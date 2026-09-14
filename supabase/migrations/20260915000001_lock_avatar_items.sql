-- =====================================================================
-- 20260915000001 — Temporarily lock all wearable avatar items
-- (owner decision 2026-09-15)
--
-- Wearable art (clothes/accessories/objects) doesn't fit the Stitch
-- characters well yet. Until it is redone, students may only buy
-- CHARACTERS (kind='base') and BACKGROUNDS (slot='background').
-- Power-ups are unrelated to avatar art and stay purchasable.
--
-- Mechanism: shop_items.active = FALSE is the system's native catalog
-- switch — every surface already honors it:
--   * AvatarService.getCatalog() filters active=true (Shop wardrobe
--     sections and Studio slot grids disappear on their own);
--   * equip_item rejects inactive items ('invalid_item') while the
--     unequip path (p_item_id NULL) keeps working;
--   * _shared/avatarCompose.ts skips inactive layers when rendering.
-- buy_shop_item is the one path that never checked active — it is
-- hardened here so locked items can't be bought even by direct RPC.
--
-- REVERSAL when the art fits: set active = TRUE again for
-- kind='item' AND slot <> 'background' (single UPDATE).
-- =====================================================================

-- 1) Lock the wearables.
UPDATE public.shop_items
   SET active = FALSE
 WHERE kind = 'item'
   AND slot IS DISTINCT FROM 'background';

-- 2) buy_shop_item: reject inactive (locked/retired) items server-side.
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
  SELECT cost INTO v_cost FROM public.shop_items
   WHERE id = p_item_id AND active;
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
REVOKE ALL ON FUNCTION public.buy_shop_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_shop_item(TEXT) TO authenticated;

-- 3) Strip now-locked items from stored configs so no avatar keeps
--    rendering a mis-fitted wearable. Keeps background entries and the
--    body; drops null/unknown refs (normalizeConfig re-adds nulls).
CREATE TEMP TABLE _locked_config_profiles AS
SELECT p.id
  FROM public.profiles p
 WHERE EXISTS (
     SELECT 1
       FROM jsonb_each(COALESCE(p.avatar_config -> 'items', '{}'::jsonb)) AS kv(key, value)
      WHERE jsonb_typeof(kv.value) = 'string'
        AND EXISTS (
            SELECT 1 FROM public.shop_items s
             WHERE s.id = kv.value #>> '{}'
               AND s.kind = 'item' AND NOT s.active
        )
 );

UPDATE public.profiles p
   SET avatar_config = jsonb_set(p.avatar_config, '{items}', COALESCE((
       SELECT jsonb_object_agg(kv.key, kv.value)
         FROM jsonb_each(p.avatar_config -> 'items') AS kv(key, value)
        WHERE jsonb_typeof(kv.value) = 'string'
          AND EXISTS (
              SELECT 1 FROM public.shop_items s
               WHERE s.id = kv.value #>> '{}'
                 AND s.kind = 'item' AND s.active
          )
   ), '{}'::jsonb))
 WHERE p.id IN (SELECT id FROM _locked_config_profiles);

-- Equipped flags on locked items are meaningless now.
UPDATE public.student_inventory si
   SET equipped = FALSE
  FROM public.shop_items s
 WHERE s.id = si.item_id AND s.kind = 'item' AND NOT s.active
   AND si.equipped;

-- 4) Invalidate stale renders for the stripped profiles. avatar_url is
--    nulled so no cached mis-fitted composite keeps showing; the next
--    Studio save (compose-avatar) re-renders clean from the new config.
DELETE FROM public.avatar_renders
 WHERE profile_id IN (SELECT id FROM _locked_config_profiles);

UPDATE public.profiles
   SET avatar_url = NULL
 WHERE id IN (SELECT id FROM _locked_config_profiles);

DROP TABLE _locked_config_profiles;
