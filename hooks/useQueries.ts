import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Engine, LessonUnit } from '../services/SupabaseService';
import {
  getTeacherClasses,
  getTeacherStudents,
  getClassStudents,
  getClassAssignments,
  getStudentClasses,
  getStudentAssignments,
  createAssignment,
  updateStudentAssignmentStatus,
  getClassAnalytics,
  ClassData,
  AssignmentWithDetails,
  Assignment,
} from '../services/DataService';
import {
  GamificationService,
} from '../services/GamificationService';
import { supabase } from '../services/supabaseClient';

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => Engine.fetchUnits(),
    staleTime: 60_000,
  });
}

export function useUnit(id: string | undefined) {
  return useQuery({
    queryKey: ['units', id],
    queryFn: () => Engine.getUnitById(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, manifest }: { title: string; manifest?: any }) =>
      Engine.createUnit(title, manifest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<LessonUnit> }) =>
      Engine.updateUnit(id, updates),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['units', variables.id] });
    },
  });
}

export function useTeacherClasses(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['teacherClasses', teacherId],
    queryFn: () => getTeacherClasses(teacherId!),
    enabled: !!teacherId,
    staleTime: 30_000,
  });
}

export function useClassStudents(classId: string | undefined) {
  return useQuery({
    queryKey: ['classStudents', classId],
    queryFn: () => getClassStudents(classId!),
    enabled: !!classId,
    staleTime: 30_000,
  });
}

export function useTeacherStudents(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['teacherStudents', teacherId],
    queryFn: () => getTeacherStudents(teacherId!),
    enabled: !!teacherId,
    staleTime: 30_000,
  });
}

export function useClassAssignments(classId: string | undefined) {
  return useQuery({
    queryKey: ['classAssignments', classId],
    queryFn: () => getClassAssignments(classId!),
    enabled: !!classId,
    staleTime: 15_000,
  });
}

export function useAllTeacherAssignments(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['allTeacherAssignments', teacherId],
    queryFn: async () => {
      const classes = await getTeacherClasses(teacherId!);
      const classIds = classes.map(c => c.id);
      if (classIds.length === 0) return { assignments: [] as Assignment[], classes };

      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .in('class_id', classIds)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return { assignments: (data || []) as Assignment[], classes };
    },
    enabled: !!teacherId,
    staleTime: 15_000,
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Assignment>) => createAssignment(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['allTeacherAssignments'] }),
  });
}

export function useClassAnalytics(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['classAnalytics', teacherId],
    queryFn: () => getClassAnalytics(teacherId!),
    enabled: !!teacherId,
    staleTime: 30_000,
  });
}

export function useStudentClasses(studentId: string | undefined) {
  return useQuery({
    queryKey: ['studentClasses', studentId],
    queryFn: () => getStudentClasses(studentId!),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}

export function useStudentAssignments(studentId: string | undefined) {
  return useQuery({
    queryKey: ['studentAssignments', studentId],
    queryFn: () => getStudentAssignments(studentId!),
    enabled: !!studentId,
    staleTime: 15_000,
  });
}

export function useSubmitAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId }: { assignmentId: string; studentId: string }) =>
      updateStudentAssignmentStatus(assignmentId, 'submitted'),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['studentAssignments', variables.studentId] });
    },
  });
}

export function useStudentProgress() {
  return useQuery({
    queryKey: ['studentProgress'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return Engine.getStudentProgress();
    },
    staleTime: 30_000,
  });
}

export function useDailyQuests() {
  return useQuery({
    queryKey: ['dailyQuests'],
    queryFn: () => GamificationService.getDailyQuests(),
    staleTime: 60_000,
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () => GamificationService.getInventory(),
    staleTime: 60_000,
  });
}

export function useLeaderboard(classId?: string) {
  return useQuery({
    queryKey: ['leaderboard', classId],
    queryFn: () => GamificationService.getLeaderboard(classId),
    staleTime: 30_000,
  });
}

export function useStudentGems() {
  return useQuery({
    queryKey: ['studentGems'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { data } = await supabase
        .from('student_progress')
        .select('gems')
        .eq('student_id', user.id)
        .single();
      return data?.gems || 0;
    },
    staleTime: 30_000,
  });
}

export function useBuyShopItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, cost }: { itemId: string; cost: number }) =>
      GamificationService.buyShopItem(itemId, cost),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['studentGems'] });
    },
  });
}

export function useClaimQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questId: string) => GamificationService.claimQuestReward(questId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dailyQuests'] }),
  });
}
