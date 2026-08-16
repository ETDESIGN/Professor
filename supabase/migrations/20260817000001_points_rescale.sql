-- ============================================
-- Points rescale (2026-08-17): move to a 1–5 per-question scale
-- ============================================
-- Owner decisions locked 2026-08-17:
--   • Live board scoring: 1/2/3 points by difficulty, streak +1/+2, hard cap 5
--     per question, wrong attempt −1 (was 30-base with ×1.4/×2.0 multipliers).
--   • Home XP ÷10 (XP_PER_LEVEL 1000 → 100, all XP_REWARDS ÷10).
--   • Fresh start: class-points ledger wiped and home XP zeroed (chosen over
--     converting historical rows). Gems, streaks, hearts, shop and inventory
--     are separate economies and are NOT touched.
--   • Leaderboard keeps the combined class-points + home-XP total (both
--     economies rescaled by the same factor, so the sum stays meaningful).
--
-- Follows the frontend change in apps/board/templates/scoringDefaults.ts and
-- constants/gamification.ts — deploy both together.

-- 1. Reset class points (point_transactions is the class-points ledger; the
--    unified leaderboard total = home XP + SUM(ledger)).
DELETE FROM public.point_transactions;

-- 2. Reset home XP to the new scale. Levels recompute from 0
--    (level = floor(xp / 100) + 1 after the rescale). Gems/streaks/hearts kept.
UPDATE public.student_progress
SET xp = 0,
    total_xp_earned = 0;

-- 3. Rescale quest templates (÷10): earn_xp target 50 → 5 (5 correct answers),
--    quest XP reward 15 → 2. quest_templates feeds getDailyQuests first —
--    stale DB rows would override the rescaled code fallbacks.
UPDATE public.quest_templates
SET target = 5,
    reward_xp = 2
WHERE type = 'earn_xp';

UPDATE public.quest_templates
SET reward_xp = 2
WHERE type <> 'earn_xp';

-- 4. Fix already-assigned quests: rows embed the old target/reward, and an
--    in-flight earn_xp row (e.g. current=30) would insta-complete against the
--    new target of 5 — reset progress too. Claimed (historical) rows stay as-is.
UPDATE public.student_quests
SET target = 5,
    reward_xp = 2,
    current = 0
WHERE quest_type = 'earn_xp'
  AND claimed = false;

UPDATE public.student_quests
SET reward_xp = 2
WHERE quest_type <> 'earn_xp'
  AND claimed = false;
