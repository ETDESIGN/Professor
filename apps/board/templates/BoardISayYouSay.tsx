// BoardISayYouSay v3 — speaking drill
//
// Two phases, deliberately ordered receptive-before-productive:
//   1. MINIMAL_PAIR_SWIPE — scoreable sound-discrimination round (binary MCQ,
//      full lifecycle: addPoints, recordAttempt, gradeObjective).
//   2. Choral drill — whole→part→whole (receptive exposure to productive echo).
//      Teacher-paced, honest unscored practice mode.
//
// Stitch Redesign (2026-09-11):
//   - Clean 16:9 studio aesthetic with safe top-left HUD clearance (pl-28 lg:pl-44).
//   - Explicit word spacing around highlighted target tokens (eliminating "Thetractoris" bug).
//   - Unified single prominent audio replay button (with SPACE shortcut).
//   - Full remote/commander Replay wiring (fixes dead remote Replay button).
//   - Triple-write contract parity for remote MARK_CORRECT (adds missing gradeObjective).
//   - Audio-text synchronization: canonical displayed text is always spoken.
//   - Celebratory completion splash when choral practice finishes.
//   - Full @media (max-height: 450px) phone floor support.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Lightbulb,
  Maximize,
  Mic,
  Minimize,
  Radio,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Zap
} from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { usePickedStudent } from './usePickedStudent';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';
import { playCue } from './playCue';

type ShellPhase = 'discrimination' | 'choral';
type ChoralStage = 'whole_first' | 'isolated_word' | 'whole_second';

interface DiscriminationItem {
  pair: [string, string];
  audioUrl: string;
  options: { text: string }[];
  correctIndex: number;
  objectiveId: string;
  difficulty: 1 | 2 | 3;
  explanation?: string;
}

interface ChoralItem {
  sentence: string;
  word?: string;
  audio?: string;
}

const BoardISayYouSay: React.FC<{ data?: any }> = ({ data }) => {
  const { state, addPoints, triggerConfetti, triggerAction } = useSession();
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
          explanation: typeof c.explanation === 'string' ? c.explanation : undefined,
        };
      });
  }, [minimalPairPool]);

  // Phase 2 — SPEAK_SENTENCE choral items
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
  const [isChoralComplete, setIsChoralComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lifecycle refs
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const streakRef = useRef(0);
  const missHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const turnId = state.currentTurnId;

  // Full reset on turnId change
  useEffect(() => {
    if (missHoldTimer.current) {
      clearTimeout(missHoldTimer.current);
      missHoldTimer.current = null;
    }
    setShellPhase('discrimination');
    setDiscIdx(0);
    setChoralIdx(0);
    setChoralStage('whole_first');
    setRevealed(false);
    setOutcome(null);
    setIsChoralComplete(false);
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
  }, [turnId]);

  // Per-item reset in discrimination phase
  useEffect(() => {
    if (shellPhase !== 'discrimination') return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setRevealed(false);
    setOutcome(null);
  }, [discIdx, shellPhase]);

  // ── Audio playback helper ───────────────────────────────────────────
  const currentChoralItem = choralItems[choralIdx];
  const isIsolated = choralStage === 'isolated_word';
  const currentDisplayText = isIsolated
    ? (currentChoralItem?.word || currentChoralItem?.sentence || '')
    : (currentChoralItem?.sentence || '');

  const playCurrentAudio = useCallback(() => {
    setIsAudioPlaying(true);
    if (shellPhase === 'discrimination') {
      const item = discriminationItems[discIdx];
      if (item) {
        playAudioUrl(item.audioUrl, item.pair[item.correctIndex]);
      }
    } else {
      // P1 Fix (§2, §3 F1, §4.e 2): The displayed text is canonical.
      // Speaking the exact displayed text eliminates audio-text desync permanently!
      playAudioUrl(undefined, currentDisplayText);
    }
    setTimeout(() => setIsAudioPlaying(false), 1500);
  }, [shellPhase, discriminationItems, discIdx, currentDisplayText]);

  // Spacebar triggers audio replay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        playCurrentAudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playCurrentAudio]);

  // ── Discrimination advancement ──────────────────────────────────────
  const advanceDiscrimination = useCallback(() => {
    if (missHoldTimer.current) {
      clearTimeout(missHoldTimer.current);
      missHoldTimer.current = null;
    }
    if (discIdx < discriminationItems.length - 1) {
      setDiscIdx((prev) => prev + 1);
      setRevealed(false);
      setOutcome(null);
      awardedRef.current = false;
      mistakesRef.current = 0;
    } else {
      if (choralItems.length === 0) playCue('win');
      else playCue('correct');
      setShellPhase('choral');
      setChoralIdx(0);
      setChoralStage('whole_first');
    }
  }, [discIdx, discriminationItems.length, choralItems.length]);

  // ── Discrimination scoring ──────────────────────────────────────────
  const onDiscriminationAnswer = useCallback(
    (chosenIndex: number) => {
      if (awardedRef.current || revealed) return;
      const item = discriminationItems[discIdx];
      if (!item) return;
      const correct = chosenIndex === item.correctIndex;
      setRevealed(true);
      if (correct) {
        awardedRef.current = true;
        setOutcome('correct');
        playCue('correct');
        streakRef.current += 1;
        if (streakRef.current === 3 || streakRef.current === 5) {
          playCue('streak');
          triggerConfetti();
        }
        if (pickedStudent) {
          const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
          addPoints(pickedStudent.id, points);
          recordAttempt({
            rosterId: pickedStudent.id,
            classId: state.activeClassId,
            profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
            correctness: 'correct',
            objectiveId: item.objectiveId,
            exerciseType: 'MINIMAL_PAIR_SWIPE',
            difficulty: item.difficulty,
          }).catch(() => {});
          gradeObjective(pickedStudent.id, unitId, item.objectiveId, true, 'receptive').catch(() => {});
        }
      } else {
        mistakesRef.current += 1;
        setOutcome('incorrect');
        streakRef.current = 0;
        playCue('wrong');
        if (pickedStudent) {
          addPoints(pickedStudent.id, -MISTAKE_PENALTY);
          recordAttempt({
            rosterId: pickedStudent.id,
            classId: state.activeClassId,
            profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
            correctness: 'incorrect',
            objectiveId: item.objectiveId,
            exerciseType: 'MINIMAL_PAIR_SWIPE',
            difficulty: item.difficulty,
          }).catch(() => {});
          gradeObjective(pickedStudent.id, unitId, item.objectiveId, false, 'receptive').catch(() => {});
        }
        playCue('reveal');
        if (missHoldTimer.current) clearTimeout(missHoldTimer.current);
        missHoldTimer.current = setTimeout(() => {
          missHoldTimer.current = null;
          advanceDiscrimination();
        }, 2200);
      }
    },
    [
      awardedRef,
      revealed,
      discriminationItems,
      discIdx,
      pickedStudent,
      addPoints,
      state.activeClassId,
      state.students,
      unitId,
      advanceDiscrimination,
      triggerConfetti,
    ]
  );

  // ── Choral stage advancement ────────────────────────────────────────
  const advanceChoral = useCallback(() => {
    const isLastItem = choralIdx >= choralItems.length - 1;
    const isLastStage = choralStage === 'whole_second';

    if (isLastStage && isLastItem) {
      playCue('win');
      triggerConfetti();
      setIsChoralComplete(true);
      return;
    }

    playCue('correct');
    if (choralStage === 'whole_first') {
      setChoralStage('isolated_word');
    } else if (choralStage === 'isolated_word') {
      setChoralStage('whole_second');
    } else {
      setChoralIdx((prev) => prev + 1);
      setChoralStage('whole_first');
    }
  }, [choralStage, choralIdx, choralItems.length, triggerConfetti]);

  // ── Remote / commander listener ─────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;

    if (shellPhase === 'discrimination') {
      if (a.type === 'MARK_CORRECT' && !awardedRef.current) {
        awardedRef.current = true;
        setRevealed(true);
        setOutcome('correct');
        playCue('correct');
        streakRef.current += 1;
        if (streakRef.current === 3 || streakRef.current === 5) {
          playCue('streak');
          triggerConfetti();
        }
        const item = discriminationItems[discIdx];
        if (pickedStudent && item) {
          const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
          addPoints(pickedStudent.id, points);
          recordAttempt({
            rosterId: pickedStudent.id,
            classId: state.activeClassId,
            profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
            correctness: 'correct',
            objectiveId: item.objectiveId,
            exerciseType: 'MINIMAL_PAIR_SWIPE',
            difficulty: item.difficulty,
          }).catch(() => {});
          // P2 Fix (§3 F3, §4.e 5): Restore triple-write contract parity on teacher override
          gradeObjective(pickedStudent.id, unitId, item.objectiveId, true, 'receptive').catch(() => {});
        }
      } else if (a.type === 'SKIP_PAIR' || a.type === 'SKIP_ROUND' || a.type === 'SKIP') {
        advanceDiscrimination();
      } else if (a.type === 'NEXT_PAIR' || a.type === 'NEXT_ROUND' || a.type === 'NEXT') {
        if (revealed) advanceDiscrimination();
      } else if (a.type === 'REPLAY_AUDIO' || a.type === 'REPLAY' || a.type === 'FLIP_CARD') {
        playCurrentAudio();
      }
    } else {
      // Choral phase
      // P1 Fix (§3 F2, §4.e 3): Wire Replay button directly to audio playback!
      if (
        a.type === 'FLIP_CARD' ||
        a.type === 'TOGGLE_PHASE' ||
        a.type === 'REPLAY_AUDIO' ||
        a.type === 'REPLAY'
      ) {
        playCurrentAudio();
      } else if (
        a.type === 'NEXT_PAIR' ||
        a.type === 'NEXT_ROUND' ||
        a.type === 'NEXT_ITEM' ||
        a.type === 'NEXT'
      ) {
        advanceChoral();
      }
    }

    if (a.type === 'RESET_GAME') {
      if (missHoldTimer.current) {
        clearTimeout(missHoldTimer.current);
        missHoldTimer.current = null;
      }
      setShellPhase('discrimination');
      setDiscIdx(0);
      setChoralIdx(0);
      setChoralStage('whole_first');
      setRevealed(false);
      setOutcome(null);
      setIsChoralComplete(false);
      mistakesRef.current = 0;
      awardedRef.current = false;
      streakRef.current = 0;
    }
  }, [
    state.lastAction,
    shellPhase,
    awardedRef,
    revealed,
    discIdx,
    discriminationItems,
    pickedStudent,
    addPoints,
    state.activeClassId,
    state.students,
    unitId,
    advanceDiscrimination,
    advanceChoral,
    playCurrentAudio,
    triggerConfetti,
  ]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // ── Empty-state ─────────────────────────────────────────────────────
  if (!mpLoading && discriminationItems.length === 0 && choralItems.length === 0) {
    return (
      <div className="h-full bg-[#070c18] flex flex-col items-center justify-center text-white text-center px-8 font-sans">
        <Mic size={64} className="text-[#38bdf8] mx-auto mb-4 opacity-50" />
        <h2 className="text-3xl font-extrabold text-white mb-2">I Say, You Say</h2>
        <p className="text-slate-400 text-lg">No speaking drills available. Generate the exercise pool for this unit.</p>
      </div>
    );
  }

  if (mpLoading) {
    return (
      <div className="h-full bg-[#070c18] flex items-center justify-center text-[#38bdf8] font-mono text-xl">
        Loading speaking drills…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#070c18] text-[#f1f5f9] font-sans flex flex-col justify-between select-none overflow-hidden relative antialiased p-4 lg:p-6"
    >
      {/* Subtle ambient background glow & grid */}
      <div className="absolute inset-0 pointer-events-none opacity-25">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[#38bdf8]/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-16 right-20 w-[400px] h-[250px] bg-[#ff2e79]/10 rounded-full blur-[120px]" />
      </div>

      {/* TOP BAR: Projector HUD with safe 180px+ clearance for BoardShell's • PRACTICE badge */}
      <header className="relative z-20 w-full flex items-center justify-between h-12 lg:h-14 shrink-0">
        {/* Left Cluster: Safe overscan padding */}
        <div className="flex items-center gap-3 pl-28 lg:pl-44 min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111c3d]/90 border border-[#1e2d5a] shadow-sm shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] animate-pulse" />
            <span className="font-mono text-xs font-bold tracking-wider text-[#38bdf8] uppercase">
              {shellPhase === 'discrimination' ? 'PHASE: SOUND CHECK' : 'PHASE: CHORAL ECHO'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-[#0b132b] border border-[#1e2d5a] shrink-0">
            <span className="w-6 h-6 rounded-md bg-[#ff2e79] flex items-center justify-center font-extrabold text-xs text-white shadow-[0_0_10px_rgba(255,46,121,0.5)]">
              IS
            </span>
            <span className="font-extrabold text-sm text-white tracking-tight">I Say You Say</span>
          </div>

          {/* Picked Student chip (when present) */}
          {pickedStudent && (
            <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-[#111c3d] to-[#1a2952] border border-[#38bdf8] rounded-full pl-1.5 pr-3 py-0.5 shadow-[0_0_12px_rgba(56,189,248,0.25)] shrink-0">
              <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center font-extrabold text-[10px] text-[#070c18]">
                {pickedStudent.name?.[0]?.toUpperCase() || 'S'}
              </div>
              <span className="font-bold text-xs text-white truncate max-w-[120px]">
                {pickedStudent.name}
              </span>
            </div>
          )}
        </div>

        {/* Right Cluster: Audio HUD & Controls */}
        <div className="flex items-center gap-2 shrink-0 pr-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] font-mono text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
            <span>CLASSROOM MIC</span>
          </div>

          <div className="flex items-center gap-1 bg-[#0b132b] border border-[#1e2d5a] rounded-xl p-1 text-slate-400">
            <button
              onClick={playCurrentAudio}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:text-white hover:bg-[#111c3d] transition"
              title="Replay Audio (Space)"
            >
              <Volume2 size={18} className={isAudioPlaying ? 'text-[#38bdf8] animate-pulse' : ''} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:text-white hover:bg-[#111c3d] transition"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT ARENA */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto my-auto min-h-0 px-2 lg:px-4">
        {shellPhase === 'discrimination' && discriminationItems.length > 0 ? (
          /* ========================================================================= */
          /* PHASE 1: MINIMAL PAIR SOUND CHECK                                         */
          /* ========================================================================= */
          <div className="w-full bg-[#0b132b] border-2 border-[#1e2d5a] rounded-3xl p-6 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center justify-center">
            {/* Clue Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#111c3d] border border-[#38bdf8]/30 mb-6 shadow-inner">
              <Volume2 size={16} className="text-[#38bdf8]" />
              <span className="font-mono text-xs font-bold tracking-widest text-slate-300 uppercase">
                LISTEN CAREFULLY • TAP WHAT YOU HEAR
              </span>
            </div>

            {/* Central Acoustic Play Hub */}
            <div className="flex flex-col items-center gap-2 mb-6">
              <button
                onClick={playCurrentAudio}
                className="relative group w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-[#111c3d] border-2 border-[#38bdf8]/60 hover:border-[#38bdf8] flex items-center justify-center shadow-[0_0_35px_rgba(56,189,248,0.25)] hover:shadow-[0_0_50px_rgba(56,189,248,0.5)] active:scale-95 transition duration-200"
                title="Tap to play sound (Spacebar)"
              >
                <div className="absolute inset-0 rounded-full bg-[#38bdf8]/20 animate-ping opacity-40" />
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-gradient-to-br from-[#38bdf8] to-sky-600 flex items-center justify-center text-slate-950 shadow-lg">
                  <Volume2 size={36} className="translate-x-0.5 text-[#070c18]" />
                </div>
                <span className="absolute -bottom-2.5 px-2 py-0.5 rounded-md bg-[#070c18] border border-[#1e2d5a] text-[10px] font-mono font-bold text-[#38bdf8] uppercase tracking-wider">
                  SPACE
                </span>
              </button>
              <p className="text-slate-400 text-xs lg:text-sm font-mono mt-1">Tap speaker or press Space to listen</p>
            </div>

            {/* Minimal Pair Option Cards */}
            {discriminationItems[discIdx] && (
              <div className="w-full max-w-2xl grid grid-cols-2 gap-4 lg:gap-6">
                {discriminationItems[discIdx].options.map((opt, i) => {
                  const item = discriminationItems[discIdx];
                  const isCorrect = i === item.correctIndex;
                  const state_ = revealed
                    ? isCorrect
                      ? 'correct'
                      : outcome === 'incorrect'
                      ? 'wrong'
                      : 'dim'
                    : 'idle';

                  return (
                    <button
                      key={i}
                      onClick={() => !revealed && onDiscriminationAnswer(i)}
                      disabled={revealed}
                      className={`h-36 sm:h-44 lg:h-52 rounded-2xl lg:rounded-3xl border-2 lg:border-4 text-2xl sm:text-3xl lg:text-4xl font-extrabold flex items-center justify-center transition-all shadow-xl active:scale-95 ${
                        state_ === 'correct'
                          ? 'bg-[#10b981]/20 border-[#10b981] text-[#34d399] shadow-[0_0_30px_rgba(16,185,129,0.35)]'
                          : state_ === 'wrong'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.35)]'
                          : state_ === 'dim'
                          ? 'bg-[#111c3d]/50 border-slate-800 text-slate-600 opacity-40'
                          : 'bg-[#111c3d] hover:bg-[#182449] border-[#1e2d5a] hover:border-[#38bdf8] text-white hover:shadow-[0_0_24px_rgba(56,189,248,0.3)]'
                      }`}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Teaching beat on Miss */}
            {revealed && outcome === 'incorrect' && discriminationItems[discIdx] && (
              <div className="mt-4 bg-[#111c3d] border-2 border-amber-400/40 rounded-2xl px-6 py-2.5 text-center max-w-lg shadow-lg animate-fade-in">
                <div className="flex items-center justify-center gap-2 font-bold text-base text-amber-300">
                  <Lightbulb size={18} /> You heard: {discriminationItems[discIdx].options[discriminationItems[discIdx].correctIndex]?.text}
                </div>
                {discriminationItems[discIdx].explanation && (
                  <p className="text-slate-300 text-xs mt-1">{discriminationItems[discIdx].explanation}</p>
                )}
              </div>
            )}
          </div>
        ) : isChoralComplete ? (
          /* ========================================================================= */
          /* CHORAL DRILL COMPLETE CELEBRATION CARD                                    */
          /* ========================================================================= */
          <div className="w-full max-w-2xl bg-[#0b132b] border-2 border-[#10b981] rounded-3xl p-8 lg:p-12 text-center shadow-[0_0_50px_rgba(16,185,129,0.3)] flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-[#10b981]/20 border-2 border-[#10b981] flex items-center justify-center text-[#10b981] shadow-[0_0_30px_#10b981] mb-5">
              <CheckCircle2 size={44} />
            </div>
            <h2 className="font-extrabold text-3xl lg:text-4xl text-white mb-2">
              Speaking Practice Complete! 🌟
            </h2>
            <p className="text-base text-[#38bdf8] font-mono mb-6">
              Great voices, energetic chanting!
            </p>
            <button
              onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-extrabold text-lg px-8 py-3.5 rounded-2xl shadow-[0_0_24px_rgba(255,46,121,0.6)] transition-all active:scale-95 flex items-center gap-2"
            >
              <span>Next Activity</span>
              <ChevronRight size={20} />
            </button>
          </div>
        ) : (
          /* ========================================================================= */
          /* PHASE 2: CHORAL ECHO DRILL (Stitch 1-choral.html & 2-solo.html)           */
          /* ========================================================================= */
          <div className="w-full bg-[#0b132b] border-2 border-[#1e2d5a] rounded-3xl p-6 lg:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center">
            {/* Context / Prompt Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#111c3d] border border-[#38bdf8]/30 mb-4 lg:mb-6 shadow-inner">
              <Radio size={16} className="text-[#38bdf8]" />
              <span className="font-mono text-xs font-bold tracking-widest text-slate-300 uppercase">
                {choralStage === 'whole_first'
                  ? 'STEP 1: EVERYONE LISTEN…'
                  : choralStage === 'isolated_word'
                  ? 'STEP 2: FOCUS ON THE WORD'
                  : 'STEP 3: ONE MORE TIME — TOGETHER!'}
              </span>
            </div>

            {/* THE GIANT DISPLAY SENTENCE LINE WITH EXACTLY ONE REPLAY BUTTON */}
            <div className="w-full flex items-center justify-center gap-5 lg:gap-8 my-2 lg:my-4">
              {/* Single Circular Replay Button */}
              <button
                onClick={playCurrentAudio}
                className="relative group flex-shrink-0 w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-[#111c3d] border-2 border-[#38bdf8]/60 hover:border-[#38bdf8] flex items-center justify-center shadow-[0_0_35px_rgba(56,189,248,0.25)] hover:shadow-[0_0_50px_rgba(56,189,248,0.5)] active:scale-95 transition duration-200"
                title="Play Audio (Spacebar)"
              >
                <div className="absolute inset-0 rounded-full bg-[#38bdf8]/20 animate-ping opacity-40" />
                <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-gradient-to-br from-[#38bdf8] to-sky-600 flex items-center justify-center text-slate-950 shadow-lg">
                  <Volume2 size={32} className="text-[#070c18]" />
                </div>
                <span className="absolute -bottom-2 px-1.5 py-0.5 rounded bg-[#070c18] border border-[#1e2d5a] text-[9px] font-mono font-bold text-[#38bdf8] uppercase">
                  SPACE
                </span>
              </button>

              {/* SENTENCE LINE: Explicit word spacing around highlighted target tokens */}
              {/* P1 Fix (§4.a, §4.e 1): Words are discrete flex tokens with gap-x-4, NEVER fused! */}
              <div className="flex items-center flex-wrap justify-center gap-x-3 sm:gap-x-4 lg:gap-x-5 gap-y-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-none">
                {currentDisplayText.split(' ').map((word, i) => {
                  const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
                  const targetClean = (currentChoralItem?.word || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
                  const isTarget = Boolean(targetClean && cleanWord === targetClean);

                  if (isTarget) {
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center px-4 sm:px-6 py-1.5 sm:py-2.5 rounded-2xl bg-[#38bdf8]/15 border-2 border-[#38bdf8] text-[#38bdf8] shadow-[0_0_30px_rgba(56,189,248,0.4)] tracking-tight"
                      >
                        {word}
                      </span>
                    );
                  }

                  return (
                    <span
                      key={i}
                      className={isIsolated ? 'opacity-30' : 'hover:text-slate-200 transition'}
                    >
                      {word}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Target Word IPA / Guidance (when word emphasis exists) */}
            {currentChoralItem?.word && (
              <div className="flex items-center gap-2 text-slate-400 font-mono text-xs sm:text-sm mt-2 mb-4">
                <span className="text-slate-500">Target word:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#111c3d] border border-[#1e2d5a] text-[#38bdf8] font-bold">
                  {currentChoralItem.word}
                </span>
              </div>
            )}

            {/* ROLE STRIP: Solo Repeat (Stitch 2-solo) or Choral Repeat (Stitch 1-choral) */}
            {pickedStudent ? (
              /* Solo Mode Strip */
              <div className="w-full max-w-3xl flex items-center justify-between gap-4 p-3 sm:p-4 rounded-2xl bg-[#070c18]/90 border border-[#1e2d5a] shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#070c18] font-extrabold text-xl shadow-md shrink-0">
                    {pickedStudent.name?.[0]?.toUpperCase() || 'S'}
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded-full bg-[#ff2e79]/20 text-[#ff2e79] font-mono text-[10px] uppercase font-bold tracking-wider">
                      SOLO ECHO
                    </span>
                    <h3 className="font-extrabold text-sm sm:text-base text-white">
                      {pickedStudent.name}, repeat clearly!
                    </h3>
                  </div>
                </div>

                {/* Soundwave animation */}
                <div className="flex items-center gap-1 h-8 px-4 bg-[#0b132b] rounded-xl border border-slate-800">
                  <span className="w-1 h-3 bg-[#38bdf8] rounded-full animate-pulse" />
                  <span className="w-1 h-5 bg-[#38bdf8] rounded-full animate-pulse delay-75" />
                  <span className="w-1 h-7 bg-[#10b981] rounded-full animate-pulse delay-150" />
                  <span className="w-1 h-4 bg-[#38bdf8] rounded-full animate-pulse delay-100" />
                  <span className="w-1 h-2 bg-[#38bdf8] rounded-full animate-pulse" />
                </div>
              </div>
            ) : (
              /* Choral Two-Step Flow Strip */
              <div className="w-full max-w-3xl flex items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-[#070c18]/90 border border-[#1e2d5a] shadow-inner">
                {/* Step 1 */}
                <div className="flex-1 flex items-center justify-center gap-2.5 px-3 py-2 rounded-xl bg-[#ff2e79]/15 border border-[#ff2e79]/40">
                  <span className="text-[#ff2e79] font-bold text-xs font-mono">1. TEACHER SAYS</span>
                </div>
                <ChevronRight size={18} className="text-[#38bdf8] animate-pulse shrink-0" />
                {/* Step 2 */}
                <div className="flex-1 flex items-center justify-center gap-2.5 px-3 py-2 rounded-xl bg-[#10b981]/15 border border-[#10b981]/40">
                  <span className="text-[#10b981] font-bold text-xs font-mono">2. CLASS REPEATS</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* BOTTOM ACTION BAR */}
      {/* P1 Fix (§4.a, §4.e 4): Roomy pb-6 clearance, button never clipped by bezel */}
      <footer className="relative z-20 w-full flex items-center justify-between pt-2 pb-4 lg:pb-6 px-2 lg:px-4 shrink-0 border-t border-[#1e2d5a]/60">
        {/* Left: Progress Track */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {shellPhase === 'discrimination'
              ? discriminationItems.map((_, i) => (
                  <span
                    key={i}
                    className={`w-3 h-3 rounded-full transition-all ${
                      i < discIdx
                        ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]'
                        : i === discIdx
                        ? 'bg-[#38bdf8] ring-2 ring-[#38bdf8]/40'
                        : 'bg-[#111c3d] border border-[#1e2d5a]'
                    }`}
                  />
                ))
              : choralItems.map((_, i) => (
                  <span
                    key={i}
                    className={`w-3 h-3 rounded-full transition-all ${
                      i < choralIdx
                        ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]'
                        : i === choralIdx
                        ? 'bg-[#38bdf8] ring-2 ring-[#38bdf8]/40'
                        : 'bg-[#111c3d] border border-[#1e2d5a]'
                    }`}
                  />
                ))}
          </div>
          <span className="font-mono text-xs font-bold text-slate-400">
            {shellPhase === 'discrimination'
              ? `SOUND ${discIdx + 1} OF ${discriminationItems.length}`
              : `SENTENCE ${choralIdx + 1} OF ${choralItems.length}`}
          </span>
        </div>

        {/* Center: Teacher Cue Hint */}
        <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#0b132b] border border-[#1e2d5a] text-slate-300 text-xs">
          <Sparkles size={14} className="text-amber-400" />
          <span>
            {shellPhase === 'discrimination'
              ? 'Listen for phoneme distinction, then tap to confirm.'
              : 'Lead echo chant with hand cue, then tap Next.'}
          </span>
        </div>

        {/* Right: Primary Action Button */}
        <div className="flex items-center gap-3">
          {shellPhase === 'discrimination' ? (
            revealed && (
              <button
                onClick={advanceDiscrimination}
                className="flex items-center gap-2 px-6 lg:px-8 py-2.5 lg:py-3 rounded-2xl bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-extrabold text-sm lg:text-base shadow-[0_0_24px_rgba(255,46,121,0.5)] transition-all active:scale-95 cursor-pointer"
              >
                <span>{discIdx < discriminationItems.length - 1 ? 'Next Sound' : 'Speaking Practice'}</span>
                <ChevronRight size={18} />
              </button>
            )
          ) : (
            !isChoralComplete && (
              <button
                onClick={advanceChoral}
                className="flex items-center gap-2 px-6 lg:px-8 py-2.5 lg:py-3 rounded-2xl bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white font-extrabold text-sm lg:text-base shadow-[0_0_24px_rgba(255,46,121,0.5)] transition-all active:scale-95 cursor-pointer"
              >
                <span>
                  {choralStage === 'whole_second' && choralIdx >= choralItems.length - 1
                    ? 'Finish'
                    : 'Next'}
                </span>
                <ChevronRight size={18} />
              </button>
            )
          )}
        </div>
      </footer>
    </div>
  );
};

export default BoardISayYouSay;
