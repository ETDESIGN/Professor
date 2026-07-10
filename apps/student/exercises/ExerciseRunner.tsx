// ExerciseRunner — plays a list of pool items one at a time via the registry,
// recording each attempt to the LearnerState (FSRS + mastery), applying the
// hearts economy, and awarding XP. Used by BOTH the lesson pool-driven steps
// (SoloLessonPlayer) and Practice mode. This is where the exercise contract
// meets the learner model — every onComplete -> recordAttempt closes the loop.

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { PoolItem, toPoolItem } from '../../../types/exercise';
import { modalityOf } from '../../../types/exercise';
import { Engine } from '../../../services/SupabaseService';
import { GamificationService } from '../../../services/GamificationService';
import { XP_REWARDS, QUEST_TYPES } from '../../../constants/gamification';
import { gradeFromResult, HEARTS_MAX } from '../../../services/learnerState';
import { getExerciseRegistry } from './registry';

export interface RunnerResult {
  total: number;
  correct: number;
  items: { objective_id: string; success: boolean }[];
}

interface ExerciseRunnerProps {
  /** Raw pool_items rows (DB shape) OR typed PoolItems. */
  items: any[];
  studentId: string;
  unitId?: string;
  title?: string;
  onExit?: () => void;
  onDone: (result: RunnerResult) => void;
}

const ExerciseRunner: React.FC<ExerciseRunnerProps> = ({ items, studentId, title, onExit, onDone }) => {
  const pool = useMemo<PoolItem[]>(() => items.map(toPoolItem).filter((p): p is PoolItem => p !== null), [items]);
  const registry = useMemo(() => getExerciseRegistry(), []);
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(HEARTS_MAX);
  const [outOfHearts, setOutOfHearts] = useState(false);
  const [results, setResults] = useState<RunnerResult['items']>([]);
  // Objectives that reached 'familiar'/'mastered' THIS session — used to advance
  // the mastery-tied quest (REACH_FAMILIAR) once per word per session (plan 4.3).
  const familiarSeen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Engine.getHearts(studentId).then((h) => { if (!cancelled) setHearts(h.current); });
    return () => { cancelled = true; };
  }, [studentId]);

  const current = pool[index];
  const progress = pool.length > 0 ? (index / pool.length) * 100 : 0;

  const finish = useCallback(
    (finalResults: RunnerResult['items']) => {
      const correct = finalResults.filter((r) => r.success).length;
      GamificationService.awardXP(XP_REWARDS.LESSON_COMPLETE, 'lesson_complete').catch(() => {});
      Engine.restoreHeart(studentId).catch(() => {});
      onDone({ total: finalResults.length, correct, items: finalResults });
    },
    [onDone, studentId],
  );

  const handleComplete = useCallback(
    async (result: { success: boolean; time_taken_ms: number; attempts: number; record?: boolean }) => {
      if (!current) return;
      const record = result.record !== false;
      const itemResult = { objective_id: current.objective_id, success: result.success };
      const nextResults = record ? [...results, itemResult] : results;

      // Engagement-only results (record:false) advance without touching the
      // learner model / hearts / XP. Otherwise record the attempt.
      if (record) {
        const grade = gradeFromResult(result);
        const modality = modalityOf(current.exercise_type);
        let masteryAfter: string | undefined;
        try {
          const after = await Engine.recordAttempt(studentId, current.objective_id, grade, {
            exerciseType: current.exercise_type,
            modality,
          });
          masteryAfter = after?.effective_mastery;
        } catch {
          /* recordAttempt swallows its own errors; ignore */
        }

        // Hearts: productive errors cost 1; receptive errors warn only.
        if (!result.success && modality === 'productive') {
          try {
            const h = await Engine.loseHeart(studentId, true);
            setHearts(h.current);
            if (h.current <= 0) setOutOfHearts(true);
          } catch { /* ignore */ }
        }

        // XP + quests on success.
        if (result.success) {
          GamificationService.awardXP(XP_REWARDS.CORRECT_ANSWER, 'correct_answer').catch(() => {});
          GamificationService.updateQuestProgress(QUEST_TYPES.EARN_XP, XP_REWARDS.CORRECT_ANSWER).catch(() => {});
          toast.success(`+${XP_REWARDS.CORRECT_ANSWER} XP`, { icon: '⭐' });
        }

        // Mastery-tied quest (plan 4.3): count a word the FIRST time this session
        // a productive success lifts it to familiar/mastered — real learning, not
        // raw XP. Avoids double-counting via the per-session familiarSeen set.
        if (
          result.success && modality === 'productive'
          && (masteryAfter === 'familiar' || masteryAfter === 'mastered')
          && !familiarSeen.current.has(current.objective_id)
        ) {
          familiarSeen.current.add(current.objective_id);
          GamificationService.updateQuestProgress(QUEST_TYPES.REACH_FAMILIAR, 1).catch(() => {});
        }
      }

      setResults(nextResults);
      // Advance after a beat (the component already showed feedback).
      setTimeout(() => {
        if (index + 1 >= pool.length) finish(nextResults);
        else setIndex(index + 1);
      }, 100);
    },
    [current, results, index, pool.length, finish, studentId],
  );

  if (pool.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="text-slate-400 font-bold mb-2">No exercises available</p>
        <p className="text-slate-300 text-sm mb-6">This unit has no practice content yet.</p>
        <button onClick={() => onDone({ total: 0, correct: 0, items: [] })} className="bg-duo-green text-white font-bold px-6 py-3 rounded-xl">
          Continue
        </button>
      </div>
    );
  }

  if (outOfHearts) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Heart size={56} className="text-duo-red mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">Out of hearts!</h2>
        <p className="text-slate-400 mb-6">Hearts refill over time, or complete a review to restore one.</p>
        <button onClick={() => finish(results)} className="bg-duo-green text-white font-bold px-6 py-3 rounded-xl">
          Finish session
        </button>
      </div>
    );
  }

  const Component = registry.get(current.exercise_type);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="px-4 py-3 flex items-center justify-between shrink-0 bg-white border-b border-slate-100">
        {onExit ? (
          <button onClick={onExit} className="text-slate-400 hover:text-slate-600 p-1"><X size={24} /></button>
        ) : <div className="w-6" />}
        <div className="flex-1 mx-4 h-3 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-duo-green rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-1 text-duo-red font-bold w-12 justify-end">
          <Heart fill="currentColor" size={20} />
          <span className="text-sm">{hearts}</span>
        </div>
      </header>

      {title && <div className="px-6 pt-4 text-center text-sm font-bold text-slate-400 uppercase tracking-wider">{title}</div>}

      <div className="flex-1 overflow-y-auto">
        {Component ? (
          <Component key={current.id} data={current} onComplete={handleComplete} onError={(m) => toast.error(m)} />
        ) : (
          // Unknown type: skip gracefully so a single v2 type never blocks a session.
          <UnknownType item={current} onSkip={() => handleComplete({ success: true, time_taken_ms: 0, attempts: 0 })} />
        )}
      </div>
    </div>
  );
};

const UnknownType: React.FC<{ item: PoolItem; onSkip: () => void }> = ({ item, onSkip }) => (
  <div className="p-6 text-center text-slate-400">
    <p className="font-bold mb-2">Unsupported exercise: {item.exercise_type}</p>
    <button onClick={onSkip} className="bg-duo-blue text-white font-bold px-4 py-2 rounded-xl">Skip</button>
  </div>
);

export default ExerciseRunner;
