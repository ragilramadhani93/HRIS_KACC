/*
# Migration 006: Payroll Engine and Expense Claims

Adds payroll processing tables and expense claim workflow.

1. New Tables
   - `payroll_components` — reusable salary component definitions per company (base, allowance, deduction)
   - `payroll_runs`        — a payroll batch for a company/period (draft → approved → paid)
   - `payroll_items`       — one row per employee per payroll_run, stores breakdown and net total
   - `payroll_item_lines`  — individual earning/deduction lines per payroll item
   - `expense_categories`  — configurable expense category master
   - `expense_claims`      — employee expense claim submission with multi-level approval

2. Enums
   - `payroll_run_status`   : draft, review, approved, paid, cancelled
   - `component_type`       : earning, deduction, benefit
   - `expense_claim_status` : draft, submitted, approved_supervisor, approved_manager, approved_finance, approved, rejected, cancelled

3. Security
   - RLS enabled, authenticated CRUD on all tables (fine-grained per-employee scoping enforced in app layer)
*/

-- Enums
DO $$ BEGIN CREATE TYPE payroll_run_status AS ENUM ('draft','review','approved','paid','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE component_type AS ENUM ('earning','deduction','benefit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE expense_claim_status AS ENUM ('draft','submitted','approved_supervisor','approved_manager','approved_finance','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payroll components (template definitions)
CREATE TABLE IF NOT EXISTS payroll_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  component_type component_type NOT NULL DEFAULT 'earning',
  is_taxable boolean NOT NULL DEFAULT false,
  is_fixed boolean NOT NULL DEFAULT true,          -- fixed amount vs percentage
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

-- Payroll runs (batch)
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

-- Payroll items (one per employee per run)
CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  -- Pre-computed totals for fast display
  total_earnings numeric(15,2) NOT NULL DEFAULT 0,
  total_deductions numeric(15,2) NOT NULL DEFAULT 0,
  total_bpjs_kes numeric(15,2) NOT NULL DEFAULT 0,
  total_bpjs_tk numeric(15,2) NOT NULL DEFAULT 0,
  total_tax numeric(15,2) NOT NULL DEFAULT 0,
  net_salary numeric(15,2) NOT NULL DEFAULT 0,
  -- Attendance summary for the period
  work_days integer NOT NULL DEFAULT 0,
  present_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  late_days integer NOT NULL DEFAULT 0,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  leave_days integer NOT NULL DEFAULT 0,
  -- Slip
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

-- Payroll item lines (individual earning/deduction entries)
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

-- Expense categories
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

-- Expense claims
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
  -- Approval chain
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

-- Indexes
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
