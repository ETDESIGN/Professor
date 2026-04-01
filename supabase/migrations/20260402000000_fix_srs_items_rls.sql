-- Fix srs_items RLS to allow teachers to insert template items (without student_id)
-- Teachers create SRS items as lesson templates; student_id is NULL for these

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_all_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_insert_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_update_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_delete_policy" ON public.srs_items;

-- Allow authenticated users to SELECT all srs_items
CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    USING (auth.role() = 'authenticated');

-- Allow authenticated users to INSERT srs_items (with or without student_id)
CREATE POLICY "srs_items_insert_policy"
    ON public.srs_items FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to UPDATE srs_items
CREATE POLICY "srs_items_update_policy"
    ON public.srs_items FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to DELETE srs_items
CREATE POLICY "srs_items_delete_policy"
    ON public.srs_items FOR DELETE
    USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled
ALTER TABLE public.srs_items ENABLE ROW LEVEL SECURITY;
