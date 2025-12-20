-- Create storage bucket for load documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'load-documents', 
  'load-documents', 
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload documents
CREATE POLICY "Authenticated users can upload load documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'load-documents');

-- Allow authenticated users to view load documents
CREATE POLICY "Authenticated users can view load documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'load-documents');

-- Allow authenticated users to delete their uploaded documents
CREATE POLICY "Authenticated users can delete load documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'load-documents');