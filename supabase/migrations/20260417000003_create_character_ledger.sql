CREATE TABLE IF NOT EXISTS public.character_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_ledger_unit ON public.character_ledger(unit_id);

ALTER TABLE public.character_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read character_ledger"
  ON public.character_ledger FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Teachers can manage character_ledger"
  ON public.character_ledger FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

GRANT ALL ON public.character_ledger TO authenticated, anon, service_role;
