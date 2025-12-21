-- Add billing party fields to loads table
-- billing_party is who we invoice/bill (could be different from customer/broker)
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_name TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_address TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_city TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_state TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_zip TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_contact TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_phone TEXT;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS billing_party_email TEXT;