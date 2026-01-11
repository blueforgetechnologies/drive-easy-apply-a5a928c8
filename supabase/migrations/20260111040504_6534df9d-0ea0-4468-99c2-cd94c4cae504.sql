-- ============================================
-- STEP 1: Content Deduplication Infrastructure
-- ============================================

-- 1) EMAIL_CONTENT TABLE (Global content store, platform-internal only)
-- =====================================================================
CREATE TABLE public.email_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content identification (unique key)
  provider TEXT NOT NULL,                    -- 'sylectus', 'fullcircle', etc.
  content_hash TEXT NOT NULL,                -- SHA256 of raw payload bytes
  
  -- Storage reference
  payload_url TEXT,                          -- Path in email-content bucket
  
  -- Content fields (populated in Phase 2, nullable for now)
  body_text TEXT,                            -- Normalized text content
  body_html TEXT,                            -- Raw HTML content
  parsed_data JSONB,                         -- Structured parsed fields
  
  -- Metadata
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_count INT NOT NULL DEFAULT 1,      -- Soft reference count for metrics
  
  -- Constraints
  CONSTRAINT email_content_provider_hash_unique UNIQUE (provider, content_hash)
);

-- Indexes for email_content
CREATE INDEX idx_email_content_provider ON public.email_content(provider);
CREATE INDEX idx_email_content_first_seen ON public.email_content(first_seen_at);
CREATE INDEX idx_email_content_hash_lookup ON public.email_content(content_hash);

-- RLS for email_content (platform admin only)
ALTER TABLE public.email_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view all content"
  ON public.email_content FOR SELECT
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can insert content"
  ON public.email_content FOR INSERT
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update content"
  ON public.email_content FOR UPDATE
  USING (is_platform_admin(auth.uid()));

-- Service role bypass (edge functions use service role)
CREATE POLICY "Service role full access to content"
  ON public.email_content FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');


-- 2) EMAIL_RECEIPTS TABLE (Tenant-scoped receipt linking to content)
-- ===================================================================
CREATE TABLE public.email_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant ownership
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Content reference
  content_id UUID NOT NULL REFERENCES public.email_content(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,                    -- Denormalized for filtering/metrics
  
  -- Email identification
  gmail_message_id TEXT NOT NULL,
  gmail_history_id TEXT,
  
  -- Routing metadata
  routing_method TEXT,                       -- 'delivered_to', 'x_original_to', etc.
  extracted_alias TEXT,                      -- '+talbi', '+internal', etc.
  delivered_to_header TEXT,                  -- Full header value
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending',    -- pending, processing, completed, failed
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  
  -- Results (populated after processing)
  load_email_id UUID,                        -- Reference to load_emails if created
  match_count INT DEFAULT 0,                 -- Number of hunt matches
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT email_receipts_tenant_gmail_unique UNIQUE (tenant_id, gmail_message_id)
);

-- Indexes for email_receipts
CREATE INDEX idx_email_receipts_tenant ON public.email_receipts(tenant_id);
CREATE INDEX idx_email_receipts_content ON public.email_receipts(content_id);
CREATE INDEX idx_email_receipts_provider ON public.email_receipts(provider);
CREATE INDEX idx_email_receipts_status ON public.email_receipts(status);
CREATE INDEX idx_email_receipts_received ON public.email_receipts(received_at);
CREATE INDEX idx_email_receipts_tenant_provider ON public.email_receipts(tenant_id, provider);

-- Trigger for updated_at
CREATE TRIGGER update_email_receipts_updated_at
  BEFORE UPDATE ON public.email_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for email_receipts (tenant-scoped access)
ALTER TABLE public.email_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant receipts"
  ON public.email_receipts FOR SELECT
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can insert receipts for their tenant"
  ON public.email_receipts FOR INSERT
  WITH CHECK (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can update their tenant receipts"
  ON public.email_receipts FOR UPDATE
  USING (can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Users can delete their tenant receipts"
  ON public.email_receipts FOR DELETE
  USING (can_access_tenant(auth.uid(), tenant_id));

-- Service role bypass
CREATE POLICY "Service role full access to receipts"
  ON public.email_receipts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');


-- 3) STORAGE BUCKET for deduplicated content (private, service-role only)
-- ========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-content',
  'email-content', 
  false,                                     -- Private bucket
  5242880,                                   -- 5MB limit per file
  ARRAY['application/json']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- NO RLS policies on storage.objects for this bucket
-- Access is service-role only (edge functions)


-- 4) FEATURE FLAG: content_dedup_enabled
-- =======================================
INSERT INTO public.feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES (
  'content_dedup_enabled',
  'Content Deduplication',
  'Enables global content deduplication for email ingestion. When enabled, raw email payloads are stored once globally and referenced by tenant receipts instead of duplicated per-tenant.',
  false,                                     -- Default disabled everywhere
  false                                      -- Not a killswitch
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Enable for Default tenant only (internal testing)
INSERT INTO public.tenant_feature_flags (tenant_id, feature_flag_id, enabled)
SELECT 
  t.id,
  ff.id,
  true
FROM public.tenants t
CROSS JOIN public.feature_flags ff
WHERE t.slug = 'default'
  AND ff.key = 'content_dedup_enabled'
ON CONFLICT (tenant_id, feature_flag_id) DO UPDATE SET
  enabled = true;


-- 5) ADD content_id and receipt_id to email_queue for dual-write
-- ===============================================================
ALTER TABLE public.email_queue 
  ADD COLUMN IF NOT EXISTS content_id UUID REFERENCES public.email_content(id),
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES public.email_receipts(id);

CREATE INDEX IF NOT EXISTS idx_email_queue_content ON public.email_queue(content_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_receipt ON public.email_queue(receipt_id);


-- 6) METRICS VIEW for Inspector
-- ==============================
CREATE OR REPLACE VIEW public.content_dedup_metrics AS
SELECT
  -- Overall metrics
  (SELECT COUNT(*) FROM public.email_content) AS unique_content_count,
  (SELECT COUNT(*) FROM public.email_receipts) AS total_receipt_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.email_receipts) > 0 
    THEN ROUND(100.0 * (1 - (SELECT COUNT(*)::numeric FROM public.email_content) / (SELECT COUNT(*) FROM public.email_receipts)), 2)
    ELSE 0 
  END AS reuse_rate_pct,
  
  -- Per-provider breakdown (as JSONB)
  (
    SELECT COALESCE(jsonb_agg(provider_stats), '[]'::jsonb)
    FROM (
      SELECT 
        ec.provider,
        COUNT(DISTINCT ec.id) AS unique_content,
        COALESCE(SUM(ec.receipt_count), 0) AS total_receipts,
        CASE 
          WHEN COALESCE(SUM(ec.receipt_count), 0) > 0 
          THEN ROUND(100.0 * (1 - COUNT(DISTINCT ec.id)::numeric / SUM(ec.receipt_count)), 2)
          ELSE 0 
        END AS reuse_rate
      FROM public.email_content ec
      GROUP BY ec.provider
    ) provider_stats
  ) AS by_provider,
  
  -- Storage estimate (rough)
  (
    SELECT COALESCE(SUM(LENGTH(COALESCE(body_text, '')) + LENGTH(COALESCE(body_html, ''))), 0)
    FROM public.email_content
  ) AS total_content_bytes,
  
  -- Feature flag status
  (
    SELECT jsonb_agg(jsonb_build_object(
      'tenant_slug', t.slug,
      'enabled', COALESCE(tff.enabled, false)
    ))
    FROM public.tenants t
    LEFT JOIN public.feature_flags ff ON ff.key = 'content_dedup_enabled'
    LEFT JOIN public.tenant_feature_flags tff ON tff.tenant_id = t.id AND tff.feature_flag_id = ff.id
    WHERE t.status = 'active'
  ) AS tenant_flag_status;