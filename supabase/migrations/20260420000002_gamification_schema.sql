-- ============================================
-- Phase 4: Gamification Schema
-- Adds gems, streaks, quests, shop, inventory
-- ============================================

-- Extend student_progress with gamification columns
ALTER TABLE public.student_progress
    ADD COLUMN IF NOT EXISTS gems INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_xp_earned INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_active_date DATE,
    ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;

-- Update existing rows
UPDATE public.student_progress
    SET gems = 0, total_xp_earned = xp, longest_streak = 0
    WHERE gems IS NULL;

-- Quest templates (system-defined)
CREATE TABLE IF NOT EXISTS public.quest_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    target INTEGER NOT NULL DEFAULT 1,
    reward_gems INTEGER NOT NULL DEFAULT 10,
    reward_xp INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student quests (daily assignments)
CREATE TABLE IF NOT EXISTS public.student_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quest_type TEXT NOT NULL,
    title TEXT NOT NULL,
    target INTEGER NOT NULL DEFAULT 1,
    current INTEGER NOT NULL DEFAULT 0,
    reward_gems INTEGER NOT NULL DEFAULT 10,
    reward_xp INTEGER NOT NULL DEFAULT 15,
    claimed BOOLEAN DEFAULT FALSE,
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, quest_type, assigned_date)
);

ALTER TABLE public.student_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_quests_select_policy"
    ON public.student_quests FOR SELECT
    USING (student_id = auth.uid() OR public.is_teacher_or_admin());

CREATE POLICY "student_quests_insert_policy"
    ON public.student_quests FOR INSERT
    WITH CHECK (student_id = auth.uid() OR public.is_teacher_or_admin());

CREATE POLICY "student_quests_update_policy"
    ON public.student_quests FOR UPDATE
    USING (student_id = auth.uid() OR public.is_teacher_or_admin());

-- Shop items catalog
CREATE TABLE IF NOT EXISTS public.shop_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'avatar',
    cost INTEGER NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student inventory (purchased items)
CREATE TABLE IF NOT EXISTS public.student_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.shop_items(id),
    equipped BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, item_id)
);

ALTER TABLE public.student_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_inventory_select_policy"
    ON public.student_inventory FOR SELECT
    USING (student_id = auth.uid() OR public.is_teacher_or_admin());

CREATE POLICY "student_inventory_insert_policy"
    ON public.student_inventory FOR INSERT
    WITH CHECK (student_id = auth.uid());

-- Seed default shop items
INSERT INTO public.shop_items (id, name, category, cost, description, icon) VALUES
    ('freeze', 'Streak Freeze', 'powerup', 200, 'Miss a day without losing your streak.', 'Zap'),
    ('hearts', 'Heart Refill', 'powerup', 100, 'Restore 5 hearts to keep learning.', 'Heart'),
    ('hat_crown', 'Gold Crown', 'avatar', 300, 'A golden crown for your avatar.', 'Crown'),
    ('shirt_space', 'Space Suit', 'avatar', 150, 'Explore the galaxy in style.', 'Shirt'),
    ('glass_cool', 'Cool Shades', 'avatar', 120, 'Look cool while learning.', 'Glasses')
ON CONFLICT (id) DO NOTHING;

-- Seed default quest templates
INSERT INTO public.quest_templates (type, title, target, reward_gems, reward_xp) VALUES
    ('earn_xp', 'Earn {target} XP', 50, 10, 15),
    ('complete_lessons', 'Complete {target} Lessons', 2, 10, 15),
    ('perfect_speaking', 'Score Perfect in Speaking', 1, 10, 15),
    ('review_words', 'Review {target} Words', 5, 10, 15),
    ('dubbing_take', 'Record {target} Dubbing Take', 1, 10, 15);

-- Add avatar_config to profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_config JSONB DEFAULT '{}';
