-- Create storage bucket for uploaded materials (textbooks, PDFs, images)
-- Run: npx supabase db push

-- Create the materials bucket (public for reading)
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

-- Teachers can upload (INSERT) files to materials bucket
CREATE POLICY "Teachers can upload materials"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'materials'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'teacher'
  )
);

-- All authenticated users can read/download files
CREATE POLICY "Authenticated users can read materials"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'materials');

-- Enable RLS on storage.objects (should be enabled by default, but ensuring it)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;