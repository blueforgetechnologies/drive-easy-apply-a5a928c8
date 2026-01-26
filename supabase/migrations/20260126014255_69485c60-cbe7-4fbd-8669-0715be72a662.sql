-- Fix storage policies for driver application documents
-- Driver applicants are not authenticated - they use public invite tokens
-- We need to allow anon uploads to specific paths that match valid invites

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can upload load documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view load documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update load documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete load documents" ON storage.objects;

-- Allow authenticated users full access (for internal use)
CREATE POLICY "Authenticated users can manage load documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'load-documents')
WITH CHECK (bucket_id = 'load-documents');

-- Allow anonymous uploads for driver applications
-- Path pattern: {tenant_id}/applications/{invite_id}/...
-- Validate that the invite exists and belongs to the tenant
CREATE POLICY "Driver applicants can upload documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND EXISTS (
    SELECT 1 FROM public.driver_invites di
    WHERE di.tenant_id::text = (storage.foldername(name))[1]
      AND di.id::text = (storage.foldername(name))[3]
  )
);

-- Allow anonymous read for driver applications (to view uploaded docs)
CREATE POLICY "Driver applicants can view their documents"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND EXISTS (
    SELECT 1 FROM public.driver_invites di
    WHERE di.tenant_id::text = (storage.foldername(name))[1]
      AND di.id::text = (storage.foldername(name))[3]
  )
);

-- Allow anonymous update for driver applications (to re-upload)
CREATE POLICY "Driver applicants can update their documents"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'load-documents'
  AND (storage.foldername(name))[2] = 'applications'
  AND EXISTS (
    SELECT 1 FROM public.driver_invites di
    WHERE di.tenant_id::text = (storage.foldername(name))[1]
      AND di.id::text = (storage.foldername(name))[3]
  )
);