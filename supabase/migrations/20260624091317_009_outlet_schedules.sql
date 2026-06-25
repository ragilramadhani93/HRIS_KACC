
CREATE TABLE outlet_schedules (
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

CREATE TRIGGER set_outlet_schedules_updated_at
  BEFORE UPDATE ON outlet_schedules
  FOR EACH ROW EXECUTE FUNCTION update_outlet_schedules_updated_at();

ALTER TABLE outlet_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_outlet_schedules" ON outlet_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_outlet_schedules" ON outlet_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_outlet_schedules" ON outlet_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_outlet_schedules" ON outlet_schedules FOR DELETE TO authenticated USING (true);
