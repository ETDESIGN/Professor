import { supabase } from './supabaseClient';

export interface ClassData {
    id: string;
    name: string;
    description: string | null;
    subject: string | null;
    grade_level: string | null;
    teacher_id: string;
    code: string | null;
    is_active: boolean;
    created_at: string;
    student_count?: number;
}

export interface StudentWithProgress {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    student_id: string;
    xp: number;
    streak: number;
    current_unit_id: string | null;
    completed_unit_ids: string[];
}

export interface ClassWithStudents {
    class: ClassData;
    students: StudentWithProgress[];
}

/**
 * Get all classes for the current teacher
 */
export async function getTeacherClasses(teacherId: string): Promise<ClassData[]> {
    const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', teacherId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching classes:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get students enrolled in a specific class with their progress
 */
export async function getClassStudents(classId: string): Promise<StudentWithProgress[]> {
    const { data: enrollments, error } = await supabase
        .from('class_enrollments')
        .select(`
      student_id,
      profiles:profiles!inner(
        id,
        email,
        full_name,
        avatar_url
      ),
      student_progress(
        student_id,
        xp,
        streak,
        current_unit_id,
        completed_unit_ids
      )
    `)
        .eq('class_id', classId);

    if (error) {
        console.error('Error fetching class students:', error);
        throw error;
    }

    // Transform the data
    return (enrollments || []).map((e: any) => ({
        id: e.profiles?.id,
        email: e.profiles?.email,
        full_name: e.profiles?.full_name,
        avatar_url: e.profiles?.avatar_url,
        student_id: e.student_id,
        xp: e.student_progress?.[0]?.xp || 0,
        streak: e.student_progress?.[0]?.streak || 0,
        current_unit_id: e.student_progress?.[0]?.current_unit_id || null,
        completed_unit_ids: e.student_progress?.[0]?.completed_unit_ids || [],
    }));
}

/**
 * Get all students across all teacher's classes
 */
export async function getTeacherStudents(teacherId: string): Promise<StudentWithProgress[]> {
    // First get all class IDs for this teacher
    const classes = await getTeacherClasses(teacherId);
    const classIds = classes.map(c => c.id);

    if (classIds.length === 0) return [];

    const { data: enrollments, error } = await supabase
        .from('class_enrollments')
        .select(`
      class_id,
      student_id,
      profiles:profiles!inner(
        id,
        email,
        full_name,
        avatar_url
      ),
      student_progress(
        student_id,
        xp,
        streak,
        current_unit_id,
        completed_unit_ids
      )
    `)
        .in('class_id', classIds);

    if (error) {
        console.error('Error fetching teacher students:', error);
        throw error;
    }

    // Transform and dedupe students (in case they're in multiple classes)
    const studentMap = new Map<string, StudentWithProgress>();

    (enrollments || []).forEach((e: any) => {
        if (!studentMap.has(e.student_id)) {
            studentMap.set(e.student_id, {
                id: e.profiles?.id,
                email: e.profiles?.email,
                full_name: e.profiles?.full_name,
                avatar_url: e.profiles?.avatar_url,
                student_id: e.student_id,
                xp: e.student_progress?.[0]?.xp || 0,
                streak: e.student_progress?.[0]?.streak || 0,
                current_unit_id: e.student_progress?.[0]?.current_unit_id || null,
                completed_unit_ids: e.student_progress?.[0]?.completed_unit_ids || [],
            });
        }
    });

    return Array.from(studentMap.values());
}

/**
 * Get student progress for a specific student
 */
export async function getStudentProgress(studentId: string): Promise<{
    progress: any;
    srsItems: any[];
}> {
    const [progressRes, srsRes] = await Promise.all([
        supabase
            .from('student_progress')
            .select('*')
            .eq('student_id', studentId)
            .single(),
        supabase
            .from('srs_items')
            .select('*')
            .eq('student_id', studentId)
            .order('next_review', { ascending: true })
    ]);

    return {
        progress: progressRes.data,
        srsItems: srsRes.data || [],
    };
}

/**
 * Create a new class
 */
export async function createClass(
    teacherId: string,
    classData: Partial<ClassData>
): Promise<ClassData> {
    // Generate a random class code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
        .from('classes')
        .insert({
            ...classData,
            teacher_id: teacherId,
            code,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating class:', error);
        throw error;
    }

    return data!;
}

/**
 * Enroll a student in a class
 */
export async function enrollStudent(
    classId: string,
    studentId: string
): Promise<void> {
    const { error } = await supabase
        .from('class_enrollments')
        .insert({
            class_id: classId,
            student_id: studentId,
        });

    if (error) {
        console.error('Error enrolling student:', error);
        throw error;
    }
}

/**
 * Find a class by its enrollment code
 */
export async function findClassByCode(code: string): Promise<ClassData | null> {
    const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows returned - class not found
            return null;
        }
        console.error('Error finding class:', error);
        throw error;
    }

    return data;
}

/**
 * Get all classes a student is enrolled in
 */
export async function getStudentClasses(studentId: string): Promise<ClassData[]> {
    const { data, error } = await supabase
        .from('class_enrollments')
        .select(`
            class:classes (*)
        `)
        .eq('student_id', studentId);

    if (error) {
        console.error('Error fetching student classes:', error);
        throw error;
    }

    return data?.map((enrollment: any) => enrollment.class).filter(Boolean) || [];
}
