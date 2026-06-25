/*
# Storage RLS policies for buckets

Creates RLS policies for face-photos, attendance-photos, and employee-documents storage buckets.
- face-photos: public read, authenticated upload
- attendance-photos: public read, authenticated upload  
- employee-documents: authenticated read & upload only
*/

CREATE POLICY "face_photos_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'face-photos');

CREATE POLICY "face_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'face-photos');

CREATE POLICY "attendance_photos_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'attendance-photos');

CREATE POLICY "attendance_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attendance-photos');

CREATE POLICY "emp_docs_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'employee-documents');

CREATE POLICY "emp_docs_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-documents');
