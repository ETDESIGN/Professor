CREATE TABLE IF NOT EXISTS public.llm_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL,
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_telemetry_unit ON public.llm_telemetry(unit_id);
CREATE INDEX IF NOT EXISTS idx_llm_telemetry_func ON public.llm_telemetry(function_name);

ALTER TABLE public.llm_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert telemetry"
  ON public.llm_telemetry FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Teachers can read telemetry"
  ON public.llm_telemetry FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

GRANT ALL ON public.llm_telemetry TO authenticated, anon, service_role;
