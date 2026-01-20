
-- Drop and recreate storage policies for load-documents bucket
DROP POLICY IF EXISTS "Tenant users can upload their load documents" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can view their load documents" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can update their load documents" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can delete their load documents" ON storage.objects;

-- Recreate with proper policies
CREATE POLICY "Users can upload load documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'load-documents');

CREATE POLICY "Users can view load documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'load-documents');

CREATE POLICY "Users can update load documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'load-documents');

CREATE POLICY "Users can delete load documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'load-documents');
