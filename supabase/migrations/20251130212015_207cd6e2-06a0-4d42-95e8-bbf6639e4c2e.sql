-- Add additional email and phone fields to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS email_secondary text,
ADD COLUMN IF NOT EXISTS phone_secondary text,
ADD COLUMN IF NOT EXISTS phone_mobile text,
ADD COLUMN IF NOT EXISTS phone_fax text;