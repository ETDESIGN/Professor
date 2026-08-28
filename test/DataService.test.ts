import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { getParentStudents, getTeacherForStudent, getStudentSRSWords } from '../services/DataService';

// A thenable chain: every builder returns `this`, and awaiting the chain at
// ANY point (mid-chain `.eq(...)` await or terminal `.single()`) resolves to
// `terminal`. This mirrors supabase-js PostgrestBuilder's Promise nature.
function chainMock(terminal: { data?: any; error?: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(terminal),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
    then: (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject),
  };
  return chain;
}

describe('DataService', () => {
  beforeEach(() => {
    // mockReset (not just clearAllMocks) so queued mockReturnValueOnce values
    // from a previous test can't leak into the next one and consume a from() call.
    mockFrom.mockReset();
  });

  describe('getParentStudents', () => {
    // Current shape (C4): getParentStudents issues 2–3 queries:
    //   1. parent_roster_links → roster_students → profiles (approved links)
    //   2. parent_student_links → profiles (legacy fallback)
    //   3. student_progress batch `.in()` — only when students were found.

    it('returns empty array when no links found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: [], error: null })); // parent_roster_links
      mockFrom.mockReturnValueOnce(chainMock({ data: [], error: null })); // parent_student_links (legacy)

      const result = await getParentStudents('parent-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('returns students with progress when links found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({
        data: [
          {
            roster_student_id: 'rl1',
            roster: {
              id: 'rs1', display_name: 'Roster Kid', avatar: null,
              claimed_profile_id: 's1',
              profile: { id: 's1', email: 's@t.com', full_name: 'Student1', avatar_url: null },
            },
          },
        ],
        error: null,
      })); // parent_roster_links
      mockFrom.mockReturnValueOnce(chainMock({ data: [], error: null })); // parent_student_links (legacy)
      mockFrom.mockReturnValueOnce(chainMock({
        data: [{ student_id: 's1', xp: 100, streak: 5, current_unit_id: 'u1', completed_unit_ids: ['u1'] }],
        error: null,
      })); // student_progress

      const result = await getParentStudents('parent-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1'); // claimed profile id is the normalized identity
      expect(result[0].full_name).toBe('Student1');
      expect(result[0].xp).toBe(100);
      expect(result[0].streak).toBe(5);
    });
  });

  describe('getTeacherForStudent', () => {
    it('returns null when no enrollment found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: null, error: { code: 'PGRST116' } }));

      const result = await getTeacherForStudent('student-1');
      expect(result).toBeNull();
    });

    it('returns teacher profile when found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: { class_id: 'class-1' } })); // class_enrollments
      mockFrom.mockReturnValueOnce(chainMock({ data: { teacher_id: 'teacher-1' } })); // classes
      mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'teacher-1', full_name: 'Ms. Smith', avatar_url: null } })); // profiles

      const result = await getTeacherForStudent('student-1');
      expect(result?.full_name).toBe('Ms. Smith');
    });
  });

  describe('getStudentSRSWords', () => {
    it('returns words from srs_items', async () => {
      mockFrom.mockReturnValueOnce(chainMock({
        data: [{ word: 'cat' }, { word: 'dog' }, { word: 'bird' }],
        error: null,
      }));

      const words = await getStudentSRSWords('student-1');
      expect(words).toEqual(['cat', 'dog', 'bird']);
    });

    it('returns empty array on error', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: null, error: { message: 'fail' } }));

      const words = await getStudentSRSWords('student-1');
      expect(words).toEqual([]);
    });
  });
});
