
ALTER TABLE IF EXISTS audit_logs SET SCHEMA public;

ALTER TABLE IF EXISTS public.quest_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quest_templates"
  ON public.quest_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage quest_templates"
  ON public.quest_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

ALTER TABLE IF EXISTS public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shop_items"
  ON public.shop_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers and admins can manage shop_items"
  ON public.shop_items FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Students can update own inventory"
  ON public.student_inventory FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can submit assignments"
  ON public.student_assignments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

REVOKE ALL ON public.llm_telemetry FROM anon;

GRANT SELECT, INSERT ON public.llm_telemetry TO authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND table_name IN (
        'profiles', 'classes', 'units', 'assignments',
        'student_assignments', 'messages', 'student_progress'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.update_updated_at_column();',
      t, t
    );
  END LOOP;
END;
$$;
