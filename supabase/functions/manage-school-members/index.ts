// manage-school-members
// Privileged account & membership operations that RLS/SQL cannot do from the
// client (minting auth accounts, setting app_metadata.role, disabling users).
// The caller is re-authorized server-side on every action.
//
// Actions:
//   invite_teacher            (manager of school_id, or admin)
//   revoke_member             (manager of the member's school, or admin)
//   create_school_with_manager(admin only)  — bootstrap a new school + manager
//   set_user_role             (admin only)  — sets app_metadata.role + profiles.role
//   disable_user              (admin only)  — bans the auth account
//   delete_user               (admin only)  — removes the auth account (cascades profile)

import { serveEdgeFunction } from '../_shared/edgeHandler.ts';

const ROLE_TEACHER = 'teacher';
const ROLE_MANAGER = 'manager';
const ROLE_ADMIN = 'admin';
const ALLOWED_ROLES = ['admin', 'manager', 'teacher', 'student', 'parent'];

const nowIso = () => new Date().toISOString();

/** Generate a setup/reset link for a user (works whether or not email delivery is configured). */
async function setupLink(sb: any, email: string): Promise<string | null> {
  const invite = await sb.auth.admin.generateLink({ type: 'invite', email });
  if (invite.data?.properties?.action_link) return invite.data.properties.action_link;
  const recovery = await sb.auth.admin.generateLink({ type: 'recovery', email });
  return recovery.data?.properties?.action_link || null;
}

/** Create a user (confirmed) with the given app_metadata role, or reuse an existing one by email. */
async function createOrReuseUser(
  sb: any,
  email: string,
  role: string,
  fullName?: string
): Promise<string> {
  const create = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (!create.error) return create.data.user.id;

  if (!/already.*(registered|exists)|user already/i.test(create.error.message)) {
    throw new Error(create.error.message);
  }
  // User exists -> locate via profiles.email and ensure app_metadata.role
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (pErr || !profile) throw new Error('User exists but could not be located');
  const upd = await sb.auth.admin.updateUserById(profile.id, { app_metadata: { role } });
  if (upd.error) throw new Error(upd.error.message);
  return profile.id;
}

/** Ensure an ACTIVE teacher membership (handles pending/active update and terminal-state re-add). */
async function ensureActiveMembership(
  sb: any,
  schoolId: string,
  userId: string,
  callerId: string,
  title: string | null
): Promise<void> {
  const { data: existing } = await sb
    .from('school_memberships')
    .select('id, status')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await sb.from('school_memberships').insert({
      school_id: schoolId,
      user_id: userId,
      role: ROLE_TEACHER,
      status: 'active',
      reviewed_by: callerId,
      reviewed_at: nowIso(),
      title,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (existing.status === 'active') return;

  if (existing.status === 'pending') {
    // pending -> active is an allowed transition (guard_membership_transition)
    const { error } = await sb
      .from('school_memberships')
      .update({ role: ROLE_TEACHER, status: 'active', reviewed_by: callerId, reviewed_at: nowIso(), title })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  // rejected / revoked -> remove the terminal row and create a fresh active one
  await sb.from('school_memberships').delete().eq('id', existing.id);
  const { error } = await sb.from('school_memberships').insert({
    school_id: schoolId,
    user_id: userId,
    role: ROLE_TEACHER,
    status: 'active',
    reviewed_by: callerId,
    reviewed_at: nowIso(),
    title,
  });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  return serveEdgeFunction(
    req,
    {
      name: 'manage-school-members',
      requireAuth: true,
      rateLimit: { maxRequests: 20, windowMs: 60_000 },
      validationRules: [{ field: 'action', required: true, type: 'string' }],
    },
    async (body, auth) => {
      const sb = auth.supabase; // service-role client (from authMiddleware)
      const callerId = auth.userId;
      const callerRole = auth.role; // profiles.role
      const action = body.action;

      const isManagerOf = async (schoolId: string) => {
        const { data } = await sb
          .from('school_memberships')
          .select('id')
          .eq('school_id', schoolId)
          .eq('user_id', callerId)
          .eq('role', 'manager')
          .eq('status', 'active')
          .maybeSingle();
        return !!data;
      };

      switch (action) {
        case 'invite_teacher': {
          const { school_id, email, full_name, title } = body;
          if (!school_id || !email) throw new Error('school_id and email are required');
          if (callerRole !== ROLE_ADMIN && !(await isManagerOf(school_id))) {
            throw new Error('Not authorized for this school');
          }
          const userId = await createOrReuseUser(sb, email, ROLE_TEACHER, full_name);
          await ensureActiveMembership(sb, school_id, userId, callerId, title || null);
          const invite_url = await setupLink(sb, email);
          return { ok: true, user_id: userId, email, invite_url };
        }

        case 'revoke_member': {
          const { membership_id } = body;
          if (!membership_id) throw new Error('membership_id is required');
          const { data: m, error: me } = await sb
            .from('school_memberships')
            .select('school_id, user_id, role')
            .eq('id', membership_id)
            .maybeSingle();
          if (me || !m) throw new Error('Membership not found');
          if (callerRole !== ROLE_ADMIN && !(await isManagerOf(m.school_id))) {
            throw new Error('Not authorized');
          }
          if (m.role === 'manager' && callerRole !== ROLE_ADMIN) {
            throw new Error('Only an admin can revoke a manager');
          }
          const { error } = await sb
            .from('school_memberships')
            .update({ status: 'revoked', reviewed_by: callerId, reviewed_at: nowIso() })
            .eq('id', membership_id);
          if (error) throw new Error(error.message);
          return { ok: true };
        }

        case 'create_school_with_manager': {
          if (callerRole !== ROLE_ADMIN) throw new Error('Admin only');
          const { school_name, manager_email, manager_full_name, slug } = body;
          if (!school_name || !manager_email) {
            throw new Error('school_name and manager_email are required');
          }
          const { data: school, error: se } = await sb
            .from('schools')
            .insert({ name: school_name, slug: slug || null })
            .select('id')
            .single();
          if (se) throw new Error(se.message);

          const managerId = await createOrReuseUser(sb, manager_email, ROLE_MANAGER, manager_full_name);
          const { error: ie } = await sb.from('school_memberships').insert({
            school_id: school.id,
            user_id: managerId,
            role: ROLE_MANAGER,
            status: 'active',
            reviewed_by: callerId,
            reviewed_at: nowIso(),
          });
          if (ie) throw new Error(ie.message);
          await sb.from('schools').update({ owner_id: managerId }).eq('id', school.id);

          const invite_url = await setupLink(sb, manager_email);
          return { ok: true, school_id: school.id, manager_user_id: managerId, invite_url };
        }

        case 'set_user_role': {
          if (callerRole !== ROLE_ADMIN) throw new Error('Admin only');
          const { user_id, role } = body;
          if (!user_id || !ALLOWED_ROLES.includes(role)) throw new Error('Invalid user_id or role');
          const u = await sb.auth.admin.updateUserById(user_id, { app_metadata: { role } });
          if (u.error) throw new Error(u.error.message);
          const { error } = await sb.from('profiles').update({ role }).eq('id', user_id);
          if (error) throw new Error(error.message);
          return { ok: true };
        }

        case 'disable_user': {
          if (callerRole !== ROLE_ADMIN) throw new Error('Admin only');
          const { user_id } = body;
          if (!user_id) throw new Error('user_id is required');
          const u = await sb.auth.admin.updateUserById(user_id, { ban_duration: '876000h' });
          if (u.error) throw new Error(u.error.message);
          return { ok: true };
        }

        case 'delete_user': {
          if (callerRole !== ROLE_ADMIN) throw new Error('Admin only');
          const { user_id } = body;
          if (!user_id) throw new Error('user_id is required');
          const { error } = await sb.auth.admin.deleteUser(user_id);
          if (error) throw new Error(error.message);
          return { ok: true };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }
  );
});
