-- =====================================================================
-- 20260904000001 — Avatar system v2 (spec 2026-09-03)
-- Layered 2D paperdoll: shop_items gains slot/rarity/compat metadata,
-- avatar_renders caches composited images, and equip/body/skin RPCs make
-- profiles.avatar_config the single source of truth. profiles.avatar_url
-- becomes a RENDER URL only (never JSON again).
--
-- Verified schema facts: shop_items(id TEXT PK, name, category, cost,
-- description, icon) — 20260420000002; student_inventory(student_id,
-- item_id, quantity, equipped, UNIQUE(student_id,item_id)) —
-- 20260420000002 + 20260817000006; buy_shop_item atomic — 20260828000001;
-- public.is_teacher_or_admin() exists.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) shop_items: avatar catalog metadata
-- ---------------------------------------------------------------------
ALTER TABLE public.shop_items
    ADD COLUMN IF NOT EXISTS slot TEXT,
    ADD COLUMN IF NOT EXISTS rarity TEXT,
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'item',
    ADD COLUMN IF NOT EXISTS compatible_bodies TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS layer_asset_path TEXT,
    ADD COLUMN IF NOT EXISTS preview_url TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS unlock_type TEXT NOT NULL DEFAULT 'gems';

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_kind_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_kind_check
    CHECK (kind IN ('item', 'base', 'emote', 'powerup'));
ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_rarity_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_rarity_check
    CHECK (rarity IS NULL OR rarity IN ('common', 'rare', 'epic', 'legendary'));
ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_unlock_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_unlock_check
    CHECK (unlock_type IN ('gems', 'default', 'quest', 'event'));

-- Power-ups are not avatar items.
UPDATE public.shop_items
   SET kind = 'powerup', unlock_type = 'gems', active = TRUE
 WHERE id IN ('freeze', 'hearts');

-- ---------------------------------------------------------------------
-- 2) shop_items RLS (was: no RLS at all — pre-existing hole)
-- ---------------------------------------------------------------------
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_items_select_policy" ON public.shop_items;
CREATE POLICY "shop_items_select_policy" ON public.shop_items
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "shop_items_insert_policy" ON public.shop_items;
CREATE POLICY "shop_items_insert_policy" ON public.shop_items
    FOR INSERT WITH CHECK (public.is_teacher_or_admin());

DROP POLICY IF EXISTS "shop_items_update_policy" ON public.shop_items;
CREATE POLICY "shop_items_update_policy" ON public.shop_items
    FOR UPDATE USING (public.is_teacher_or_admin())
    WITH CHECK (public.is_teacher_or_admin());

DROP POLICY IF EXISTS "shop_items_delete_policy" ON public.shop_items;
CREATE POLICY "shop_items_delete_policy" ON public.shop_items
    FOR DELETE USING (public.is_teacher_or_admin());

-- ---------------------------------------------------------------------
-- 3) avatar_renders: composited-image cache (written by the edge only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avatar_renders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    config_hash TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'idle',
    base_path TEXT NOT NULL,
    sizes INTEGER[] NOT NULL DEFAULT '{128,256,512,768}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profile_id, config_hash, variant)
);

ALTER TABLE public.avatar_renders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avatar_renders_select_policy" ON public.avatar_renders;
CREATE POLICY "avatar_renders_select_policy" ON public.avatar_renders
    FOR SELECT USING (profile_id = auth.uid() OR public.is_teacher_or_admin());
-- No INSERT/UPDATE/DELETE policies: only the service key (edge compositor)
-- writes render rows.

-- ---------------------------------------------------------------------
-- 4) Helper: read/normalize a profile's avatar_config with defaults
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avatar_config_get(p_profile UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    -- NOTE (fixed 2026-09-05): jsonb || is a RIGHT-wins merge — defaults
    -- MUST come FIRST or they clobber the stored body/skin on every RPC read
    -- (equipping any item silently reset species/body to human_boy).
    SELECT COALESCE(
        ('{"version":1,"body":"human_boy","skin":1}'::jsonb
            || NULLIF(p.avatar_config::text, '')::jsonb)
        || jsonb_build_object('items', COALESCE(NULLIF(p.avatar_config::text, '')::jsonb -> 'items', '{}'::jsonb)),
        '{"version":1,"body":"human_boy","skin":1,"items":{}}'::jsonb
    )
    FROM public.profiles p
    WHERE p.id = p_profile;
$$;

-- ---------------------------------------------------------------------
-- 5) equip_item: atomic equip/unequip of a slot item
--    p_item_id NULL + p_slot → unequip that slot.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equip_item(p_item_id TEXT, p_slot TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student UUID := auth.uid();
    v_config JSONB;
    v_body TEXT;
    v_slot TEXT;
    v_item RECORD;
BEGIN
    IF v_student IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;

    v_config := public.avatar_config_get(v_student);
    v_body := COALESCE(v_config ->> 'body', 'human_boy');

    IF p_item_id IS NULL THEN
        v_slot := p_slot;
        IF v_slot NOT IN ('hair','eyes','outfit','headwear','face','handheld','back','background') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'invalid_slot');
        END IF;
        v_config := jsonb_set(v_config, ARRAY['items', v_slot], 'null'::jsonb);
        UPDATE public.student_inventory si
           SET equipped = FALSE
         WHERE si.student_id = v_student
           AND si.item_id IN (SELECT id FROM public.shop_items
                               WHERE slot = v_slot AND kind = 'item');
    ELSE
        SELECT * INTO v_item FROM public.shop_items
         WHERE id = p_item_id AND active AND kind = 'item';
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'invalid_item');
        END IF;

        IF v_item.unlock_type <> 'default' AND NOT EXISTS (
            SELECT 1 FROM public.student_inventory
             WHERE student_id = v_student AND item_id = p_item_id
        ) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_owned');
        END IF;

        -- Human-only slots need a human body; per-item compatibility list wins last.
        IF v_item.slot IN ('hair','eyes','outfit') AND v_body NOT LIKE 'human%' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'incompatible_body');
        END IF;
        IF v_item.compatible_bodies <> '{}' AND NOT (v_body = ANY (v_item.compatible_bodies)) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'incompatible_body');
        END IF;

        v_config := jsonb_set(v_config, ARRAY['items', v_item.slot], to_jsonb(p_item_id));

        UPDATE public.student_inventory si
           SET equipped = (si.item_id = p_item_id)
         WHERE si.student_id = v_student
           AND si.item_id IN (SELECT id FROM public.shop_items
                               WHERE slot = v_item.slot AND kind = 'item');
    END IF;

    UPDATE public.profiles
       SET avatar_config = v_config
     WHERE id = v_student;

    RETURN jsonb_build_object('ok', true, 'config', v_config);
END;
$$;

-- ---------------------------------------------------------------------
-- 6) set_avatar_body: switch base body (species are purchased bases);
--    strips items the new body can't wear.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_avatar_body(p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student UUID := auth.uid();
    v_config JSONB;
    v_base RECORD;
    v_slot TEXT;
    v_item RECORD;
BEGIN
    IF v_student IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;

    SELECT * INTO v_base FROM public.shop_items
     WHERE id = p_body AND kind = 'base' AND active;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
    END IF;

    IF v_base.unlock_type <> 'default' AND NOT EXISTS (
        SELECT 1 FROM public.student_inventory
         WHERE student_id = v_student AND item_id = p_body
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_owned');
    END IF;

    v_config := public.avatar_config_get(v_student);
    v_config := jsonb_set(v_config, '{body}', to_jsonb(p_body));

    -- Strip items the new body cannot wear (human-only slots + explicit lists).
    FOR v_slot IN SELECT jsonb_object_keys(COALESCE(v_config -> 'items', '{}'::jsonb)) LOOP
        CONTINUE WHEN v_config -> 'items' ->> v_slot IS NULL;
        IF v_slot IN ('hair','eyes','outfit') AND p_body NOT LIKE 'human%' THEN
            v_config := jsonb_set(v_config, ARRAY['items', v_slot], 'null'::jsonb);
        ELSE
            SELECT * INTO v_item FROM public.shop_items
             WHERE id = (v_config -> 'items' ->> v_slot) AND kind = 'item';
            IF FOUND AND v_item.compatible_bodies <> '{}'
               AND NOT (p_body = ANY (v_item.compatible_bodies)) THEN
                v_config := jsonb_set(v_config, ARRAY['items', v_slot], 'null'::jsonb);
            END IF;
        END IF;
    END LOOP;

    UPDATE public.profiles
       SET avatar_config = v_config
     WHERE id = v_student;

    UPDATE public.student_inventory si
       SET equipped = (si.item_id = p_body)
     WHERE si.student_id = v_student
       AND si.item_id IN (SELECT id FROM public.shop_items WHERE kind = 'base');

    RETURN jsonb_build_object('ok', true, 'config', v_config);
END;
$$;

-- ---------------------------------------------------------------------
-- 7) set_avatar_skin: tone index 1..6 (ignored by species bases)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_avatar_skin(p_skin INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student UUID := auth.uid();
    v_config JSONB;
BEGIN
    IF v_student IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;
    v_config := public.avatar_config_get(v_student);
    v_config := jsonb_set(v_config, '{skin}', to_jsonb(LEAST(GREATEST(COALESCE(p_skin, 1), 1), 6)));
    UPDATE public.profiles
       SET avatar_config = v_config
     WHERE id = v_student;
    RETURN jsonb_build_object('ok', true, 'config', v_config);
END;
$$;

REVOKE ALL ON FUNCTION public.avatar_config_get(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_item(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_avatar_body(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_avatar_skin(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_item(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_avatar_body(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_avatar_skin(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Backfill: the old builder wrote JSON into avatar_url — every <img>
--    consumer shows a broken image. Clear it; compose-avatar will refill
--    with a real render URL on first save. (Legacy JSON configs migrate
--    no values — the slot model is new.)
-- ---------------------------------------------------------------------
UPDATE public.profiles
   SET avatar_url = NULL
 WHERE avatar_url LIKE '{%';

-- ---------------------------------------------------------------------
-- 9) Catalog seed (idempotent; art paths follow avatars/layers/{id}.png).
--    Pricing: common 20 / rare 40 / epic 75 / legendary 150 (spec §2.5).
--    Free starters carry unlock_type 'default' — free = cool (spec §2.5).
--    Legacy ids (hat_crown, shirt_space, glass_cool) keep their ids so
--    existing owners keep their purchases — they finally render now.
-- ---------------------------------------------------------------------
INSERT INTO public.shop_items
    (id, name, category, cost, description, icon, slot, rarity, kind,
     compatible_bodies, layer_asset_path, sort_order, active, unlock_type)
VALUES
    -- Bases (kind='base'; species are the flagship gem purchases)
    ('human_boy',  'Boy',     'avatar',   0, 'The classic explorer.',    'User',     NULL, NULL,        'base', '{}', 'avatars/bases/human_boy_skin1.png',  1, TRUE, 'default'),
    ('human_girl', 'Girl',    'avatar',   0, 'The classic adventurer.', 'User',     NULL, NULL,        'base', '{}', 'avatars/bases/human_girl_skin1.png', 2, TRUE, 'default'),
    ('robot',      'Robot',   'avatar', 150, 'Beep boop. Extremely cool.', 'Bot',   NULL, 'epic',      'base', '{}', 'avatars/bases/robot_skin1.png',      3, TRUE, 'gems'),
    ('alien',      'Alien',   'avatar', 150, 'From a galaxy far away.',  'Sparkles',NULL, 'epic',      'base', '{}', 'avatars/bases/alien_skin1.png',      4, TRUE, 'gems'),
    ('monster',    'Monster', 'avatar', 150, 'Friendly. Mostly.',        'Ghost',   NULL, 'epic',      'base', '{}', 'avatars/bases/monster_skin1.png',    5, TRUE, 'gems'),
    -- Hair (human-only)
    ('hair_short_brown',  'Short Brown',  'avatar',  0, 'Clean and ready.',   NULL, 'hair', 'common', 'item', '{}', 'avatars/layers/hair_short_brown.png', 10, TRUE, 'default'),
    ('hair_long_black',   'Long Black',   'avatar',  0, 'Sleek and swift.',   NULL, 'hair', 'common', 'item', '{}', 'avatars/layers/hair_long_black.png', 11, TRUE, 'default'),
    ('hair_curly_blonde', 'Curly Blonde', 'avatar', 20, 'Springy curls.',    NULL, 'hair', 'common', 'item', '{}', 'avatars/layers/hair_curly_blonde.png', 12, TRUE, 'gems'),
    ('hair_spiky_pink',   'Spiky Pink',   'avatar', 40, 'Punk is not dead.', NULL, 'hair', 'rare',   'item', '{}', 'avatars/layers/hair_spiky_pink.png', 13, TRUE, 'gems'),
    ('hair_ponytail_red', 'Ponytail Red', 'avatar', 40, 'Sporty energy.',    NULL, 'hair', 'rare',   'item', '{}', 'avatars/layers/hair_ponytail_red.png', 14, TRUE, 'gems'),
    ('hair_afro_dark',    'Puff Afro',    'avatar', 40, 'Big and proud.',    NULL, 'hair', 'rare',   'item', '{}', 'avatars/layers/hair_afro_dark.png', 15, TRUE, 'gems'),
    ('hair_bun_blonde',   'Bun Blonde',   'avatar', 75, 'Elegant top bun.',  NULL, 'hair', 'epic',   'item', '{}', 'avatars/layers/hair_bun_blonde.png', 16, TRUE, 'gems'),
    ('hair_mohawk_green', 'Mohawk Green', 'avatar', 75, 'Maximum volume.',   NULL, 'hair', 'epic',   'item', '{}', 'avatars/layers/hair_mohawk_green.png', 17, TRUE, 'gems'),
    -- Eyes (human-only)
    ('eyes_happy_brown', 'Happy Brown',  'avatar',  0, 'The friendly default.', NULL, 'eyes', 'common', 'item', '{}', 'avatars/layers/eyes_happy_brown.png', 20, TRUE, 'default'),
    ('eyes_wink_blue',   'Wink Blue',    'avatar', 20, 'Just kidding. Or not.', NULL, 'eyes', 'common', 'item', '{}', 'avatars/layers/eyes_wink_blue.png', 21, TRUE, 'gems'),
    ('eyes_star_blue',   'Star Eyes',    'avatar', 40, 'Seeing possibilities.', NULL, 'eyes', 'rare',   'item', '{}', 'avatars/layers/eyes_star_blue.png', 22, TRUE, 'gems'),
    ('eyes_sleepy_grey', 'Sleepy Grey',  'avatar', 40, 'Five more minutes.',    NULL, 'eyes', 'rare',   'item', '{}', 'avatars/layers/eyes_sleepy_grey.png', 23, TRUE, 'gems'),
    ('eyes_laser_cyber', 'Laser Eyes',   'avatar', 75, ' pew pew ',             NULL, 'eyes', 'epic',   'item', '{}', 'avatars/layers/eyes_laser_cyber.png', 24, TRUE, 'gems'),
    -- Outfits (human-only, one-piece)
    ('outfit_hoodie_blue',    'Blue Hoodie',    'avatar',  0, 'Cozy classic.',       NULL, 'outfit', 'common',    'item', '{}', 'avatars/layers/outfit_hoodie_blue.png', 30, TRUE, 'default'),
    ('outfit_tshirt_red',     'Red T-Shirt',    'avatar',  0, 'Bright and simple.',  NULL, 'outfit', 'common',    'item', '{}', 'avatars/layers/outfit_tshirt_red.png', 31, TRUE, 'default'),
    ('outfit_overalls_denim', 'Denim Overalls', 'avatar', 20, 'Ready for mud.',      NULL, 'outfit', 'common',    'item', '{}', 'avatars/layers/outfit_overalls_denim.png', 32, TRUE, 'gems'),
    ('outfit_soccer_kit',     'Soccer Kit',     'avatar', 20, 'Number 10.',          NULL, 'outfit', 'common',    'item', '{}', 'avatars/layers/outfit_soccer_kit.png', 33, TRUE, 'gems'),
    ('outfit_chef_whites',    'Chef Whites',    'avatar', 20, 'What is cooking?',    NULL, 'outfit', 'common',    'item', '{}', 'avatars/layers/outfit_chef_whites.png', 34, TRUE, 'gems'),
    ('outfit_lab_coat',       'Lab Coat',       'avatar', 40, 'Scientist mode.',     NULL, 'outfit', 'rare',      'item', '{}', 'avatars/layers/outfit_lab_coat.png', 35, TRUE, 'gems'),
    ('outfit_astronaut_suit', 'Astronaut Suit', 'avatar', 40, 'To the moon.',        NULL, 'outfit', 'rare',      'item', '{}', 'avatars/layers/outfit_astronaut_suit.png', 36, TRUE, 'gems'),
    ('outfit_karate_gi',      'Karate Gi',      'avatar', 40, 'Hi-yah!',             NULL, 'outfit', 'rare',      'item', '{}', 'avatars/layers/outfit_karate_gi.png', 37, TRUE, 'gems'),
    ('shirt_space',           'Space Suit',     'avatar', 75, 'Explore the galaxy in style.', NULL, 'outfit', 'epic', 'item', '{}', 'avatars/layers/shirt_space.png', 38, TRUE, 'gems'),
    ('outfit_pirate_captain', 'Pirate Captain', 'avatar', 75, 'Yarrr.',              NULL, 'outfit', 'epic',      'item', '{}', 'avatars/layers/outfit_pirate_captain.png', 39, TRUE, 'gems'),
    ('outfit_wizard_robe',    'Wizard Robe',    'avatar', 75, 'You are a wizard.',   NULL, 'outfit', 'epic',      'item', '{}', 'avatars/layers/outfit_wizard_robe.png', 40, TRUE, 'gems'),
    ('outfit_superhero_suit', 'Superhero Suit', 'avatar', 150, 'Up, up and away!',   NULL, 'outfit', 'legendary', 'item', '{}', 'avatars/layers/outfit_superhero_suit.png', 41, TRUE, 'gems'),
    -- Headwear (universal — same head anchor on every body)
    ('headwear_cap_red',      'Red Cap',        'avatar',  0, 'Backwards optional.',  NULL, 'headwear', 'common',    'item', '{}', 'avatars/layers/headwear_cap_red.png', 50, TRUE, 'default'),
    ('headwear_party_hat',    'Party Hat',      'avatar', 20, 'Every day is a party.',NULL, 'headwear', 'common',    'item', '{}', 'avatars/layers/headwear_party_hat.png', 51, TRUE, 'gems'),
    ('headwear_beanie_orange','Orange Beanie',  'avatar', 20, 'Warm head, warm heart.',NULL,'headwear', 'common',    'item', '{}', 'avatars/layers/headwear_beanie_orange.png', 52, TRUE, 'gems'),
    ('headwear_gamer_headset','Gamer Headset',  'avatar', 40, 'Comms online.',        NULL, 'headwear', 'rare',      'item', '{}', 'avatars/layers/headwear_gamer_headset.png', 53, TRUE, 'gems'),
    ('headwear_cat_ears',     'Cat Ears',       'avatar', 40, 'Meow.',                NULL, 'headwear', 'rare',      'item', '{}', 'avatars/layers/headwear_cat_ears.png', 54, TRUE, 'gems'),
    ('headwear_viking_helmet','Viking Helmet',  'avatar', 75, 'Skol!',                NULL, 'headwear', 'epic',      'item', '{}', 'avatars/layers/headwear_viking_helmet.png', 55, TRUE, 'gems'),
    ('headwear_wizard_hat',   'Wizard Hat',     'avatar', 75, 'Pairs with the robe.', NULL, 'headwear', 'epic',      'item', '{}', 'avatars/layers/headwear_wizard_hat.png', 56, TRUE, 'gems'),
    ('hat_crown',             'Gold Crown',     'avatar', 150, 'A golden crown for your avatar.', NULL, 'headwear', 'legendary', 'item', '{}', 'avatars/layers/hat_crown.png', 57, TRUE, 'gems'),
    -- Face (universal)
    ('face_round_glasses', 'Round Glasses', 'avatar', 20, 'Very scholarly.',  NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_round_glasses.png', 60, TRUE, 'gems'),
    ('glass_cool',         'Cool Shades',   'avatar', 20, 'Look cool while learning.', NULL, 'face', 'common', 'item', '{}', 'avatars/layers/glass_cool.png', 61, TRUE, 'gems'),
    ('face_monocle',       'Monocle',       'avatar', 40, 'Quite.',           NULL, 'face', 'rare',   'item', '{}', 'avatars/layers/face_monocle.png', 62, TRUE, 'gems'),
    ('face_party_mask',    'Party Mask',    'avatar', 40, 'Who is that?',     NULL, 'face', 'rare',   'item', '{}', 'avatars/layers/face_party_mask.png', 63, TRUE, 'gems'),
    ('face_cyber_visor',   'Cyber Visor',   'avatar', 75, 'Neon HUD.',        NULL, 'face', 'epic',   'item', '{}', 'avatars/layers/face_cyber_visor.png', 64, TRUE, 'gems'),
    -- Handheld (universal)
    ('handheld_pencil_hero',  'Hero Pencil',   'avatar', 20, 'The mightiest tool.', NULL, 'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_pencil_hero.png', 70, TRUE, 'gems'),
    ('handheld_flag_checkered','Finish Flag',  'avatar', 40, 'First place.',       NULL, 'handheld', 'rare',   'item', '{}', 'avatars/layers/handheld_flag_checkered.png', 71, TRUE, 'gems'),
    ('handheld_ice_wand',     'Ice Wand',      'avatar', 40, 'Brrr.',              NULL, 'handheld', 'rare',   'item', '{}', 'avatars/layers/handheld_ice_wand.png', 72, TRUE, 'gems'),
    ('handheld_trophy_gold',  'Gold Trophy',   'avatar', 75, 'Champion.',          NULL, 'handheld', 'epic',   'item', '{}', 'avatars/layers/handheld_trophy_gold.png', 73, TRUE, 'gems'),
    -- Back (universal)
    ('back_cape_pink',     'Pink Cape',     'avatar', 40, 'Dramatic exits.', NULL, 'back', 'rare', 'item', '{}', 'avatars/layers/back_cape_pink.png', 80, TRUE, 'gems'),
    ('back_fairy_wings',   'Fairy Wings',   'avatar', 75, 'Sparkly.',        NULL, 'back', 'epic', 'item', '{}', 'avatars/layers/back_fairy_wings.png', 81, TRUE, 'gems'),
    ('back_rocket_jetpack','Rocket Jetpack','avatar', 75, '3… 2… 1…',        NULL, 'back', 'epic', 'item', '{}', 'avatars/layers/back_rocket_jetpack.png', 82, TRUE, 'gems'),
    -- Background (universal identity-card backdrops)
    ('bg_sky',     'Sunny Sky',  'avatar',  0, 'A perfect day.',   NULL, 'background', 'common', 'item', '{}', 'avatars/layers/bg_sky.png', 90, TRUE, 'default'),
    ('bg_stars',   'Starfield',  'avatar', 20, 'Dream big.',       NULL, 'background', 'common', 'item', '{}', 'avatars/layers/bg_stars.png', 91, TRUE, 'gems'),
    ('bg_forest',  'Deep Forest','avatar', 20, 'Adventure awaits.',NULL, 'background', 'common', 'item', '{}', 'avatars/layers/bg_forest.png', 92, TRUE, 'gems'),
    ('bg_galaxy',  'Galaxy',     'avatar', 75, 'Cosmic.',          NULL, 'background', 'epic',   'item', '{}', 'avatars/layers/bg_galaxy.png', 93, TRUE, 'gems'),
    -- Species signature items (restricted compatibility)
    ('sig_robot_antenna', 'Neon Antenna', 'avatar', 75, 'Robot exclusive.', NULL, 'headwear', 'epic', 'item', ARRAY['robot'],  'avatars/layers/sig_robot_antenna.png', 100, TRUE, 'gems'),
    ('sig_robot_core',    'Glowing Core', 'avatar', 75, 'Robot exclusive.', NULL, 'face',     'epic', 'item', ARRAY['robot'],  'avatars/layers/sig_robot_core.png', 101, TRUE, 'gems'),
    ('sig_monster_horns', 'Party Horns',  'avatar', 75, 'Monster exclusive.', NULL, 'headwear', 'epic', 'item', ARRAY['monster'], 'avatars/layers/sig_monster_horns.png', 102, TRUE, 'gems'),
    ('sig_alien_crown',   'Cosmic Tiara', 'avatar', 75, 'Alien exclusive.', NULL, 'headwear', 'epic', 'item', ARRAY['alien'],  'avatars/layers/sig_alien_crown.png', 103, TRUE, 'gems')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    cost = EXCLUDED.cost,
    description = EXCLUDED.description,
    slot = EXCLUDED.slot,
    rarity = EXCLUDED.rarity,
    kind = EXCLUDED.kind,
    compatible_bodies = EXCLUDED.compatible_bodies,
    layer_asset_path = EXCLUDED.layer_asset_path,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active,
    unlock_type = EXCLUDED.unlock_type;


-- 2026-09-05: 6th base (Bender-style robot) + two FREE universal test
-- accessories (single-cutout method — one image fits every body).
INSERT INTO public.shop_items
    (id, name, category, cost, description, icon, slot, rarity, kind,
     compatible_bodies, layer_asset_path, sort_order, active, unlock_type)
VALUES
    ('robot_bender', 'Bender Bot', 'avatar', 150, 'Cheeky chrome unit.', 'Bot', NULL, 'epic', 'base', '{}', 'avatars/bases/robot_bender_skin1.png', 4, TRUE, 'gems'),
    ('face_shades_classic', 'Classic Shades', 'avatar', 0, 'One pair, every character.', NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_shades_classic.png', 65, TRUE, 'default'),
    ('headwear_cowboy_hat', 'Cowboy Hat', 'avatar', 0, 'Yeehaw. Fits everyone.', NULL, 'headwear', 'rare', 'item', '{}', 'avatars/layers/headwear_cowboy_hat.png', 58, TRUE, 'default')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, cost = EXCLUDED.cost, slot = EXCLUDED.slot, rarity = EXCLUDED.rarity,
    kind = EXCLUDED.kind, layer_asset_path = EXCLUDED.layer_asset_path,
    sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, unlock_type = EXCLUDED.unlock_type;
UPDATE public.shop_items SET sort_order = 5 WHERE id = 'alien';
UPDATE public.shop_items SET sort_order = 6 WHERE id = 'monster';
