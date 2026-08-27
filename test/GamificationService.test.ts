import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserMock, fromMock, rpcMock } = vi.hoisted(() => {
  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const fromMock = vi.fn();
  return { getUserMock, fromMock, rpcMock };
});

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
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
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  describe('RPC wrappers', () => {
    it('awardXP calls the award_xp RPC and derives level client-side', async () => {
      rpcMock.mockResolvedValue({ data: [{ xp: 120, total_xp_earned: 340 }], error: null });
      const res = await GamificationService.awardXP(20, 'test');
      expect(rpcMock).toHaveBeenCalledWith('award_xp', { p_amount: 20 });
      expect(res).toEqual({ newXP: 120, newLevel: 2 });
    });

    it('awardXP treats empty rows as a no-op', async () => {
      rpcMock.mockResolvedValue({ data: [], error: null });
      expect(await GamificationService.awardXP(20, 'test')).toEqual({ newXP: 0, newLevel: 1 });
    });

    it('awardXP returns no-op on RPC error', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
      expect(await GamificationService.awardXP(20, 'test')).toEqual({ newXP: 0, newLevel: 1 });
    });

    it('awardXPToStudent returns the new xp from award_xp_to_student', async () => {
      rpcMock.mockResolvedValue({ data: 55, error: null });
      const res = await GamificationService.awardXPToStudent('s1', 5);
      expect(rpcMock).toHaveBeenCalledWith('award_xp_to_student', { p_student: 's1', p_amount: 5 });
      expect(res).toBe(55);
    });

    it('awardXPToStudent returns 0 on RPC error', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
      expect(await GamificationService.awardXPToStudent('s1', 5)).toBe(0);
    });

    it('awardGems returns the new gem balance', async () => {
      rpcMock.mockResolvedValue({ data: 42, error: null });
      const res = await GamificationService.awardGems(2, 'test');
      expect(rpcMock).toHaveBeenCalledWith('award_gems', { p_amount: 2 });
      expect(res).toBe(42);
    });

    it('spendGems returns success:false with current gems when RPC returns false', async () => {
      rpcMock.mockResolvedValue({ data: false, error: null });
      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { gems: 37 }, error: null }),
          }),
        }),
      }));
      const res = await GamificationService.spendGems(50);
      expect(rpcMock).toHaveBeenCalledWith('spend_gems', { p_amount: 50 });
      expect(res).toEqual({ success: false, newGems: 37 });
    });

    it('spendGems returns success:true with re-read balance when RPC returns true', async () => {
      rpcMock.mockResolvedValue({ data: true, error: null });
      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { gems: 10 }, error: null }),
          }),
        }),
      }));
      const res = await GamificationService.spendGems(5);
      expect(res).toEqual({ success: true, newGems: 10 });
    });

    it('spendGems returns newGems 0 when the follow-up gem read fails', async () => {
      rpcMock.mockResolvedValue({ data: false, error: null });
      fromMock.mockImplementation(() => {
        throw new Error('from unavailable');
      });
      const res = await GamificationService.spendGems(50);
      expect(res).toEqual({ success: false, newGems: 0 });
    });

    it('updateQuestProgress calls the RPC with default increment', async () => {
      await GamificationService.updateQuestProgress('earn_xp');
      expect(rpcMock).toHaveBeenCalledWith('update_quest_progress', { p_quest_type: 'earn_xp', p_increment: 1 });
    });

    it('claimQuestReward returns null on empty RPC result (already claimed)', async () => {
      rpcMock.mockResolvedValue({ data: [], error: null });
      expect(await GamificationService.claimQuestReward('q1')).toBeNull();
    });

    it('claimQuestReward returns rewards on success', async () => {
      rpcMock.mockResolvedValue({ data: [{ reward_xp: 5, reward_gems: 10 }], error: null });
      expect(await GamificationService.claimQuestReward('q1')).toEqual({ xp: 5, gems: 10 });
    });

    it('buyShopItem reports server-side verdict (insufficient)', async () => {
      rpcMock.mockResolvedValue({ data: 'insufficient', error: null });
      const res = await GamificationService.buyShopItem('hat_crown', 100);
      expect(rpcMock).toHaveBeenCalledWith('buy_shop_item', { p_item_id: 'hat_crown' });
      expect(res.success).toBe(false);
    });

    it('buyShopItem succeeds on ok verdict', async () => {
      rpcMock.mockResolvedValue({ data: 'ok', error: null });
      expect((await GamificationService.buyShopItem('hat_crown', 100)).success).toBe(true);
    });

    it('buyShopItem fails on invalid_item', async () => {
      rpcMock.mockResolvedValue({ data: 'invalid_item', error: null });
      expect((await GamificationService.buyShopItem('nope', 100)).success).toBe(false);
    });
  });

  describe('getDailyQuests', () => {
    it('returns existing quests when already assigned today', async () => {
      const existingQuests = [
        { id: 'q1', quest_type: 'earn_xp', title: 'Earn 5 XP', target: 5, current: 3, reward_gems: 10, reward_xp: 2 },
      ];

      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: existingQuests }),
          }),
        }),
      }));

      const result = await GamificationService.getDailyQuests();
      expect(result).toEqual(existingQuests);
    });

    it('returns empty array when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      expect(await GamificationService.getDailyQuests()).toEqual([]);
    });
  });

  describe('checkAndUpdateStreak', () => {
    it('increments streak when last active was yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { streak: 3, last_active_date: yesterdayStr, longest_streak: 5 }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }));

      const result = await GamificationService.checkAndUpdateStreak();
      expect(result.streak).toBe(4);
      expect(result.streakBroken).toBe(false);
    });

    it('resets streak when gap is more than 1 day', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { streak: 10, last_active_date: threeDaysAgo.toISOString().split('T')[0], longest_streak: 15 }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }));

      const result = await GamificationService.checkAndUpdateStreak();
      expect(result.streak).toBe(1);
      expect(result.streakBroken).toBe(true);
    });

    it('returns 0 streak when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      expect(await GamificationService.checkAndUpdateStreak()).toEqual({ streak: 0, streakBroken: false });
    });
  });

  describe('getInventory', () => {
    it('returns inventory items for user', async () => {
      const items = [{ item_id: 'hat_crown', student_id: 'u1' }];
      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: items, error: null }),
          }),
          eq2: vi.fn(),
        }),
      }));
      // getInventory: select('*, shop_items(*)').eq(...).then() — chain resolves directly
      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: items }),
        }),
      }));
      expect(await GamificationService.getInventory()).toEqual(items);
    });

    it('returns empty array when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      expect(await GamificationService.getInventory()).toEqual([]);
    });
  });

  describe('character CRUD', () => {
    it('getCharacters returns characters for unit', async () => {
      const chars = [{ id: 'c1', name: 'Alice', role: 'hero' }];
      fromMock.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: chars, error: null }),
          }),
        }),
      }));
      expect(await GamificationService.getCharacters('unit-1')).toEqual(chars);
    });

    it('addCharacter inserts and returns new character', async () => {
      const newChar = { id: 'c2', name: 'Bob', role: 'villain', unit_id: 'unit-1' };
      fromMock.mockImplementation(() => ({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newChar, error: null }),
          }),
        }),
      }));
      expect(await GamificationService.addCharacter('unit-1', { name: 'Bob', role: 'villain' })).toEqual(newChar);
    });

    it('updateCharacter returns true on success', async () => {
      fromMock.mockImplementation(() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }));
      expect(await GamificationService.updateCharacter('c1', { name: 'Updated' })).toBe(true);
    });

    it('deleteCharacter returns true on success', async () => {
      fromMock.mockImplementation(() => ({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }));
      expect(await GamificationService.deleteCharacter('c1')).toBe(true);
    });
  });
});
