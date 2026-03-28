import { supabase } from './supabaseClient';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    full_name?: string;
    avatar_url?: string;
}

export interface LoginResult {
    success: boolean;
    user?: AuthUser;
    error?: string;
}

/**
 * Sign in with email and password using Supabase Auth
 */
export async function signInWithPassword(
    email: string,
    password: string
): Promise<LoginResult> {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data.user) {
            return { success: false, error: 'No user returned' };
        }

        // Get user role from profiles table
        let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, role, full_name, avatar_url')
            .eq('id', data.user.id)
            .maybeSingle();

        if (profileError) {
            return {
                success: false,
                error: 'Unable to verify user role. Please contact support.'
            };
        }

        // Self-Healing: If profile doesn't exist, create it
        if (!profile) {
            console.log('Profile not found, attempting self-healing...');

            // Wait briefly to allow RLS policies or trigger to catch up
            await new Promise(resolve => setTimeout(resolve, 500));

            const defaultRole = data.user.user_metadata?.role ? data.user.user_metadata.role.toLowerCase() : 'student';
            const defaultFullName = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Unknown User';

            const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email: data.user.email,
                    role: defaultRole, // Will be cast to enum in Supabase if properly defined, otherwise string representation is fine for JS client
                    full_name: defaultFullName
                })
                .select('id, email, role, full_name, avatar_url')
                .single();

            if (insertError) {
                console.error('Self-healing failed:', insertError);
                return {
                    success: false,
                    error: 'Profile setup incomplete. Please try signing up again or contact support.'
                };
            }

            profile = newProfile;
            console.log('Profile self-healed successfully:', profile);
        }

        return {
            success: true,
            user: {
                id: profile.id,
                email: profile.email || '',
                role: profile.role as UserRole,
                full_name: profile.full_name || undefined,
                avatar_url: profile.avatar_url || undefined,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Sign up a new user with email, password, and role
 */
export async function signUp(
    email: string,
    password: string,
    role: UserRole,
    fullName?: string
): Promise<{ success: boolean; needsEmailConfirmation?: boolean; error?: string }> {
    try {
        // Dynamic redirect URL for Vercel deployment
        const redirectUrl = typeof window !== 'undefined'
            ? window.location.origin
            : 'https://professor-eta.vercel.app';

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: redirectUrl,
                data: {
                    full_name: fullName || email.split('@')[0],
                    role: role.toLowerCase(),
                },
            },
        });

        if (error) {
            return { success: false, error: error.message };
        }

        // Check if email confirmation is required
        // If session is null, user needs to confirm their email
        const needsEmailConfirmation = !data.session;

        // Note: Profile will be created automatically by the trigger
        return { success: true, needsEmailConfirmation };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return null;

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, role, full_name, avatar_url')
            .eq('id', user.id)
            .maybeSingle();

        if (!profile) return null;

        return {
            id: profile.id,
            email: profile.email || '',
            role: profile.role as UserRole,
            full_name: profile.full_name || undefined,
            avatar_url: profile.avatar_url || undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Check if user has the required role for a portal
 */
export function hasAccessToPortal(
    userRole: UserRole,
    portal: 'teacher' | 'student' | 'parent' | 'admin'
): boolean {
    const roleAccess: Record<UserRole, string[]> = {
        admin: ['admin', 'teacher', 'student', 'parent'],
        teacher: ['teacher'],
        student: ['student'],
        parent: ['parent'],
    };

    return roleAccess[userRole]?.includes(portal) || false;
}

/**
 * Verify user can access a specific portal
 */
export async function verifyPortalAccess(
    email: string,
    portal: 'teacher' | 'student' | 'parent' | 'admin'
): Promise<{ allowed: boolean; userRole?: UserRole; error?: string }> {
    const user = await getCurrentUser();

    if (!user) {
        return { allowed: false, error: 'Not authenticated' };
    }

    if (!hasAccessToPortal(user.role, portal)) {
        return {
            allowed: false,
            userRole: user.role,
            error: `Your account is registered as a ${user.role}. Please use the ${user.role} portal.`
        };
    }

    return { allowed: true, userRole: user.role };
}
