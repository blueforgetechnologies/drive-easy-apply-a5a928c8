-- Create a security definer function to validate driver invite storage paths
-- This allows anon users to validate paths without direct table access
CREATE OR REPLACE FUNCTION public.validate_driver_invite_storage_path(
  p_tenant_id text,
  p_invite_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_invites di
    WHERE di.tenant_id::text = p_tenant_id
      AND di.id::text = p_invite_id
  )
$$;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION public.validate_driver_invite_storage_path(text, text) TO anon;

-- Drop old policies that use direct table access
DROP POLICY IF EXISTS "Driver applicants can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Driver applicants can view their documents" ON storage.objects;
DROP POLICY IF EXISTS "Driver applicants can update their documents" ON storage.objects;

-- Recreate with security definer function
CREATE POLICY "Driver applicants can upload documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND validate_driver_invite_storage_path(
    (storage.foldername(name))[1],
    (storage.foldername(name))[3]
  )
);

CREATE POLICY "Driver applicants can view their documents"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND validate_driver_invite_storage_path(
    (storage.foldername(name))[1],
    (storage.foldername(name))[3]
  )
);

CREATE POLICY "Driver applicants can update their documents"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND validate_driver_invite_storage_path(
    (storage.foldername(name))[1],
    (storage.foldername(name))[3]
  )
);