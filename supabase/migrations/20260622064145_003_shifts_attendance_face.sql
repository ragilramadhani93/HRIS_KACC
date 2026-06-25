/*
# Migration 003: Shifts, Attendance, and Face Profiles

Creates the attendance tracking system including shift definitions, face profile registration, and daily attendance records.

1. New Tables
   - `shift_templates` — named shift definitions with start/end time and rotation config
   - `shift_assignments` — which employee works which shift and when
   - `face_profiles` — face registration photos (front/left/right) + match embedding stub
   - `attendance` — daily check-in/check-out records with GPS and face score

2. Enums
   - `attendance_status`: present, late, early_leave, absent, holiday, overtime
   - `geofence_status`: inside, outside, unknown
   - `face_profile_status`: pending, verified, rejected

3. Security
   - RLS on all tables, authenticated CRUD
*/

-- Enums
DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('present','late','early_leave','absent','holiday','overtime'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE geofence_status AS ENUM ('inside','outside','unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE face_profile_status AS ENUM ('pending','verified','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rotation_type AS ENUM ('daily','weekly','monthly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shift templates
CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_overnight boolean NOT NULL DEFAULT false,
  late_tolerance_minutes integer NOT NULL DEFAULT 15,
  rotation rotation_type NOT NULL DEFAULT 'daily',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_shifts" ON shift_templates;
CREATE POLICY "auth_select_shifts" ON shift_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_shifts" ON shift_templates;
CREATE POLICY "auth_insert_shifts" ON shift_templates FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_shifts" ON shift_templates;
CREATE POLICY "auth_update_shifts" ON shift_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_shifts" ON shift_templates;
CREATE POLICY "auth_delete_shifts" ON shift_templates FOR DELETE TO authenticated USING (true);

-- Shift assignments (employee ↔ shift ↔ date range)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_template_id uuid NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_shift_assign" ON shift_assignments;
CREATE POLICY "auth_select_shift_assign" ON shift_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_shift_assign" ON shift_assignments;
CREATE POLICY "auth_insert_shift_assign" ON shift_assignments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_shift_assign" ON shift_assignments;
CREATE POLICY "auth_update_shift_assign" ON shift_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_shift_assign" ON shift_assignments;
CREATE POLICY "auth_delete_shift_assign" ON shift_assignments FOR DELETE TO authenticated USING (true);

-- Face profiles
CREATE TABLE IF NOT EXISTS face_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  photo_front_url text,
  photo_left_url text,
  photo_right_url text,
  embedding_data jsonb,
  status face_profile_status NOT NULL DEFAULT 'pending',
  registered_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE face_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_face" ON face_profiles;
CREATE POLICY "auth_select_face" ON face_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_face" ON face_profiles;
CREATE POLICY "auth_insert_face" ON face_profiles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_face" ON face_profiles;
CREATE POLICY "auth_update_face" ON face_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_face" ON face_profiles;
CREATE POLICY "auth_delete_face" ON face_profiles FOR DELETE TO authenticated USING (true);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  shift_template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  -- Check-in
  check_in_time timestamptz,
  check_in_lat numeric(10,7),
  check_in_lng numeric(10,7),
  check_in_geofence geofence_status DEFAULT 'unknown',
  check_in_selfie_url text,
  check_in_face_score numeric(5,2),
  -- Check-out
  check_out_time timestamptz,
  check_out_lat numeric(10,7),
  check_out_lng numeric(10,7),
  check_out_geofence geofence_status DEFAULT 'unknown',
  check_out_selfie_url text,
  -- Computed
  status attendance_status NOT NULL DEFAULT 'absent',
  work_duration_minutes integer,
  notes text,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_attendance" ON attendance;
CREATE POLICY "auth_select_attendance" ON attendance FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_attendance" ON attendance;
CREATE POLICY "auth_insert_attendance" ON attendance FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_attendance" ON attendance;
CREATE POLICY "auth_update_attendance" ON attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_attendance" ON attendance;
CREATE POLICY "auth_delete_attendance" ON attendance FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_outlet ON attendance(outlet_id);

CREATE OR REPLACE TRIGGER trg_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_face_profiles_updated_at
  BEFORE UPDATE ON face_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();
