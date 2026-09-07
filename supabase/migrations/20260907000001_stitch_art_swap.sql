-- ============================================
-- Stitch art swap (2026-09-07) — owner decision 2026-09-06
-- * Stitch becomes the sole art generator; all seedream art is retired.
-- * Skin-tone switching REMOVED (one skin per character).
-- * robot_bender retired; dragon added as the 6th base.
-- * Slot gating is now per-item (compatible_bodies), not human-only —
--   robot wears outfit tops, dragon has a hair-crest item, etc.
-- ============================================

-- 1) Migrate stored configs: robot_bender → robot, drop the skin key.
UPDATE public.profiles
   SET avatar_config = (avatar_config - 'skin')
             || jsonb_build_object('body', 'robot')
 WHERE (avatar_config ->> 'body') = 'robot_bender';
UPDATE public.profiles
   SET avatar_config = avatar_config - 'skin'
 WHERE avatar_config ? 'skin';

-- 2) set_avatar_skin → graceful no-op (cached old clients must not error).
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
    -- Retired 2026-09-07 (single-skin characters). Returns the current
    -- config so stale clients still apply the response cleanly.
    v_config := public.avatar_config_get(v_student);
    RETURN jsonb_build_object('ok', true, 'config', v_config, 'note', 'skin_tones_retired');
END;
$$;
REVOKE ALL ON FUNCTION public.set_avatar_skin(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_skin(INTEGER) TO authenticated;

-- 3) equip_item: drop the human-only slot rule (compat lists are the gate).
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

-- 4) set_avatar_body: same — compat lists only.
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

    FOR v_slot IN SELECT jsonb_object_keys(COALESCE(v_config -> 'items', '{}'::jsonb)) LOOP
        CONTINUE WHEN v_config -> 'items' ->> v_slot IS NULL;
        SELECT * INTO v_item FROM public.shop_items
         WHERE id = (v_config -> 'items' ->> v_slot) AND kind = 'item';
        IF FOUND AND v_item.compatible_bodies <> '{}'
           AND NOT (p_body = ANY (v_item.compatible_bodies)) THEN
            v_config := jsonb_set(v_config, ARRAY['items', v_slot], 'null'::jsonb);
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

-- 5) Catalog swap: retire every avatar row not in the new Stitch set,
--    then upsert the new library (6 bases + 56 items, single-skin paths).
UPDATE public.shop_items
   SET active = FALSE
 WHERE kind IN ('item', 'base')
   AND id NOT IN (
    'human_boy','human_girl','robot','alien','monster','dragon',
    'headwear_cap_red','headwear_beanie_yellow','headwear_party_hat','headwear_cowboy_hat',
    'headwear_wizard_hat','headwear_flower_crown','headwear_headphones','headwear_crown_gold',
    'face_shades_black','face_glasses_round_yellow','face_glasses_nerd_red','face_glasses_round_blue',
    'face_eye_patch','face_ski_goggles','face_shades_heart_pink','face_shades_star',
    'handheld_balloon_red','handheld_book','handheld_pencil','handheld_soccer_ball',
    'handheld_ice_cream','handheld_game_controller','handheld_microphone','handheld_trophy',
    'back_backpack_school','back_cape_red','back_wings_fairy','back_jetpack',
    'outfit_hoodie_red','outfit_pirate_top','outfit_superhero_top','outfit_astronaut_top',
    'bg_park','bg_forest','bg_beach','bg_space',
    'hair_spiky_brown','hair_curly_brown','hair_buzz_cut','hair_mohawk',
    'hair_braids_long','hair_pigtails','hair_wavy_long','hair_top_bun',
    'headwear_antenna_bolt','headwear_antenna_sphere','headwear_antenna_spring','face_pixel_smile',
    'headwear_horns_gold','headwear_horns_devil','outfit_fur_collar','handheld_star_medal',
    'back_wings_dragon','back_tail_bow','hair_scale_mohawk','headwear_flame_clip',
    'headwear_star_clip','face_space_visor','headwear_antenna_rings','face_third_eye_monocle'
   );

INSERT INTO public.shop_items
    (id, name, category, cost, description, icon, slot, rarity, kind,
     compatible_bodies, layer_asset_path, sort_order, active, unlock_type)
VALUES
    -- Bases (single-skin paths: avatars/bases/{body}.png)
    ('human_boy',  'Boy',    'avatar',   0, 'The classic explorer.', 'User',    NULL, NULL,   'base', '{}', 'avatars/bases/human_boy.png',  1, TRUE, 'default'),
    ('human_girl', 'Girl',   'avatar',   0, 'The classic adventurer.', 'User', NULL, NULL,   'base', '{}', 'avatars/bases/human_girl.png', 2, TRUE, 'default'),
    ('robot',      'Robot',  'avatar', 150, 'Beep boop. Extremely cool.', 'Bot', NULL, 'epic', 'base', '{}', 'avatars/bases/robot.png',      3, TRUE, 'gems'),
    ('alien',      'Alien',  'avatar', 150, 'From a galaxy far away.', 'Sparkles', NULL, 'epic', 'base', '{}', 'avatars/bases/alien.png',    4, TRUE, 'gems'),
    ('monster',    'Monster','avatar', 150, 'Friendly. Mostly.', 'Ghost',  NULL, 'epic',   'base', '{}', 'avatars/bases/monster.png',    5, TRUE, 'gems'),
    ('dragon',     'Dragon', 'avatar', 150, 'Small wings, big heart.', 'Flame', NULL, 'epic', 'base', '{}', 'avatars/bases/dragon.png',    6, TRUE, 'gems'),
    -- Universal headwear
    ('headwear_cap_red',       'Red Cap',        'avatar',  0, 'Classic and cool.', NULL, 'headwear', 'common', 'item', '{}', 'avatars/layers/headwear_cap_red.png', 10, TRUE, 'default'),
    ('headwear_beanie_yellow','Yellow Beanie',  'avatar', 20, 'Warm and sunny.',  NULL, 'headwear', 'common', 'item', '{}', 'avatars/layers/headwear_beanie_yellow.png', 11, TRUE, 'gems'),
    ('headwear_party_hat',    'Party Hat',      'avatar', 20, 'Celebrate!',       NULL, 'headwear', 'common', 'item', '{}', 'avatars/layers/headwear_party_hat.png', 12, TRUE, 'gems'),
    ('headwear_cowboy_hat',   'Cowboy Hat',     'avatar', 40, 'Yeehaw.',          NULL, 'headwear', 'rare',   'item', '{}', 'avatars/layers/headwear_cowboy_hat.png', 13, TRUE, 'gems'),
    ('headwear_wizard_hat',   'Wizard Hat',     'avatar', 40, 'Plus ten wisdom.', NULL, 'headwear', 'rare',   'item', '{}', 'avatars/layers/headwear_wizard_hat.png', 14, TRUE, 'gems'),
    ('headwear_flower_crown', 'Flower Crown',   'avatar', 40, 'Spring royalty.',  NULL, 'headwear', 'rare',   'item', '{}', 'avatars/layers/headwear_flower_crown.png', 15, TRUE, 'gems'),
    ('headwear_headphones',   'Headphones',     'avatar', 40, 'Lost in the beat.',NULL, 'headwear', 'rare',   'item', '{}', 'avatars/layers/headwear_headphones.png', 16, TRUE, 'gems'),
    ('headwear_crown_gold',   'Gold Crown',     'avatar', 75, 'Rule the class.',  NULL, 'headwear', 'epic',   'item', '{}', 'avatars/layers/headwear_crown_gold.png', 17, TRUE, 'gems'),
    -- Universal face
    ('face_shades_black',        'Black Shades',     'avatar',  0, 'Too cool.',      NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_shades_black.png', 20, TRUE, 'default'),
    ('face_glasses_round_yellow','Round Yellow Glasses', 'avatar', 20, 'Bright thinker.', NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_glasses_round_yellow.png', 21, TRUE, 'gems'),
    ('face_glasses_nerd_red',    'Nerd Glasses',     'avatar', 20, 'Smart is cool.', NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_glasses_nerd_red.png', 22, TRUE, 'gems'),
    ('face_glasses_round_blue',  'Round Blue Glasses','avatar', 20, 'Calm and clear.',NULL, 'face', 'common', 'item', '{}', 'avatars/layers/face_glasses_round_blue.png', 23, TRUE, 'gems'),
    ('face_eye_patch',           'Eye Patch',        'avatar', 40, 'Arrr.',          NULL, 'face', 'rare',   'item', '{}', 'avatars/layers/face_eye_patch.png', 24, TRUE, 'gems'),
    ('face_ski_goggles',         'Ski Goggles',      'avatar', 40, 'Downhill fast.', NULL, 'face', 'rare',   'item', '{}', 'avatars/layers/face_ski_goggles.png', 25, TRUE, 'gems'),
    ('face_shades_heart_pink',   'Heart Shades',     'avatar', 40, 'Love the look.', NULL, 'face', 'rare',   'item', '{}', 'avatars/layers/face_shades_heart_pink.png', 26, TRUE, 'gems'),
    ('face_shades_star',         'Star Shades',      'avatar', 75, 'Star power.',    NULL, 'face', 'epic',   'item', '{}', 'avatars/layers/face_shades_star.png', 27, TRUE, 'gems'),
    -- Universal handheld
    ('handheld_balloon_red',      'Red Balloon',    'avatar',  0, 'Up, up, up.',     NULL, 'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_balloon_red.png', 30, TRUE, 'default'),
    ('handheld_book',             'Storybook',      'avatar',  0, 'Once upon a time.',NULL,'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_book.png', 31, TRUE, 'default'),
    ('handheld_pencil',           'Giant Pencil',   'avatar',  0, 'Big ideas.',      NULL, 'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_pencil.png', 32, TRUE, 'default'),
    ('handheld_soccer_ball',      'Soccer Ball',    'avatar', 20, 'Goal!',           NULL, 'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_soccer_ball.png', 33, TRUE, 'gems'),
    ('handheld_ice_cream',        'Ice Cream',      'avatar', 20, 'Double scoop.',   NULL, 'handheld', 'common', 'item', '{}', 'avatars/layers/handheld_ice_cream.png', 34, TRUE, 'gems'),
    ('handheld_game_controller',  'Game Controller','avatar', 40, 'Player one.',     NULL, 'handheld', 'rare',   'item', '{}', 'avatars/layers/handheld_game_controller.png', 35, TRUE, 'gems'),
    ('handheld_microphone',       'Microphone',     'avatar', 40, 'Next idol.',      NULL, 'handheld', 'rare',   'item', '{}', 'avatars/layers/handheld_microphone.png', 36, TRUE, 'gems'),
    ('handheld_trophy',           'Trophy',         'avatar', 75, 'Champion.',       NULL, 'handheld', 'epic',   'item', '{}', 'avatars/layers/handheld_trophy.png', 37, TRUE, 'gems'),
    -- Universal back
    ('back_backpack_school','School Backpack','avatar', 20, 'Ready for class.', NULL, 'back', 'common', 'item', '{}', 'avatars/layers/back_backpack_school.png', 40, TRUE, 'gems'),
    ('back_cape_red',       'Hero Cape',     'avatar', 40, 'To the rescue!',  NULL, 'back', 'rare',   'item', '{}', 'avatars/layers/back_cape_red.png', 41, TRUE, 'gems'),
    ('back_wings_fairy',    'Fairy Wings',   'avatar', 75, 'Sprinkle dust.',  NULL, 'back', 'epic',   'item', '{}', 'avatars/layers/back_wings_fairy.png', 42, TRUE, 'gems'),
    ('back_jetpack',        'Jetpack',       'avatar', 75, 'Three, two, one…',NULL, 'back', 'epic',   'item', '{}', 'avatars/layers/back_jetpack.png', 43, TRUE, 'gems'),
    -- Universal outfit
    ('outfit_hoodie_red',    'Red Hoodie',    'avatar',  0, 'Cozy classic.',  NULL, 'outfit', 'common', 'item', '{}', 'avatars/layers/outfit_hoodie_red.png', 50, TRUE, 'default'),
    ('outfit_pirate_top',    'Pirate Top',    'avatar', 20, 'Yo ho ho.',      NULL, 'outfit', 'common', 'item', '{}', 'avatars/layers/outfit_pirate_top.png', 51, TRUE, 'gems'),
    ('outfit_superhero_top', 'Superhero Top', 'avatar', 40, 'Secret identity.',NULL,'outfit', 'rare',   'item', '{}', 'avatars/layers/outfit_superhero_top.png', 52, TRUE, 'gems'),
    ('outfit_astronaut_top', 'Astronaut Top','avatar', 40, 'To the stars.',   NULL, 'outfit', 'rare',   'item', '{}', 'avatars/layers/outfit_astronaut_top.png', 53, TRUE, 'gems'),
    -- Universal background
    ('bg_park',   'Sunny Park',       'avatar',  0, 'A perfect day.',   NULL, 'background', 'common', 'item', '{}', 'avatars/layers/bg_park.png',   60, TRUE, 'default'),
    ('bg_forest', 'Enchanted Forest', 'avatar', 40, 'Mushroom magic.',  NULL, 'background', 'rare',   'item', '{}', 'avatars/layers/bg_forest.png', 61, TRUE, 'gems'),
    ('bg_beach',  'Tropical Beach',   'avatar', 40, 'Sun and sea.',     NULL, 'background', 'rare',   'item', '{}', 'avatars/layers/bg_beach.png',  62, TRUE, 'gems'),
    ('bg_space',  'Outer Space',      'avatar', 75, 'The final frontier.',NULL,'background','epic',   'item', '{}', 'avatars/layers/bg_space.png',  63, TRUE, 'gems'),
    -- Boy hair
    ('hair_spiky_brown', 'Spiky Hair',    'avatar',  0, 'Sharp look.',   NULL, 'hair', 'common', 'item', ARRAY['human_boy'], 'avatars/layers/hair_spiky_brown.png', 70, TRUE, 'default'),
    ('hair_curly_brown', 'Curly Hair',    'avatar', 20, 'Springy.',      NULL, 'hair', 'common', 'item', ARRAY['human_boy'], 'avatars/layers/hair_curly_brown.png', 71, TRUE, 'gems'),
    ('hair_buzz_cut',    'Buzz Cut',      'avatar', 20, 'Low effort.',   NULL, 'hair', 'common', 'item', ARRAY['human_boy'], 'avatars/layers/hair_buzz_cut.png', 72, TRUE, 'gems'),
    ('hair_mohawk',      'Mohawk',        'avatar', 40, 'Punk lives.',   NULL, 'hair', 'rare',   'item', ARRAY['human_boy'], 'avatars/layers/hair_mohawk.png', 73, TRUE, 'gems'),
    -- Girl hair
    ('hair_braids_long','Long Braids',    'avatar',  0, 'Classic charm.',NULL, 'hair', 'common', 'item', ARRAY['human_girl'], 'avatars/layers/hair_braids_long.png', 74, TRUE, 'default'),
    ('hair_pigtails',   'Pigtails',       'avatar', 20, 'Double fun.',   NULL, 'hair', 'common', 'item', ARRAY['human_girl'], 'avatars/layers/hair_pigtails.png', 75, TRUE, 'gems'),
    ('hair_wavy_long',  'Wavy Long Hair', 'avatar', 20, 'Beachy.',       NULL, 'hair', 'common', 'item', ARRAY['human_girl'], 'avatars/layers/hair_wavy_long.png', 76, TRUE, 'gems'),
    ('hair_top_bun',    'Top Bun',        'avatar', 40, 'Elegant.',      NULL, 'hair', 'rare',   'item', ARRAY['human_girl'], 'avatars/layers/hair_top_bun.png', 77, TRUE, 'gems'),
    -- Robot parts
    ('headwear_antenna_bolt',  'Bolt Antenna',   'avatar',  0, 'Zap.',           NULL, 'headwear', 'common', 'item', ARRAY['robot'], 'avatars/layers/headwear_antenna_bolt.png', 80, TRUE, 'default'),
    ('headwear_antenna_sphere','Orb Antenna',    'avatar', 20, 'Glowing.',       NULL, 'headwear', 'common', 'item', ARRAY['robot'], 'avatars/layers/headwear_antenna_sphere.png', 81, TRUE, 'gems'),
    ('headwear_antenna_spring','Spring Antenna', 'avatar', 40, 'Boing.',         NULL, 'headwear', 'rare',   'item', ARRAY['robot'], 'avatars/layers/headwear_antenna_spring.png', 82, TRUE, 'gems'),
    ('face_pixel_smile',       'Pixel Smile',    'avatar', 20, 'New display.',   NULL, 'face',     'common', 'item', ARRAY['robot'], 'avatars/layers/face_pixel_smile.png', 83, TRUE, 'gems'),
    -- Monster parts
    ('headwear_horns_gold','Golden Horns', 'avatar', 40, 'Treasure head.', NULL, 'headwear', 'rare',   'item', ARRAY['monster'], 'avatars/layers/headwear_horns_gold.png', 86, TRUE, 'gems'),
    ('headwear_horns_devil','Devil Horns', 'avatar', 40, 'Just mischief.', NULL, 'headwear', 'rare',   'item', ARRAY['monster'], 'avatars/layers/headwear_horns_devil.png', 87, TRUE, 'gems'),
    ('outfit_fur_collar',  'Fur Collar',  'avatar', 20, 'Extra cozy.',    NULL, 'outfit',    'common', 'item', ARRAY['monster'], 'avatars/layers/outfit_fur_collar.png', 88, TRUE, 'gems'),
    ('handheld_star_medal', 'Star Medal',  'avatar', 40, 'Best monster.',  NULL, 'handheld',  'rare',   'item', ARRAY['monster'], 'avatars/layers/handheld_star_medal.png', 89, TRUE, 'gems'),
    -- Dragon parts
    ('back_wings_dragon',   'Dragon Wings',  'avatar', 40, 'Soon airborne.', NULL, 'back',      'rare', 'item', ARRAY['dragon'], 'avatars/layers/back_wings_dragon.png', 90, TRUE, 'gems'),
    ('back_tail_bow',       'Tail with Bow', 'avatar', 40, 'Fancy tail.',    NULL, 'back',      'rare', 'item', ARRAY['dragon'], 'avatars/layers/back_tail_bow.png', 91, TRUE, 'gems'),
    ('hair_scale_mohawk',   'Scale Crest',   'avatar', 40, 'Regal ridge.',   NULL, 'hair',      'rare', 'item', ARRAY['dragon'], 'avatars/layers/hair_scale_mohawk.png', 92, TRUE, 'gems'),
    ('headwear_flame_clip', 'Flame Clip',    'avatar', 20, 'Tiny fire.',     NULL, 'headwear',  'common','item', ARRAY['dragon'], 'avatars/layers/headwear_flame_clip.png', 93, TRUE, 'gems'),
    -- Alien parts
    ('headwear_star_clip',       'Star Clip',       'avatar',  0, 'Cosmic cute.',  NULL, 'headwear', 'common','item', ARRAY['alien'], 'avatars/layers/headwear_star_clip.png', 94, TRUE, 'default'),
    ('face_space_visor',         'Space Visor',     'avatar', 20, 'Scanning…',     NULL, 'face',     'common','item', ARRAY['alien'], 'avatars/layers/face_space_visor.png', 95, TRUE, 'gems'),
    ('headwear_antenna_rings',   'Antenna Rings',   'avatar', 40, 'Halo upgrade.', NULL, 'headwear', 'rare',  'item', ARRAY['alien'], 'avatars/layers/headwear_antenna_rings.png', 96, TRUE, 'gems'),
    ('face_third_eye_monocle',   'Third-Eye Monocle','avatar', 40, 'Sees everything.',NULL,'face',     'rare',  'item', ARRAY['alien'], 'avatars/layers/face_third_eye_monocle.png', 97, TRUE, 'gems')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    cost = EXCLUDED.cost,
    description = EXCLUDED.description,
    slot = EXCLUDED.slot,
    rarity = EXCLUDED.rarity,
    kind = EXCLUDED.kind,
    compatible_bodies = EXCLUDED.compatible_bodies,
    layer_asset_path = EXCLUDED.layer_asset_path,
    sort_order = EXCLUDED.sort_order,
    active = TRUE,
    unlock_type = EXCLUDED.unlock_type;

-- 6) Render cache: art bump (art:9 → art:10) invalidates every cached hash.
TRUNCATE public.avatar_renders;
