-- Ensure the load-documents bucket is NOT public (documents can contain sensitive info)
UPDATE storage.buckets
SET public = false
WHERE id = 'load-documents';

-- Remove the public read policy if it exists
DROP POLICY IF EXISTS "Allow public read access on load-documents" ON storage.objects;