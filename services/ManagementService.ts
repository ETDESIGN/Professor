import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from './logger';

const log = createClientLogger('ManagementService');

// =====================================================================
// Types
// =====================================================================
export interface SchoolDirectoryEntry {
    id: string;
    name: string;
    slug: string | null;
    country: string | null;
    city: string | null;
}

export interface SchoolMembershipWithSchool {
    id: string;
    school_id: string;
    user_id: string;
    role: 'manager' | 'teacher';
    status: 'pending' | 'active' | 'rejected' | 'revoked';
    requested_at: string;
    reviewed_at: string | null;
    title: string | null;
    school: { id: string; name: string; slug: string | null } | null;
}

export interface RosterStudent {
    id: string;
    school_id: string | null;
    class_id: string;
    teacher_id: string;
    display_name: string;
    avatar: string | null;
    team: string | null;
    claim_token: string;
    claim_token_expires_at: string | null;
    claimed_profile_id: string | null;
    claimed_at: string | null;
    is_archived: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface PendingParentLink {
    id: string;
    parent_id: string;
    roster_student_id: string;
    relationship: string | null;
    status: string;
    created_at: string;
    parent: { id: string; full_name: string | null; email: string | null } | null;
    roster: { id: string; display_name: string; class_id: string } | null;
}

export interface AnnouncementRow {
    id: string;
    school_id: string | null;
    class_id: string | null;
    author_id: string;
    audience: 'school' | 'class' | 'public';
    title: string | null;
    body: string;
    created_at: string;
}

export type RosterPatch = Partial<Pick<RosterStudent, 'display_name' | 'avatar' | 'team' | 'metadata'>>;

// =====================================================================
// Schools & affiliation
// =====================================================================

/** Public, PII-free list of schools (for the affiliation picker). */
export async function getSchoolDirectory(): Promise<SchoolDirectoryEntry[]> {
    const { data, error } = await supabase
        .from('school_directory')
        .select('*')
        .order('name');
    if (error) {
        log.warn('school_directory_error', { error: error.message });
        throw error;
    }
    return (data || []) as SchoolDirectoryEntry[];
}

/** Memberships for a user (own rows are visible via RLS). */
export async function getMyMemberships(userId: string): Promise<SchoolMembershipWithSchool[]> {
    const { data, error } = await supabase
        .from('school_memberships')
        .select('id, school_id, user_id, role, status, requested_at, reviewed_at, title, school:schools(id, name, slug)')
        .eq('user_id', userId)
        .order('requested_at', { ascending: false });
    if (error) {
        log.warn('my_memberships_error', { error: error.message });
        throw error;
    }
    return (data || []) as unknown as SchoolMembershipWithSchool[];
}

/** A teacher self-requests affiliation (status pending -> manager approves). */
export async function requestAffiliation(schoolId: string, userId: string): Promise<void> {
    const { error } = await supabase
        .from('school_memberships')
        .insert({ school_id: schoolId, user_id: userId, role: 'teacher', status: 'pending' });
    if (error) {
        toast.error(error.message || 'Could not send request');
        throw error;
    }
    toast.success('Affiliation request sent');
}

export async function withdrawAffiliation(membershipId: string): Promise<void> {
    const { error } = await supabase
        .from('school_memberships')
        .delete()
        .eq('id', membershipId);
    if (error) {
        toast.error(error.message || 'Could not withdraw request');
        throw error;
    }
    toast.success('Request withdrawn');
}

// =====================================================================
// Roster students (no-auth placeholders created by the teacher)
// =====================================================================

export async function getRosterForClass(classId: string): Promise<RosterStudent[]> {
    const { data, error } = await supabase
        .from('roster_students')
        .select('*')
        .eq('class_id', classId)
        .eq('is_archived', false)
        .order('display_name', { ascending: true });
    if (error) {
        log.warn('roster_for_class_error', { error: error.message });
        throw error;
    }
    return (data || []) as RosterStudent[];
}

export async function createRosterStudent(
    classId: string,
    teacherId: string,
    displayName: string,
    opts?: { avatar?: string; team?: string }
): Promise<RosterStudent> {
    const { data, error } = await supabase.rpc('create_roster_student', {
        p_class_id: classId,
        p_teacher_id: teacherId,
        p_display_name: displayName.trim(),
        p_avatar: opts?.avatar ?? null,
        p_team: opts?.team ?? null,
    });
    if (error) {
        log.warn('create_roster_student_error', { error: error.message });
        toast.error(error.message || 'Could not create student');
        throw error;
    }
    return data as RosterStudent;
}

export async function updateRosterStudent(id: string, patch: RosterPatch): Promise<void> {
    const { error } = await supabase
        .from('roster_students')
        .update(patch)
        .eq('id', id);
    if (error) {
        toast.error(error.message || 'Could not update student');
        throw error;
    }
}

export async function archiveRosterStudent(id: string): Promise<void> {
    const { error } = await supabase
        .from('roster_students')
        .update({ is_archived: true })
        .eq('id', id);
    if (error) {
        toast.error(error.message || 'Could not remove student');
        throw error;
    }
    toast.success('Student removed from roster');
}

/** A shareable one-time link a student/parent uses at home to claim the roster entry. */
export function buildClaimUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/claim?t=${token}`;
}

// =====================================================================
// Claim (RPC)
// =====================================================================

/** Home account binds itself to a roster entry via its one-time claim token. */
export async function claimRosterStudent(token: string): Promise<string> {
    const { data, error } = await supabase.rpc('claim_roster_student', { p_token: token });
    if (error) {
        toast.error(error.message || 'Claim failed');
        throw error;
    }
    return data as string;
}

export interface RosterTokenPreview {
    roster_student_id: string;
    display_name: string;
    is_claimed: boolean;
    class_name: string | null;
}

/** Minimal, safe preview of a roster entry for someone holding the token. */
export async function previewRosterToken(token: string): Promise<RosterTokenPreview | null> {
    const { data, error } = await supabase.rpc('preview_roster_token', { p_token: token });
    if (error) {
        log.warn('preview_roster_token_error', { error: error.message });
        throw error;
    }
    return Array.isArray(data) && data.length ? (data[0] as RosterTokenPreview) : null;
}

/** Parent requests an approval-gated link via a roster token. Returns a status string. */
export async function connectParentByToken(token: string): Promise<'requested' | 'already_pending' | 'already_active'> {
    const { data, error } = await supabase.rpc('connect_parent_by_token', { p_token: token });
    if (error) {
        toast.error(error.message || 'Could not connect');
        throw error;
    }
    return data as 'requested' | 'already_pending' | 'already_active';
}

// =====================================================================
// Parent links (approval-gated)
// =====================================================================

export async function requestParentRosterLink(
    parentId: string,
    rosterStudentId: string,
    relationship = 'parent'
): Promise<void> {
    const { error } = await supabase
        .from('parent_roster_links')
        .insert({
            parent_id: parentId,
            roster_student_id: rosterStudentId,
            relationship,
            status: 'pending',
        });
    if (error) {
        toast.error(error.message || 'Could not request link');
        throw error;
    }
    toast.success('Parent link requested — pending teacher approval');
}

/** Pending parent links visible to the current teacher/manager (RLS-scoped). */
export async function getPendingParentLinks(): Promise<PendingParentLink[]> {
    const { data, error } = await supabase
        .from('parent_roster_links')
        .select(
            'id, parent_id, roster_student_id, relationship, status, created_at, ' +
            'parent:profiles!parent_roster_links_parent_id_fkey(id, full_name, email), ' +
            'roster:roster_students(id, display_name, class_id)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) {
        log.warn('pending_parent_links_error', { error: error.message });
        throw error;
    }
    return (data || []) as unknown as PendingParentLink[];
}

export async function decideParentRosterLink(linkId: string, approve: boolean): Promise<void> {
    const { error } = await supabase.rpc('decide_parent_roster_link', {
        p_link: linkId,
        p_approve: approve,
    });
    if (error) {
        toast.error(error.message || 'Could not decide');
        throw error;
    }
    toast.success(approve ? 'Parent link approved' : 'Parent link rejected');
}

// =====================================================================
// Announcements (class/school broadcast)
// =====================================================================

export async function getClassAnnouncements(classId: string): Promise<AnnouncementRow[]> {
    const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
    if (error) {
        log.warn('class_announcements_error', { error: error.message });
        throw error;
    }
    return (data || []) as AnnouncementRow[];
}

export async function createClassAnnouncement(
    classId: string,
    authorId: string,
    title: string,
    body: string
): Promise<void> {
    const { error } = await supabase
        .from('announcements')
        .insert({
            class_id: classId,
            author_id: authorId,
            audience: 'class',
            title: title.trim() || null,
            body: body.trim(),
        });
    if (error) {
        toast.error(error.message || 'Could not post announcement');
        throw error;
    }
    toast.success('Announcement posted');
}

// =====================================================================
// School members (manager view) — RLS lets a manager read/update their school
// =====================================================================

export interface SchoolMember {
    id: string;
    user_id: string;
    role: 'manager' | 'teacher';
    status: 'pending' | 'active' | 'rejected' | 'revoked';
    requested_at: string;
    reviewed_at: string | null;
    title: string | null;
    user: { full_name: string | null; email: string | null } | null;
}

export async function getSchoolMembers(schoolId: string): Promise<SchoolMember[]> {
    const { data, error } = await supabase
        .from('school_memberships')
        .select(
            'id, user_id, role, status, requested_at, reviewed_at, title, ' +
            'user:profiles!school_memberships_user_id_fkey(full_name, email)'
        )
        .eq('school_id', schoolId)
        .order('requested_at', { ascending: false });
    if (error) {
        log.warn('school_members_error', { error: error.message });
        throw error;
    }
    return (data || []) as unknown as SchoolMember[];
}

/** Manager approves/rejects a pending affiliation request (RLS + transition trigger gated). */
export async function setMembershipStatus(
    membershipId: string,
    status: 'active' | 'rejected'
): Promise<void> {
    const { error } = await supabase
        .from('school_memberships')
        .update({ status })
        .eq('id', membershipId);
    if (error) {
        toast.error(error.message || 'Could not update member');
        throw error;
    }
    toast.success(status === 'active' ? 'Member approved' : 'Request rejected');
}

// =====================================================================
// Privileged provisioning (calls the manage-school-members edge function,
// which is the only path that can mint/disable auth accounts & set
// app_metadata.role). Caller's JWT is forwarded automatically.
// =====================================================================

async function invokeManageMembers(action: string, payload: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('manage-school-members', {
        body: { action, ...payload },
    });
    if (error) {
        const msg = (error as any)?.message || 'Request failed';
        toast.error(msg);
        throw error;
    }
    if (data?.error) {
        toast.error(data.error);
        throw new Error(data.error);
    }
    return data;
}

export interface InviteResult {
    ok: boolean;
    user_id: string;
    email: string;
    invite_url: string | null;
}

export const ProvisioningService = {
    inviteTeacher: async (schoolId: string, email: string, fullName?: string, title?: string): Promise<InviteResult> =>
        invokeManageMembers('invite_teacher', { school_id: schoolId, email, full_name: fullName, title }),
    revokeMember: (membershipId: string) =>
        invokeManageMembers('revoke_member', { membership_id: membershipId }),
    createSchoolWithManager: (schoolName: string, managerEmail: string, managerFullName?: string, slug?: string) =>
        invokeManageMembers('create_school_with_manager', {
            school_name: schoolName, manager_email: managerEmail, manager_full_name: managerFullName, slug,
        }),
    setUserRole: (userId: string, role: 'admin' | 'manager' | 'teacher' | 'student' | 'parent') =>
        invokeManageMembers('set_user_role', { user_id: userId, role }),
    disableUser: (userId: string) =>
        invokeManageMembers('disable_user', { user_id: userId }),
    deleteUser: (userId: string) =>
        invokeManageMembers('delete_user', { user_id: userId }),
};
