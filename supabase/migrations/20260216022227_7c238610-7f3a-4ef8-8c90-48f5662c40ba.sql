
-- Drop the empty body_html and body_text columns from email_content
-- These are 100% NULL across all 99K rows (worker fetches from Gmail API / .eml files directly)
ALTER TABLE public.email_content DROP COLUMN IF EXISTS body_html;
ALTER TABLE public.email_content DROP COLUMN IF EXISTS body_text;
