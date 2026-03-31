-- Create storage bucket for uploaded materials (textbooks, PDFs, images)
-- Run: npx supabase db push

-- Create the materials bucket (public for authenticated users)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  true,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for materials bucket

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload to materials"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'materials'
  AND auth.uid() IS NOT NULL
);

-- Allow authenticated users to read files
CREATE POLICY "Authenticated users can read materials"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'materials');

-- Allow authenticated users to update their own files
CREATE POLICY "Authenticated users can update materials"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'materials')
WITH CHECK (
  bucket_id = 'materials'
  AND (storage.foldername(name))[1] = (SELECT id FROM auth.users WHERE id = auth.uid())::text
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete materials"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'materials'
  AND (storage.foldername(name))[1] = (SELECT id FROM auth.users WHERE id = auth.uid())::text
);

-- Enable RLS on storage.objects (should be enabled by default, but ensuring it)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;