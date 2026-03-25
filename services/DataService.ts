import { supabase } from './supabaseClient';
import { toast } from 'sonner';

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
        toast.error('Failed to create class. Please try again.');
        throw error;
    }

    toast.success(`Class "${classData.name}" created successfully!`);
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
        toast.error('Failed to join class. Please check the code and try again.');
        throw error;
    }

    toast.success('Successfully joined the class!');
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

/**
 * Analytics data for class reports
 */
export interface ClassAnalytics {
    totalStudents: number;
    totalXp: number;
    avgXpPerStudent: number;
    mastery: number; // Based on completed units
    engagement: number; // Based on streak (0-100)
    completion: number; // % of students with current_unit_id
    skills: { name: string; score: number; color: string }[];
    timeSpent: number; // Estimated minutes based on XP
}

/**
 * Get class analytics for a teacher
 * Calculates deterministic metrics from real student data
 */
export async function getClassAnalytics(teacherId: string): Promise<ClassAnalytics> {
    const students = await getTeacherStudents(teacherId);

    if (students.length === 0) {
        return {
            totalStudents: 0,
            totalXp: 0,
            avgXpPerStudent: 0,
            mastery: 0,
            engagement: 0,
            completion: 0,
            skills: [],
            timeSpent: 0
        };
    }

    // Calculate deterministic metrics
    const totalXp = students.reduce((sum, s) => sum + (s.xp || 0), 0);
    const avgXpPerStudent = Math.round(totalXp / students.length);

    // Mastery: Average completed units per student (as percentage)
    // Assuming 10 units total for baseline
    const TOTAL_UNITS = 10;
    const totalCompletions = students.reduce((sum, s) => sum + (s.completed_unit_ids?.length || 0), 0);
    const mastery = Math.round((totalCompletions / students.length / TOTAL_UNITS) * 100);

    // Engagement: Based on average streak (max 100 for streak of 30+ days)
    const totalStreak = students.reduce((sum, s) => sum + (s.streak || 0), 0);
    const avgStreak = totalStreak / students.length;
    const engagement = Math.min(100, Math.round(avgStreak * 3.33)); // 30-day streak = 100%

    // Completion: % of students with active current_unit_id
    const studentsWithCurrentUnit = students.filter(s => s.current_unit_id).length;
    const completion = Math.round((studentsWithCurrentUnit / students.length) * 100);

    // Time spent: Deterministic proxy based on XP (15 XP per minute of activity)
    const timeSpent = Math.round(totalXp / 15);

    // Skills: Generate from student data (placeholder until skill tracking is implemented)
    // Use average XP as a proxy for overall skill level
    const skills = [
        { name: 'Speaking', score: Math.min(100, Math.round(avgXpPerStudent * 0.8)), color: 'bg-blue-500' },
        { name: 'Listening', score: Math.min(100, Math.round(avgXpPerStudent * 0.9)), color: 'bg-green-500' },
        { name: 'Reading', score: Math.min(100, Math.round(avgXpPerStudent)), color: 'bg-purple-500' },
        { name: 'Grammar', score: Math.min(100, Math.round(avgXpPerStudent * 0.7)), color: 'bg-orange-500' },
    ];

    return {
        totalStudents: students.length,
        totalXp,
        avgXpPerStudent,
        mastery: Math.min(100, mastery),
        engagement: Math.min(100, engagement),
        completion: Math.min(100, completion),
        skills,
        timeSpent
    };
}

/**
 * Get all students linked to a parent
 */
export async function getParentStudents(parentId: string): Promise<StudentWithProgress[]> {
    const { data: links, error } = await supabase
        .from('parent_student_links')
        .select(`
            student_id,
            profiles:profiles!parent_student_links_student_id_fkey(
                id,
                email,
                full_name,
                avatar_url
            )
        `)
        .eq('parent_id', parentId);

    if (error) {
        console.error('Error fetching parent-student links:', error);
        throw error;
    }

    if (!links || links.length === 0) return [];

    // Get progress for each student
    const studentsWithProgress = await Promise.all(
        links.map(async (link: any) => {
            const studentId = link.student_id;
            const { data: progress } = await supabase
                .from('student_progress')
                .select('*')
                .eq('student_id', studentId)
                .single();

            return {
                id: link.profiles?.id,
                email: link.profiles?.email,
                full_name: link.profiles?.full_name,
                avatar_url: link.profiles?.avatar_url,
                student_id: studentId,
                xp: progress?.xp || 0,
                streak: progress?.streak || 0,
                current_unit_id: progress?.current_unit_id || null,
                completed_unit_ids: progress?.completed_unit_ids || [],
            };
        })
    );

    return studentsWithProgress;
}

// ============================================
// Assignment Interfaces
// ============================================

export interface Assignment {
    id: string;
    class_id: string;
    unit_id: string | null;
    title: string;
    description: string | null;
    due_date: string | null;
    created_at: string;
    updated_at: string;
}

export interface StudentAssignment {
    id: string;
    assignment_id: string;
    student_id: string;
    status: 'pending' | 'submitted' | 'graded';
    grade: number | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AssignmentWithDetails extends Assignment {
    class_name?: string;
    unit_title?: string;
    student_status?: 'pending' | 'submitted' | 'graded';
    student_grade?: number | null;
    student_completed_at?: string | null;
}

// ============================================
// Message Interfaces
// ============================================

export interface Message {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    read: boolean;
    created_at: string;
}

export interface MessageWithSender extends Message {
    sender_name?: string;
    sender_avatar?: string;
    receiver_name?: string;
    receiver_avatar?: string;
}

// ============================================
// Assignment Functions
// ============================================

/**
 * Create a new assignment for a class
 */
export async function createAssignment(
    assignmentData: Partial<Assignment>
): Promise<Assignment> {
    const { data, error } = await supabase
        .from('assignments')
        .insert({
            class_id: assignmentData.class_id,
            unit_id: assignmentData.unit_id || null,
            title: assignmentData.title,
            description: assignmentData.description || null,
            due_date: assignmentData.due_date || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating assignment:', error);
        toast.error('Failed to create assignment. Please try again.');
        throw error;
    }

    toast.success(`Assignment "${assignmentData.title}" created successfully!`);
    return data!;
}

/**
 * Get all assignments for a specific class
 */
export async function getClassAssignments(classId: string): Promise<Assignment[]> {
    const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('class_id', classId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching class assignments:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get all assignments for a student with their status
 */
export async function getStudentAssignments(studentId: string): Promise<AssignmentWithDetails[]> {
    const { data, error } = await supabase
        .from('student_assignments')
        .select(`
            id,
            assignment_id,
            status,
            grade,
            completed_at,
            assignments:assignments!inner(
                id,
                class_id,
                unit_id,
                title,
                description,
                due_date,
                created_at,
                updated_at,
                classes:classes!inner(
                    name
                )
            )
        `)
        .eq('student_id', studentId)
        .order('assignments(due_date)', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('Error fetching student assignments:', error);
        throw error;
    }

    return (data || []).map((item: any) => ({
        id: item.assignments.id,
        class_id: item.assignments.class_id,
        unit_id: item.assignments.unit_id,
        title: item.assignments.title,
        description: item.assignments.description,
        due_date: item.assignments.due_date,
        created_at: item.assignments.created_at,
        updated_at: item.assignments.updated_at,
        class_name: item.assignments.classes?.name,
        student_status: item.status,
        student_grade: item.grade,
        student_completed_at: item.completed_at,
    }));
}

/**
 * Update a student's assignment status
 */
export async function updateStudentAssignmentStatus(
    studentAssignmentId: string,
    status: 'pending' | 'submitted' | 'graded',
    grade?: number
): Promise<void> {
    const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
    };

    if (status === 'submitted') {
        updateData.completed_at = new Date().toISOString();
    }

    if (grade !== undefined) {
        updateData.grade = grade;
    }

    const { error } = await supabase
        .from('student_assignments')
        .update(updateData)
        .eq('id', studentAssignmentId);

    if (error) {
        console.error('Error updating student assignment:', error);
        toast.error('Failed to update assignment status');
        throw error;
    }

    if (status === 'submitted') {
        toast.success('Assignment submitted successfully!');
    } else if (status === 'graded') {
        toast.success('Assignment graded successfully!');
    }
}

// ============================================
// Message Functions
// ============================================

/**
 * Send a message from one user to another
 */
export async function sendMessage(
    senderId: string,
    receiverId: string,
    content: string
): Promise<Message> {
    const { data, error } = await supabase
        .from('messages')
        .insert({
            sender_id: senderId,
            receiver_id: receiverId,
            content,
            read: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error sending message:', error);
        toast.error('Failed to send message');
        throw error;
    }

    toast.success('Message sent successfully!');
    return data!;
}

/**
 * Get all messages for a user (sent and received)
 */
export async function getUserMessages(userId: string): Promise<MessageWithSender[]> {
    const { data, error } = await supabase
        .from('messages')
        .select(`
            *,
            sender:profiles!messages_sender_id_fkey(
                full_name,
                avatar_url
            ),
            receiver:profiles!messages_receiver_id_fkey(
                full_name,
                avatar_url
            )
        `)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user messages:', error);
        throw error;
    }

    return (data || []).map((msg: any) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        receiver_id: msg.receiver_id,
        content: msg.content,
        read: msg.read,
        created_at: msg.created_at,
        sender_name: msg.sender?.full_name,
        sender_avatar: msg.sender?.avatar_url,
        receiver_name: msg.receiver?.full_name,
        receiver_avatar: msg.receiver?.avatar_url,
    }));
}

/**
 * Get unread message count for a user
 */
export async function getUnreadMessageCount(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('read', false);

    if (error) {
        console.error('Error fetching unread message count:', error);
        throw error;
    }

    return count || 0;
}

/**
 * Mark a message as read
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
    const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('id', messageId);

    if (error) {
        console.error('Error marking message as read:', error);
        // Don't show toast for this silent operation
        throw error;
    }
}
