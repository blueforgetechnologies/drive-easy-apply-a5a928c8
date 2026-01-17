-- =====================================================
-- STORAGE TENANT ISOLATION POLICIES (Fixed for Lovable Cloud)
-- Create helper in PUBLIC schema, then fix storage policies
-- =====================================================

-- Step 1: Create helper function in PUBLIC schema
CREATE OR REPLACE FUNCTION public.get_storage_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
  
  RETURN v_tenant_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_storage_tenant_id() TO authenticated;

-- Step 2: Drop existing overly-permissive policies on load-documents
DROP POLICY IF EXISTS "Authenticated users can upload load documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view load documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete load documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read access on load-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload on load-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete on load-documents" ON storage.objects;

-- Step 3: Drop existing overly-permissive policies on company-logos (writes only)
DROP POLICY IF EXISTS "Allow authenticated users to upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete company logos" ON storage.objects;

-- Step 4: Create tenant-scoped policies for load-documents
-- Path structure: {tenant_id}/{load_id}/{filename}

CREATE POLICY "Tenant users can view their load documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

CREATE POLICY "Tenant users can upload their load documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

CREATE POLICY "Tenant users can update their load documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

CREATE POLICY "Tenant users can delete their load documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

-- Step 5: Create tenant-scoped policies for company-logos (writes)
-- Path structure: {tenant_id}/{filename}

CREATE POLICY "Tenant users can upload their company logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

CREATE POLICY "Tenant users can update their company logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);

CREATE POLICY "Tenant users can delete their company logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_storage_tenant_id()::text
);