/* ============================================================================
 * KACC HRIS — APPLY ALL MIGRATIONS (001 → 010)
 * ----------------------------------------------------------------------------
 * Cara pakai:
 *   1. Buka dashboard Supabase → SQL Editor → New query
 *   2. Paste SELURUH isi file ini → Run (atau Ctrl/Cmd + Enter)
 *   3. Tunggu sampai muncul "Success. No rows returned"
 *
 * File ini gabungan dari supabase/migrations/ dan sudah idempotent
 * (aman jika dijalankan ulang). Membuat semua tabel, enum, RLS policy,
 * trigger, fungsi, dan storage bucket yang dipakai aplikasi.
 * ==========================================================================*/


/* ============================ 001: Organization ============================ */

DO $$ BEGIN
  CREATE TYPE outlet_type AS ENUM (
    'coffee_shop', 'coffee_corner', 'mobile_coffee',
    'warehouse', 'office', 'event_booth', 'distributor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_companies" ON companies;
CREATE POLICY "auth_select_companies" ON companies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_companies" ON companies;
CREATE POLICY "auth_insert_companies" ON companies FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_companies" ON companies;
CREATE POLICY "auth_update_companies" ON companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_companies" ON companies;
CREATE POLICY "auth_delete_companies" ON companies FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_regions" ON regions;
CREATE POLICY "auth_select_regions" ON regions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_regions" ON regions;
CREATE POLICY "auth_insert_regions" ON regions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_regions" ON regions;
CREATE POLICY "auth_update_regions" ON regions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_regions" ON regions;
CREATE POLICY "auth_delete_regions" ON regions FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, code)
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_areas" ON areas;
CREATE POLICY "auth_select_areas" ON areas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_areas" ON areas;
CREATE POLICY "auth_insert_areas" ON areas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_areas" ON areas;
CREATE POLICY "auth_update_areas" ON areas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_areas" ON areas;
CREATE POLICY "auth_delete_areas" ON areas FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  outlet_code text UNIQUE NOT NULL,
  name text NOT NULL,
  outlet_type outlet_type NOT NULL DEFAULT 'coffee_shop',
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  geofence_radius_meters integer NOT NULL DEFAULT 100,
  manager_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_outlets" ON outlets;
CREATE POLICY "auth_select_outlets" ON outlets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_outlets" ON outlets;
CREATE POLICY "auth_insert_outlets" ON outlets FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_outlets" ON outlets;
CREATE POLICY "auth_update_outlets" ON outlets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_outlets" ON outlets;
CREATE POLICY "auth_delete_outlets" ON outlets FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_regions_updated_at
  BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_areas_updated_at
  BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_outlets_updated_at
  BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ================== 002: User Profiles and Employees ======================= */

DO $$ BEGIN CREATE TYPE app_role AS ENUM ('super_admin','hr_admin','regional_manager','area_manager','supervisor','auditor','employee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE employee_status AS ENUM ('active','probation','contract','resigned','terminated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('ktp','npwp','kk','bpjs','contract','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gender_type AS ENUM ('male','female'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE marital_status_type AS ENUM ('single','married','divorced','widowed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'employee',
  avatar_url text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON user_profiles;
CREATE POLICY "profiles_select_own" ON user_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_insert_own" ON user_profiles;
CREATE POLICY "profiles_insert_own" ON user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON user_profiles;
CREATE POLICY "profiles_update_own" ON user_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "profiles_delete_own" ON user_profiles;
CREATE POLICY "profiles_delete_own" ON user_profiles FOR DELETE TO authenticated USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  nik text,
  birth_place text,
  birth_date date,
  gender gender_type,
  marital_status marital_status_type,
  phone text,
  email text,
  address text,
  job_title text,
  department text,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  area_id uuid REFERENCES areas(id) ON DELETE SET NULL,
  primary_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  backup_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  join_date date,
  status employee_status NOT NULL DEFAULT 'active',
  face_registered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_employees" ON employees;
CREATE POLICY "auth_select_employees" ON employees FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_employees" ON employees;
CREATE POLICY "auth_insert_employees" ON employees FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_employees" ON employees;
CREATE POLICY "auth_update_employees" ON employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_employees" ON employees;
CREATE POLICY "auth_delete_employees" ON employees FOR DELETE TO authenticated USING (true);

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS manager_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_emp_docs" ON employee_documents;
CREATE POLICY "auth_select_emp_docs" ON employee_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_emp_docs" ON employee_documents;
CREATE POLICY "auth_insert_emp_docs" ON employee_documents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_emp_docs" ON employee_documents;
CREATE POLICY "auth_update_emp_docs" ON employee_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_emp_docs" ON employee_documents;
CREATE POLICY "auth_delete_emp_docs" ON employee_documents FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS outlet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  to_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  transfer_type text NOT NULL DEFAULT 'permanent',
  effective_date date NOT NULL,
  end_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outlet_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_transfers" ON outlet_transfers;
CREATE POLICY "auth_select_transfers" ON outlet_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_transfers" ON outlet_transfers;
CREATE POLICY "auth_insert_transfers" ON outlet_transfers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_transfers" ON outlet_transfers;
CREATE POLICY "auth_update_transfers" ON outlet_transfers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_transfers" ON outlet_transfers;
CREATE POLICY "auth_delete_transfers" ON outlet_transfers FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_outlet ON employees(primary_outlet_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ================ 003: Shifts, Attendance, Face Profiles =================== */

DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('present','late','early_leave','absent','holiday','overtime'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE geofence_status AS ENUM ('inside','outside','unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE face_profile_status AS ENUM ('pending','verified','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rotation_type AS ENUM ('daily','weekly','monthly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  shift_template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  check_in_time timestamptz,
  check_in_lat numeric(10,7),
  check_in_lng numeric(10,7),
  check_in_geofence geofence_status DEFAULT 'unknown',
  check_in_selfie_url text,
  check_in_face_score numeric(5,2),
  check_out_time timestamptz,
  check_out_lat numeric(10,7),
  check_out_lng numeric(10,7),
  check_out_geofence geofence_status DEFAULT 'unknown',
  check_out_selfie_url text,
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

CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_outlet ON attendance(outlet_id);

CREATE OR REPLACE TRIGGER trg_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_face_profiles_updated_at
  BEFORE UPDATE ON face_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ================ 004: Leave, Overtime, Notifications ====================== */

DO $$ BEGIN CREATE TYPE leave_status AS ENUM ('pending','approved_supervisor','approved_manager','approved_hr','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE overtime_status AS ENUM ('pending','approved_supervisor','approved_manager','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('attendance','payroll','leave','overtime','shift','system','approval'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  days_per_year integer NOT NULL DEFAULT 12,
  requires_proof boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_leave_types" ON leave_types;
CREATE POLICY "auth_select_leave_types" ON leave_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_leave_types" ON leave_types;
CREATE POLICY "auth_insert_leave_types" ON leave_types FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_leave_types" ON leave_types;
CREATE POLICY "auth_update_leave_types" ON leave_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_leave_types" ON leave_types;
CREATE POLICY "auth_delete_leave_types" ON leave_types FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_days integer NOT NULL DEFAULT 0,
  used_days integer NOT NULL DEFAULT 0,
  pending_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_leave_bal" ON leave_balances;
CREATE POLICY "auth_select_leave_bal" ON leave_balances FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_leave_bal" ON leave_balances;
CREATE POLICY "auth_insert_leave_bal" ON leave_balances FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_leave_bal" ON leave_balances;
CREATE POLICY "auth_update_leave_bal" ON leave_balances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_leave_bal" ON leave_balances;
CREATE POLICY "auth_delete_leave_bal" ON leave_balances FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days integer NOT NULL DEFAULT 1,
  reason text,
  proof_url text,
  status leave_status NOT NULL DEFAULT 'pending',
  supervisor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_approved_at timestamptz,
  supervisor_notes text,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manager_approved_at timestamptz,
  manager_notes text,
  hr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hr_approved_at timestamptz,
  hr_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_leave_req" ON leave_requests;
CREATE POLICY "auth_select_leave_req" ON leave_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_leave_req" ON leave_requests;
CREATE POLICY "auth_insert_leave_req" ON leave_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_leave_req" ON leave_requests;
CREATE POLICY "auth_update_leave_req" ON leave_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_leave_req" ON leave_requests;
CREATE POLICY "auth_delete_leave_req" ON leave_requests FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  overtime_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_hours numeric(4,2),
  reason text,
  status overtime_status NOT NULL DEFAULT 'pending',
  supervisor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_approved_at timestamptz,
  supervisor_notes text,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manager_approved_at timestamptz,
  manager_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_overtime" ON overtime_requests;
CREATE POLICY "auth_select_overtime" ON overtime_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_overtime" ON overtime_requests;
CREATE POLICY "auth_insert_overtime" ON overtime_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_overtime" ON overtime_requests;
CREATE POLICY "auth_update_overtime" ON overtime_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_overtime" ON overtime_requests;
CREATE POLICY "auth_delete_overtime" ON overtime_requests FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  reference_id uuid,
  reference_table text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_audit" ON audit_logs;
CREATE POLICY "auth_select_audit" ON audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_audit" ON audit_logs;
CREATE POLICY "auth_insert_audit" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_overtime_employee ON overtime_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE OR REPLACE TRIGGER trg_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_overtime_updated_at
  BEFORE UPDATE ON overtime_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ====================== 005: Storage policies ============================== */

DROP POLICY IF EXISTS "face_photos_public_select" ON storage.objects;
CREATE POLICY "face_photos_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'face-photos');
DROP POLICY IF EXISTS "face_photos_auth_insert" ON storage.objects;
CREATE POLICY "face_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'face-photos');
DROP POLICY IF EXISTS "attendance_photos_public_select" ON storage.objects;
CREATE POLICY "attendance_photos_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'attendance-photos');
DROP POLICY IF EXISTS "attendance_photos_auth_insert" ON storage.objects;
CREATE POLICY "attendance_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attendance-photos');
DROP POLICY IF EXISTS "emp_docs_auth_select" ON storage.objects;
CREATE POLICY "emp_docs_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'employee-documents');
DROP POLICY IF EXISTS "emp_docs_auth_insert" ON storage.objects;
CREATE POLICY "emp_docs_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-documents');


/* ===================== 006: Payroll and Expense ============================ */

DO $$ BEGIN CREATE TYPE payroll_run_status AS ENUM ('draft','review','approved','paid','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE component_type AS ENUM ('earning','deduction','benefit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE expense_claim_status AS ENUM ('draft','submitted','approved_supervisor','approved_manager','approved_finance','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payroll_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  component_type component_type NOT NULL DEFAULT 'earning',
  is_taxable boolean NOT NULL DEFAULT false,
  is_fixed boolean NOT NULL DEFAULT true,
  default_amount numeric(15,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

ALTER TABLE payroll_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_payroll_comp" ON payroll_components;
CREATE POLICY "auth_select_payroll_comp" ON payroll_components FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_payroll_comp" ON payroll_components;
CREATE POLICY "auth_insert_payroll_comp" ON payroll_components FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_payroll_comp" ON payroll_components;
CREATE POLICY "auth_update_payroll_comp" ON payroll_components FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_payroll_comp" ON payroll_components;
CREATE POLICY "auth_delete_payroll_comp" ON payroll_components FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL,
  run_date date,
  status payroll_run_status NOT NULL DEFAULT 'draft',
  total_gross numeric(18,2) NOT NULL DEFAULT 0,
  total_deductions numeric(18,2) NOT NULL DEFAULT 0,
  total_net numeric(18,2) NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_year, period_month)
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_payroll_runs" ON payroll_runs;
CREATE POLICY "auth_select_payroll_runs" ON payroll_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_payroll_runs" ON payroll_runs;
CREATE POLICY "auth_insert_payroll_runs" ON payroll_runs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_payroll_runs" ON payroll_runs;
CREATE POLICY "auth_update_payroll_runs" ON payroll_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_payroll_runs" ON payroll_runs;
CREATE POLICY "auth_delete_payroll_runs" ON payroll_runs FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  total_earnings numeric(15,2) NOT NULL DEFAULT 0,
  total_deductions numeric(15,2) NOT NULL DEFAULT 0,
  total_bpjs_kes numeric(15,2) NOT NULL DEFAULT 0,
  total_bpjs_tk numeric(15,2) NOT NULL DEFAULT 0,
  total_tax numeric(15,2) NOT NULL DEFAULT 0,
  net_salary numeric(15,2) NOT NULL DEFAULT 0,
  work_days integer NOT NULL DEFAULT 0,
  present_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  late_days integer NOT NULL DEFAULT 0,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  leave_days integer NOT NULL DEFAULT 0,
  notes text,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_payroll_items" ON payroll_items;
CREATE POLICY "auth_select_payroll_items" ON payroll_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_payroll_items" ON payroll_items;
CREATE POLICY "auth_insert_payroll_items" ON payroll_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_payroll_items" ON payroll_items;
CREATE POLICY "auth_update_payroll_items" ON payroll_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_payroll_items" ON payroll_items;
CREATE POLICY "auth_delete_payroll_items" ON payroll_items FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS payroll_item_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id uuid NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  component_id uuid REFERENCES payroll_components(id) ON DELETE SET NULL,
  component_name text NOT NULL,
  component_type component_type NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_item_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_pil" ON payroll_item_lines;
CREATE POLICY "auth_select_pil" ON payroll_item_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_pil" ON payroll_item_lines;
CREATE POLICY "auth_insert_pil" ON payroll_item_lines FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_pil" ON payroll_item_lines;
CREATE POLICY "auth_update_pil" ON payroll_item_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_pil" ON payroll_item_lines;
CREATE POLICY "auth_delete_pil" ON payroll_item_lines FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  max_amount numeric(12,2),
  requires_receipt boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_exp_cat" ON expense_categories;
CREATE POLICY "auth_select_exp_cat" ON expense_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_exp_cat" ON expense_categories;
CREATE POLICY "auth_insert_exp_cat" ON expense_categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_exp_cat" ON expense_categories;
CREATE POLICY "auth_update_exp_cat" ON expense_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_exp_cat" ON expense_categories;
CREATE POLICY "auth_delete_exp_cat" ON expense_categories FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  claim_date date NOT NULL,
  title text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL,
  receipt_url text,
  status expense_claim_status NOT NULL DEFAULT 'draft',
  supervisor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_approved_at timestamptz,
  supervisor_notes text,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manager_approved_at timestamptz,
  manager_notes text,
  finance_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finance_approved_at timestamptz,
  finance_notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_expense" ON expense_claims;
CREATE POLICY "auth_select_expense" ON expense_claims FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_expense" ON expense_claims;
CREATE POLICY "auth_insert_expense" ON expense_claims FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_expense" ON expense_claims;
CREATE POLICY "auth_update_expense" ON expense_claims FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_expense" ON expense_claims;
CREATE POLICY "auth_delete_expense" ON expense_claims FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON payroll_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_emp ON payroll_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_emp ON expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status);

CREATE OR REPLACE TRIGGER trg_payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_payroll_items_updated_at
  BEFORE UPDATE ON payroll_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_expense_claims_updated_at
  BEFORE UPDATE ON expense_claims FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ==================== 007: Employee salary fields ========================== */

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bpjs_kes_employee numeric(6,4) NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS bpjs_kes_employer numeric(6,4) NOT NULL DEFAULT 0.04,
  ADD COLUMN IF NOT EXISTS bpjs_tk_jht_employee numeric(6,4) NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS bpjs_tk_jht_employer numeric(6,4) NOT NULL DEFAULT 0.037,
  ADD COLUMN IF NOT EXISTS npwp text;

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1000;

CREATE OR REPLACE FUNCTION next_employee_code(prefix text DEFAULT 'EMP')
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN prefix || LPAD(nextval('employee_code_seq')::text, 5, '0');
END;
$$;


/* ============ 008: Daily salary, area rates, incentives ==================== */

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_scheme text NOT NULL DEFAULT 'monthly'
    CHECK (salary_scheme IN ('monthly','daily')),
  ADD COLUMN IF NOT EXISTS daily_rate numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS area_salary_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  job_title text,
  daily_rate numeric(12,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE area_salary_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_area_rates" ON area_salary_rates;
CREATE POLICY "auth_select_area_rates" ON area_salary_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_area_rates" ON area_salary_rates;
CREATE POLICY "auth_insert_area_rates" ON area_salary_rates FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_area_rates" ON area_salary_rates;
CREATE POLICY "auth_update_area_rates" ON area_salary_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_area_rates" ON area_salary_rates;
CREATE POLICY "auth_delete_area_rates" ON area_salary_rates FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS incentive_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  incentive_type text NOT NULL CHECK (incentive_type IN ('sales','achievement','attendance')),
  fixed_amount numeric(12,2) NOT NULL DEFAULT 150000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incentive_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_inc_scheme" ON incentive_schemes;
CREATE POLICY "auth_select_inc_scheme" ON incentive_schemes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_inc_scheme" ON incentive_schemes;
CREATE POLICY "auth_insert_inc_scheme" ON incentive_schemes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_inc_scheme" ON incentive_schemes;
CREATE POLICY "auth_update_inc_scheme" ON incentive_schemes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_inc_scheme" ON incentive_schemes;
CREATE POLICY "auth_delete_inc_scheme" ON incentive_schemes FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS incentive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  incentive_scheme_id uuid REFERENCES incentive_schemes(id) ON DELETE SET NULL,
  incentive_type text NOT NULL CHECK (incentive_type IN ('sales','achievement','attendance')),
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  qualified boolean NOT NULL DEFAULT false,
  absent_days integer NOT NULL DEFAULT 0,
  late_days integer NOT NULL DEFAULT 0,
  sick_no_doc_days integer NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, incentive_type, period_year, period_month)
);

ALTER TABLE incentive_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_inc_rec" ON incentive_records;
CREATE POLICY "auth_select_inc_rec" ON incentive_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_inc_rec" ON incentive_records;
CREATE POLICY "auth_insert_inc_rec" ON incentive_records FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_inc_rec" ON incentive_records;
CREATE POLICY "auth_update_inc_rec" ON incentive_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_inc_rec" ON incentive_records;
CREATE POLICY "auth_delete_inc_rec" ON incentive_records FOR DELETE TO authenticated USING (true);

DO $$ BEGIN
  CREATE TYPE absence_type AS ENUM (
    'sakit_dengan_surat',
    'sakit_tanpa_surat',
    'izin',
    'perbantuan'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE absence_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS absence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  absence_type absence_type NOT NULL,
  absence_date date NOT NULL,
  end_date date,
  total_days integer NOT NULL DEFAULT 1,
  reason text,
  document_url text,
  target_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  status absence_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE absence_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_absence" ON absence_requests;
CREATE POLICY "auth_select_absence" ON absence_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_absence" ON absence_requests;
CREATE POLICY "auth_insert_absence" ON absence_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_absence" ON absence_requests;
CREATE POLICY "auth_update_absence" ON absence_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_absence" ON absence_requests;
CREATE POLICY "auth_delete_absence" ON absence_requests FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS kiosk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kiosk_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_select_kiosk" ON kiosk_sessions;
CREATE POLICY "public_select_kiosk" ON kiosk_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "auth_insert_kiosk" ON kiosk_sessions;
CREATE POLICY "auth_insert_kiosk" ON kiosk_sessions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_kiosk" ON kiosk_sessions;
CREATE POLICY "auth_update_kiosk" ON kiosk_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_incentive_records_emp ON incentive_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_incentive_records_period ON incentive_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_absence_requests_emp ON absence_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_absence_requests_date ON absence_requests(absence_date);
CREATE INDEX IF NOT EXISTS idx_area_salary_rates_area ON area_salary_rates(area_id);

CREATE OR REPLACE TRIGGER trg_area_rates_updated_at
  BEFORE UPDATE ON area_salary_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_incentive_records_updated_at
  BEFORE UPDATE ON incentive_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_absence_requests_updated_at
  BEFORE UPDATE ON absence_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();


/* ====================== 009: Outlet schedules ============================== */

CREATE TABLE IF NOT EXISTS outlet_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  shift_template_id uuid NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  day_of_week       smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  min_staff         smallint NOT NULL DEFAULT 1,
  max_staff         smallint,
  is_active         boolean NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, shift_template_id, day_of_week)
);

CREATE OR REPLACE FUNCTION update_outlet_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_outlet_schedules_updated_at ON outlet_schedules;
CREATE TRIGGER set_outlet_schedules_updated_at
  BEFORE UPDATE ON outlet_schedules
  FOR EACH ROW EXECUTE FUNCTION update_outlet_schedules_updated_at();

ALTER TABLE outlet_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_outlet_schedules" ON outlet_schedules;
CREATE POLICY "select_outlet_schedules" ON outlet_schedules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_outlet_schedules" ON outlet_schedules;
CREATE POLICY "insert_outlet_schedules" ON outlet_schedules FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_outlet_schedules" ON outlet_schedules;
CREATE POLICY "update_outlet_schedules" ON outlet_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_outlet_schedules" ON outlet_schedules;
CREATE POLICY "delete_outlet_schedules" ON outlet_schedules FOR DELETE TO authenticated USING (true);


/* ====================== 010: Storage buckets =============================== */

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('attendance-photos', 'attendance-photos', true),
  ('face-photos', 'face-photos', true),
  ('employee-documents', 'employee-documents', true)
ON CONFLICT (id) DO NOTHING;

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


/* ============================ SELESAI ✅ =================================== */
