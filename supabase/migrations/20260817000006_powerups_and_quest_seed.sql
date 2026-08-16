-- =====================================================================
-- 20260817000006 — working power-ups + complete quest seed
-- ---------------------------------------------------------------------
-- Phase 4 backlog (audit 2026-08-17):
-- (a) student_inventory has UNIQUE(student_id, item_id) — consumables
--     (Heart Refill, Streak Freeze) can't stack and nothing ever consumed
--     them. Add a quantity column + an atomic consume RPC.
-- (b) quest_templates seed lacks 'reach_familiar', which ExerciseRunner
--     updates on every mastery lift — progress was written to a quest that
--     never existed.

-- (a1) stacking quantities for consumables
ALTER TABLE public.student_inventory
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- (a2) atomic consume (decrement, keep the row for history). SECURITY
-- DEFINER so the read-modify-write can't race two tabs into a double spend.
CREATE OR REPLACE FUNCTION public.consume_inventory_item(p_item_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;
    UPDATE public.student_inventory
       SET quantity = quantity - 1
     WHERE student_id = auth.uid()
       AND item_id = p_item_id
       AND quantity > 0
    RETURNING id INTO v_id;
    RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_inventory_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_inventory_item(TEXT) TO authenticated;

-- (b) missing quest template (guarded: quest_templates has no unique on type)
INSERT INTO public.quest_templates (type, title, target, reward_gems, reward_xp)
SELECT 'reach_familiar', 'Master {target} Words', 3, 10, 15
WHERE NOT EXISTS (
    SELECT 1 FROM public.quest_templates WHERE type = 'reach_familiar'
);
