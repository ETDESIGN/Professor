import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import type { PaginatedResult, PaginationOptions } from './pagination';

const log = createClientLogger('AdminService');

async function requireAdmin(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  // Effective role mirrors the backend current_role_name(): app_metadata
  // (admin-provisioned) takes precedence over profiles.role.
  const effectiveRole = (user.app_metadata?.role as string) ?? profile?.role;
  if (effectiveRole !== 'admin' && effectiveRole !== 'manager') {
    throw new Error('Insufficient permissions. Admin or manager role required.');
  }
}

export interface DistrictMetrics {
  totalSchools: number;
  totalTeachers: number;
  totalStudents: number;
  totalParents: number;
  totalUnits: number;
  activeUnits: number;
  draftUnits: number;
  avgXpPerStudent: number;
  avgStreak: number;
  completionRate: number;
}

export interface TeacherSummary {
  id: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  classCount: number;
  studentCount: number;
  createdAt: string;
}

export interface StudentSummary {
  id: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  xp: number;
  streak: number;
  completedUnits: number;
  currentUnitId: string | null;
  enrolledClassName: string | null;
}

export interface SchoolGroup {
  classId: string;
  className: string;
  teacherName: string | null;
  subject: string | null;
  gradeLevel: string | null;
  studentCount: number;
  avgXp: number;
  avgStreak: number;
  code: string | null;
}

export interface ContentModerationItem {
  id: string;
  title: string;
  status: string;
  level: string;
  topic: string | null;
  createdAt: string;
  hasFlow: boolean;
  hasManifest: boolean;
  lessonCount: number;
}

export const AdminService = {
  async getDistrictMetrics(): Promise<DistrictMetrics> {
    log.info('get_district_metrics');
    await requireAdmin();

    const [profilesRes, unitStatsRes, progressStatsRes, classesRes] = await Promise.all([
      supabase.from('profiles').select('role'),
      supabase.from('units').select('status'),
      supabase.from('student_progress').select('xp, streak, completed_unit_ids, current_unit_id'),
      supabase.from('classes').select('id', { count: 'exact' }).eq('is_active', true)
    ]);

    const profiles = profilesRes.data || [];
    const units = unitStatsRes.data || [];
    const progress = progressStatsRes.data || [];

    const totalStudents = profiles.filter(p => p.role === 'student').length;

    return {
      totalSchools: classesRes.count || 0,
      totalTeachers: profiles.filter(p => p.role === 'teacher').length,
      totalStudents,
      totalParents: profiles.filter(p => p.role === 'parent').length,
      totalUnits: units.length,
      activeUnits: units.filter(u => u.status === 'Active').length,
      draftUnits: units.filter(u => u.status === 'Draft').length,
      avgXpPerStudent: totalStudents > 0 ? Math.round(progress.reduce((s, p) => s + (p.xp || 0), 0) / totalStudents) : 0,
      avgStreak: totalStudents > 0 ? Math.round(progress.reduce((s, p) => s + (p.streak || 0), 0) / totalStudents) : 0,
      completionRate: totalStudents > 0 ? Math.round((progress.filter(p => p.current_unit_id).length / totalStudents) * 100) : 0,
    };
  },

  async getSchoolGroups(): Promise<SchoolGroup[]> {
    log.info('get_school_groups');
    await requireAdmin();

    const { data: classes, error } = await supabase
      .from('classes')
      .select(`
        id, name, subject, grade_level, code,
        teacher:profiles!classes_teacher_id_fkey(full_name),
        class_enrollments(count)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('get_school_groups_error', { error: error.message });
      throw error;
    }

    const classIds = (classes || []).map((c: any) => c.id);
    if (classIds.length === 0) return [];

    const { data: progressData } = await supabase
      .from('class_enrollments')
      .select('class_id, student_id')
      .in('class_id', classIds);

    const enrollmentCounts = new Map<string, number>();
    (classes || []).forEach((c: any) => {
      const count = c.class_enrollments?.[0]?.count ?? 0;
      enrollmentCounts.set(c.id, count);
    });

    const studentIds = [...new Set((progressData || []).map((e: any) => e.student_id))];
    const avgMap = new Map<string, { totalXp: number; totalStreak: number; count: number }>();

    if (studentIds.length > 0) {
      const { data: studentProgress } = await supabase
        .from('student_progress')
        .select('student_id, xp, streak')
        .in('student_id', studentIds);

      const progressByStudent = new Map<string, { xp: number; streak: number }>();
      (studentProgress || []).forEach((p: any) => progressByStudent.set(p.student_id, p));

      (progressData || []).forEach((e: any) => {
        const p = progressByStudent.get(e.student_id);
        const entry = avgMap.get(e.class_id) || { totalXp: 0, totalStreak: 0, count: 0 };
        entry.totalXp += p?.xp || 0;
        entry.totalStreak += p?.streak || 0;
        entry.count += 1;
        avgMap.set(e.class_id, entry);
      });
    }

    return (classes || []).map((c: any) => {
      const stats = avgMap.get(c.id);
      const count = stats?.count || 0;
      return {
        classId: c.id,
        className: c.name,
        teacherName: c.teacher?.full_name || 'Unknown',
        subject: c.subject,
        gradeLevel: c.grade_level,
        studentCount: enrollmentCounts.get(c.id) || 0,
        avgXp: count > 0 ? Math.round(stats.totalXp / count) : 0,
        avgStreak: count > 0 ? Math.round(stats.totalStreak / count) : 0,
        code: c.code,
      };
    });
  },

  async getTeacherSummaries(): Promise<TeacherSummary[]> {
    log.info('get_teacher_summaries');
    await requireAdmin();

    const { data: teachers, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, created_at')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false });

    if (error) {
      log.error('get_teacher_summaries_error', { error: error.message });
      throw error;
    }

    const teacherIds = (teachers || []).map(t => t.id);
    if (teacherIds.length === 0) return [];

    const { data: classesData } = await supabase
      .from('classes')
      .select('teacher_id, id')
      .in('teacher_id', teacherIds);

    const classCountMap = new Map<string, number>();
    const teacherClassIds = new Map<string, string[]>();
    (classesData || []).forEach((c: any) => {
      classCountMap.set(c.teacher_id, (classCountMap.get(c.teacher_id) || 0) + 1);
      const ids = teacherClassIds.get(c.teacher_id) || [];
      ids.push(c.id);
      teacherClassIds.set(c.teacher_id, ids);
    });

    const allClassIds = (classesData || []).map((c: any) => c.id);
    let studentCountMap = new Map<string, number>();

    if (allClassIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('class_id')
        .in('class_id', allClassIds);

      const classStudentCounts = new Map<string, number>();
      (enrollments || []).forEach((e: any) => {
        classStudentCounts.set(e.class_id, (classStudentCounts.get(e.class_id) || 0) + 1);
      });

      teacherClassIds.forEach((cids, teacherId) => {
        const total = cids.reduce((sum, cid) => sum + (classStudentCounts.get(cid) || 0), 0);
        studentCountMap.set(teacherId, total);
      });
    }

    return (teachers || []).map((t: any) => ({
      id: t.id,
      fullName: t.full_name,
      email: t.email,
      avatarUrl: t.avatar_url,
      classCount: classCountMap.get(t.id) || 0,
      studentCount: studentCountMap.get(t.id) || 0,
      createdAt: t.created_at,
    }));
  },

  async getStudentSummaries(limit: number = 50, cursor?: string): Promise<PaginatedResult<StudentSummary>> {
    log.info('get_student_summaries', { metadata: { limit, cursor } });
    await requireAdmin();

    let query = supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: students, error } = await query;

    if (error) {
      log.error('get_student_summaries_error', { error: error.message });
      throw error;
    }

    const hasMore = (students || []).length > limit;
    const results = hasMore ? (students || []).slice(0, limit) : (students || []);
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].created_at : null;

    const studentIds = results.map(s => s.id);
    if (studentIds.length === 0) return { data: [], nextCursor: null, hasMore: false };

    const [progressRes, enrollmentRes] = await Promise.all([
      supabase.from('student_progress').select('student_id, xp, streak, completed_unit_ids, current_unit_id').in('student_id', studentIds),
      supabase.from('class_enrollments').select('student_id, class:classes(name)').in('student_id', studentIds)
    ]);

    const progressMap = new Map<string, any>();
    (progressRes.data || []).forEach((p: any) => progressMap.set(p.student_id, p));

    const classMap = new Map<string, string>();
    (enrollmentRes.data || []).forEach((e: any) => {
      if (e.class?.name) classMap.set(e.student_id, e.class.name);
    });

    const data = results.map((s: any) => {
      const progress = progressMap.get(s.id) || {};
      return {
        id: s.id,
        fullName: s.full_name,
        email: s.email,
        avatarUrl: s.avatar_url,
        xp: progress.xp || 0,
        streak: progress.streak || 0,
        completedUnits: progress.completed_unit_ids?.length || 0,
        currentUnitId: progress.current_unit_id || null,
        enrolledClassName: classMap.get(s.id) || null,
      };
    });

    return { data, nextCursor, hasMore };
  },

  async getContentForModeration(): Promise<ContentModerationItem[]> {
    log.info('get_content_for_moderation');
    await requireAdmin();

    const { data: units, error } = await supabase
      .from('units')
      .select('id, title, status, level, topic, lessons, flow, manifest')
      .order('last_updated', { ascending: false });

    if (error) {
      log.error('get_content_error', { error: error.message });
      throw error;
    }

    return (units || []).map((u: any) => ({
      id: u.id,
      title: u.title,
      status: u.status,
      level: u.level,
      topic: u.topic,
      createdAt: u.last_updated || '',
      hasFlow: !!(u.flow && Array.isArray(u.flow) && u.flow.length > 0),
      hasManifest: !!u.manifest,
      lessonCount: u.lessons || 0,
    }));
  },

  async updateUnitStatus(unitId: string, status: string): Promise<void> {
    log.info('update_unit_status', { metadata: { unitId, status } });
    await requireAdmin();

    const { error } = await supabase
      .from('units')
      .update({ status })
      .eq('id', unitId);

    if (error) {
      log.error('update_unit_status_error', { error: error.message });
      throw error;
    }
  },

  async updateUserRole(userId: string, role: 'admin' | 'teacher' | 'student' | 'parent'): Promise<void> {
    log.info('update_user_role', { metadata: { userId, role } });
    await requireAdmin();

    const { error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      log.error('update_user_role_error', { error: error.message });
      throw error;
    }
  },

  async deleteUser(userId: string): Promise<void> {
    log.info('delete_user', { metadata: { userId } });
    await requireAdmin();

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      log.error('delete_user_error', { error: error.message });
      throw error;
    }
  },
};
