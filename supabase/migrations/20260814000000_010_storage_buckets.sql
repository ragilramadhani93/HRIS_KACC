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
    EXECUTE format('DROP POLICY IF EXISTS "public_read_%I" ON storage.objects', b);
    EXECUTE format('CREATE POLICY "public_read_%I" ON storage.objects FOR SELECT USING (bucket_id = %L)', b, b);
    EXECUTE format('DROP POLICY IF EXISTS "auth_upload_%I" ON storage.objects', b);
    EXECUTE format('CREATE POLICY "auth_upload_%I" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)', b, b);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%I" ON storage.objects', b);
    EXECUTE format('CREATE POLICY "auth_update_%I" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', b, b, b);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%I" ON storage.objects', b);
    EXECUTE format('CREATE POLICY "auth_delete_%I" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)', b, b);
  END LOOP;
END $$;
