import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { AdminService } from '../services/AdminService';

function queryChain(resolvedValue: { data: any; error?: any; count?: number }) {
  const chain: any = {};
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'select' || prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'eq' || prop === 'in' || prop === 'order' || prop === 'limit' || prop === 'lt') {
        return vi.fn().mockReturnValue(new Proxy(chain, handler));
      }
      return undefined;
    },
  };

  const proxy = new Proxy(chain, handler);

  const methods: any = {
    select: vi.fn().mockReturnValue(proxy),
    insert: vi.fn().mockReturnValue(proxy),
    update: vi.fn().mockReturnValue(proxy),
    delete: vi.fn().mockReturnValue(proxy),
    eq: vi.fn().mockReturnValue(proxy),
    in: vi.fn().mockReturnValue(proxy),
    order: vi.fn().mockReturnValue(proxy),
    limit: vi.fn().mockReturnValue(proxy),
    lt: vi.fn().mockReturnValue(proxy),
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };

  Object.assign(chain, methods);

  return { ...methods, ...resolvedValue, then: undefined };
}

function selectChain(data: any, error?: any) {
  const result = { data, error: error || null };
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockImplementation(() => chain);
  chain.eq.mockImplementation(() => chain);
  chain.in.mockImplementation(() => chain);
  chain.order.mockImplementation(() => chain);
  chain.limit.mockImplementation(() => chain);
  chain.lt.mockImplementation(() => chain);
  chain.data = data;
  chain.error = error || null;
  chain.count = undefined;
  return chain;
}

function updateChain(error?: any) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: error || null }),
  };
  return chain;
}

function deleteChain(error?: any) {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: error || null }),
  };
  return chain;
}

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDistrictMetrics', () => {
    it('returns computed metrics from database', async () => {
      const profilesChain = selectChain([
        { role: 'teacher' }, { role: 'teacher' },
        { role: 'student' }, { role: 'student' }, { role: 'student' },
        { role: 'parent' },
      ]);
      const unitsChain = selectChain([
        { status: 'Active' }, { status: 'Active' }, { status: 'Draft' },
      ]);
      const progressChain = selectChain([
        { xp: 100, streak: 5, completed_unit_ids: ['u1'], current_unit_id: 'u2' },
        { xp: 200, streak: 10, completed_unit_ids: ['u1', 'u2'], current_unit_id: 'u3' },
        { xp: 0, streak: 0, completed_unit_ids: [], current_unit_id: null },
      ]);
      const classesChain = selectChain([]);
      classesChain.count = 4;

      mockFrom
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(unitsChain)
        .mockReturnValueOnce(progressChain)
        .mockReturnValueOnce(classesChain);

      const metrics = await AdminService.getDistrictMetrics();

      expect(metrics.totalTeachers).toBe(2);
      expect(metrics.totalStudents).toBe(3);
      expect(metrics.totalParents).toBe(1);
      expect(metrics.totalUnits).toBe(3);
      expect(metrics.activeUnits).toBe(2);
      expect(metrics.draftUnits).toBe(1);
      expect(metrics.totalSchools).toBe(4);
      expect(metrics.avgXpPerStudent).toBe(100);
      expect(metrics.avgStreak).toBe(5);
      expect(metrics.completionRate).toBe(67);
    });

    it('returns zeros when no data', async () => {
      mockFrom
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(Object.assign(selectChain([]), { count: 0 }));

      const metrics = await AdminService.getDistrictMetrics();

      expect(metrics.totalTeachers).toBe(0);
      expect(metrics.totalStudents).toBe(0);
      expect(metrics.avgXpPerStudent).toBe(0);
      expect(metrics.completionRate).toBe(0);
    });
  });

  describe('getTeacherSummaries', () => {
    it('returns empty array when no teachers', async () => {
      mockFrom.mockReturnValueOnce(selectChain([]));

      const summaries = await AdminService.getTeacherSummaries();
      expect(summaries).toEqual([]);
    });

    it('returns teacher summaries with class and student counts', async () => {
      mockFrom
        .mockReturnValueOnce(selectChain([
          { id: 't1', full_name: 'Ms. Smith', email: 'ms@school.com', avatar_url: null, created_at: '2024-01-01' },
          { id: 't2', full_name: 'Mr. Jones', email: 'mr@school.com', avatar_url: null, created_at: '2024-01-02' },
        ]))
        .mockReturnValueOnce(selectChain([
          { teacher_id: 't1', id: 'c1' },
          { teacher_id: 't1', id: 'c2' },
          { teacher_id: 't2', id: 'c3' },
        ]))
        .mockReturnValueOnce(selectChain([
          { class_id: 'c1' }, { class_id: 'c1' },
          { class_id: 'c2' },
          { class_id: 'c3' }, { class_id: 'c3' }, { class_id: 'c3' },
        ]));

      const summaries = await AdminService.getTeacherSummaries();

      expect(summaries).toHaveLength(2);
      expect(summaries[0].fullName).toBe('Ms. Smith');
      expect(summaries[0].classCount).toBe(2);
      expect(summaries[0].studentCount).toBe(3);
      expect(summaries[1].fullName).toBe('Mr. Jones');
      expect(summaries[1].classCount).toBe(1);
      expect(summaries[1].studentCount).toBe(3);
    });
  });

  describe('getStudentSummaries', () => {
    it('returns student summaries with progress and class info', async () => {
      mockFrom
        .mockReturnValueOnce(selectChain([
          { id: 's1', full_name: 'Alice', email: 'a@t.com', avatar_url: null, created_at: '2026-01-01' },
        ]))
        .mockReturnValueOnce(selectChain([
          { student_id: 's1', xp: 500, streak: 7, completed_unit_ids: ['u1', 'u2'], current_unit_id: 'u3' },
        ]))
        .mockReturnValueOnce(selectChain([
          { student_id: 's1', class: { name: 'English 101' } },
        ]));

      const result = await AdminService.getStudentSummaries(50);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].fullName).toBe('Alice');
      expect(result.data[0].xp).toBe(500);
      expect(result.data[0].streak).toBe(7);
      expect(result.data[0].completedUnits).toBe(2);
      expect(result.data[0].currentUnitId).toBe('u3');
      expect(result.data[0].enrolledClassName).toBe('English 101');
      expect(result.hasMore).toBe(false);
    });

    it('returns empty result when no students', async () => {
      mockFrom.mockReturnValueOnce(selectChain([]));
      const result = await AdminService.getStudentSummaries();
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getContentForModeration', () => {
    it('returns content items with computed flags', async () => {
      mockFrom.mockReturnValueOnce(selectChain([
        { id: 'u1', title: 'Unit 1', status: 'Active', level: 'A1', topic: 'Colors', lessons: 5, flow: [{ type: 'INTRO' }], manifest: { steps: [] }, last_updated: '2024-03-01' },
        { id: 'u2', title: 'Unit 2', status: 'Draft', level: 'A2', topic: null, lessons: 0, flow: null, manifest: null, last_updated: '2024-03-02' },
      ]));

      const items = await AdminService.getContentForModeration();

      expect(items).toHaveLength(2);
      expect(items[0].hasFlow).toBe(true);
      expect(items[0].hasManifest).toBe(true);
      expect(items[0].lessonCount).toBe(5);
      expect(items[1].hasFlow).toBe(false);
      expect(items[1].hasManifest).toBe(false);
      expect(items[1].topic).toBeNull();
    });

    it('throws on database error', async () => {
      const errorChain = selectChain(null, { message: 'DB error' });
      errorChain.error = { message: 'DB error' };
      mockFrom.mockReturnValueOnce(errorChain);

      await expect(AdminService.getContentForModeration()).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('updateUnitStatus', () => {
    it('calls update with correct status', async () => {
      mockFrom.mockReturnValueOnce(updateChain());

      await expect(AdminService.updateUnitStatus('u1', 'Active')).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      mockFrom.mockReturnValueOnce(updateChain({ message: 'fail' }));

      await expect(AdminService.updateUnitStatus('u1', 'Active')).rejects.toEqual({ message: 'fail' });
    });
  });

  describe('updateUserRole', () => {
    it('calls profile update with role', async () => {
      mockFrom.mockReturnValueOnce(updateChain());

      await expect(AdminService.updateUserRole('user-1', 'teacher')).resolves.toBeUndefined();
    });
  });

  describe('deleteUser', () => {
    it('deletes profile row', async () => {
      mockFrom.mockReturnValueOnce(deleteChain());

      await expect(AdminService.deleteUser('user-1')).resolves.toBeUndefined();
    });

    it('throws on delete error', async () => {
      mockFrom.mockReturnValueOnce(deleteChain({ message: 'forbidden' }));

      await expect(AdminService.deleteUser('user-1')).rejects.toEqual({ message: 'forbidden' });
    });
  });
});
