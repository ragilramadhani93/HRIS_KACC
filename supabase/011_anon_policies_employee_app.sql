/*
  Migration 011: Add anon policies for Employee App (APK)

  The Employee App runs inside Capacitor and uses the Supabase anon key
  WITHOUT a Supabase Auth session.  All existing RLS policies are
  `TO authenticated`, so the anon role is blocked from every table.

  This migration adds permissive policies for the `anon` role on every
  table and storage bucket the Employee App reads or writes.

  Tables needed (anon):
    SELECT:  face_profiles, employees, outlets, shift_assignments,
             shift_templates, absence_requests, attendance,
             payroll_items, payroll_runs, payroll_item_lines
    INSERT:  absence_requests, attendance
    UPDATE:  attendance

  Storage buckets (anon read):
    face-photos, attendance-photos, employee-documents
*/

-- Helper: permissive anon SELECT on a table (idempotent)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'regions', 'areas', 'outlets',
    'employees',
    'shift_templates', 'shift_assignments',
    'face_profiles',
    'attendance',
    'absence_requests',
    'payroll_items', 'payroll_runs', 'payroll_item_lines'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      'anon_select_' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO anon USING (true)',
      'anon_select_' || t, t
    );
  END LOOP;
END $$;

-- anon INSERT on absence_requests (employee can submit leave requests)
DROP POLICY IF EXISTS anon_insert_absence_requests ON absence_requests;
CREATE POLICY anon_insert_absence_requests ON absence_requests
  FOR INSERT TO anon WITH CHECK (true);

-- anon INSERT + UPDATE on attendance (employee check-in / check-out)
DROP POLICY IF EXISTS anon_insert_attendance ON attendance;
CREATE POLICY anon_insert_attendance ON attendance
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_attendance ON attendance;
CREATE POLICY anon_update_attendance ON attendance
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Storage: anon SELECT on all three buckets (public read)
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['attendance-photos', 'face-photos', 'employee-documents'] LOOP
    -- The existing migration 010 already created public_read_<bucket> policies
    -- that apply to ALL roles (no TO clause).  If they exist, no-op.
    -- If they don't (bucket missing etc.), create an explicit anon one.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'objects'
        AND policyname = 'anon_select_' || b
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO anon USING (bucket_id = %L)',
        'anon_select_' || b, b
      );
    END IF;
  END LOOP;
END $$;
