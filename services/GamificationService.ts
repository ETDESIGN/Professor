import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { XP_REWARDS, GEM_REWARDS } from '../constants/gamification';

const log = createClientLogger('GamificationService');

export const GamificationService = {
  async awardXP(amount: number, reason: string): Promise<{ newXP: number; newLevel: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { newXP: 0, newLevel: 1 };

    const { data: progress, error: fetchError } = await supabase
      .from('student_progress')
      .select('xp, total_xp_earned')
      .eq('student_id', user.id)
      .single();

    if (fetchError || !progress) {
      log.warn('award_xp_no_progress', { error: fetchError?.message });
      return { newXP: 0, newLevel: 1 };
    }

    const newXP = (progress.xp || 0) + amount;
    const newTotal = (progress.total_xp_earned || 0) + amount;
    const newLevel = Math.floor(newXP / 1000) + 1;

    await supabase
      .from('student_progress')
      .update({ xp: newXP, total_xp_earned: newTotal })
      .eq('student_id', user.id);

    log.info('xp_awarded', { metadata: { amount, reason, newXP, newLevel } });
    return { newXP, newLevel };
  },

  async awardGems(amount: number, reason: string): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { data: progress } = await supabase
      .from('student_progress')
      .select('gems')
      .eq('student_id', user.id)
      .single();

    if (!progress) return 0;

    const newGems = (progress.gems || 0) + amount;
    await supabase
      .from('student_progress')
      .update({ gems: newGems })
      .eq('student_id', user.id);

    return newGems;
  },

  async spendGems(amount: number): Promise<{ success: boolean; newGems: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, newGems: 0 };

    const { data: progress } = await supabase
      .from('student_progress')
      .select('gems')
      .eq('student_id', user.id)
      .single();

    if (!progress || (progress.gems || 0) < amount) {
      return { success: false, newGems: progress?.gems || 0 };
    }

    const newGems = progress.gems - amount;
    await supabase
      .from('student_progress')
      .update({ gems: newGems })
      .eq('student_id', user.id);

    return { success: true, newGems };
  },

  async checkAndUpdateStreak(): Promise<{ streak: number; streakBroken: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { streak: 0, streakBroken: false };

    const { data: progress } = await supabase
      .from('student_progress')
      .select('streak, last_active_date, longest_streak')
      .eq('student_id', user.id)
      .single();

    if (!progress) return { streak: 0, streakBroken: false };

    const today = new Date().toISOString().split('T')[0];
    const lastActive = progress.last_active_date;
    let newStreak = progress.streak || 0;
    let streakBroken = false;

    if (lastActive === today) {
      return { streak: newStreak, streakBroken: false };
    }

    if (lastActive) {
      const lastDate = new Date(lastActive);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
        streakBroken = true;
      }
    } else {
      newStreak = 1;
    }

    const longestStreak = Math.max(progress.longest_streak || 0, newStreak);

    const xpBonus = newStreak > 1 ? XP_REWARDS.DAILY_STREAK : 0;

    await supabase
      .from('student_progress')
      .update({
        streak: newStreak,
        last_active_date: today,
        longest_streak: longestStreak,
        xp: xpBonus > 0 ? supabase.rpc ? undefined : undefined : undefined,
      })
      .eq('student_id', user.id);

    if (xpBonus > 0) {
      await GamificationService.awardXP(xpBonus, 'daily_streak');
    }

    return { streak: newStreak, streakBroken };
  },

  async getDailyQuests(): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('student_quests')
      .select('*')
      .eq('student_id', user.id)
      .eq('assigned_date', today);

    if (existing && existing.length > 0) return existing;

    const templates = [
      { type: 'earn_xp', title: 'Earn 50 XP', target: 50, reward_gems: 10, reward_xp: 15 },
      { type: 'complete_lessons', title: 'Complete 2 Lessons', target: 2, reward_gems: 10, reward_xp: 15 },
      { type: 'perfect_speaking', title: 'Score Perfect in Speaking', target: 1, reward_gems: 10, reward_xp: 15 },
    ];

    const quests = templates.map(t => ({
      student_id: user.id,
      quest_type: t.type,
      title: t.title,
      target: t.target,
      current: 0,
      reward_gems: t.reward_gems,
      reward_xp: t.reward_xp,
      assigned_date: today,
    }));

    const { data } = await supabase
      .from('student_quests')
      .upsert(quests, { onConflict: 'student_id,quest_type,assigned_date' })
      .select();

    return data || [];
  },

  async updateQuestProgress(questType: string, increment: number = 1): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    const { data: quest } = await supabase
      .from('student_quests')
      .select('*')
      .eq('student_id', user.id)
      .eq('quest_type', questType)
      .eq('assigned_date', today)
      .single();

    if (!quest) return;

    const newCurrent = Math.min((quest.current || 0) + increment, quest.target);
    await supabase
      .from('student_quests')
      .update({ current: newCurrent })
      .eq('id', quest.id);
  },

  async claimQuestReward(questId: string): Promise<{ xp: number; gems: number } | null> {
    const { data: quest } = await supabase
      .from('student_quests')
      .select('*')
      .eq('id', questId)
      .single();

    if (!quest || quest.current < quest.target || quest.claimed) return null;

    await supabase
      .from('student_quests')
      .update({ claimed: true })
      .eq('id', questId);

    await GamificationService.awardXP(quest.reward_xp, 'quest_complete');
    await GamificationService.awardGems(quest.reward_gems, 'quest_complete');

    return { xp: quest.reward_xp, gems: quest.reward_gems };
  },

  async buyShopItem(itemId: string, cost: number): Promise<{ success: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const spent = await GamificationService.spendGems(cost);
    if (!spent.success) return { success: false };

    await supabase.from('student_inventory').insert({
      student_id: user.id,
      item_id: itemId,
    });

    return { success: true };
  },

  async getInventory(): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('student_inventory')
      .select('*, shop_items(*)')
      .eq('student_id', user.id);

    return data || [];
  },

  async getLeaderboard(classId?: string): Promise<any[]> {
    let query = supabase
      .from('student_progress')
      .select('student_id, xp, streak, gems, profiles!inner(id, full_name, avatar_url)')
      .order('xp', { ascending: false })
      .limit(50);

    if (classId) {
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', classId);

      if (enrollments && enrollments.length > 0) {
        const studentIds = enrollments.map(e => e.student_id);
        query = query.in('student_id', studentIds);
      }
    }

    const { data, error } = await query;
    if (error) {
      log.warn('leaderboard_error', { error: error.message });
      return [];
    }

    return (data || []).map((row: any, index: number) => ({
      rank: index + 1,
      id: row.student_id,
      name: row.profiles?.full_name || 'Student',
      avatar: row.profiles?.avatar_url || '',
      xp: row.xp || 0,
      streak: row.streak || 0,
      gems: row.gems || 0,
    }));
  },
};
