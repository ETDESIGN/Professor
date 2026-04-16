import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }) },
  },
}));

vi.mock('../services/LessonTransformer', () => ({
  transformManifestToFlow: vi.fn().mockResolvedValue([{ type: 'INTRO_SPLASH' }]),
}));

import { Engine } from '../services/SupabaseService';

describe('SupabaseService Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const originalUrl = import.meta.env.VITE_SUPABASE_URL;
    Object.defineProperty(import.meta, 'env', {
      value: { ...import.meta.env, VITE_SUPABASE_URL: 'https://test.supabase.co' },
      writable: true,
    });
  });

  it('has all required methods', () => {
    expect(typeof Engine.fetchUnits).toBe('function');
    expect(typeof Engine.createUnit).toBe('function');
    expect(typeof Engine.getUnitById).toBe('function');
    expect(typeof Engine.updateUnit).toBe('function');
    expect(typeof Engine.unlockNextUnit).toBe('function');
    expect(typeof Engine.getStudentProgress).toBe('function');
    expect(typeof Engine.updateStudentProgress).toBe('function');
    expect(typeof Engine.fetchStudents).toBe('function');
    expect(typeof Engine.addStudent).toBe('function');
    expect(typeof Engine.removeStudent).toBe('function');
    expect(typeof Engine.fetchSRSItems).toBe('function');
    expect(typeof Engine.updateSRSItem).toBe('function');
    expect(typeof Engine.ensureStudentSRSItems).toBe('function');
    expect(typeof Engine.simulateScan).toBe('function');
  });

  it('ensureStudentSRSItems is callable without error', async () => {
    await expect(Engine.ensureStudentSRSItems('unit-1', 'student-1')).resolves.toBeUndefined();
  });

  it('fetchUnits returns an array', async () => {
    const units = await Engine.fetchUnits();
    expect(Array.isArray(units)).toBe(true);
  });

  it('getStudentProgress returns object with expected keys', async () => {
    const progress = await Engine.getStudentProgress();
    expect(progress).toHaveProperty('completedUnitIds');
    expect(progress).toHaveProperty('currentUnitId');
    expect(progress).toHaveProperty('xp');
    expect(progress).toHaveProperty('streak');
  });

  it('fetchSRSItems returns an array', async () => {
    const items = await Engine.fetchSRSItems('student-1');
    expect(Array.isArray(items)).toBe(true);
  });

  it('generateMockLessonData returns title and vocab', () => {
    const data = Engine.generateMockLessonData('test-file');
    expect(data).toHaveProperty('title', 'test-file');
    expect(data).toHaveProperty('vocab');
  });
});
