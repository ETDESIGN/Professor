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

function chainMock(terminal: { data?: any; error?: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(terminal),
    maybeSingle: vi.fn().mockResolvedValue(terminal),
  };
  return chain;
}

describe('DataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getParentStudents', () => {
    it('returns empty array when no links found', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await getParentStudents('parent-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('returns students with progress when links found', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ student_id: 's1', profiles: { id: 's1', email: 's@t.com', full_name: 'Student1', avatar_url: null } }],
          error: null,
        }),
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { xp: 100, streak: 5, current_unit_id: 'u1', completed_unit_ids: ['u1'] },
        }),
      });

      const result = await getParentStudents('parent-1');
      expect(result).toHaveLength(1);
      expect(result[0].xp).toBe(100);
      expect(result[0].full_name).toBe('Student1');
    });
  });

  describe('getTeacherForStudent', () => {
    it('returns null when no enrollment found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: null, error: { code: 'PGRST116' } }));

      const result = await getTeacherForStudent('student-1');
      expect(result).toBeNull();
    });

    it('returns teacher profile when found', async () => {
      mockFrom.mockReturnValueOnce(chainMock({ data: { class_id: 'class-1' } }));
      mockFrom.mockReturnValueOnce(chainMock({ data: { teacher_id: 'teacher-1' } }));
      mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'teacher-1', full_name: 'Ms. Smith', avatar_url: null } }));

      const result = await getTeacherForStudent('student-1');
      expect(result?.full_name).toBe('Ms. Smith');
    });
  });

  describe('getStudentSRSWords', () => {
    it('returns words from srs_items', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ word: 'cat' }, { word: 'dog' }, { word: 'bird' }],
          error: null,
        }),
      });

      const words = await getStudentSRSWords('student-1');
      expect(words).toEqual(['cat', 'dog', 'bird']);
    });

    it('returns empty array on error', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'fail' },
        }),
      });

      const words = await getStudentSRSWords('student-1');
      expect(words).toEqual([]);
    });
  });
});
