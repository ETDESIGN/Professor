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
import {
  getSchoolDirectory,
  getMyMemberships,
  requestAffiliation,
  withdrawAffiliation,
  getRosterForClass,
  createRosterStudent,
  updateRosterStudent,
  archiveRosterStudent,
  claimRosterStudent,
  connectParentByToken,
  getPendingParentLinks,
  decideParentRosterLink,
  getSchoolMembers,
  setMembershipStatus,
  ProvisioningService,
  getClassAnnouncements,
  createClassAnnouncement,
  RosterPatch,
} from '../services/ManagementService';
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
    queryFn: () => GamificationService.getStudentGems(),
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

// ============================================
// Schools / affiliation / roster / approvals / announcements
// ============================================

export function useSchoolDirectory() {
  return useQuery({
    queryKey: ['schoolDirectory'],
    queryFn: () => getSchoolDirectory(),
    staleTime: 60_000,
  });
}

export function useMyMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ['myMemberships', userId],
    queryFn: () => getMyMemberships(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useRequestAffiliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ schoolId, userId }: { schoolId: string; userId: string }) =>
      requestAffiliation(schoolId, userId),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['myMemberships', v.userId] }),
  });
}

export function useWithdrawAffiliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => withdrawAffiliation(membershipId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myMemberships'] }),
  });
}

export function useRosterForClass(classId: string | undefined) {
  return useQuery({
    queryKey: ['roster', classId],
    queryFn: () => getRosterForClass(classId!),
    enabled: !!classId,
    staleTime: 15_000,
  });
}

export function useCreateRosterStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      teacherId,
      displayName,
      opts,
    }: {
      classId: string;
      teacherId: string;
      displayName: string;
      opts?: { avatar?: string; team?: string };
    }) => createRosterStudent(classId, teacherId, displayName, opts),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['roster', v.classId] }),
  });
}

export function useUpdateRosterStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, classId }: { id: string; patch: RosterPatch; classId: string }) =>
      updateRosterStudent(id, patch),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['roster', v.classId] }),
  });
}

export function useArchiveRosterStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, classId }: { id: string; classId: string }) => archiveRosterStudent(id),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['roster', v.classId] }),
  });
}

export function usePendingParentLinks(enabled = true) {
  return useQuery({
    queryKey: ['pendingParentLinks'],
    queryFn: () => getPendingParentLinks(),
    enabled,
    staleTime: 15_000,
  });
}

export function useDecideParentRosterLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, approve }: { linkId: string; approve: boolean }) =>
      decideParentRosterLink(linkId, approve),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pendingParentLinks'] }),
  });
}

export function useClaimRosterStudent() {
  return useMutation({
    mutationFn: (token: string) => claimRosterStudent(token),
  });
}

export function useConnectParentByToken() {
  return useMutation({
    mutationFn: (token: string) => connectParentByToken(token),
  });
}

// ============================================
// Manager: school members, affiliation approvals, provisioning
// ============================================

export function useSchoolMembers(schoolId: string | undefined) {
  return useQuery({
    queryKey: ['schoolMembers', schoolId],
    queryFn: () => getSchoolMembers(schoolId!),
    enabled: !!schoolId,
    staleTime: 15_000,
  });
}

export function useSetMembershipStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, status }: { membershipId: string; status: 'active' | 'rejected' }) =>
      setMembershipStatus(membershipId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schoolMembers'] }),
  });
}

export function useInviteTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ schoolId, email, fullName, title }: { schoolId: string; email: string; fullName?: string; title?: string }) =>
      ProvisioningService.inviteTeacher(schoolId, email, fullName, title),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['schoolMembers', v.schoolId] }),
  });
}

export function useRevokeMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, schoolId }: { membershipId: string; schoolId: string }) =>
      ProvisioningService.revokeMember(membershipId),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['schoolMembers', v.schoolId] }),
  });
}

export function useClassAnnouncements(classId: string | undefined) {
  return useQuery({
    queryKey: ['classAnnouncements', classId],
    queryFn: () => getClassAnnouncements(classId!),
    enabled: !!classId,
    staleTime: 30_000,
  });
}

export function useCreateClassAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      authorId,
      title,
      body,
    }: {
      classId: string;
      authorId: string;
      title: string;
      body: string;
    }) => createClassAnnouncement(classId, authorId, title, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['classAnnouncements', v.classId] }),
  });
}
