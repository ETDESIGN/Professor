import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from './logger';

const log = createClientLogger('DataService');

export interface ClassData {
    id: string;
    name: string;
    description: string | null;
    subject: string | null;
    grade_level: string | null;
    teacher_id: string;
    code: string | null;
    is_active: boolean;
    school_id: string | null;
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
        log.warn('error_fetching_classes', { error: error?.message || String(error) });
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
        log.warn('error_fetching_class_students', { error: error?.message || String(error) });
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
 * ROSTER-FIRST live session roster (Claude plan, Phase 2). Returns the board
 * student shape for every roster_students entry in a class — including
 * UNCLAIMED students (no profile yet) so they can be picked and earn points.
 * `points` = unified total = SUM(point_transactions) + (claimed ? home XP : 0).
 * `id` is the roster_students.id (the canonical board identity).
 */
export interface SessionRosterStudent {
    id: string;                 // roster_students.id
    name: string;               // display_name
    avatar: string;
    points: number;             // unified: ledger sum + home XP (if claimed)
    team: string | undefined;
    xp: number;                 // home XP (0 if unclaimed)
    claimed_profile_id: string | null;
    is_claimed: boolean;
}

export async function getSessionRoster(classId: string): Promise<SessionRosterStudent[]> {
    // 1) roster rows for the class (RLS scopes to the teacher/manager/admin).
    const { data: roster, error: rErr } = await supabase
        .from('roster_students')
        .select('id, display_name, team, claimed_profile_id')
        .eq('class_id', classId)
        .eq('is_archived', false)
        .order('display_name', { ascending: true });
    if (rErr) {
        log.warn('session_roster_error', { error: rErr.message });
        throw rErr;
    }
    if (!roster || roster.length === 0) return [];

    const ids = roster.map(r => r.id);
    const claimedIds = roster.map(r => r.claimed_profile_id).filter(Boolean) as string[];

    // 2) class-points ledger sums per roster.
    const [sumsRes, xpRes] = await Promise.all([
        supabase.from('point_transactions').select('roster_id, amount').in('roster_id', ids),
        claimedIds.length
            ? supabase.from('student_progress').select('student_id, xp').in('student_id', claimedIds)
            : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (sumsRes.error) log.warn('session_roster_sums_error', { error: sumsRes.error.message });

    const sumByRoster = new Map<string, number>();
    for (const row of (sumsRes.data || [])) {
        sumByRoster.set(row.roster_id, (sumByRoster.get(row.roster_id) || 0) + (row.amount || 0));
    }
    const xpByProfile = new Map<string, number>();
    for (const row of (xpRes.data || [])) {
        xpByProfile.set(row.student_id, row.xp || 0);
    }

    return roster.map(r => {
        const claimed = !!r.claimed_profile_id;
        const ledger = sumByRoster.get(r.id) || 0;
        const homeXp = claimed ? (xpByProfile.get(r.claimed_profile_id as string) || 0) : 0;
        return {
            id: r.id,
            name: r.display_name || 'Student',
            avatar: '',
            points: ledger + homeXp,
            team: r.team || undefined,
            xp: homeXp,
            claimed_profile_id: r.claimed_profile_id,
            is_claimed: claimed,
        };
    });
}

/** Insert a class-points ledger row (debounced by the caller). */
export async function awardClassPoints(
    rosterId: string,
    classId: string | null | undefined,
    amount: number,
    source: string,
    profileId?: string | null,
): Promise<void> {
    const { error } = await supabase.from('point_transactions').insert({
        roster_id: rosterId,
        class_id: classId ?? null,
        amount,
        source,
        profile_id: profileId ?? null,
    });
    if (error) {
        log.warn('award_class_points_error', { error: error.message });
    }
}


/**
 * Get all students across all teacher's classes
 */
export async function getTeacherStudents(teacherId: string): Promise<StudentWithProgress[]> {
    // Query 1: Fetch class IDs for this teacher
    const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', teacherId);

    if (classError) {
        log.warn('error_fetching_teacher_classes', { error: classError?.message || String(classError) });
        throw classError;
    }

    const classIds = (classes || []).map(c => c.id);
    if (classIds.length === 0) return [];

    // Query 2: Fetch enrollments
    const { data: enrollments, error: enrollmentError } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .in('class_id', classIds);

    if (enrollmentError) {
        log.warn('error_fetching_enrollments', { error: enrollmentError?.message || String(enrollmentError) });
        throw enrollmentError;
    }

    // Query 3: Extract unique student IDs
    const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
    if (studentIds.length === 0) return [];

    // Query 4: Fetch profiles (no nested joins)
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', studentIds);

    if (profileError) {
        log.warn('error_fetching_student_profiles', { error: profileError?.message || String(profileError) });
        throw profileError;
    }

    // Query 5: Fetch student_progress separately
    const { data: progressData, error: progressError } = await supabase
        .from('student_progress')
        .select('student_id, xp, streak, current_unit_id, completed_unit_ids')
        .in('student_id', studentIds);

    if (progressError) {
        log.warn('error_fetching_student_progress', { error: progressError?.message || String(progressError) });
        // Don't throw - use default progress values
    }

    // Manually merge profiles and progress in JavaScript
    const progressMap = new Map();
    (progressData || []).forEach(p => {
        progressMap.set(p.student_id, p);
    });

    return (profiles || []).map((p: any) => {
        const progress = progressMap.get(p.id) || {};
        return {
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            student_id: p.id,
            xp: progress.xp || 0,
            streak: progress.streak || 0,
            current_unit_id: progress.current_unit_id || null,
            completed_unit_ids: progress.completed_unit_ids || [],
        };
    });
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

    if (progressRes.error) {
        log.warn('error_fetching_student_progress', { error: progressRes.error?.message || String(progressRes.error) });
        throw progressRes.error;
    }

    if (srsRes.error) {
        log.warn('error_fetching_srs_items', { error: srsRes.error?.message || String(srsRes.error) });
        throw srsRes.error;
    }

    return {
        progress: progressRes.data,
        srsItems: srsRes.data || [],
    };
}

/**
 * Create a new class
 */
function generateClassCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function generateUniqueClassCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateClassCode();
        const { data } = await supabase
            .from('classes')
            .select('id')
            .eq('code', code)
            .maybeSingle();
        if (!data) return code;
    }
    throw new Error('Failed to generate a unique class code. Please try again.');
}

export async function createClass(
    teacherId: string,
    classData: Partial<ClassData>
): Promise<ClassData> {
    const code = await generateUniqueClassCode();

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
        log.warn('error_creating_class', { error: error?.message || String(error) });
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
        log.warn('error_enrolling_student', { error: error?.message || String(error) });
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
        log.warn('error_finding_class', { error: error?.message || String(error) });
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
        log.warn('error_fetching_student_classes', { error: error?.message || String(error) });
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
 * Utilizes the Supabase view for efficient DB-side aggregation
 */
export async function getClassAnalytics(teacherId: string): Promise<ClassAnalytics> {
    const { data, error } = await supabase
        .from('class_analytics_view')
        .select('*')
        .eq('teacher_id', teacherId);

    if (error || !data || data.length === 0) {
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

    const totalStudents = data.reduce((sum, row) => sum + row.total_students, 0);
    const totalXp = data.reduce((sum, row) => sum + row.total_xp, 0);
    const avgXpPerStudent = totalStudents > 0 ? Math.round(totalXp / totalStudents) : 0;

    const classCount = data.length;
    const mastery = Math.round(data.reduce((sum, row) => sum + row.mastery_percent, 0) / classCount);
    const engagement = Math.round(data.reduce((sum, row) => sum + row.engagement_percent, 0) / classCount);
    const completion = Math.round(data.reduce((sum, row) => sum + row.completion_percent, 0) / classCount);

    const timeSpent = Math.round(totalXp / 15);

    let skills: { name: string; score: number; color: string }[] = [];
    if (avgXpPerStudent > 0) {
        skills = [
            { name: 'General English', score: Math.min(100, Math.round(avgXpPerStudent / 10)), color: 'bg-emerald-500' },
            { name: 'Listening', score: Math.min(100, Math.round(avgXpPerStudent / 12)), color: 'bg-blue-500' },
        ];
    }

    return {
        totalStudents,
        totalXp,
        avgXpPerStudent,
        mastery: Math.min(100, mastery),
        engagement: Math.min(100, engagement),
        completion: Math.min(100, Math.max(0, completion || 0)),
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
        .eq('parent_id', parentId)
        .eq('status', 'active'); // only show APPROVED links (pending links must be approved first)

    if (error) {
        log.warn('error_fetching_parent_student_links', { error: error?.message || String(error) });
        throw error;
    }

    if (!links || links.length === 0) return [];

    const studentIds = links.map((link: any) => link.student_id);

    const { data: progressData, error: progressError } = await supabase
        .from('student_progress')
        .select('*')
        .in('student_id', studentIds);

    if (progressError) {
        log.warn('error_fetching_progress_batch', { error: progressError?.message || String(progressError) });
    }

    const progressMap = new Map();
    (progressData || []).forEach((p: any) => {
        progressMap.set(p.student_id, p);
    });

    const studentsWithProgress = links.map((link: any) => {
        const progress = progressMap.get(link.student_id) || {};
        return {
            id: link.profiles?.id,
            email: link.profiles?.email,
            full_name: link.profiles?.full_name,
            avatar_url: link.profiles?.avatar_url,
            student_id: link.student_id,
            xp: progress.xp || 0,
            streak: progress.streak || 0,
            current_unit_id: progress.current_unit_id || null,
            completed_unit_ids: progress.completed_unit_ids || [],
        };
    });

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
        log.warn('error_creating_assignment', { error: error?.message || String(error) });
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
        log.warn('error_fetching_class_assignments', { error: error?.message || String(error) });
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
        log.warn('error_fetching_student_assignments', { error: error?.message || String(error) });
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
        log.warn('error_updating_student_assignment', { error: error?.message || String(error) });
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
        log.warn('error_sending_message', { error: error?.message || String(error) });
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        throw new Error('Invalid user ID format');
    }

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
        log.warn('error_fetching_user_messages', { error: error?.message || String(error) });
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
        log.warn('error_fetching_unread_message_count', { error: error?.message || String(error) });
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
        log.warn('error_marking_message_as_read', { error: error?.message || String(error) });
        throw error;
    }
}

export async function getTeacherForStudent(studentId: string): Promise<{ id: string; full_name: string | null; avatar_url: string | null } | null> {
    const { data: enrollment } = await supabase
        .from('class_enrollments')
        .select('class_id')
        .eq('student_id', studentId)
        .limit(1)
        .single();

    if (!enrollment) return null;

    const { data: classData } = await supabase
        .from('classes')
        .select('teacher_id')
        .eq('id', enrollment.class_id)
        .single();

    if (!classData) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', classData.teacher_id)
        .single();

    return profile || null;
}

export async function getStudentSRSWords(studentId: string): Promise<string[]> {
    const { data } = await supabase
        .from('srs_items')
        .select('word')
        .eq('student_id', studentId)
        .order('next_review', { ascending: false })
        .limit(20);

    return (data || []).map((d: any) => d.word);
}
