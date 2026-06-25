/*
# Migration 008: Daily salary scheme, area rates, incentives, and absence rework

1. Add daily salary scheme to employees table
2. Add area_salary_rates table (per-area rate overrides)
3. Add incentive_schemes + incentive_records tables
4. Add absence_requests table (replaces leave_requests workflow)
5. Rename/repurpose leave_types concept to absence_types (sakit, izin, perbantuan)
*/

-- Daily salary flag and daily rate fields on employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_scheme text NOT NULL DEFAULT 'monthly'
    CHECK (salary_scheme IN ('monthly','daily')),
  ADD COLUMN IF NOT EXISTS daily_rate numeric(12,2) NOT NULL DEFAULT 0;

-- Area-level salary rate overrides (daily rate per area for a specific job title / all)
CREATE TABLE IF NOT EXISTS area_salary_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  job_title text,           -- NULL = applies to all job titles in area
  daily_rate numeric(12,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE area_salary_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_area_rates" ON area_salary_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_area_rates" ON area_salary_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_area_rates" ON area_salary_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_area_rates" ON area_salary_rates FOR DELETE TO authenticated USING (true);

-- Incentive schemes master (company-level)
CREATE TABLE IF NOT EXISTS incentive_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  incentive_type text NOT NULL CHECK (incentive_type IN ('sales','achievement','attendance')),
  -- For attendance incentive: fixed amount if conditions met
  fixed_amount numeric(12,2) NOT NULL DEFAULT 150000,
  -- For sales/achievement: manual adjustment per record
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incentive_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_inc_scheme" ON incentive_schemes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_inc_scheme" ON incentive_schemes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inc_scheme" ON incentive_schemes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_inc_scheme" ON incentive_schemes FOR DELETE TO authenticated USING (true);

-- Incentive records per employee per payroll period
CREATE TABLE IF NOT EXISTS incentive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  incentive_scheme_id uuid REFERENCES incentive_schemes(id) ON DELETE SET NULL,
  incentive_type text NOT NULL CHECK (incentive_type IN ('sales','achievement','attendance')),
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  -- Attendance incentive: auto-calculated
  qualified boolean NOT NULL DEFAULT false,      -- met all conditions
  absent_days integer NOT NULL DEFAULT 0,        -- in period
  late_days integer NOT NULL DEFAULT 0,
  sick_no_doc_days integer NOT NULL DEFAULT 0,   -- sakit tanpa surat dokter
  -- All types: final approved amount
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, incentive_type, period_year, period_month)
);

ALTER TABLE incentive_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_inc_rec" ON incentive_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_inc_rec" ON incentive_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inc_rec" ON incentive_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_inc_rec" ON incentive_records FOR DELETE TO authenticated USING (true);

-- Absence types (replaces leave_types concept for this app)
-- sakit_dengan_surat, sakit_tanpa_surat, izin, perbantuan
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

-- Absence requests (simplied single-level approval by supervisor/HR)
CREATE TABLE IF NOT EXISTS absence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  absence_type absence_type NOT NULL,
  absence_date date NOT NULL,         -- single day; for multi-day, one row per day or use end_date
  end_date date,                       -- inclusive; if null = single day
  total_days integer NOT NULL DEFAULT 1,
  reason text,
  document_url text,                   -- surat dokter / surat izin
  -- Perbantuan fields
  target_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  -- Approval
  status absence_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE absence_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_absence" ON absence_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_absence" ON absence_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_absence" ON absence_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_absence" ON absence_requests FOR DELETE TO authenticated USING (true);

-- Kiosk sessions: store temporary face-match tokens for kiosk check-in
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
CREATE POLICY "public_select_kiosk" ON kiosk_sessions FOR SELECT USING (true);
CREATE POLICY "auth_insert_kiosk" ON kiosk_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_kiosk" ON kiosk_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Indexes
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
