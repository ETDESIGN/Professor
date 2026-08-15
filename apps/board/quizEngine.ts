// quizEngine.ts — shared helpers for assessment games (SpeedQuiz + TeamBattle).
//
// Implements spec (speedquiz-teambattle-v2-spec.md) Part A:
//   • correctAnswerFor(item) — extracts the correct answer from any pool item,
//     handling the LISTEN_SELECT image-URL footgun correctly.
//   • buildQuizComposition — proportional-to-type-distribution + mastery-weighted
//     within type (spec A1).
//   • useQuizComposition — React hook that fetches objectives, SRS states, pool
//     items, and builds a diverse set of quiz questions for assessment games.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { classWeakObjectives } from '../../services/boardLearner';
import { nextRungForObjective, type ObjectiveType, type RungSrsState } from './lessonDirector';
import type { PoolItem, ExerciseType } from '../../types/exercise';

// =====================================================================
// 1. correctAnswerFor — the critical helper (spec correction note).
//
// Extracts the correct answer from a pool item's content. The footgun:
// LISTEN_SELECT options are {image_url, label?} objects, so correctAnswer
// is an image URL (string), not a plain text option.
// =====================================================================

export function correctAnswerFor(item: PoolItem): string {
  const c = item.content as any;
  switch (item.exercise_type) {
    case 'MEANING_MATCH':
    case 'ERROR_SPOT':
    case 'SPELL_CLOZE':
    case 'STORY_COMPREHENSION':
      return String(c?.options?.[c.correct_index] ?? '');
    case 'LISTEN_SELECT':
      return String(c?.options?.[c.correct_index]?.image_url ?? '');
    case 'WORD_BANK_BUILD':
      return ''; // No single correct answer — handled via LCS partial credit
    default:
      return '';
  }
}

// =====================================================================
// 2. buildQuizComposition — proportional-to-type-distribution + mastery-
// weighted within type (spec A1).
// =====================================================================

interface Objective {
  id: string;
  type: ObjectiveType;
}

export function buildQuizComposition(
  lessonObjectives: Objective[],
  totalQuestions: number,
  weakOrder: string[],
  srsByObjective: Record<string, RungSrsState | null>,
): { objectiveId: string; exerciseType: ExerciseType }[] {
  // Step 1: Count objectives by type
  const typeCounts: Record<string, number> = {};
  for (const o of lessonObjectives) {
    typeCounts[o.type] = (typeCounts[o.type] || 0) + 1;
  }

  // Step 2: Allocate slots proportionally (min 1 per type if present)
  const types = Object.keys(typeCounts);
  const total = lessonObjectives.length;
  const slots: Record<string, number> = {};
  let allocated = 0;
  for (const t of types) {
    const s = Math.max(1, Math.round((typeCounts[t] / total) * totalQuestions));
    slots[t] = s;
    allocated += s;
  }
  // Adjust to match totalQuestions
  while (allocated > totalQuestions) {
    const maxType = types.reduce((a, b) => (slots[a] > slots[b] ? a : b));
    if (slots[maxType] <= 1) break;
    slots[maxType]--;
    allocated--;
  }
  while (allocated < totalQuestions) {
    const maxType = types.reduce((a, b) => (typeCounts[a] > typeCounts[b] ? a : b));
    slots[maxType]++;
    allocated++;
  }

  // Step 3: Within each type, select weakest objectives + map to exercise type
  const result: { objectiveId: string; exerciseType: ExerciseType }[] = [];
  const weakRank = (oid: string) => {
    const i = weakOrder.indexOf(oid);
    return i === -1 ? weakOrder.length : i;
  };

  for (const [type, slotCount] of Object.entries(slots)) {
    const eligible = lessonObjectives.filter(o => o.type === type);
    eligible.sort((a, b) => weakRank(a.id) - weakRank(b.id));
    const chosen = eligible.slice(0, slotCount);
    for (const obj of chosen) {
      const srs = srsByObjective[obj.id] ?? null;
      const rung = nextRungForObjective(obj.type, srs);
      const exType = exerciseTypeForQuizRung(obj.type, rung);
      result.push({ objectiveId: obj.id, exerciseType: exType });
    }
  }

  return result;
}

// =====================================================================
// 3. exerciseTypeForQuizRung — vocab type-cycling rule (spec A2).
//
// Maps an objective's mastery rung to the exercise type for a quiz question.
// Non-vocab types are fixed: grammar → ERROR_SPOT, story → STORY_COMPREHENSION.
// =====================================================================

const vocabTypeForRung: Record<number, ExerciseType> = {
  1: 'LISTEN_SELECT',
  2: 'LISTEN_SELECT',
  3: 'MEANING_MATCH',
  4: 'SPELL_CLOZE',
  5: 'WORD_BANK_BUILD',
};

function exerciseTypeForQuizRung(objectiveType: ObjectiveType, rung: number): ExerciseType {
  if (objectiveType === 'vocabulary') {
    return vocabTypeForRung[rung] || 'MEANING_MATCH';
  }
  if (objectiveType === 'grammar') return 'ERROR_SPOT';
  if (objectiveType === 'story') return 'STORY_COMPREHENSION';
  // dialogue/phonics — default to MEANING_MATCH (vocab-like)
  return 'MEANING_MATCH';
}

// =====================================================================
// 4. useQuizComposition — React hook for assessment games.
//
// Fetches objectives, SRS states, and pool items, then builds a diverse
// set of quiz questions using buildQuizComposition. Returns the questions
// + loading state.
// =====================================================================

export interface QuizQuestion {
  objectiveId: string;
  exerciseType: ExerciseType;
  difficulty: 1 | 2 | 3;
  item: PoolItem;
  correctAnswer: string;
}

export function useQuizComposition(
  unitId: string,
  totalQuestions: number,
  roster: string[],
): { questions: QuizQuestion[]; loading: boolean } {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [weakOrder, setWeakOrder] = useState<string[]>([]);
  const [srsByObjective, setSrsByObjective] = useState<Record<string, RungSrsState | null>>({});
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [objectivesLoaded, setObjectivesLoaded] = useState(false);
  const [poolLoaded, setPoolLoaded] = useState(false);

  // Fetch objectives
  useEffect(() => {
    let cancelled = false;
    setObjectivesLoaded(false);
    if (!unitId) { setObjectives([]); setObjectivesLoaded(true); return; }
    (async () => {
      const { data, error } = await supabase
        .from('objectives')
        .select('id, type')
        .eq('unit_id', unitId);
      if (cancelled) return;
      if (error || !data) { setObjectives([]); setObjectivesLoaded(true); return; }
      setObjectives(data.map((o: any) => ({
        id: String(o.id),
        type: (['vocabulary','grammar','story','dialogue','phonics'].includes(o.type)
          ? o.type : 'vocabulary') as ObjectiveType,
      })));
      setObjectivesLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // Fetch class-weak ordering + SRS states
  const rosterKey = roster.join(',');
  useEffect(() => {
    let cancelled = false;
    if (!unitId || roster.length === 0) { setWeakOrder([]); setSrsByObjective({}); return; }
    (async () => {
      const weak = await classWeakObjectives(roster, unitId);
      if (cancelled) return;
      setWeakOrder(weak.map(w => w.objective_id));
      const order = ['new','learning','familiar','mastered','decaying'] as const;
      const srsMap: Record<string, RungSrsState | null> = {};
      for (const w of weak) {
        if (!w.states || w.states.length === 0) { srsMap[w.objective_id] = null; continue; }
        let worst: RungSrsState = w.states[0];
        let worstRung = nextRungForObjective('vocabulary', worst);
        for (const s of w.states) {
          const r = nextRungForObjective('vocabulary', s);
          if (r < worstRung) { worst = s; worstRung = r; }
        }
        srsMap[w.objective_id] = worst;
      }
      setSrsByObjective(srsMap);
    })();
    return () => { cancelled = true; };
  }, [unitId, rosterKey]);

  // Fetch pool items for all quiz-relevant exercise types
  useEffect(() => {
    let cancelled = false;
    setPoolLoaded(false);
    if (!unitId) { setPoolItems([]); setPoolLoaded(true); return; }
    (async () => {
      const types = ['MEANING_MATCH', 'SPELL_CLOZE', 'LISTEN_SELECT', 'ERROR_SPOT', 'STORY_COMPREHENSION', 'WORD_BANK_BUILD'];
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', unitId)
        .in('exercise_type', types)
        .limit(60);
      if (cancelled) return;
      if (error || !data) { setPoolItems([]); setPoolLoaded(true); return; }
      const items = data.map((row: any) => {
        if (!row || !types.includes(row.exercise_type)) return null;
        const content = (row.content && typeof row.content === 'object' ? row.content : {}) as any;
        return {
          id: String(row.id),
          unit_id: String(row.unit_id),
          objective_id: String(row.objective_id ?? ''),
          exercise_type: row.exercise_type,
          difficulty: (Number(row.difficulty) >= 1 && Number(row.difficulty) <= 3
            ? Number(row.difficulty) : 2) as 1 | 2 | 3,
          content: { ...content, type: row.exercise_type },
        } as PoolItem;
      }).filter((p: any): p is PoolItem => p !== null);
      setPoolItems(items);
      setPoolLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // Build quiz composition
  const questions = useMemo(() => {
    if (objectives.length === 0 || poolItems.length === 0) return [];
    const composition = buildQuizComposition(objectives, totalQuestions, weakOrder, srsByObjective);
    const out: QuizQuestion[] = [];
    for (const { objectiveId, exerciseType } of composition) {
      // Find a pool item matching the objective + preferred type
      let item = poolItems.find(p => p.objective_id === objectiveId && p.exercise_type === exerciseType);
      // Fallback: any item for this objective
      if (!item) item = poolItems.find(p => p.objective_id === objectiveId);
      if (!item) continue;
      out.push({
        objectiveId,
        exerciseType: item.exercise_type,
        difficulty: item.difficulty,
        item,
        correctAnswer: correctAnswerFor(item),
      });
    }
    // Shuffle for variety
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }, [objectives, poolItems, totalQuestions, weakOrder, srsByObjective]);

  const loading = !objectivesLoaded || !poolLoaded;

  return { questions, loading };
}
