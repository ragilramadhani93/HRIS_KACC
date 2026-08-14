/*
# Migration 010: Storage buckets for photos and documents

Creates the public storage buckets the app uploads to:
- attendance-photos   — check-in/check-out selfies (web, kiosk, employee app)
- face-photos         — face profile registration photos
- employee-documents  — leave proof, expense receipts, employee documents
*/

-- Buckets (public so face photos / selfies / documents can be read by the app)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('attendance-photos', 'attendance-photos', true),
  ('face-photos', 'face-photos', true),
  ('employee-documents', 'employee-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (public read, authenticated write)
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['attendance-photos', 'face-photos', 'employee-documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'public_read_' || b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)', 'public_read_' || b, b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth_upload_' || b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)', 'auth_upload_' || b, b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth_update_' || b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', 'auth_update_' || b, b, b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth_delete_' || b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)', 'auth_delete_' || b, b);
  END LOOP;
END $$;
