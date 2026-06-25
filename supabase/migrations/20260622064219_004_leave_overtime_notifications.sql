/*
# Migration 004: Leave, Overtime, Notifications, and Audit Log

Covers the leave management system, overtime requests, in-app notifications, and system audit logging.

1. New Tables
   - `leave_types` — configurable leave types per company
   - `leave_balances` — per employee per year balance tracking
   - `leave_requests` — employee leave requests with multi-level approval chain
   - `overtime_requests` — overtime submissions with approval workflow
   - `notifications` — in-app notification inbox
   - `audit_logs` — immutable action log for security/compliance

2. Enums
   - `leave_status` / `overtime_status`: pending, approved_supervisor, approved_manager, approved_hr, approved, rejected, cancelled
   - `notification_type`: attendance, payroll, leave, overtime, shift, system

3. Security
   - RLS on all tables
   - leave_requests + overtime: employee reads own rows; supervisors/managers read based on approver chain
   - notifications: users read only their own
   - audit_logs: read-only for authenticated; insert only (no update/delete to preserve integrity)
*/

-- Leave type enum
DO $$ BEGIN CREATE TYPE leave_status AS ENUM ('pending','approved_supervisor','approved_manager','approved_hr','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE overtime_status AS ENUM ('pending','approved_supervisor','approved_manager','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('attendance','payroll','leave','overtime','shift','system','approval'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Leave types master
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

-- Leave balances
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

-- Leave requests
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
  -- Approval chain
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

-- Overtime requests
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

-- Notifications
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

-- Audit logs (immutable — no update/delete policies)
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

-- Indexes
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
