// BoardWordDetective v3 — Vocabulary-in-context game
//
// Pedagogical Loop:
//   1. SHOW mystery clue (English-only prompt, auto-play audio, zero Chinese)
//   2. STUDENT investigates 1x4 landscape evidence cards (or cloze word tablets)
//   3. FEEDBACK: Case Solved emerald lock, big checkmark, +pts award, audio pronunciation
//   4. ESCALATE to next case file (harder context / closer distractors)
//
// Stitch Redesign (2026-09-11):
//   - 1x4 horizontal landscape card row (~4:3 aspect ratio), eliminating 2x2 vertical cropping.
//   - P1: Chinese translation stripped from challenge prompts across Board and Commander.
//   - P1: Auto-play clue audio on mount + full Remote/Commander Replay wiring.
//   - P2: Dynamic task instruction sub-labels per exercise type.
//   - P2: Cancellable transition timers preventing turn-bleeding.
//   - Safe 180px+ header clearance from BoardShell's • PRACTICE badge.
//   - Full @media (max-height: 450px) phone floor support.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  HelpCircle,
  Lightbulb,
  Maximize,
  Mic,
  Minimize,
  Radio,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Zap
} from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { useSpeech } from './useSpeech';
import { preloadRoundSpeech } from './speechPreload';
import type {
  PoolItem,
  SpellClozeContent,
  MeaningMatchContent,
  ImageSelectContent,
  AudioL1SelectContent
} from '../../../types/exercise';

interface VocabItem {
  poolItem: PoolItem;
  exerciseType: string;
  sentence: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string;
  audioUrl?: string;
  speechText?: string;
  explanation?: string;
}

// Helper to strip any Chinese characters or parentheses from the English challenge prompt
const cleanEnglishPrompt = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/\s*[(（][\u4e00-\u9fa5\s/]+[)）]/g, '')
    .replace(/\s*[\u4e00-\u9fa5]+/g, '')
    .trim();
};

const BoardWordDetective: React.FC<{ data?: any }> = ({ data }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const streakRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [phase, setPhase] = useState<'prompt' | 'revealing' | 'feedback' | 'complete'>('prompt');
  const [eliminatedIdx, setEliminatedIdx] = useState<number | null>(null);
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastAward, setLastAward] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  // Pull items from escalating pool
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'WORD_DETECTIVE',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 8,
  });

  // Normalize pool items into common VocabItem shape
  const vocabItems: VocabItem[] = useMemo(() => {
    const items: VocabItem[] = [];
    for (const pi of poolItems) {
      const content = pi.content as any;
      const explanation: string | undefined = content.explanation;

      if (pi.exercise_type === 'SPELL_CLOZE') {
        const cloze = content as SpellClozeContent;
        items.push({
          poolItem: pi,
          exerciseType: 'SPELL_CLOZE',
          sentence: cleanEnglishPrompt(cloze.sentence_with_blank),
          options: cloze.options,
          correctIndex: cloze.correct_index,
          audioUrl: cloze.audio_url,
          speechText: cloze.options[cloze.correct_index],
          explanation,
        });
      } else if (pi.exercise_type === 'MEANING_MATCH') {
        const match = content as MeaningMatchContent;
        items.push({
          poolItem: pi,
          exerciseType: 'MEANING_MATCH',
          sentence: `"${cleanEnglishPrompt(match.prompt)}" — which meaning fits?`,
          options: match.options,
          correctIndex: match.correct_index,
          audioUrl: match.prompt_audio,
          speechText: cleanEnglishPrompt(match.prompt),
          explanation,
        });
      } else if (pi.exercise_type === 'IMAGE_SELECT') {
        const img = content as ImageSelectContent;
        const hasImages = img.options?.every((o) => !!o.image_url);
        if (!hasImages) continue;
        items.push({
          poolItem: pi,
          exerciseType: 'IMAGE_SELECT',
          // P1 Fix (§2 Owner Bug, §3 F1, §4.e 1): Clean English prompt strictly, removing (岩石)
          sentence: cleanEnglishPrompt(img.prompt),
          options: img.options.map((o) => o.image_url),
          correctIndex: img.correct_index,
          audioUrl: img.prompt_audio,
          speechText: cleanEnglishPrompt(img.prompt),
          imageUrl: img.options[img.correct_index]?.image_url,
          explanation,
        });
      } else if (pi.exercise_type === 'AUDIO_L1_SELECT') {
        const a = content as AudioL1SelectContent;
        items.push({
          poolItem: pi,
          exerciseType: 'AUDIO_L1_SELECT',
          sentence: a.prompt_text ? cleanEnglishPrompt(a.prompt_text) : 'Listen — which meaning did you hear?',
          options: a.options,
          correctIndex: a.correct_index,
          audioUrl: a.audio_url,
          speechText: a.prompt_text ? cleanEnglishPrompt(a.prompt_text) : undefined,
          explanation,
        });
      }
    }

    // Deterministic option shuffle per turn
    const resetCount = state.resetCount ?? 0;
    const optsRng = makeRng('wd-options', unitId, turnId ?? 'practice', resetCount);
    for (const it of items) {
      if (!it.options || it.options.length < 2) continue;
      const idx = it.options.map((_: string, i: number) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(optsRng() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const newCorrect = idx.indexOf(it.correctIndex);
      it.options = idx.map((i) => it.options[i]);
      it.correctIndex = newCorrect;
    }
    return items;
  }, [poolItems, unitId, turnId, state.resetCount]);

  const currentItem = vocabItems[currentItemIdx];

  // Pre-warm TTS for round
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // Audio hook
  const { play: playCurrentSpeech } = useSpeech({
    text: currentItem?.speechText,
    audioUrl: currentItem?.audioUrl,
    unitId,
  });

  const playAudio = useCallback(() => {
    setIsAudioPlaying(true);
    if (currentItem?.audioUrl || currentItem?.speechText) {
      playCurrentSpeech();
    }
    setTimeout(() => setIsAudioPlaying(false), 1500);
  }, [currentItem, playCurrentSpeech]);

  // P1 Fix (§3 F4, §4.e 3): Auto-play audio on clue mount
  useEffect(() => {
    if (phase === 'prompt' && currentItem) {
      const t = setTimeout(() => {
        playAudio();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [currentItemIdx, phase, playAudio]);

  // Keyboard Spacebar replay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        playAudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playAudio]);

  // Reset state on new turn
  useEffect(() => {
    clearAdvanceTimer();
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    setStreak(0);
    setCurrentItemIdx(0);
    setSelectedWord(null);
    setPhase('prompt');
    setEliminatedIdx(null);
    setRevealedIdx(null);
  }, [turnId]);

  const advanceToNext = useCallback(() => {
    clearAdvanceTimer();
    if (currentItemIdx < vocabItems.length - 1) {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx((prev) => prev + 1);
      setSelectedWord(null);
      setPhase('prompt');
      setEliminatedIdx(null);
      setRevealedIdx(null);
    } else {
      setPhase('complete');
      playCue('win');
      triggerAction('SLIDE_COMPLETE', { forced: false });
    }
  }, [currentItemIdx, vocabItems.length, triggerAction]);

  // Teacher force correct
  const handleForceCorrect = useCallback(() => {
    if (!currentItem || phase !== 'prompt' || awardedRef.current || revealedIdx !== null) return;
    clearAdvanceTimer();
    const newStreak = streakRef.current + 1;
    streakRef.current = newStreak;
    setStreak(newStreak);
    if (newStreak === 3 || newStreak === 5) {
      playCue('streak');
      triggerConfetti();
    } else {
      playCue('correct');
    }
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || 1;
    const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, newStreak);
    setLastAward(points);
    awardedRef.current = true;
    if (picked) {
      addPoints(picked, points);
      logAttempt({
        state,
        picked,
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty,
        correctness: 'correct',
        modality: 'receptive',
        pushToRemediation,
      });
    }
    setSelectedWord(currentItem.correctIndex);
    setPhase('revealing');
    playAudio();
    advanceTimerRef.current = setTimeout(() => advanceToNext(), 900);
  }, [
    currentItem,
    phase,
    awardedRef,
    revealedIdx,
    streakRef,
    state,
    unitId,
    addPoints,
    pushToRemediation,
    advanceToNext,
    playAudio,
    triggerConfetti,
  ]);

  // Listen for remote events
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      clearAdvanceTimer();
      mistakesRef.current = 0;
      awardedRef.current = false;
      streakRef.current = 0;
      setStreak(0);
      setCurrentItemIdx(0);
      setSelectedWord(null);
      setPhase('prompt');
      setEliminatedIdx(null);
      setRevealedIdx(null);
    } else if (type === 'REVEAL_HINT') {
      if (currentItem && revealedIdx === null) {
        const wrongs = currentItem.options
          .map((_, i) => i)
          .filter((i) => i !== currentItem.correctIndex && i !== eliminatedIdx);
        if (wrongs.length > 1) {
          const draw = makeRng(seedBase, currentItem.poolItem?.id ?? currentItemIdx, 'hint')();
          setEliminatedIdx(wrongs[Math.floor(draw * wrongs.length)]);
        }
      }
    } else if (type === 'SKIP_ITEM' || type === 'SKIP') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      handleForceCorrect();
    } else if (type === 'REPLAY_AUDIO' || type === 'REPLAY' || type === 'FLIP_CARD') {
      playAudio();
    } else if (type === 'NEXT' || type === 'NEXT_ITEM') {
      if (phase === 'revealing' || phase === 'feedback') {
        advanceToNext();
      }
    } else if (type === 'SLIDE_COMPLETE') {
      setPhase('complete');
    }
  }, [
    state.lastAction,
    currentItem,
    revealedIdx,
    eliminatedIdx,
    seedBase,
    currentItemIdx,
    advanceToNext,
    handleForceCorrect,
    playAudio,
    phase,
  ]);

  // Option selection
  const handleWordSelect = (idx: number) => {
    if (!currentItem || phase !== 'prompt' || revealedIdx !== null || idx === eliminatedIdx) return;
    const correct = currentItem.correctIndex;
    clearAdvanceTimer();
    setSelectedWord(idx);

    if (idx === correct) {
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      setStreak(newStreak);
      if (newStreak === 3 || newStreak === 5) {
        playCue('streak');
        triggerConfetti();
      } else {
        playCue('correct');
      }
      const picked = state.quickWheelWinner;
      const difficulty = currentItem.poolItem.difficulty || 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, newStreak);
      setLastAward(points);
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: currentItem.poolItem.objective_id,
          exerciseType: currentItem.poolItem.exercise_type,
          difficulty,
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }

      setPhase('revealing');
      playAudio();

      // P2 Fix (§3 F8, §4.e 5): Wrap advance timeouts in cancellable advanceTimerRef
      advanceTimerRef.current = setTimeout(() => {
        setPhase('feedback');
        advanceTimerRef.current = setTimeout(() => {
          advanceToNext();
        }, 800);
      }, 900);
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      setStreak(0);
      playCue('wrong');
      const picked = state.quickWheelWinner;
      if (picked) {
        addPoints(picked, -MISTAKE_PENALTY);
      }
      logAttempt({
        state,
        picked: picked || '',
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty: currentItem.poolItem.difficulty || 1,
        correctness: 'incorrect',
        correct: false,
        modality: 'receptive',
        pushToRemediation,
      });

      if (mistakesRef.current >= 2) {
        // Second consecutive miss — reveal correct option, teach, then advance
        playCue('reveal');
        setRevealedIdx(correct);
        advanceTimerRef.current = setTimeout(() => advanceToNext(), 2400);
      } else {
        advanceTimerRef.current = setTimeout(() => setSelectedWord(null), 800);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Dynamic instruction sub-label per exercise type (§4.e 4)
  const getSubLabel = (type: string) => {
    switch (type) {
      case 'IMAGE_SELECT':
        return 'Find the matching evidence photo';
      case 'SPELL_CLOZE':
        return 'Choose the word that completes the case';
      case 'MEANING_MATCH':
        return 'Find the matching meaning';
      case 'AUDIO_L1_SELECT':
        return 'Listen carefully and identify the meaning';
      default:
        return 'Investigate the clue and find the match';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#070c18] text-[#38bdf8] font-mono text-xl">
        Loading vocabulary items…
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070c18] text-white p-8 text-center font-sans">
        <div className="w-16 h-16 rounded-full bg-[#111c3d] border border-[#38bdf8]/40 flex items-center justify-center text-[#38bdf8] mb-4">
          <Search size={32} />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2">Word Detective</h2>
        <p className="text-slate-400 text-lg max-w-md">
          No vocabulary items ready for this unit yet. Run the exercise generator or skip to the next slide.
        </p>
      </div>
    );
  }

  const isImageTask = Boolean(currentItem.imageUrl);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#070c18] text-[#f1f5f9] font-sans flex flex-col justify-between select-none overflow-hidden relative antialiased p-4 lg:p-6"
    >
      {/* Ambient background grid & glow */}
      <div className="absolute inset-0 pointer-events-none opacity-25">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-[#38bdf8]/10 rounded-full blur-[140px]" />
      </div>

      {/* TOP BAR: Safe 180px+ clearance from BoardShell's • PRACTICE badge */}
      <header className="relative z-20 w-full flex items-center justify-between h-12 lg:h-14 shrink-0">
        {/* Left Cluster: Clearance offset */}
        <div className="flex items-center gap-3 pl-28 lg:pl-44 min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111c3d]/90 border border-[#1e2d5a] shadow-sm shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] animate-pulse" />
            <span className="font-mono text-xs font-bold tracking-wider text-[#38bdf8] uppercase">
              PHASE: WORD DETECTIVE
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-[#0b132b] border border-[#1e2d5a] shrink-0">
            <Search size={16} className="text-[#ff2e79]" />
            <span className="font-extrabold text-sm text-white tracking-tight">Word Detective</span>
            <span className="text-xs px-2 py-0.5 rounded bg-[#111c3d] border border-[#1e2d5a] text-slate-400 font-mono">
              CASE {currentItemIdx + 1}/{vocabItems.length}
            </span>
          </div>

          {streak > 1 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0b132b] border border-[#10b981]/40 text-[#10b981] text-xs font-bold shrink-0">
              <Flame size={14} className="text-amber-400" />
              <span>STREAK: {streak}</span>
            </div>
          )}

          {pickedStudent && (
            <div className="hidden md:flex items-center gap-2 bg-[#111c3d] border border-[#38bdf8]/40 rounded-full pl-1.5 pr-3 py-0.5 shrink-0">
              <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center font-extrabold text-[10px] text-[#070c18]">
                {pickedStudent.name?.[0]?.toUpperCase() || 'S'}
              </div>
              <span className="font-bold text-xs text-white truncate max-w-[120px]">
                {pickedStudent.name}'s turn
              </span>
            </div>
          )}
        </div>

        {/* Right Cluster */}
        <div className="flex items-center gap-2 shrink-0 pr-2">
          <button
            onClick={playAudio}
            className="w-8 h-8 rounded-lg bg-[#0b132b] border border-[#1e2d5a] flex items-center justify-center text-slate-400 hover:text-white transition"
            title="Replay Audio (Space)"
          >
            <Volume2 size={18} className={isAudioPlaying ? 'text-[#38bdf8] animate-pulse' : ''} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-lg bg-[#0b132b] border border-[#1e2d5a] flex items-center justify-center text-slate-400 hover:text-white transition"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT ARENA: 16:9 projection, no vertical clipping */}
      <main className="relative z-10 w-full flex-1 flex flex-col justify-center max-w-[1720px] mx-auto px-2 lg:px-4 py-1 gap-3 lg:gap-4 min-h-0">
        {/* CLUE PROMPT BANNER */}
        <div className="w-full bg-gradient-to-r from-[#111c3d]/90 via-[#0b132b] to-[#111c3d]/90 border border-[#1e2d5a] rounded-2xl px-5 lg:px-7 py-3 flex items-center justify-between shadow-2xl relative overflow-hidden shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 ${
                phase === 'revealing' || phase === 'feedback'
                  ? 'bg-[#10b981]/20 border border-[#10b981]/50 text-[#10b981]'
                  : 'bg-[#38bdf8]/10 border border-[#38bdf8]/40 text-[#38bdf8]'
              }`}
            >
              {phase === 'revealing' || phase === 'feedback' ? <Check size={22} /> : <Search size={22} />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate">
                <span className="text-[11px] lg:text-xs uppercase tracking-widest font-mono font-semibold text-[#38bdf8]">
                  {phase === 'revealing' || phase === 'feedback' ? 'CASE SOLVED' : 'MYSTERY CLUE'}
                </span>
                <span className="text-xs text-slate-400 font-sans truncate">
                  • {getSubLabel(currentItem.exerciseType)}
                </span>
              </div>

              {/* CLUE TEXT: Strictly English, Zero Chinese (§4.e 1) */}
              <div className="flex items-baseline gap-3 mt-0.5 truncate">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight truncate drop-shadow-[0_2px_12px_rgba(56,189,248,0.25)]">
                  {currentItem.exerciseType === 'SPELL_CLOZE' && (phase === 'revealing' || phase === 'feedback')
                    ? currentItem.sentence.replace('___', currentItem.options[currentItem.correctIndex])
                    : currentItem.sentence}
                </h1>
              </div>
            </div>
          </div>

          {/* Right: Audio replay pill + Points Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={playAudio}
              className="inline-flex items-center gap-2 px-3.5 lg:px-4 py-2 rounded-full bg-[#38bdf8]/15 border border-[#38bdf8]/50 text-[#38bdf8] text-xs font-bold tracking-wide hover:bg-[#38bdf8]/25 transition-all shadow-[0_0_16px_rgba(56,189,248,0.3)] cursor-pointer"
            >
              <Volume2 size={16} />
              <span className="hidden sm:inline">HEAR CLUE</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#070c18] text-[#38bdf8] border border-[#38bdf8]/40">
                SPACE
              </span>
            </button>

            {phase === 'feedback' && (
              <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-400/50 text-amber-300 font-extrabold text-sm shadow-lg animate-bounce">
                <span>+{lastAward}</span>
                <span className="text-[10px] font-bold uppercase text-amber-200">PTS</span>
              </div>
            )}
          </div>
        </div>

        {/* 1x4 HORIZONTAL CARD ROW (Stitch 2-feedback.html, §4.e 2) */}
        {/* Replaces the 2x2 vertical stack, utilizing full 16:9 width without cropping */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-5 w-full items-stretch min-h-0 flex-1">
          {currentItem.options.map((option, idx) => {
            const isCorrect = idx === currentItem.correctIndex;
            const isSelected = selectedWord === idx;
            const isRevealed = revealedIdx === idx;
            const isEliminated = eliminatedIdx === idx;
            const isDimmed =
              (phase === 'revealing' || phase === 'feedback') && !isCorrect;

            let cardStateStyle = 'bg-[#111c3d] border-[#1e2d5a] hover:border-[#38bdf8] text-white';

            if (phase === 'revealing' || phase === 'feedback') {
              if (isCorrect) {
                cardStateStyle =
                  'bg-[#111c3d] border-2 border-[#10b981] shadow-[0_0_35px_rgba(16,185,129,0.45)] scale-[1.02] text-[#34d399]';
              } else {
                cardStateStyle = 'bg-[#111c3d]/40 border-slate-800 opacity-40 grayscale';
              }
            } else if (isSelected) {
              cardStateStyle = isCorrect
                ? 'bg-[#10b981]/20 border-2 border-[#10b981] text-[#34d399] shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                : 'bg-rose-500/20 border-2 border-rose-500 text-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.4)]';
            } else if (isRevealed) {
              cardStateStyle =
                'bg-amber-500/20 border-2 border-amber-400 text-amber-300 ring-4 ring-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.4)]';
            } else if (isEliminated) {
              cardStateStyle = 'bg-[#070c18] border-slate-800 text-slate-600 opacity-30 pointer-events-none line-through';
            }

            return (
              <button
                key={idx}
                onClick={() => handleWordSelect(idx)}
                disabled={phase !== 'prompt' || isEliminated || revealedIdx !== null}
                className={`relative rounded-2xl overflow-hidden border flex flex-col justify-between transition-all duration-300 shadow-xl active:scale-95 ${cardStateStyle}`}
              >
                {/* Image Option (~4:3 landscape ratio) */}
                {isImageTask ? (
                  <div className="relative w-full aspect-[4/3] bg-black overflow-hidden">
                    <img
                      src={option}
                      alt={`Evidence ${idx + 1}`}
                      className={`w-full h-full object-cover object-center transition-transform duration-300 ${
                        phase === 'prompt' ? 'hover:scale-105' : ''
                      }`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111c3d] via-transparent to-transparent opacity-80" />

                    {/* Top Option Badge */}
                    <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                      <span className="px-2 py-0.5 rounded bg-[#070c18]/80 backdrop-blur-md border border-slate-700 text-slate-300 font-mono font-bold text-[10px]">
                        OPTION {String.fromCharCode(65 + idx)}
                      </span>

                      {isCorrect && (phase === 'revealing' || phase === 'feedback') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#10b981] text-[#070c18] font-black text-[10px] uppercase shadow-lg">
                          <Check size={12} strokeWidth={3} /> MATCHED
                        </span>
                      )}

                      {isEliminated && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-950/90 text-rose-300 font-mono text-[9px] uppercase">
                          RULED OUT ✖
                        </span>
                      )}
                    </div>

                    {/* Centered Big Checkmark on Match */}
                    {isCorrect && (phase === 'revealing' || phase === 'feedback') && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 animate-scale-up">
                        <div className="w-16 h-16 rounded-full bg-[#10b981] border-4 border-white shadow-2xl flex items-center justify-center text-[#070c18] text-3xl font-black">
                          ✓
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Text Option Card (for SPELL_CLOZE, MEANING_MATCH) */
                  <div className="flex-1 flex flex-col justify-center items-center p-4 lg:p-6 text-center">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      OPTION {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                      {option}
                    </span>
                    {isEliminated && (
                      <span className="text-[10px] font-mono text-rose-400 mt-1 uppercase">
                        RULED OUT ✖
                      </span>
                    )}
                  </div>
                )}

                {/* Card Label Footer */}
                {isImageTask && (
                  <div className="p-3 bg-[#111c3d] border-t border-[#1e2d5a]/60 flex items-center justify-between shrink-0">
                    <div>
                      <h3 className="text-sm lg:text-base font-extrabold text-white tracking-wide truncate">
                        {isCorrect && (phase === 'revealing' || phase === 'feedback')
                          ? currentItem.sentence
                          : `Evidence ${String.fromCharCode(65 + idx)}`}
                      </h3>
                      <p className="text-[10px] font-mono text-slate-400">
                        {isCorrect && (phase === 'revealing' || phase === 'feedback')
                          ? 'TARGET DISCOVERED'
                          : 'CASE EVIDENCE'}
                      </p>
                    </div>
                    {isCorrect && (phase === 'revealing' || phase === 'feedback') && (
                      <div className="w-6 h-6 rounded-lg bg-[#10b981]/20 border border-[#10b981]/40 flex items-center justify-center text-[#10b981] font-bold text-xs">
                        ✓
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Reveal-on-wrong teaching beat */}
        {revealedIdx !== null && currentItem.explanation && (
          <div className="bg-[#111c3d] border-2 border-amber-400/40 rounded-2xl px-6 py-2.5 text-center max-w-xl mx-auto shadow-lg animate-fade-in shrink-0">
            <div className="flex items-center justify-center gap-2 font-bold text-sm text-amber-300">
              <Lightbulb size={16} /> Clue Explanation: {currentItem.explanation}
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM BAR: Auto-advance status / step dots / manual next */}
      <footer className="relative z-20 w-full h-14 lg:h-16 shrink-0 bg-[#0b132b]/90 border-t border-[#1e2d5a] rounded-2xl px-4 lg:px-6 flex items-center justify-between gap-4 shadow-2xl">
        {/* Left: Auto-advancing status or round progress */}
        <div className="flex items-center gap-3">
          {phase === 'revealing' || phase === 'feedback' ? (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
              <span className="text-xs font-mono font-bold tracking-wider text-[#10b981] uppercase">
                Solved! Next case…
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>CASE {currentItemIdx + 1} OF {vocabItems.length}</span>
              {streak > 0 && <span className="text-[#10b981] font-bold">• STREAK: {streak}</span>}
            </div>
          )}
        </div>

        {/* Center: Case Progress Tokens */}
        <div className="flex items-center gap-1.5">
          {vocabItems.map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-bold transition-all ${
                i < currentItemIdx
                  ? 'bg-[#10b981]/20 border border-[#10b981] text-[#10b981]'
                  : i === currentItemIdx
                  ? 'bg-[#38bdf8] text-[#070c18] ring-2 ring-[#38bdf8]/40 shadow-[0_0_10px_#38bdf8]'
                  : 'bg-[#111c3d] border border-[#1e2d5a] text-slate-600'
              }`}
            >
              {i < currentItemIdx ? '✓' : i + 1}
            </div>
          ))}
        </div>

        {/* Right: Manual Next / Skip Button */}
        <div className="flex items-center gap-2">
          {phase === 'revealing' || phase === 'feedback' ? (
            <button
              onClick={advanceToNext}
              className="px-5 py-2 rounded-xl bg-[#ff2e79] text-white font-extrabold text-xs tracking-wider uppercase flex items-center gap-1.5 shadow-[0_0_16px_rgba(255,46,121,0.5)] hover:bg-[#ff2e79]/90 active:scale-95 transition-all cursor-pointer"
            >
              <span>Next Clue</span>
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={advanceToNext}
              className="px-3.5 py-1.5 rounded-xl bg-[#111c3d] hover:bg-[#182449] border border-[#1e2d5a] text-slate-300 text-xs font-mono transition-all active:scale-95"
            >
              Skip →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default BoardWordDetective;
