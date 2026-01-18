-- Table to store features that can be versioned
CREATE TABLE public.versionable_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  description TEXT,
  v1_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  v2_files_pattern JSONB DEFAULT '[]'::jsonb,
  isolation_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track active V2 development
CREATE TABLE public.feature_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id UUID NOT NULL REFERENCES public.versionable_features(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 2,
  feature_flag_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scaffolding' CHECK (status IN ('scaffolding', 'development', 'testing', 'pilot', 'promoted', 'deprecated')),
  scaffold_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  promoted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  notes TEXT,
  UNIQUE(feature_id, version_number)
);

-- Enable RLS
ALTER TABLE public.versionable_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_versions ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage versionable features
CREATE POLICY "Platform admins can manage versionable_features"
ON public.versionable_features
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

CREATE POLICY "Platform admins can manage feature_versions"
ON public.feature_versions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_platform_admin = true
  )
);

-- Seed some initial versionable features
INSERT INTO public.versionable_features (feature_key, feature_name, description, v1_files, v2_files_pattern, isolation_notes) VALUES
(
  'load_hunter',
  'Load Hunter',
  'Email parsing, truck matching, and load approval system',
  '["src/pages/LoadHunterTab.tsx", "src/pages/LoadApprovalTab.tsx", "worker/src/matching.ts", "worker/src/process.ts", "worker/src/inbound.ts"]'::jsonb,
  '["src/pages/LoadHunterV2Tab.tsx", "src/pages/LoadApprovalV2Tab.tsx", "worker/src/matchingV2.ts", "worker/src/processV2.ts", "worker/src/inboundV2.ts"]'::jsonb,
  'Worker changes require version-flag gating in worker/src/index.ts. UI changes need routing in App.tsx based on feature flag.'
),
(
  'fleet_financials',
  'Fleet Financials',
  'Truck expense tracking and financial reporting',
  '["src/pages/FleetFinancialsTab.tsx", "src/components/FleetFinancialsTable.tsx", "src/hooks/useFleetColumns.ts"]'::jsonb,
  '["src/pages/FleetFinancialsV2Tab.tsx", "src/components/FleetFinancialsTableV2.tsx", "src/hooks/useFleetColumnsV2.ts"]'::jsonb,
  'UI-only feature. No worker changes needed.'
),
(
  'settlements',
  'Driver Settlements',
  'Driver pay calculation and settlement generation',
  '["src/pages/SettlementsTab.tsx", "src/pages/SettlementDetail.tsx"]'::jsonb,
  '["src/pages/SettlementsV2Tab.tsx", "src/pages/SettlementDetailV2.tsx"]'::jsonb,
  'UI-only feature. May involve payment formula changes in usePaymentFormulas hook.'
),
(
  'email_routing',
  'Email Routing',
  'Gmail integration and email routing to tenants',
  '["src/components/EmailRoutingOverview.tsx", "src/components/GmailTenantMapping.tsx", "supabase/functions/gmail-webhook/index.ts", "supabase/functions/fetch-gmail-loads/index.ts"]'::jsonb,
  '["src/components/EmailRoutingOverviewV2.tsx", "src/components/GmailTenantMappingV2.tsx", "supabase/functions/gmail-webhook-v2/index.ts", "supabase/functions/fetch-gmail-loads-v2/index.ts"]'::jsonb,
  'Edge function changes require new function files. Worker uses gmail-webhook so coordinate carefully.'
);

-- Trigger for updated_at
CREATE TRIGGER update_versionable_features_updated_at
BEFORE UPDATE ON public.versionable_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();