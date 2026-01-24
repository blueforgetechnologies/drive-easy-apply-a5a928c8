-- Add needs_reauth and reauth_reason columns to gmail_tokens for visibility into token health
ALTER TABLE gmail_tokens 
ADD COLUMN IF NOT EXISTS needs_reauth boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reauth_reason text;

-- Add index for quick lookup of tokens needing re-auth
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_needs_reauth ON gmail_tokens (needs_reauth) WHERE needs_reauth = true;