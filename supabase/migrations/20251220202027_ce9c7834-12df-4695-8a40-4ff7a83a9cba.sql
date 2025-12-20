-- Create the load-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('load-documents', 'load-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow authenticated users to read files
CREATE POLICY "Allow authenticated read access on load-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'load-documents');

-- Create policy to allow authenticated users to upload files
CREATE POLICY "Allow authenticated upload on load-documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'load-documents');

-- Create policy to allow authenticated users to delete their files
CREATE POLICY "Allow authenticated delete on load-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'load-documents');

-- Create policy for public read access (since bucket is public)
CREATE POLICY "Allow public read access on load-documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'load-documents');