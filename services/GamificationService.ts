import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { XP_REWARDS, GEM_REWARDS } from '../constants/gamification';
import { getHearts, refillHearts } from './learnerState';

const log = createClientLogger('GamificationService');

export const GamificationService = {
  /** FIXPLAN H2: atomic server-side XP award. The RPC returns a TABLE
   *  (xp, total_xp_earned); ZERO ROWS = no-op (unauthenticated or amount 0).
   *  Level is derived client-side (100 XP per level), as before. */
  async awardXP(amount: number, reason: string): Promise<{ newXP: number; newLevel: number }> {
    const { data, error } = await supabase.rpc('award_xp', { p_amount: amount });
    if (error || !Array.isArray(data) || data.length === 0) {
      log.warn('award_xp_failed', { metadata: { reason }, error: error?.message });
      return { newXP: 0, newLevel: 1 };
    }
    const row = data[0];
    const newXP = row.xp ?? 0;
    const newLevel = Math.floor(newXP / 100) + 1;
    log.info('xp_awarded', { metadata: { amount, reason, newXP, totalXpEarned: row.total_xp_earned } });
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
    const { data, error } = await supabase.rpc('award_xp_to_student', { p_student: studentId, p_amount: amount });
    if (error) {
      log.warn('award_xp_student_failed', { metadata: { studentId, error: error.message } });
      return 0;
    }
    const newXP = data ?? 0;
    log.info('xp_awarded_to_student', { metadata: { studentId, amount, reason, newXP } });
    return newXP;
  },

  async awardGems(amount: number, reason: string): Promise<number> {
    const { data, error } = await supabase.rpc('award_gems', { p_amount: amount });
    if (error) {
      log.warn('award_gems_failed', { metadata: { reason }, error: error.message });
      return 0;
    }
    return data ?? 0;
  },

  async spendGems(amount: number): Promise<{ success: boolean; newGems: number }> {
    const { data, error } = await supabase.rpc('spend_gems', { p_amount: amount });
    if (error) {
      log.warn('spend_gems_failed', { error: error.message });
      return { success: false, newGems: 0 };
    }
    // Re-read the balance for the UI; a failed read must not break the flow.
    let newGems = 0;
    try {
      newGems = await GamificationService.getStudentGems();
    } catch {
      newGems = 0;
    }
    return { success: data === true, newGems };
  },
  async getStudentGems(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data, error } = await supabase
      .from('student_progress')
      .select('gems')
      .eq('student_id', user.id)
      .maybeSingle();
    // FIXPLAN H3: 0 rows = genuinely no progress row yet (0 gems); a transport
    // error must throw so the react-query caller can render a retry state
    // instead of a silently-empty balance.
    if (error) {
      log.error('get_student_gems_error', { error: error.message });
      throw error;
    }
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

    const { data: existing, error: existingError } = await supabase
      .from('student_quests')
      .select('*')
      .eq('student_id', user.id)
      .eq('assigned_date', today);

    // FIXPLAN H3: a failed read must not look like "no quests today" (which
    // would trigger a spurious re-seed). Throw so the caller can retry.
    if (existingError) {
      log.error('get_daily_quests_read_error', { error: existingError.message });
      throw existingError;
    }

    if (existing && existing.length > 0) return existing;

    const { data: dbTemplates, error: templatesError } = await supabase
      .from('quest_templates')
      .select('*');

    // Template-table read failure falls back to the built-in defaults (a
    // missing/unreadable template table is a legitimate degraded mode), but
    // the failure must be visible in logs at error level.
    if (templatesError) {
      log.error('quest_templates_read_error', { error: templatesError.message });
    }

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

    const { data, error: upsertError } = await supabase
      .from('student_quests')
      .upsert(quests, { onConflict: 'student_id,quest_type,assigned_date' })
      .select();

    // FIXPLAN H3: seed failure must throw — returning [] here used to render
    // "no quests" for a failure.
    if (upsertError) {
      log.error('daily_quests_seed_error', { error: upsertError.message });
      throw upsertError;
    }

    return data || [];
  },

  async updateQuestProgress(questType: string, increment: number = 1): Promise<void> {
    const { error } = await supabase.rpc('update_quest_progress', { p_quest_type: questType, p_increment: increment });
    if (error) {
      log.warn('quest_progress_update_failed', { error: error.message });
    }
  },

  async claimQuestReward(questId: string): Promise<{ xp: number; gems: number } | null> {
    const { data, error } = await supabase.rpc('claim_quest_reward', { p_quest_id: questId });
    if (error) {
      log.warn('quest_claim_failed', { error: error.message });
      return null;
    }
    // ZERO ROWS = already claimed or not complete.
    if (!Array.isArray(data) || data.length === 0) return null;
    return { xp: data[0].reward_xp ?? 0, gems: data[0].reward_gems ?? 0 };
  },

  async buyShopItem(itemId: string, _cost: number): Promise<{ success: boolean }> {
    // Server-side price + balance are authoritative; the cost param is kept
    // for signature compatibility only.
    const { data, error } = await supabase.rpc('buy_shop_item', { p_item_id: itemId });
    if (error) {
      log.warn('buy_shop_item_failed', { error: error.message });
      return { success: false };
    }
    return { success: data === 'ok' };
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

    let current;
    try {
      current = await getHearts(user.id);
    } catch (err) {
      // Hearts balance unreadable — report honestly instead of guessing.
      log.warn('heart_refill_read_failed', { error: err instanceof Error ? err.message : String(err) });
      return { success: false, hearts: 0 };
    }
    if (current.current >= current.max) {
      return { success: false, hearts: current.current };
    }
    const consumed = await GamificationService.consumeInventoryItem('hearts');
    if (!consumed) return { success: false, hearts: current.current };

    // refillHearts re-reads hearts internally (getHearts throws on read
    // failure). If that read fails AFTER the item was consumed, we still
    // report failure here — the item stays consumed; Task 8 adds Shop-side
    // pending/toast handling for this edge.
    let h;
    try {
      h = await refillHearts(user.id);
    } catch (err) {
      log.warn('heart_refill_write_failed', { error: err instanceof Error ? err.message : String(err) });
      return { success: false, hearts: 0 };
    }
    return { success: true, hearts: h.current };
  },

  async getInventory(): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('student_inventory')
      .select('*, shop_items(*)')
      .eq('student_id', user.id);

    // FIXPLAN H3: a failed inventory read must throw, not render as an empty
    // backpack.
    if (error) {
      log.error('get_inventory_error', { error: error.message });
      throw error;
    }

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
      // FIXPLAN H3: throw — a failed read must not look like "no characters".
      log.error('get_characters_error', { error: error.message });
      throw error;
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
      // FIXPLAN H3: throw — the user initiated this write; a null return
      // used to look like success-with-nothing.
      log.error('add_character_error', { error: error.message });
      throw error;
    }
    return data;
  },

  async updateCharacter(characterId: string, updates: Partial<{ name: string; role: string; image_url: string; description: string }>): Promise<boolean> {
    const { error } = await supabase
      .from('character_ledger')
      .update(updates)
      .eq('id', characterId);

    if (error) {
      // FIXPLAN H3: throw — a failed update used to return false, which
      // callers treated the same as success.
      log.error('update_character_error', { error: error.message });
      throw error;
    }
    return true;
  },

  async deleteCharacter(characterId: string): Promise<boolean> {
    const { error } = await supabase
      .from('character_ledger')
      .delete()
      .eq('id', characterId);

    if (error) {
      // FIXPLAN H3: throw — a failed delete used to look like success.
      log.error('delete_character_error', { error: error.message });
      throw error;
    }
    return true;
  },


};
