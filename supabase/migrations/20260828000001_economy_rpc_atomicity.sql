-- =====================================================================
-- 20260828000001 — economy RPC atomicity (FIXPLAN H2)
-- Replaces client-side read-modify-write on student_progress /
-- student_quests / student_inventory (lost updates, double claims,
-- lost gems on shop failure — audit 2026-08-28).
-- Pattern: mirror consume_inventory_item (20260817000006).
--
-- Schema facts verified against migrations (initial 20260320000000 +
-- reconcile 20260420000001 + hardening 20260622000000 + powerups
-- 20260817000006):
--   * student_progress.student_id UUID NOT NULL UNIQUE → ON CONFLICT ok
--   * student_progress(id, xp, total_xp_earned, gems)
--   * student_quests(id, student_id, quest_type, target, current,
--                    claimed, reward_xp, reward_gems, assigned_date)
--   * student_inventory(student_id, item_id, quantity,
--                       UNIQUE(student_id, item_id))
--   * shop_items(id TEXT PK, cost INTEGER NOT NULL)
--   * public.is_teacher_or_admin() exists (no args, STABLE)
--
-- OUT-parameter note: RETURNS TABLE columns are OUT params in plpgsql;
-- their NAMES are the caller-visible RPC result keys (RETURN QUERY assigns
-- positionally, aliases do not rename). Any clash with column names inside
-- DML bodies is resolved by aliasing the target table (sp.xp, sq.reward_xp).

-- Self-heal helper: every award RPC ensures the progress row exists first
-- (the auto-create trigger swallows insert failures with RAISE LOG).
CREATE OR REPLACE FUNCTION public.ensure_student_progress(p_student UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.student_progress (student_id, xp, gems)
  VALUES (p_student, 0, 0)
  ON CONFLICT (student_id) DO NOTHING;
END;
$$;

-- Student path: award XP to the caller (auth.uid()). Single atomic UPDATE.
CREATE OR REPLACE FUNCTION public.award_xp(p_amount INTEGER)
RETURNS TABLE(xp INTEGER, total_xp_earned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID := auth.uid();
  v_xp INTEGER;
  v_total INTEGER;
BEGIN
  IF v_student IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN;
  END IF;
  PERFORM public.ensure_student_progress(v_student);
  UPDATE public.student_progress sp
     SET xp = sp.xp + p_amount,
         total_xp_earned = sp.total_xp_earned + GREATEST(p_amount, 0)
   WHERE sp.student_id = v_student
  RETURNING sp.xp, sp.total_xp_earned INTO v_xp, v_total;

  RETURN QUERY SELECT v_xp, v_total;
END;
$$;

-- Teacher path (live-board addPoints): caller must be teacher/admin.
-- Single atomic UPDATE; returns the student's new XP total.
CREATE OR REPLACE FUNCTION public.award_xp_to_student(p_student UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN RETURN 0; END IF;
  IF NOT public.is_teacher_or_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ensure_student_progress(p_student);
  UPDATE public.student_progress
     SET xp = GREATEST(0, xp + p_amount),
         total_xp_earned = total_xp_earned + GREATEST(p_amount, 0)
   WHERE student_id = p_student
  RETURNING xp INTO v_xp;
  RETURN COALESCE(v_xp, 0);
END;
$$;

-- Student path: award gems to the caller. Single atomic UPDATE.
CREATE OR REPLACE FUNCTION public.award_gems(p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID := auth.uid();
  v_gems INTEGER;
BEGIN
  IF v_student IS NULL OR p_amount IS NULL OR p_amount = 0 THEN RETURN 0; END IF;
  PERFORM public.ensure_student_progress(v_student);
  UPDATE public.student_progress
     SET gems = gems + p_amount
   WHERE student_id = v_student
  RETURNING gems INTO v_gems;
  RETURN COALESCE(v_gems, 0);
END;
$$;

-- Atomic spend: the gems>=p_amount guard is part of the same UPDATE, so two
-- concurrent callers can never both succeed and drive gems negative.
CREATE OR REPLACE FUNCTION public.spend_gems(p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RETURN FALSE; END IF;
  UPDATE public.student_progress
     SET gems = gems - p_amount
   WHERE student_id = auth.uid()
     AND gems >= p_amount
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

-- Bump today's unclaimed quest progress for the caller. Capped at target.
CREATE OR REPLACE FUNCTION public.update_quest_progress(p_quest_type TEXT, p_increment INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.student_quests
     SET current = LEAST(current + COALESCE(p_increment, 1), target)
   WHERE student_id = auth.uid()
     AND quest_type = p_quest_type
     AND assigned_date = CURRENT_DATE
     AND claimed = FALSE;
END;
$$;

-- Atomic claim: exactly one caller can flip claimed=FALSE→TRUE (the UPDATE
-- condition is re-checked by the row lock), and the rewards are applied in
-- the same transaction. Empty result = not claimable (already claimed /
-- incomplete / not found).
CREATE OR REPLACE FUNCTION public.claim_quest_reward(p_quest_id UUID)
RETURNS TABLE(reward_xp INTEGER, reward_gems INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID;
  v_xp INTEGER;
  v_gems INTEGER;
  v_row public.student_quests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.student_quests WHERE id = p_quest_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NULL OR v_row.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_quests sq
     SET claimed = TRUE
   WHERE sq.id = p_quest_id
     AND sq.claimed = FALSE
     AND sq.current >= sq.target
  RETURNING sq.reward_xp, sq.reward_gems INTO v_xp, v_gems;

  IF v_xp IS NULL THEN RETURN; END IF;  -- already claimed or incomplete

  PERFORM public.ensure_student_progress(v_row.student_id);
  UPDATE public.student_progress
     SET xp = xp + v_xp, total_xp_earned = total_xp_earned + v_xp,
         gems = gems + v_gems
   WHERE student_id = v_row.student_id;

  RETURN QUERY SELECT v_xp, v_gems;
END;
$$;

-- Atomic buy: validate + debit + inventory-upsert in ONE transaction.
-- Stacks quantity (owner decision 2026-08-28).
CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'insufficient'; END IF;
  SELECT cost INTO v_cost FROM public.shop_items WHERE id = p_item_id;
  IF v_cost IS NULL THEN RETURN 'invalid_item'; END IF;

  PERFORM public.ensure_student_progress(auth.uid());
  UPDATE public.student_progress
     SET gems = gems - v_cost
   WHERE student_id = auth.uid()
     AND gems >= v_cost;
  IF NOT FOUND THEN RETURN 'insufficient'; END IF;

  INSERT INTO public.student_inventory (student_id, item_id, quantity)
  VALUES (auth.uid(), p_item_id, 1)
  ON CONFLICT (student_id, item_id)
  DO UPDATE SET quantity = public.student_inventory.quantity + 1;

  RETURN 'ok';
END;
$$;

-- ensure_student_progress: deliberately NOT granted to authenticated — it is
-- only invoked internally by the SECURITY DEFINER RPCs above (owner context);
-- granting it would let any authenticated user create progress rows for
-- arbitrary UUIDs.
REVOKE ALL ON FUNCTION public.ensure_student_progress(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_xp(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_xp_to_student(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_gems(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spend_gems(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_quest_progress(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_quest_reward(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buy_shop_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp_to_student(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_gems(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_gems(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_quest_progress(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_shop_item(TEXT) TO authenticated;
