-- Fix tenant_feature_flags updates failing due to missing updated_at column
-- The table has a BEFORE UPDATE trigger calling update_updated_at_column(), which expects NEW.updated_at.

ALTER TABLE public.tenant_feature_flags
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Optional backfill aligned with existing enabled_at when present
UPDATE public.tenant_feature_flags
SET updated_at = COALESCE(enabled_at, now())
WHERE updated_at IS NULL;