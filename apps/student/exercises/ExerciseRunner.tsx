// ExerciseRunner — plays a list of pool items one at a time via the registry,
// recording each attempt to the LearnerState (FSRS + mastery), applying the
// hearts economy, and awarding XP. Used by BOTH the lesson pool-driven steps
// (SoloLessonPlayer) and Practice mode. This is where the exercise contract
// meets the learner model — every onComplete -> recordAttempt closes the loop.
//
// Redesigned to Wonder Atlas warmth × Duolingo accents per stitch screens
// 12/1-battery-shell.html and 12/4-round-complete.html.

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { PoolItem, toPoolItem } from '../../../types/exercise';
import { modalityOf } from '../../../types/exercise';
import { Engine } from '../../../services/SupabaseService';
import { GamificationService } from '../../../services/GamificationService';
import { XP_REWARDS, QUEST_TYPES } from '../../../constants/gamification';
import { gradeFromResult, HEARTS_MAX } from '../../../services/learnerState';
import { getExerciseRegistry } from './registry';
import { playCue } from '../../board/templates/playCue';

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
  heartSafe?: boolean;
  onExit?: () => void;
  onDone: (result: RunnerResult) => void;
}

const ExerciseRunner: React.FC<ExerciseRunnerProps> = ({ items, studentId, title, heartSafe, onExit, onDone }) => {
  const { t } = useTranslation();
  const registry = useMemo(() => getExerciseRegistry(), []);
  // Mutable queue (P-D): a missed word is re-queued once (retry) so it gets
  // another attempt in the same session — desirable difficulty / retrieval loop.
  const [queue, setQueue] = useState<PoolItem[]>(() => items.map(toPoolItem).filter((p): p is PoolItem => p !== null));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'summary'>('playing');
  const [hearts, setHearts] = useState(HEARTS_MAX);
  // True when the hearts balance could not be read from the DB — the counter
  // renders disabled ("—") and wrong answers must NOT decrement an unknown
  // balance (getHearts now throws instead of faking full hearts). Starts
  // true so an early wrong answer can't decrement an unread balance.
  const [heartsUnavailable, setHeartsUnavailable] = useState(true);
  const [outOfHearts, setOutOfHearts] = useState(false);
  const [results, setResults] = useState<RunnerResult['items']>([]);
  // Objectives that reached 'familiar'/'mastered' THIS session — used to advance
  // the mastery-tied quest (REACH_FAMILIAR) once per word per session (plan 4.3).
  const familiarSeen = useRef<Set<string>>(new Set());
  const retried = useRef<Set<string>>(new Set()); // P-D: one retry per objective
  // Advance-after-feedback timer — tracked so cleanup can clear it and it
  // can never setState after unmount.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, []);

  // Round-complete celebration cue (synth, zero assets, never throws).
  useEffect(() => {
    if (phase === 'summary') playCue('win');
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    Engine.getHearts(studentId)
      .then((h) => { if (!cancelled) { setHearts(h.current); setHeartsUnavailable(false); } })
      .catch(() => { if (!cancelled) setHeartsUnavailable(true); });
    return () => { cancelled = true; };
  }, [studentId]);

  const current = queue[index];
  const progress = queue.length > 0 ? (index / queue.length) * 100 : 0;

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
        // Skip entirely when the balance is unavailable — never decrement a
        // hearts value we failed to read.
        if (!result.success && modality === 'productive' && !heartsUnavailable) {
          try {
            if (!heartSafe) {
              const h = await Engine.loseHeart(studentId, true);
              setHearts(h.current);
              if (h.current <= 0) setOutOfHearts(true);
            }
            playCue('wrong');
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

      // P-D: re-queue a missed word ONCE (give it another attempt this session).
      let requeued = false;
      if (record && !result.success && current.objective_id && !retried.current.has(current.objective_id)) {
        retried.current.add(current.objective_id);
        setQueue((q) => [...q, { ...current, id: `${current.id}-retry` }]);
        requeued = true;
      }

      // Advance after a beat (the component already showed feedback).
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        const newLen = queue.length + (requeued ? 1 : 0);
        if (index + 1 >= newLen) setPhase('summary');
        else setIndex(index + 1);
      }, 100);
    },
    [current, results, index, queue.length, finish, studentId, heartsUnavailable],
  );

  // Empty items fallback
  if (queue.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-[#EAE0D0]">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-2 border-[#E2D7C3] p-6 shadow-card flex flex-col items-center text-center">
          <p className="text-[#1D3557] font-black text-xl mb-2">{t('exercise.noExercises', 'No exercises available')}</p>
          <p className="text-[#8C7A68] text-sm font-semibold mb-6">This unit has no practice content yet.</p>
          <button
            type="button"
            onClick={() => onDone({ total: 0, correct: 0, items: [] })}
            className="w-full h-12 bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_2px_0_#1E6F5C] text-white font-bold text-base rounded-2xl flex items-center justify-center transition-all cursor-pointer"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // P-D: end-of-round summary — celebratory recap before onDone (stitch screen 4)
  if (phase === 'summary') {
    const correct = results.filter((r) => r.success).length;
    const accuracy = results.length ? Math.round((correct / results.length) * 100) : 100;
    const mastered = familiarSeen.current.size;

    return (
      <div className="h-full flex flex-col justify-between items-center py-6 px-4 bg-[#EAE0D0] text-[#264653] overflow-y-auto">
        {/* Top spacer / Header micro bar */}
        <div className="w-full max-w-sm flex items-center justify-between px-2 pt-1 pb-3 text-[#8C7A68]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5EFE3] border border-[#E2D7C3] rounded-full text-xs font-extrabold text-[#8C7A68] tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#2A9D8F]" />
            ROUND RECAP
          </span>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Close"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#FDFBF7] border border-[#E2D7C3] text-[#8C7A68] hover:text-[#1D3557] hover:bg-white active:scale-95 transition-transform shadow-sm cursor-pointer"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Centered Floating Paper Card */}
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-2 border-[#E2D7C3] p-6 shadow-card flex flex-col items-center text-center relative overflow-hidden my-auto">
          {/* Confetti & Sparkle accents */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div className="absolute top-5 left-5 w-4 h-4 text-[#E91E63] opacity-80">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>
            <div className="absolute top-7 right-7 w-3.5 h-3.5 text-[#2A9D8F] opacity-75">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>
            <div className="absolute top-20 left-8 w-2 h-2 rounded-full bg-[#E9C46A] opacity-75" />
            <div className="absolute top-24 right-9 w-2.5 h-2.5 rounded-full bg-[#E91E63] opacity-65" />
          </div>

          {/* Trophy Badge */}
          <div className="relative mb-4">
            <div className="w-[88px] h-[88px] bg-[#FEF3C7] border-2 border-[#E9C46A] flex items-center justify-center rounded-full shadow-sm relative z-10">
              <svg className="w-12 h-12 text-[#E9C46A] filter drop-shadow-[0_2px_4px_rgba(201,158,50,0.35)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4H18V3C18 2.45 17.55 2 17 2H7C6.45 2 6 2.45 6 3V4H5C3.34 4 2 5.34 2 7V8C2 10.21 3.79 12 6 12H6.18C6.9 13.75 8.43 15.11 10.3 15.65C10.74 15.78 11.2 15.89 11.67 15.95V18.1C9.64 18.39 8 19.12 8 20V21C8 21.55 8.45 22 9 22H15C15.55 22 16 21.55 16 21V20C16 19.12 14.36 18.39 12.33 18.1V15.95C12.8 15.89 13.26 15.78 13.7 15.65C15.57 15.11 17.1 13.75 17.82 12H18C20.21 12 22 10.21 22 8V7C22 5.34 20.66 4 19 4ZM5 10C4.45 10 4 9.55 4 9V7C4 6.45 4.45 6 5 6H6V10H5ZM19 10H18V6H19C19.55 6 20 6.45 20 7V9C20 9.55 19.55 10 19 10Z" />
              </svg>
            </div>
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-white border border-[#E9C46A] rounded-full flex items-center justify-center text-xs shadow-xs z-20">
              ✨
            </span>
            <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-[#E8F8F5] border border-[#2A9D8F] rounded-full flex items-center justify-center text-[10px] text-[#2A9D8F] font-black z-20">
              ★
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-bold text-[30px] leading-tight text-[#1D3557] tracking-tight mb-1">
            Round Complete!
          </h1>

          {/* Subtitle */}
          <p className="font-bold text-[15px] text-[#E76F51] mb-6 flex items-center justify-center gap-1">
            <span>{accuracy >= 80 ? 'Excellent work! 🎉' : accuracy >= 50 ? 'Good effort — keep going! 💪' : 'Practice makes perfect! 🌱'}</span>
          </p>

          {/* 3 Honest Metric Summary Tiles */}
          <div className="grid grid-cols-3 gap-2.5 w-full mb-5">
            <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3 flex flex-col items-center justify-center shadow-[0_3px_0_#E2D7C3]">
              <span className="font-black text-[22px] leading-tight text-[#1D3557]">
                {correct}/{results.length}
              </span>
              <span className="text-xs uppercase font-black text-[#8C7A68] tracking-wider mt-1">
                CORRECT
              </span>
            </div>

            <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3 flex flex-col items-center justify-center shadow-[0_3px_0_#E2D7C3]">
              <span className="font-black text-[22px] leading-tight text-[#2A9D8F]">
                {accuracy}%
              </span>
              <span className="text-xs uppercase font-black text-[#8C7A68] tracking-wider mt-1">
                ACCURACY
              </span>
            </div>

            <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3 flex flex-col items-center justify-center shadow-[0_3px_0_#E2D7C3]">
              <span className="font-black text-[22px] leading-tight text-[#E91E63]">
                {mastered}
              </span>
              <span className="text-xs uppercase font-black text-[#8C7A68] tracking-wider mt-1">
                STRENGTHENED
              </span>
            </div>
          </div>

          {/* Retrieval Re-Queue Note */}
          {retried.current.size > 0 && (
            <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3 w-full mb-4 flex items-center justify-center gap-2 text-xs font-bold text-[#264653] leading-relaxed shadow-xs">
              <span className="text-base leading-none">🔄</span>
              <span className="text-left text-xs font-extrabold text-[#264653]">
                {retried.current.size} tricky word(s) mastered in the Review Round!
              </span>
            </div>
          )}

          {/* Heart Recovery Economy Chip */}
          <div className="inline-flex items-center gap-1.5 bg-[#E8F8F5] border border-[#2A9D8F] text-[#2A9D8F] font-extrabold text-xs px-3.5 py-1.5 rounded-full mb-6 shadow-xs">
            <span>+1 Heart Restored</span>
            <span className="text-sm leading-none">❤️</span>
          </div>

          {/* Primary Action CTA */}
          <button
            type="button"
            onClick={() => finish(results)}
            className="w-full h-14 bg-[#2A9D8F] shadow-[0_5px_0_#1E6F5C] active:translate-y-[4px] active:shadow-[0_1px_0_#1E6F5C] text-white font-black text-[17px] tracking-wide rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>GOT IT</span>
            <svg className="w-5 h-5 font-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Footer info */}
        {title && (
          <footer className="w-full flex items-center justify-center pt-2 pb-1 text-center">
            <p className="text-xs font-bold text-[#8C7A68]">
              {title}
            </p>
          </footer>
        )}
      </div>
    );
  }

  // Out of hearts screen
  if (outOfHearts) {
    return (
      <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#EAE0D0]">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-2 border-[#E2D7C3] p-6 shadow-card flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#FEE2E2] border-2 border-[#FECACA] flex items-center justify-center mb-4 text-[#FF4B4B]">
            <Heart size={36} fill="currentColor" />
          </div>
          <h2 className="text-2xl font-black text-[#1D3557] mb-2">Out of hearts!</h2>
          <p className="text-sm font-bold text-[#8C7A68] mb-6">
            Hearts refill over time, or complete a review to restore one.
          </p>
          <button
            type="button"
            onClick={() => finish(results)}
            className="w-full h-12 bg-[#E76F51] shadow-[0_4px_0_#C4553B] active:translate-y-[2px] active:shadow-[0_2px_0_#C4553B] text-white font-bold text-base rounded-2xl flex items-center justify-center transition-all cursor-pointer"
          >
            Finish session
          </button>
        </div>
      </div>
    );
  }

  const Component = registry.get(current.exercise_type);

  return (
    <div className="h-full flex flex-col bg-[#EAE0D0] text-[#264653] font-nunito select-none relative overflow-hidden">
      {/* Shell Header HUD (stitch screen 1) */}
      <header className="pt-4 pb-2 px-4 flex flex-col gap-2 shrink-0 z-20 bg-[#EAE0D0]">
        <div className="flex items-center justify-between gap-3 h-12">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              aria-label="Exit exercise"
              className="w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-[#F7F3E8] text-[#8C7A68] active:scale-95 transition-all cursor-pointer"
            >
              <svg className="w-6 h-6 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <div className="w-12 h-12" />
          )}

          {/* Center Progress Bar */}
          <div className="flex-1 h-3.5 bg-[#E2D7C3] rounded-full p-[2px] overflow-hidden flex items-center shadow-inner">
            <div
              className="h-full bg-[#E91E63] rounded-full transition-all duration-500 relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-x-1 top-[1px] h-[2px] bg-white/40 rounded-full" />
            </div>
          </div>

          {/* Live Hearts Counter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FDFBF7] border border-[#E2D7C3] shadow-sm">
            <svg
              className={`w-5 h-5 drop-shadow-sm ${heartsUnavailable ? 'fill-[#8C7A68] opacity-50' : 'fill-[#FF4B4B]'}`}
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="font-bold text-base text-[#264653] leading-none pt-0.5">
              {heartsUnavailable ? '—' : hearts}
            </span>
          </div>
        </div>

        {/* Context Subtitle Chip */}
        {title && (
          <div className="flex justify-center -mt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] text-[#8C7A68] text-xs font-extrabold tracking-widest uppercase shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F]" />
              {title}
            </span>
          </div>
        )}
      </header>

      {/* Main Exercise Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {Component ? (
          <Component key={current.id} data={current} onComplete={handleComplete} onError={(m) => toast.error(m)} />
        ) : (
          // Sanctioned bug-fix: Unknown type advances WITHOUT recording (record:false, success:false)
          // protecting FSRS from false-success writes.
          <UnknownType
            item={current}
            onSkip={() => handleComplete({ success: false, record: false, time_taken_ms: 0, attempts: 0 })}
          />
        )}
      </div>
    </div>
  );
};

const UnknownType: React.FC<{ item: PoolItem; onSkip: () => void }> = ({ item, onSkip }) => (
  <div className="p-6 text-center text-[#8C7A68] bg-[#EAE0D0] h-full flex flex-col items-center justify-center">
    <div className="w-full max-w-sm bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-6 shadow-sm flex flex-col items-center">
      <p className="font-bold text-[#1D3557] mb-2">Unsupported exercise: {item.exercise_type}</p>
      <button
        type="button"
        onClick={onSkip}
        className="mt-2 bg-[#1CB0F6] shadow-[0_4px_0_#0284C7] active:translate-y-[2px] active:shadow-[0_2px_0_#0284C7] text-white font-bold px-6 py-2.5 rounded-xl cursor-pointer"
      >
        Skip
      </button>
    </div>
  </div>
);

export default ExerciseRunner;
