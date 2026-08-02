import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('parentAnalytics');

export interface DailyActivity {
  date: string;       // ISO date string (YYYY-MM-DD)
  points: number;
}

export interface SkillMastery {
  skill: string;
  total: number;
  mastered: number;
  needsWork: number;
  masteryPercent: number;
}

/**
 * Fetch daily point totals for a student over the last N days.
 * Returns one entry per day (zeros for days with no activity).
 * Uses point_transactions (parent read access via 20260803000005 RLS).
 */
export async function getWeeklyActivity(
  studentProfileId: string,
  days: number = 7
): Promise<DailyActivity[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const { data, error } = await supabase
    .from('point_transactions')
    .select('amount, created_at')
    .eq('profile_id', studentProfileId)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true });

  if (error) {
    log.warn('weekly_activity_error', { error: error.message });
    throw new Error(error.message);
  }

  // Aggregate by day.
  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of (data || [])) {
    const day = (row.created_at as string).slice(0, 10);
    if (byDay.has(day)) {
      byDay.set(day, (byDay.get(day) || 0) + (row.amount || 0));
    }
  }

  return Array.from(byDay.entries()).map(([date, points]) => ({ date, points }));
}

/**
 * Fetch per-skill FSRS mastery for a student.
 * Queries srs_items for the student and groups by objective type (skill).
 * Returns mastery buckets — skills with no data are omitted (honest empty).
 */
export async function getStudentSkillMastery(
  studentProfileId: string
): Promise<SkillMastery[]> {
  const { data, error } = await supabase
    .from('srs_items')
    .select('mastery_state, objective_id, objectives!inner(type)')
    .eq('student_id', studentProfileId)
    .not('objective_id', 'is', null);

  if (error) {
    log.warn('skill_mastery_error', { error: error.message });
    throw new Error(error.message);
  }

  if (!data || data.length === 0) return [];

  // Group by objective type (vocabulary, grammar, phonics).
  const bySkill = new Map<string, { total: number; mastered: number }>();
  for (const row of data) {
    const obj = row.objectives as any;
    const skill = obj?.type || 'other';
    const entry = bySkill.get(skill) || { total: 0, mastered: 0 };
    entry.total += 1;
    const state = row.mastery_state as string;
    if (state === 'familiar' || state === 'mastered') entry.mastered += 1;
    bySkill.set(skill, entry);
  }

  const SKILL_LABELS: Record<string, string> = {
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    phonics: 'Phonics',
    other: 'Other',
  };

  return Array.from(bySkill.entries()).map(([type, { total, mastered }]) => ({
    skill: SKILL_LABELS[type] || type,
    total,
    mastered,
    needsWork: total - mastered,
    masteryPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
  }));
}
