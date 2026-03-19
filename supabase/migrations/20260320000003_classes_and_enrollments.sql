-- ============================================
-- Task 1: Classes & Enrollments Tables
-- ============================================

-- Table: classes (teachers own classes)
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    subject TEXT,
    grade_level TEXT,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code TEXT UNIQUE, -- Class code for students to join
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: class_enrollments (links students to classes)
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    role_in_class TEXT DEFAULT 'student', -- 'student', 'co_teacher', 'assistant'
    UNIQUE(class_id, student_id)
);

-- Table: parent_student_links (links parents to students)
CREATE TABLE IF NOT EXISTS public.parent_student_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'parent', -- 'parent', 'guardian'
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_id, student_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON public.classes(code);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON public.parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_student ON public.parent_student_links(student_id);

-- ============================================
-- RLS Policies for Classes
-- ============================================

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

-- Teachers can create and manage their own classes
CREATE POLICY "Teachers can create classes"
    ON public.classes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- Teachers can view their own classes
CREATE POLICY "Teachers can view own classes"
    ON public.classes FOR SELECT
    USING (
        teacher_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Teachers can update their own classes
CREATE POLICY "Teachers can update own classes"
    ON public.classes FOR UPDATE
    USING (
        teacher_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Teachers can delete their own classes
CREATE POLICY "Teachers can delete own classes"
    ON public.classes FOR DELETE
    USING (
        teacher_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- ============================================
-- RLS Policies for Enrollments
-- ============================================

-- Teachers can view enrollments in their classes
CREATE POLICY "Teachers can view class enrollments"
    ON public.class_enrollments FOR SELECT
    USING (
        class_id IN (
            SELECT id FROM public.classes WHERE teacher_id = auth.uid()
        )
        OR student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Teachers can enroll students
CREATE POLICY "Teachers can manage enrollments"
    ON public.class_enrollments FOR ALL
    WITH CHECK (
        class_id IN (
            SELECT id FROM public.classes WHERE teacher_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Students can view their enrollments
CREATE POLICY "Students can view own enrollments"
    ON public.class_enrollments FOR SELECT
    USING (student_id = auth.uid());

-- ============================================
-- RLS Policies for Parent Links
-- ============================================

-- Parents can view their linked students
CREATE POLICY "Parents can view linked students"
    ON public.parent_student_links FOR SELECT
    USING (parent_id = auth.uid());

-- Parents can link to students (requires approval)
CREATE POLICY "Parents can create links"
    ON public.parent_student_links FOR INSERT
    WITH CHECK (parent_id = auth.uid());

-- Parents can manage their own links
CREATE POLICY "Parents can manage links"
    ON public.parent_student_links FOR ALL
    USING (parent_id = auth.uid());

-- ============================================
-- Helper Views
-- ============================================

-- View: Teacher's enrolled students with their progress
CREATE OR REPLACE VIEW public.teacher_students_view AS
SELECT 
    c.id as class_id,
    c.name as class_name,
    c.teacher_id,
    p.id as student_id,
    p.email as student_email,
    p.full_name as student_name,
    p.avatar_url as student_avatar,
    sp.xp,
    sp.streak,
    sp.current_unit_id
FROM public.classes c
JOIN public.class_enrollments ce ON c.id = ce.class_id
JOIN public.profiles p ON ce.student_id = p.id
LEFT JOIN public.student_progress sp ON p.id::text = sp.student_id
WHERE c.teacher_id = auth.uid() OR auth.uid() IN (
    SELECT teacher_id FROM public.classes WHERE id = c.id
);

-- Grant permissions
GRANT ALL ON public.classes TO authenticated, anon, service_role;
GRANT ALL ON public.class_enrollments TO authenticated, anon, service_role;
GRANT ALL ON public.parent_student_links TO authenticated, anon, service_role;
GRANT ALL ON public.teacher_students_view TO authenticated, anon, service_role;
