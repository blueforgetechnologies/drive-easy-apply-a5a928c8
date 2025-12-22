-- Add pay_method_active flag to applications table
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS pay_method_active boolean DEFAULT true;