import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSignIn, mockSignUp, mockSignOut, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
    from: mockFrom,
  },
}));

import { signInWithPassword, signUp, signOut, getCurrentUser, hasAccessToPortal } from '../services/AuthService';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasAccessToPortal', () => {
    it('allows admin access to all portals', () => {
      expect(hasAccessToPortal('admin', 'admin')).toBe(true);
      expect(hasAccessToPortal('admin', 'teacher')).toBe(true);
      expect(hasAccessToPortal('admin', 'student')).toBe(true);
      expect(hasAccessToPortal('admin', 'parent')).toBe(true);
    });

    it('allows teacher access only to teacher portal', () => {
      expect(hasAccessToPortal('teacher', 'teacher')).toBe(true);
      expect(hasAccessToPortal('teacher', 'student')).toBe(false);
      expect(hasAccessToPortal('teacher', 'parent')).toBe(false);
    });

    it('allows student access only to student portal', () => {
      expect(hasAccessToPortal('student', 'student')).toBe(true);
      expect(hasAccessToPortal('student', 'teacher')).toBe(false);
    });

    it('allows parent access only to parent portal', () => {
      expect(hasAccessToPortal('parent', 'parent')).toBe(true);
      expect(hasAccessToPortal('parent', 'teacher')).toBe(false);
    });
  });

  describe('signInWithPassword', () => {
    it('returns error on auth failure', async () => {
      mockSignIn.mockResolvedValueOnce({
        data: {},
        error: { message: 'Invalid login credentials' },
      });

      const result = await signInWithPassword('test@test.com', 'wrong');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid login');
    });

    it('returns success with user profile', async () => {
      mockSignIn.mockResolvedValueOnce({
        data: { user: { id: 'user-1', email: 'test@test.com', user_metadata: {} } },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'user-1', email: 'test@test.com', role: 'teacher', full_name: 'Test User', avatar_url: null },
        }),
      });

      const result = await signInWithPassword('test@test.com', 'password');
      expect(result.success).toBe(true);
      expect(result.user?.role).toBe('teacher');
      expect(result.user?.full_name).toBe('Test User');
    });

    it('returns error when no user returned', async () => {
      mockSignIn.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const result = await signInWithPassword('test@test.com', 'password');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No user');
    });
  });

  describe('signUp', () => {
    it('returns success for new signup', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { session: { access_token: 'token' }, user: { id: 'new-1' } },
        error: null,
      });

      const result = await signUp('new@test.com', 'password123', 'student', 'New User');
      expect(result.success).toBe(true);
      expect(result.needsEmailConfirmation).toBe(false);
    });

    it('detects email confirmation required', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { session: null, user: { id: 'new-2' } },
        error: null,
      });

      const result = await signUp('new@test.com', 'password123', 'student');
      expect(result.success).toBe(true);
      expect(result.needsEmailConfirmation).toBe(true);
    });

    it('returns error on signup failure', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: {},
        error: { message: 'User already registered' },
      });

      const result = await signUp('existing@test.com', 'pass', 'teacher');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });
  });

  describe('signOut', () => {
    it('returns success on signout', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null });
      const result = await signOut();
      expect(result.success).toBe(true);
    });

    it('returns error on signout failure', async () => {
      mockSignOut.mockResolvedValueOnce({ error: { message: 'Session missing' } });
      const result = await signOut();
      expect(result.success).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when no user', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('returns user with profile', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { id: 'user-1', email: 'test@test.com', role: 'student', full_name: 'Student', avatar_url: null },
        }),
      });

      const user = await getCurrentUser();
      expect(user?.id).toBe('user-1');
      expect(user?.role).toBe('student');
    });

    it('returns null when profile not found', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }),
      });

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });
});
