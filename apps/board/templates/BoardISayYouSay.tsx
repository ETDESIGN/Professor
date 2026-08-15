// BoardISayYouSay v2 — speaking drill (Prompt 8 / isayyousay-v2-spec.md).
//
// Two phases, deliberately ordered receptive-before-productive:
//   1. MINIMAL_PAIR_SWIPE — scoreable sound-discrimination round (binary MCQ,
//      full lifecycle). Reuses the pattern from BoardListenTap.
//   2. Choral drill — whole→part→whole (a legitimate language-teaching
//      technique). Teacher-paced, NO scoring (decision 2: pronunciation
//      capture deferred). The honest "no scoring" banner replaces the old
//      fake waveform that implied engagement was being measured when it wasn't.
//
// Content shapes (verified against types/exercise.ts):
//   MinimalPairSwipeContent { pair: [string, string], audio_url, options: TextOption[], correct_index, prompt? }
//   SpeakSentenceContent { target_sentence, target_word?, target_audio? }
// (the spec's invented targetWord/sentenceAudioUrl/correctSide are corrected)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Mic, Volume2, X, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { usePickedStudent } from './usePickedStudent';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';

type ShellPhase = 'discrimination' | 'choral';
type ChoralStage = 'whole_first' | 'isolated_word' | 'whole_second';

interface DiscriminationItem {
  pair: [string, string];
  audioUrl: string;
  options: { text: string }[];
  correctIndex: number;
  objectiveId: string;
  difficulty: 1 | 2 | 3;
}

interface ChoralItem {
  sentence: string;
  word?: string;
  audio?: string;
}

const BoardISayYouSay: React.FC<{ data?: any }> = ({ data }) => {
  const { state, addPoints } = useSession();
  const unitId = state.activeUnit?.id || '';
  const pickedStudent = usePickedStudent();
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // Phase 1 — MINIMAL_PAIR_SWIPE via the escalation engine (rung 2, scored).
  const { items: minimalPairPool, loading: mpLoading } = useEscalatingPool({
    unitId,
    shellType: 'I_SAY_YOU_SAY',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 5,
  });

  const discriminationItems = useMemo<DiscriminationItem[]>(() => {
    return minimalPairPool
      .filter((it) => it.exercise_type === 'MINIMAL_PAIR_SWIPE')
      .map((it) => {
        const c = it.content as any;
        return {
          pair: c.pair ?? ['', ''],
          audioUrl: c.audio_url ?? '',
          options: (c.options ?? []).map((o: any) => ({ text: typeof o === 'string' ? o : o.text })),
          correctIndex: typeof c.correct_index === 'number' ? c.correct_index : 0,
          objectiveId: it.objective_id,
          difficulty: (it.difficulty >= 1 && it.difficulty <= 3 ? it.difficulty : 1) as 1 | 2 | 3,
        };
      });
  }, [minimalPairPool]);

  // Phase 2 — SPEAK_SENTENCE choral items (any objective — mastery-gating
  // doesn't apply because nothing is scored; choral repetition of a brand-new
  // word is exposure, same as INPUT-phase presentation).
  const { items: speakPool } = useEscalatingPool({
    unitId,
    shellType: 'I_SAY_YOU_SAY',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 4,
  });

  const choralItems = useMemo<ChoralItem[]>(() => {
    // Prefer frozen data if provided (some flows carry inline items).
    if (Array.isArray(data?.items) && data.items.length > 0) {
      return data.items.map((it: any) => ({ sentence: it.text ?? '', word: it.emphasis, audio: it.audio }));
    }
    return speakPool
      .filter((it) => it.exercise_type === 'SPEAK_SENTENCE')
      .map((it) => {
        const c = it.content as any;
        return { sentence: c.target_sentence ?? '', word: c.target_word, audio: c.target_audio };
      })
      .filter((d) => d.sentence);
  }, [speakPool, data]);

  // ── Game state ──────────────────────────────────────────────────────
  const [shellPhase, setShellPhase] = useState<ShellPhase>('discrimination');
  const [discIdx, setDiscIdx] = useState(0);
  const [choralIdx, setChoralIdx] = useState(0);
  const [choralStage, setChoralStage] = useState<ChoralStage>('whole_first');
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<null | 'correct' | 'incorrect'>(null);

  // Lifecycle (discrimination round only — choral has no scoring).
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const turnId = state.currentTurnId;
  useEffect(() => {
    if (shellPhase !== 'discrimination') return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setRevealed(false);
    setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, discIdx, shellPhase]);

  // ── Discrimination scoring ──────────────────────────────────────────
  const onDiscriminationAnswer = useCallback((chosenIndex: number) => {
    if (awardedRef.current || revealed) return;
    const item = discriminationItems[discIdx];
    if (!item) return;
    const correct = chosenIndex === item.correctIndex;
    setRevealed(true);
    if (correct) {
      awardedRef.current = true;
      setOutcome('correct');
      if (pickedStudent) {
        const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0);
        addPoints(pickedStudent.id, points);
        recordAttempt({
          rosterId: pickedStudent.id, classId: state.activeClassId,
          profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
          correctness: 'correct', objectiveId: item.objectiveId, exerciseType: 'MINIMAL_PAIR_SWIPE', difficulty: item.difficulty,
        }).catch(() => {});
        gradeObjective(pickedStudent.id, unitId, item.objectiveId, true, 'receptive').catch(() => {});
      }
    } else {
      mistakesRef.current += 1;
      setOutcome('incorrect');
      if (pickedStudent) {
        addPoints(pickedStudent.id, -MISTAKE_PENALTY);
        recordAttempt({
          rosterId: pickedStudent.id, classId: state.activeClassId,
          profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
          correctness: 'incorrect', objectiveId: item.objectiveId, exerciseType: 'MINIMAL_PAIR_SWIPE', difficulty: item.difficulty,
        }).catch(() => {});
        gradeObjective(pickedStudent.id, unitId, item.objectiveId, false, 'receptive').catch(() => {});
      }
    }
  }, [awardedRef, revealed, discriminationItems, discIdx, pickedStudent, addPoints, state.activeClassId, state.students, unitId]);

  const advanceDiscrimination = useCallback(() => {
    if (discIdx < discriminationItems.length - 1) {
      setDiscIdx(discIdx + 1);
      setRevealed(false); setOutcome(null); awardedRef.current = false; mistakesRef.current = 0;
    } else {
      // Move to the choral phase.
      setShellPhase('choral');
      setChoralIdx(0); setChoralStage('whole_first');
    }
  }, [discIdx, discriminationItems.length]);

  // ── Choral stage advancement ────────────────────────────────────────
  const advanceChoral = useCallback(() => {
    if (choralStage === 'whole_first') setChoralStage('isolated_word');
    else if (choralStage === 'isolated_word') setChoralStage('whole_second');
    else {
      // whole_second done — next choral item, or end.
      if (choralIdx < choralItems.length - 1) {
        setChoralIdx(choralIdx + 1);
        setChoralStage('whole_first');
      } else {
        // Choral complete. SLIDE_COMPLETE never fires automatically here (no
        // scored attempt to resolve) — the teacher's End control does.
      }
    }
  }, [choralStage, choralIdx, choralItems.length]);

  // ── Remote/commander listener ───────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (shellPhase === 'discrimination') {
      if (a.type === 'MARK_CORRECT' && !awardedRef.current) {
        // Force-correct teacher override.
        awardedRef.current = true; setRevealed(true); setOutcome('correct');
        const item = discriminationItems[discIdx];
        if (pickedStudent && item) {
          const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0);
          addPoints(pickedStudent.id, points);
          recordAttempt({ rosterId: pickedStudent.id, classId: state.activeClassId, profileId: (state.students.find((s:any)=>s.id===pickedStudent.id) as any)?.claimed_profile_id, correctness: 'correct', objectiveId: item.objectiveId, exerciseType: 'MINIMAL_PAIR_SWIPE', difficulty: item.difficulty }).catch(()=>{});
        }
      } else if (a.type === 'SKIP_PAIR' || a.type === 'SKIP_ROUND') {
        advanceDiscrimination();
      } else if (a.type === 'NEXT_PAIR' || a.type === 'NEXT_ROUND' || a.type === 'NEXT') {
        if (revealed) advanceDiscrimination();
      }
    } else {
      // Choral phase — replay / advance cues.
      if (a.type === 'FLIP_CARD' || a.type === 'TOGGLE_PHASE') {
        // Replay audio (no-op state change, just lets the teacher re-tap play).
      } else if (a.type === 'NEXT_PAIR' || a.type === 'NEXT_ROUND' || a.type === 'NEXT_ITEM' || a.type === 'NEXT') {
        advanceChoral();
      }
    }
    if (a.type === 'RESET_GAME') {
      setShellPhase('discrimination'); setDiscIdx(0); setChoralIdx(0); setChoralStage('whole_first');
      setRevealed(false); setOutcome(null); mistakesRef.current = 0; awardedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Empty-state ─────────────────────────────────────────────────────
  if (!mpLoading && discriminationItems.length === 0 && choralItems.length === 0) {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8 font-display">
        <Mic size={64} className="text-blue-400 mx-auto mb-4 opacity-50" />
        <h2 className="text-4xl font-bold text-slate-500 mb-2">I Say, You Say</h2>
        <p className="text-slate-600 text-xl">No speaking drills available. Generate the exercise pool for this unit.</p>
      </div>
    );
  }

  if (mpLoading) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-slate-500 font-mono text-2xl">
        Loading speaking drills…
      </div>
    );
  }

  // ── Render: discrimination phase ────────────────────────────────────
  if (shellPhase === 'discrimination' && discriminationItems.length > 0) {
    const item = discriminationItems[discIdx];
    return (
      <div className="h-full bg-slate-900 flex flex-col p-8 font-display">
        <div className="flex justify-between items-center mb-8">
          <div className="bg-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/10">
            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white text-2xl"><Volume2 /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">Sound Check</h1>
              <p className="text-slate-400 text-sm">Listen carefully — which word did you hear?</p>
            </div>
          </div>
          <div className="bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 text-white font-bold text-lg">
            {discIdx + 1} / {discriminationItems.length}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <button
            onClick={() => playAudioUrl(item.audioUrl, item.pair[item.correctIndex])}
            className="w-32 h-32 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center text-white shadow-2xl active:scale-95 transition-all"
          >
            <Volume2 size={64} />
          </button>
          <p className="text-slate-400 text-xl">Tap to play the sound again</p>

          <div className="flex gap-6">
            {item.options.map((opt, i) => {
              const isCorrect = i === item.correctIndex;
              const state_ = revealed ? (isCorrect ? 'correct' : outcome === 'incorrect' ? 'wrong' : 'dim') : 'idle';
              return (
                <button
                  key={i}
                  onClick={() => !revealed && onDiscriminationAnswer(i)}
                  disabled={revealed}
                  className={`w-64 h-64 rounded-3xl border-4 text-4xl font-bold flex items-center justify-center transition-all ${
                    state_ === 'correct' ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' :
                    state_ === 'wrong' ? 'bg-rose-500/20 border-rose-400 text-rose-300' :
                    state_ === 'dim' ? 'bg-slate-800 border-slate-600 text-slate-500' :
                    'bg-slate-800 border-slate-600 text-white hover:border-blue-400'
                  }`}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>

          {revealed && (
            <button
              onClick={advanceDiscrimination}
              className="px-10 py-4 bg-blue-500 text-white font-bold text-xl rounded-2xl shadow-lg active:scale-95 flex items-center gap-2"
            >
              {discIdx < discriminationItems.length - 1 ? 'Next Sound' : 'Start Speaking Practice'} <Zap size={24} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: choral phase (no scoring, honest banner) ────────────────
  const choralItem = choralItems[choralIdx];
  if (!choralItem) {
    // No choral content — jump straight to end.
    return (
      <div className="h-full bg-emerald-900 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <Check size={64} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-4xl font-bold">Speaking practice complete!</h2>
        </div>
      </div>
    );
  }

  const isIsolated = choralStage === 'isolated_word';
  const displayText = isIsolated ? (choralItem.word || choralItem.sentence) : choralItem.sentence;
  const stageLabel = choralStage === 'whole_first' ? 'Listen & Repeat' : choralStage === 'isolated_word' ? 'Focus on the word' : 'One more time';

  return (
    <div className="h-full bg-emerald-900 flex flex-col font-display relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent opacity-50"></div>

      {/* Honest "no scoring" banner — replaces the old fake waveform */}
      <div className="relative z-10 p-4 bg-black/20 border-b border-white/10 flex items-center justify-center gap-2 text-emerald-200 font-bold uppercase tracking-widest text-sm">
        <Mic size={16} /> Speaking Practice — Listen &amp; Repeat Together
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex justify-between items-center">
        <div className="text-white/60 font-mono text-lg">
          {choralIdx + 1} / {choralItems.length} · {stageLabel}
        </div>
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="w-2 h-2 rounded-full bg-white/20" />
          <span className="w-2 h-2 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Main stage */}
      <div className="flex-1 relative z-20 flex flex-col items-center justify-center">
        <div className="mb-10 w-28 h-28 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-2xl">
          {choralStage === 'whole_first' ? <Volume2 size={56} /> : <Mic size={56} />}
        </div>

        <div className="text-center max-w-5xl px-8">
          <div className="text-3xl font-bold uppercase tracking-[0.2em] text-emerald-300 mb-6">
            {choralStage === 'whole_first' ? 'Everyone listen…' : 'Everyone say:'}
          </div>
          <h1 className={`font-black text-white leading-tight drop-shadow-lg ${isIsolated ? 'text-9xl' : 'text-7xl'}`}>
            {displayText.split(' ').map((word, i) => {
              const isEmphasized = isIsolated || (choralItem.word && word.replace(/[^a-zA-Z]/g, '').toLowerCase() === choralItem.word.toLowerCase());
              return (
                <span key={i} className={`inline-block mx-2 ${isEmphasized ? 'text-yellow-400 scale-110' : ''}`}>{word}</span>
              );
            })}
          </h1>

          {(choralItem.audio || displayText) && (
            <button
              onClick={() => playAudioUrl(choralItem.audio, displayText)}
              className="mt-8 flex items-center gap-3 bg-white/15 hover:bg-white/25 text-white px-8 py-4 rounded-2xl font-bold text-2xl active:scale-95 border border-white/20"
            >
              <Volume2 size={32} className="text-yellow-300" /> Play
            </button>
          )}
        </div>
      </div>

      {/* Footer: advance control (no scoring controls — deliberate absence) */}
      <div className="relative z-10 p-6 flex justify-center">
        <button
          onClick={advanceChoral}
          className="px-8 py-3 bg-white/15 hover:bg-white/25 text-white font-bold text-lg rounded-2xl border border-white/20 active:scale-95"
        >
          {choralStage === 'whole_second' && choralIdx >= choralItems.length - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
};

export default BoardISayYouSay;
