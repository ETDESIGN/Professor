import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserMock, fromMock, invokeMock } = vi.hoisted(() => {
  const chain: any = {};
  const createChain = () => {
    const handler: any = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        if (!handler._mocks[prop]) handler._mocks[prop] = vi.fn().mockReturnValue(handler);
        return handler._mocks[prop];
      },
      apply(_target, _thisArg, _args) {
        return handler;
      },
    });
    handler._mocks = {};
    handler.mockResolvedValue = (val: any) => {
      handler._mocks.then = vi.fn().mockResolvedValue(val);
      return handler;
    };
    return handler;
  };

  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
  const invokeMock = vi.fn().mockResolvedValue({ data: null, error: null });

  const fromMock = vi.fn().mockImplementation(() => createChain());

  return { getUserMock, fromMock, invokeMock };
});

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
    functions: { invoke: invokeMock },
  },
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { GamificationService } from '../services/GamificationService';

describe('GamificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  const makeChain = (resolvedValue: any) => {
    const chain: Record<string, any> = {};
    const handler = {
      get(_target: any, prop: string) {
        if (!chain[prop]) {
          if (prop === 'then') return undefined;
          chain[prop] = vi.fn().mockReturnValue(new Proxy({}, handler));
        }
        return chain[prop];
      },
    };
    const proxy = new Proxy({}, handler);
    if (resolvedValue !== undefined) {
      chain.then = vi.fn().mockResolvedValue(resolvedValue);
    }
    return { proxy, chain };
  };

  describe('awardXP', () => {
    it('awards XP and returns new total and level', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { xp: 500, total_xp_earned: 2000 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') {
          return { select: selectChain, update: updateChain };
        }
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.awardXP(100, 'lesson_complete');
      expect(result.newXP).toBe(600);
      expect(result.newLevel).toBe(1);
    });

    it('returns zeros when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.awardXP(100, 'test');
      expect(result).toEqual({ newXP: 0, newLevel: 1 });
    });

    it('calculates level correctly at XP boundary', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { xp: 950, total_xp_earned: 3000 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: updateChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.awardXP(100, 'test');
      expect(result.newXP).toBe(1050);
      expect(result.newLevel).toBe(2);
    });
  });

  describe('awardGems', () => {
    it('awards gems and returns new total', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { gems: 100 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: updateChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.awardGems(50, 'quest_complete');
      expect(result).toBe(150);
    });

    it('returns 0 when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.awardGems(50, 'test');
      expect(result).toBe(0);
    });
  });

  describe('spendGems', () => {
    it('spends gems when balance is sufficient', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { gems: 300 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: updateChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.spendGems(200);
      expect(result.success).toBe(true);
      expect(result.newGems).toBe(100);
    });

    it('rejects when balance is insufficient', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { gems: 50 }, error: null }),
        }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: vi.fn() };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.spendGems(200);
      expect(result.success).toBe(false);
      expect(result.newGems).toBe(50);
    });
  });

  describe('getDailyQuests', () => {
    it('returns existing quests when already assigned today', async () => {
      const existingQuests = [
        { id: 'q1', quest_type: 'earn_xp', title: 'Earn 50 XP', target: 50, current: 30, reward_gems: 10, reward_xp: 15 },
      ];

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existingQuests }),
        }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_quests') return { select: selectChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.getDailyQuests();
      expect(result).toEqual(existingQuests);
    });

    it('generates quests from templates when none exist', async () => {
      const newQuests = [
        { id: 'q1', quest_type: 'earn_xp', title: 'Earn 50 XP', target: 50, current: 0 },
        { id: 'q2', quest_type: 'complete_lessons', title: 'Complete 2 Lessons', target: 2, current: 0 },
      ];

      let callCount = 0;
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { data: [] };
            if (callCount === 2) return { data: null };
            return { data: [] };
          }),
        }),
      });
      const upsertChain = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: newQuests }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_quests') return { select: selectChain, upsert: upsertChain };
        if (table === 'quest_templates') return { select: vi.fn().mockReturnValue({ data: null }) };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.getDailyQuests();
      expect(result).toEqual(newQuests);
    });

    it('returns empty array when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.getDailyQuests();
      expect(result).toEqual([]);
    });
  });

  describe('claimQuestReward', () => {
    it('claims a completed quest and returns rewards', async () => {
      const quest = { id: 'q1', current: 50, target: 50, claimed: false, reward_xp: 15, reward_gems: 10 };

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: quest, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      let fromCallCount = 0;
      fromMock.mockImplementation((table: string) => {
        fromCallCount++;
        if (fromCallCount === 1) return { select: selectChain };
        if (fromCallCount === 2) return { update: updateChain };
        if (table === 'student_progress') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { xp: 100, total_xp_earned: 500, gems: 50 }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.claimQuestReward('q1');
      expect(result).toEqual({ xp: 15, gems: 10 });
    });

    it('returns null when quest is not complete', async () => {
      const quest = { id: 'q1', current: 20, target: 50, claimed: false, reward_xp: 15, reward_gems: 10 };

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: quest, error: null }),
        }),
      });

      fromMock.mockImplementation(() => ({ select: selectChain, update: vi.fn() }));

      const result = await GamificationService.claimQuestReward('q1');
      expect(result).toBeNull();
    });

    it('returns null when quest already claimed', async () => {
      const quest = { id: 'q1', current: 50, target: 50, claimed: true, reward_xp: 15, reward_gems: 10 };

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: quest, error: null }),
        }),
      });

      fromMock.mockImplementation(() => ({ select: selectChain, update: vi.fn() }));

      const result = await GamificationService.claimQuestReward('q1');
      expect(result).toBeNull();
    });
  });

  describe('buyShopItem', () => {
    it('purchases item when gems are sufficient', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { gems: 300 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const insertChain = vi.fn().mockResolvedValue({ error: null });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: updateChain };
        if (table === 'student_inventory') return { insert: insertChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.buyShopItem('hat_crown', 300);
      expect(result.success).toBe(true);
    });

    it('fails when gems are insufficient', async () => {
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { gems: 50 }, error: null }),
        }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: vi.fn() };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.buyShopItem('hat_crown', 300);
      expect(result.success).toBe(false);
    });

    it('fails when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.buyShopItem('hat_crown', 300);
      expect(result.success).toBe(false);
    });
  });

  describe('checkAndUpdateStreak', () => {
    it('increments streak when last active was yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { streak: 3, last_active_date: yesterdayStr, longest_streak: 5 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      let fromCallCount = 0;
      fromMock.mockImplementation((table: string) => {
        fromCallCount++;
        if (fromCallCount <= 2 && table === 'student_progress') return { select: selectChain, update: updateChain };
        if (table === 'student_progress') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { xp: 100, total_xp_earned: 500 }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.checkAndUpdateStreak();
      expect(result.streak).toBe(4);
      expect(result.streakBroken).toBe(false);
    });

    it('resets streak when gap is more than 1 day', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { streak: 10, last_active_date: threeDaysAgoStr, longest_streak: 15 }, error: null }),
        }),
      });
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_progress') return { select: selectChain, update: updateChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.checkAndUpdateStreak();
      expect(result.streak).toBe(1);
      expect(result.streakBroken).toBe(true);
    });

    it('returns 0 streak when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.checkAndUpdateStreak();
      expect(result).toEqual({ streak: 0, streakBroken: false });
    });
  });

  describe('getInventory', () => {
    it('returns inventory items for user', async () => {
      const items = [{ item_id: 'hat_crown', student_id: 'u1' }];

      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: items }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'student_inventory') return { select: selectChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.getInventory();
      expect(result).toEqual(items);
    });

    it('returns empty array when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await GamificationService.getInventory();
      expect(result).toEqual([]);
    });
  });

  describe('character CRUD', () => {
    it('getCharacters returns characters for unit', async () => {
      const chars = [{ id: 'c1', name: 'Alice', role: 'hero' }];
      const selectChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: chars, error: null }),
        }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'character_ledger') return { select: selectChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.getCharacters('unit-1');
      expect(result).toEqual(chars);
    });

    it('addCharacter inserts and returns new character', async () => {
      const newChar = { id: 'c2', name: 'Bob', role: 'villain', unit_id: 'unit-1' };
      const insertChain = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newChar, error: null }),
        }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'character_ledger') return { insert: insertChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.addCharacter('unit-1', { name: 'Bob', role: 'villain' });
      expect(result).toEqual(newChar);
    });

    it('updateCharacter returns true on success', async () => {
      const updateChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'character_ledger') return { update: updateChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.updateCharacter('c1', { name: 'Updated' });
      expect(result).toBe(true);
    });

    it('deleteCharacter returns true on success', async () => {
      const deleteChain = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      fromMock.mockImplementation((table: string) => {
        if (table === 'character_ledger') return { delete: deleteChain };
        return makeChain(undefined).proxy;
      });

      const result = await GamificationService.deleteCharacter('c1');
      expect(result).toBe(true);
    });
  });
});
