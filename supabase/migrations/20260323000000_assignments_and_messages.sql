-- Migration: Assignments and Messages Tables
-- Created: 2026-03-23
-- Description: Creates assignments, student_assignments, and messages tables with RLS policies

-- ============================================
-- Task 1: Create Assignments Tables
-- ============================================

-- Table: assignments (teachers create assignments for their classes)
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: student_assignments (tracks individual student progress on assignments)
CREATE TABLE IF NOT EXISTS public.student_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded')),
    grade INTEGER CHECK (grade >= 0 AND grade <= 100),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id, student_id)
);

-- Table: messages (direct messaging between users)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Task 2: Create Indexes for Performance
-- ============================================

-- Assignments indexes
CREATE INDEX IF NOT EXISTS idx_assignments_class ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_unit ON public.assignments(unit_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments(due_date);

-- Student assignments indexes
CREATE INDEX IF NOT EXISTS idx_student_assignments_assignment ON public.student_assignments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON public.student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_status ON public.student_assignments(status);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_read ON public.messages(read);

-- ============================================
-- Task 3: Enable Row Level Security
-- ============================================

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Task 4: RLS Policies for Assignments
-- ============================================

-- Teachers can INSERT assignments for their own classes
CREATE POLICY "Teachers can create assignments"
    ON public.assignments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE classes.id = assignments.class_id
            AND classes.teacher_id = auth.uid()
        )
    );

-- Teachers can UPDATE assignments for their own classes
CREATE POLICY "Teachers can update assignments"
    ON public.assignments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE classes.id = assignments.class_id
            AND classes.teacher_id = auth.uid()
        )
    );

-- Teachers can SELECT assignments for their own classes
CREATE POLICY "Teachers can view assignments"
    ON public.assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE classes.id = assignments.class_id
            AND classes.teacher_id = auth.uid()
        )
    );

-- Students can SELECT assignments for classes they are enrolled in
CREATE POLICY "Students can view class assignments"
    ON public.assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.class_enrollments
            WHERE class_enrollments.class_id = assignments.class_id
            AND class_enrollments.student_id = auth.uid()
        )
    );

-- ============================================
-- Task 5: RLS Policies for Student Assignments
-- ============================================

-- Teachers can SELECT student_assignments for their students
CREATE POLICY "Teachers can view student assignments"
    ON public.student_assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments
            JOIN public.classes ON classes.id = assignments.class_id
            WHERE assignments.id = student_assignments.assignment_id
            AND classes.teacher_id = auth.uid()
        )
    );

-- Teachers can UPDATE student_assignments for their students
CREATE POLICY "Teachers can update student assignments"
    ON public.student_assignments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments
            JOIN public.classes ON classes.id = assignments.class_id
            WHERE assignments.id = student_assignments.assignment_id
            AND classes.teacher_id = auth.uid()
        )
    );

-- Students can SELECT their own student_assignments
CREATE POLICY "Students can view own assignments"
    ON public.student_assignments FOR SELECT
    USING (student_id = auth.uid());

-- Students can UPDATE their own student_assignments
CREATE POLICY "Students can update own assignments"
    ON public.student_assignments FOR UPDATE
    USING (student_id = auth.uid());

-- ============================================
-- Task 6: RLS Policies for Messages
-- ============================================

-- Users can SELECT messages where they are sender or receiver
CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT
    USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can INSERT messages where they are the sender
CREATE POLICY "Users can send messages"
    ON public.messages FOR INSERT
    WITH CHECK (sender_id = auth.uid());

-- Users can UPDATE messages they received (mark as read)
CREATE POLICY "Users can update received messages"
    ON public.messages FOR UPDATE
    USING (receiver_id = auth.uid());

-- ============================================
-- Task 7: Grant Permissions
-- ============================================

GRANT ALL ON public.assignments TO authenticated, anon, service_role;
GRANT ALL ON public.student_assignments TO authenticated, anon, service_role;
GRANT ALL ON public.messages TO authenticated, anon, service_role;

-- ============================================
-- Task 8: Create Helper Functions
-- ============================================

-- Function to get assignments for a class
CREATE OR REPLACE FUNCTION public.get_class_assignments(class_uuid UUID)
RETURNS TABLE (
    id UUID,
    class_id UUID,
    unit_id UUID,
    title TEXT,
    description TEXT,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.class_id,
        a.unit_id,
        a.title,
        a.description,
        a.due_date,
        a.created_at,
        a.updated_at
    FROM public.assignments a
    WHERE a.class_id = class_uuid
    ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student assignments with assignment details
CREATE OR REPLACE FUNCTION public.get_student_assignments_with_details(student_uuid UUID)
RETURNS TABLE (
    id UUID,
    assignment_id UUID,
    student_id UUID,
    status TEXT,
    grade INTEGER,
    completed_at TIMESTAMPTZ,
    assignment_title TEXT,
    assignment_description TEXT,
    assignment_due_date TIMESTAMPTZ,
    class_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sa.id,
        sa.assignment_id,
        sa.student_id,
        sa.status,
        sa.grade,
        sa.completed_at,
        a.title AS assignment_title,
        a.description AS assignment_description,
        a.due_date AS assignment_due_date,
        c.name AS class_name
    FROM public.student_assignments sa
    JOIN public.assignments a ON a.id = sa.assignment_id
    JOIN public.classes c ON c.id = a.class_id
    WHERE sa.student_id = student_uuid
    ORDER BY a.due_date ASC NULLS LAST, sa.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM public.messages
        WHERE receiver_id = user_uuid
        AND read = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
