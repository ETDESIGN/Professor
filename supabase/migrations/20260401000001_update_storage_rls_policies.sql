-- Update storage bucket RLS policies for materials
-- Teachers can INSERT (upload) files, authenticated users can SELECT (read/download)

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can upload to materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete materials" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can upload materials" ON storage.objects;

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
