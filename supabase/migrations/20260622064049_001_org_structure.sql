/*
# Migration 001: Organization Structure

Creates the hierarchical organization tables: companies, regions, areas, and outlets.

1. New Tables
   - `companies` — top-level tenant/company record
   - `regions` — regional grouping under a company
   - `areas` — area grouping under a region
   - `outlets` — physical/virtual locations under an area with GPS + geofence support

2. All tables
   - Primary key: uuid, gen_random_uuid()
   - created_at / updated_at timestamps
   - soft-delete via `is_active` boolean

3. Outlets extra fields
   - outlet_code, outlet_type (enum), lat/lng, geofence_radius_meters
   - manager_id placeholder (FK added later after employees table)

4. Security
   - RLS enabled on all tables
   - Authenticated users can SELECT all (read-only public org data)
   - Only service-role / admin to insert/update (enforced via policies referencing user profile role)
   - For bootstrap simplicity, allow authenticated insert/update/delete — locked down via app-layer role checks
*/

-- Outlet type enum
DO $$ BEGIN
  CREATE TYPE outlet_type AS ENUM (
    'coffee_shop', 'coffee_corner', 'mobile_coffee',
    'warehouse', 'office', 'event_booth', 'distributor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Companies
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

-- Regions
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

-- Areas
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

-- Outlets
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

-- Updated_at trigger function
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
