import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { XP_REWARDS, GEM_REWARDS } from '../constants/gamification';
import { getHearts, refillHearts } from './learnerState';

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
    const newLevel = Math.floor(newXP / 100) + 1;

    const { error: updateError } = await supabase
      .from('student_progress')
      .update({ xp: newXP, total_xp_earned: newTotal })
      .eq('student_id', user.id);

    if (updateError) {
      log.warn('award_xp_write_failed', { error: updateError.message });
      return { newXP: progress.xp || 0, newLevel: Math.floor((progress.xp || 0) / 100) + 1 };
    }

    log.info('xp_awarded', { metadata: { amount, reason, newXP, newLevel } });
    return { newXP, newLevel };
  },

  /**
   * Award XP to a SPECIFIC student (used by the live board addPoints so class
   * points persist into the student's home XP — the unified points total). This
   * is the bridge: a class activity raises the student's home XP/leaderboard
   * total (locked decision 0.1.4). Teacher-authenticated; the student_progress
   * row must already exist (enrolled student).
   */
  async awardXPToStudent(studentId: string, amount: number, reason = 'classroom_points'): Promise<number> {
    if (!studentId || amount === 0) return 0;
    const { data: progress, error: fetchError } = await supabase
      .from('student_progress')
      .select('xp, total_xp_earned')
      .eq('student_id', studentId)
      .maybeSingle();
    if (fetchError || !progress) {
      log.warn('award_xp_student_no_progress', { metadata: { studentId, error: fetchError?.message } });
      return 0;
    }
    const newXP = Math.max(0, (progress.xp || 0) + amount);
    const newTotal = Math.max(0, (progress.total_xp_earned || 0) + Math.max(0, amount));
    const { error: updateError } = await supabase
      .from('student_progress')
      .update({ xp: newXP, total_xp_earned: newTotal })
      .eq('student_id', studentId);
    if (updateError) log.warn('award_xp_student_write_failed', { metadata: { studentId, error: updateError.message } });
    else log.info('xp_awarded_to_student', { metadata: { studentId, amount, reason, newXP } });
    return newXP;
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
    const { error: gemError } = await supabase
      .from('student_progress')
      .update({ gems: newGems })
      .eq('student_id', user.id);

    if (gemError) {
      log.warn('award_gems_write_failed', { error: gemError.message });
      return progress.gems || 0;
    }

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
    const { error: spendError } = await supabase
      .from('student_progress')
      .update({ gems: newGems })
      .eq('student_id', user.id);

    if (spendError) {
      log.warn('spend_gems_write_failed', { error: spendError.message });
      return { success: false, newGems: progress.gems };
    }

    return { success: true, newGems };
  },
  async getStudentGems(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data } = await supabase
      .from('student_progress')
      .select('gems')
      .eq('student_id', user.id)
      .single();
    return data?.gems || 0;
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
        // Streak Freeze (Duolingo-style): auto-consume one if owned — the
        // streak continues instead of resetting. Phase 4: previously the
        // power-up existed in the shop but nothing ever consumed it.
        const freezeUsed = await GamificationService.consumeInventoryItem('freeze');
        if (freezeUsed) {
          newStreak += 1;
        } else {
          newStreak = 1;
          streakBroken = true;
        }
      }
    } else {
      newStreak = 1;
    }

    const longestStreak = Math.max(progress.longest_streak || 0, newStreak);

    const xpBonus = newStreak > 1 ? XP_REWARDS.DAILY_STREAK : 0;

    const { error: streakError } = await supabase
      .from('student_progress')
      .update({
        streak: newStreak,
        last_active_date: today,
        longest_streak: longestStreak,
      })
      .eq('student_id', user.id);

    if (streakError) {
      log.warn('streak_update_failed', { error: streakError.message });
    }

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

    const { data: dbTemplates } = await supabase
      .from('quest_templates')
      .select('*');

    const templates = (dbTemplates && dbTemplates.length > 0)
      ? dbTemplates.map((t: any) => ({
          type: t.type,
          title: t.title,
          target: t.target || 1,
          reward_gems: t.reward_gems || 10,
          reward_xp: t.reward_xp || 2,
        }))
      : [
          { type: 'earn_xp', title: 'Earn 5 XP', target: 5, reward_gems: 10, reward_xp: 2 },
          { type: 'complete_lessons', title: 'Complete 2 Lessons', target: 2, reward_gems: 10, reward_xp: 2 },
          { type: 'perfect_speaking', title: 'Score Perfect in Speaking', target: 1, reward_gems: 10, reward_xp: 2 },
          { type: 'reach_familiar', title: 'Master 3 Words', target: 3, reward_gems: 10, reward_xp: 2 },
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
    const { error: questError } = await supabase
      .from('student_quests')
      .update({ current: newCurrent })
      .eq('id', quest.id);

    if (questError) {
      log.warn('quest_progress_update_failed', { error: questError.message });
    }
  },

  async claimQuestReward(questId: string): Promise<{ xp: number; gems: number } | null> {
    const { data: quest } = await supabase
      .from('student_quests')
      .select('*')
      .eq('id', questId)
      .single();

    if (!quest || quest.current < quest.target || quest.claimed) return null;

    const { error: claimError } = await supabase
      .from('student_quests')
      .update({ claimed: true })
      .eq('id', questId);

    if (claimError) {
      log.warn('quest_claim_failed', { error: claimError.message });
      return null;
    }

    await GamificationService.awardXP(quest.reward_xp, 'quest_complete');
    await GamificationService.awardGems(quest.reward_gems, 'quest_complete');

    return { xp: quest.reward_xp, gems: quest.reward_gems };
  },

  async buyShopItem(itemId: string, cost: number): Promise<{ success: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const spent = await GamificationService.spendGems(cost);
    if (!spent.success) return { success: false };

    // Consumables stack: bump quantity on re-purchase (the old plain INSERT
    // hit the UNIQUE(student_id, item_id) constraint on the second buy).
    const { error: invError } = await supabase
      .from('student_inventory')
      .upsert(
        { student_id: user.id, item_id: itemId, quantity: 1 },
        { onConflict: 'student_id,item_id', ignoreDuplicates: false },
      );

    if (invError) {
      log.warn('inventory_upsert_failed', { error: invError.message });
      return { success: false };
    }

    return { success: true };
  },

  /** Atomically consume one unit of a power-up. Returns false when the
   *  student owns none (the RPC only decrements quantity > 0 rows). */
  async consumeInventoryItem(itemId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('consume_inventory_item', { p_item_id: itemId });
    if (error) {
      log.warn('consume_inventory_failed', { error: error.message });
      return false;
    }
    return data === true;
  },

  /** Use a Heart Refill now: consume one and restore hearts to max. */
  async useHeartRefill(): Promise<{ success: boolean; hearts: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, hearts: 0 };

    const current = await getHearts(user.id);
    if (current.current >= current.max) {
      return { success: false, hearts: current.current };
    }
    const consumed = await GamificationService.consumeInventoryItem('hearts');
    if (!consumed) return { success: false, hearts: current.current };

    const h = await refillHearts(user.id);
    return { success: true, hearts: h.current };
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

  async getLeaderboard(_classId?: string): Promise<any[]> {
    // C2 + audit P0-4: rank by the roster model (class points ledger + home XP,
    // including unclaimed roster kids) so it matches the live board — but via
    // the get_class_leaderboard RPC, because the view's underlying RLS hides
    // roster rows from students entirely (empty podium). The RPC scopes rows
    // to the caller's enrolled classes.
    const { data, error } = await supabase.rpc('get_class_leaderboard', { p_limit: 50 });

    if (error) {
      log.warn('leaderboard_error', { error: error.message });
      return [];
    }

    return (data || []).map((row: any, index: number) => ({
      rank: index + 1,
      // Prefer the claimed profile id when present so clients comparing
      // against auth.uid() highlight "(You)" correctly; unclaimed kids keep
      // their roster id.
      id: row.profile_id || row.roster_student_id,
      name: row.student_name || 'Student',
      avatar: row.avatar_url || '',
      // Surface the unified total as `xp` (the field existing UI consumers
      // read) AND as `points` for newer consumers.
      xp: row.total_points || 0,
      points: row.total_points || 0,
      streak: row.streak || 0,
      gems: row.gems || 0,
      is_claimed: !!row.is_claimed,
    }));
  },

  async getCharacters(unitId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('character_ledger')
      .select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: true });

    if (error) {
      log.warn('get_characters_error', { error: error.message });
      return [];
    }
    return data || [];
  },

  async addCharacter(unitId: string, character: { name: string; role?: string; image_url?: string; description?: string }): Promise<any | null> {
    const { data, error } = await supabase
      .from('character_ledger')
      .insert({ unit_id: unitId, ...character })
      .select()
      .single();

    if (error) {
      log.warn('add_character_error', { error: error.message });
      return null;
    }
    return data;
  },

  async updateCharacter(characterId: string, updates: Partial<{ name: string; role: string; image_url: string; description: string }>): Promise<boolean> {
    const { error } = await supabase
      .from('character_ledger')
      .update(updates)
      .eq('id', characterId);

    if (error) {
      log.warn('update_character_error', { error: error.message });
      return false;
    }
    return true;
  },

  async deleteCharacter(characterId: string): Promise<boolean> {
    const { error } = await supabase
      .from('character_ledger')
      .delete()
      .eq('id', characterId);

    if (error) {
      log.warn('delete_character_error', { error: error.message });
      return false;
    }
    return true;
  },


};
