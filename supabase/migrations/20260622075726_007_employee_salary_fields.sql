/*
# Migration 007: Add employee basic_salary and BPJS fields

Adds salary fields to employees table and a leave_quota function for balance seeding.
*/

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bpjs_kes_employee numeric(6,4) NOT NULL DEFAULT 0.01,  -- 1% employee share
  ADD COLUMN IF NOT EXISTS bpjs_kes_employer numeric(6,4) NOT NULL DEFAULT 0.04,  -- 4% employer share
  ADD COLUMN IF NOT EXISTS bpjs_tk_jht_employee numeric(6,4) NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS bpjs_tk_jht_employer numeric(6,4) NOT NULL DEFAULT 0.037,
  ADD COLUMN IF NOT EXISTS npwp text;

-- Add sequence counter for employee codes
CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1000;

-- Function to get next employee code
CREATE OR REPLACE FUNCTION next_employee_code(prefix text DEFAULT 'EMP')
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN prefix || LPAD(nextval('employee_code_seq')::text, 5, '0');
END;
$$;
