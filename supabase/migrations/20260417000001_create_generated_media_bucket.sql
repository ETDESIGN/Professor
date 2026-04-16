INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-media',
  'generated-media',
  true,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'audio/mpeg', 'audio/webm', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "generated_media_public_read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'generated-media');

CREATE POLICY "service_role_full_access_generated_media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'generated-media')
WITH CHECK (bucket_id = 'generated-media');

CREATE POLICY "teachers_can_upload_generated_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-media'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher')
  )
);
