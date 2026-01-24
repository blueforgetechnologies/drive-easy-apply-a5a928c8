-- Update email-content bucket to allow both JSON payloads and raw MIME (.eml) files
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/json', 'application/octet-stream']
WHERE id = 'email-content';