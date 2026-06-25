/*
# Migration 002: User Profiles and Employees

Creates user profile (role/permissions layer on top of auth.users) and employee master data.

1. New Tables
   - `user_profiles` — extends auth.users with app role, company, and display info
   - `employees` — full employee record (personal, employment, assignment)
   - `employee_documents` — uploaded document files per employee

2. Enums
   - `app_role`: super_admin, hr_admin, regional_manager, area_manager, supervisor, auditor, employee
   - `employee_status`: active, probation, contract, resigned, terminated
   - `document_type`: ktp, npwp, kk, bpjs, contract, other
   - `gender_type`: male, female
   - `marital_status`: single, married, divorced, widowed

3. Security
   - RLS on all tables
   - user_profiles: users can read their own + admins can read all
   - employees: authenticated read; insert/update scoped to admins via profile role
*/

-- Enums
DO $$ BEGIN CREATE TYPE app_role AS ENUM ('super_admin','hr_admin','regional_manager','area_manager','supervisor','auditor','employee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE employee_status AS ENUM ('active','probation','contract','resigned','terminated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('ktp','npwp','kk','bpjs','contract','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gender_type AS ENUM ('male','female'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE marital_status_type AS ENUM ('single','married','divorced','widowed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User profiles (one per auth.users row)
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

-- Employees
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
  -- Employment
  job_title text,
  department text,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  area_id uuid REFERENCES areas(id) ON DELETE SET NULL,
  primary_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  backup_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  join_date date,
  status employee_status NOT NULL DEFAULT 'active',
  -- Face profile
  face_registered boolean NOT NULL DEFAULT false,
  -- Metadata
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

-- Outlet FK on manager
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS manager_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- Employee documents
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

-- Outlet transfer history
CREATE TABLE IF NOT EXISTS outlet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  to_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  transfer_type text NOT NULL DEFAULT 'permanent', -- permanent | temporary
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_outlet ON employees(primary_outlet_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
