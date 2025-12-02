-- Add issue tracking columns to load_emails
ALTER TABLE load_emails 
ADD COLUMN IF NOT EXISTS has_issues boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS issue_notes text;