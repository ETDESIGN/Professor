// BoardSoundLab — 3-phase listening game (v3 Acoustic Arena)
//
// Pedagogical Loop:
//   Phase 1 (Recognition): Auto-play audio (word) → Student taps matching 1x4 image card
//   Phase 2 (Discrimination): Auto-play audio (sentence) → Student selects matching sentence
//   Phase 3 (Production): Display target text → Student speaks → Speech recognition / 2-miss mercy
//
// v3 Redesign Features:
// - Auto-play on item mount with transparent replay metering (-1 pt after first free play)
// - 1x4 horizontal landscape card grid (aspect-[4/3]) eliminating 2x2 vertical cropping
// - Sight-reading leak prevented: captions hidden during active listening, revealed on feedback
// - Dynamic acoustic visualizer hub with ripple animations and SPACE replay shortcut
// - 3-step projector-calibrated progress nav with status badges
// - 2-miss speech production mercy scaffold + teacher override MARK_CORRECT
// - Full state resets on phase transitions, remote PLAY_AUDIO action support
// - Phone floor @media (max-height: 450px) calibration for 700x320 landscape

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2, Mic, MicOff, Check, CheckCircle, X,
  Sparkles, ChevronRight, Headphones, Flame, Lightbulb, RotateCcw
} from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useSpeechRecognition } from './useSpeechRecognition';
import { logAttempt } from './scoreAttempt';
import { shuffle } from './scoringUtils';
import { playCue } from './playCue';
import { useSpeech } from './useSpeech';
import { preloadRoundSpeech } from './speechPreload';
import type { PoolItem, ListenSelectContent, DictationContent, SpeakSentenceContent } from '../../../types/exercise';

type Phase = 1 | 2 | 3;

interface SoundItem {
  poolItem: PoolItem;
  audioUrl?: string;
  speechText?: string;
  options: string[];
  imageOptions?: { imageUrl: string; label?: string }[];
  correctIndex: number;
  imageUrl?: string;
  targetText?: string;
  explanation?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const BoardSoundLab: React.FC<{ data?: any }> = () => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();

  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const resolvedRef = useRef(false);
  const completeRef = useRef(false);
  const phase3MissesRef = useRef(0);
  const advanceTimerRef = useRef<any>(null);
  const lastAutoPlayKeyRef = useRef<string | null>(null);

  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [phase1Idx, setPhase1Idx] = useState(0);
  const [phase2Idx, setPhase2Idx] = useState(0);
  const [phase3Idx, setPhase3Idx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [replayCount, setReplayCount] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [phase3Revealed, setPhase3Revealed] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull listening pool
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'SOUND_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 12,
  });

  // Categorize items by phase
  const phase1Items: SoundItem[] = React.useMemo(() => {
    return poolItems
      .filter((pi) => pi.exercise_type === 'LISTEN_SELECT')
      .slice(0, 4)
      .map((pi) => {
        const content = pi.content as ListenSelectContent;
        return {
          poolItem: pi,
          audioUrl: content.audio_url,
          speechText: content.prompt_text,
          options: content.options.map((o) => o.label || o.image_url),
          imageOptions: content.options.map((o) => ({ imageUrl: o.image_url, label: o.label })),
          correctIndex: content.correct_index,
          imageUrl: content.options[content.correct_index]?.image_url,
          explanation: (content as any).explanation,
        };
      });
  }, [poolItems]);

  const phase2Items: SoundItem[] = React.useMemo(() => {
    const dictation = poolItems.filter((pi) => pi.exercise_type === 'DICTATION').slice(0, 3);
    const allTexts = dictation.map((pi) => (pi.content as DictationContent).correct_text);
    return dictation.map((pi) => {
      const content = pi.content as DictationContent;
      const distractors = allTexts.filter((t) => t !== content.correct_text).slice(0, 2);

      // F5 guard: ensure at least 2 distractors so quiz never collapses
      const rawOptions = [content.correct_text, ...distractors];
      if (rawOptions.length < 3) {
        const base = content.correct_text;
        const fallback1 = base.endsWith('.') ? base.slice(0, -1) + ' too.' : base + ' too.';
        const fallback2 = 'The ' + (base.toLowerCase().startsWith('the ') ? base.slice(4) : base);
        if (rawOptions.length < 2) rawOptions.push(fallback1);
        if (rawOptions.length < 3) rawOptions.push(fallback2);
      }
      const uniqueOptions = Array.from(new Set(rawOptions));
      const options = shuffle(uniqueOptions, makeRng(seedBase, pi.id, 'options'));
      return {
        poolItem: pi,
        audioUrl: content.audio_url,
        speechText: content.prompt_text || content.correct_text,
        options,
        correctIndex: options.indexOf(content.correct_text),
        targetText: content.correct_text,
        explanation: (content as any).explanation,
      };
    });
  }, [poolItems, seedBase]);

  const phase3Items: SoundItem[] = React.useMemo(() => {
    return poolItems
      .filter((pi) => pi.exercise_type === 'SPEAK_SENTENCE')
      .slice(0, 3)
      .map((pi) => {
        const content = pi.content as SpeakSentenceContent;
        return {
          poolItem: pi,
          audioUrl: content.target_audio || '',
          speechText: content.target_sentence,
          options: [],
          correctIndex: 0,
          targetText: content.target_sentence,
          explanation: (content as any).explanation,
        };
      });
  }, [poolItems]);

  const currentItem = currentPhase === 1 ? phase1Items[phase1Idx] : currentPhase === 2 ? phase2Items[phase2Idx] : phase3Items[phase3Idx];
  const totalPhaseItems = currentPhase === 1 ? phase1Items.length : currentPhase === 2 ? phase2Items.length : phase3Items.length;
  const currentItemIdx = currentPhase === 1 ? phase1Idx : currentPhase === 2 ? phase2Idx : phase3Idx;

  const hasAnyItems = phase1Items.length > 0 || phase2Items.length > 0 || phase3Items.length > 0;

  // Speech synthesiser / audio resolver
  const { play: playCurrentSpeech } = useSpeech({
    text: currentItem?.speechText,
    audioUrl: currentItem?.audioUrl,
    unitId,
  });

  // Warm TTS cache
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Skip empty phases safely
  useEffect(() => {
    if (allDone || !hasAnyItems || currentItem) return;
    if (currentPhase === 1 && phase1Items.length === 0) setCurrentPhase(2);
    else if (currentPhase === 2 && phase2Items.length === 0) setCurrentPhase(3);
    else if (currentPhase === 3 && phase3Items.length === 0) completeGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, hasAnyItems, currentItem, currentPhase, phase1Items.length, phase2Items.length, phase3Items.length]);

  // Unified play audio function
  const playAudio = () => {
    if (!currentItem?.audioUrl && !currentItem?.speechText) return;
    setIsPlayingAudio(true);
    playCurrentSpeech();
    setTimeout(() => setIsPlayingAudio(false), 1400);

    // Replays cost points AFTER the first free listen
    if (replayCount >= 1) {
      const picked = state.quickWheelWinner;
      if (picked) addPoints(picked, -MISTAKE_PENALTY);
    }
    setReplayCount((prev) => prev + 1);
  };

  // P1 Fix (§2, §3 F1, §4.b P1): Auto-Play once on item mount
  const autoPlayKey = currentItem ? `p${currentPhase}-${currentItem.poolItem.id}-${currentItemIdx}` : null;
  useEffect(() => {
    if (!autoPlayKey || allDone || resolvedRef.current || !currentItem) return;
    if (lastAutoPlayKeyRef.current === autoPlayKey) return;
    lastAutoPlayKeyRef.current = autoPlayKey;

    if (currentItem.audioUrl || currentItem.speechText) {
      setIsPlayingAudio(true);
      playCurrentSpeech();
      setTimeout(() => setIsPlayingAudio(false), 1400);
      // First play recorded so subsequent manual plays count as metered replays
      setReplayCount(1);
    }
  }, [autoPlayKey, allDone, currentItem, playCurrentSpeech]);

  // Speech recognition for Phase 3
  const {
    isListening,
    isSupported: speechSupported,
    startListening,
    score: speechScore,
    transcript: speechTranscript,
    passed: speechPassed,
  } = useSpeechRecognition({
    targetText: currentItem?.targetText || '',
    onResult: (score, transcript, passed) => {
      if (resolvedRef.current) return;
      if (passed) {
        itemSuccess('productive', Math.max(0.6, Math.min(1, score)));
        setPhaseComplete(true);
        advanceTimerRef.current = setTimeout(() => advancePhase3(), 2000);
      } else {
        itemFailure('productive');
        phase3MissesRef.current += 1;
        // P2 Fix (§3 F6, §4.b P2): 2-miss mercy scaffold
        if (phase3MissesRef.current >= 2) {
          playCue('reveal');
          resolvedRef.current = true;
          setPhase3Revealed(true);
          playCurrentSpeech();
          advanceTimerRef.current = setTimeout(() => {
            setPhase3Revealed(false);
            advancePhase3();
          }, 2400);
        }
      }
    },
  });

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    phase3MissesRef.current = 0;
    lastAutoPlayKeyRef.current = null;
    setCurrentPhase(1);
    setPhase1Idx(0);
    setPhase2Idx(0);
    setPhase3Idx(0);
    setSelectedOption(null);
    setReplayCount(0);
    setIsPlayingAudio(false);
    setPhaseComplete(false);
    setAllDone(false);
    setStreak(0);
    setRevealed(false);
    setPhase3Revealed(false);
  }, [turnId]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      phase3MissesRef.current = 0;
      lastAutoPlayKeyRef.current = null;
      setCurrentPhase(1);
      setPhase1Idx(0);
      setPhase2Idx(0);
      setPhase3Idx(0);
      setSelectedOption(null);
      setReplayCount(0);
      setIsPlayingAudio(false);
      setPhaseComplete(false);
      setAllDone(false);
      setStreak(0);
      setRevealed(false);
      setPhase3Revealed(false);
    } else if (type === 'SKIP_PHASE') {
      advancePhase();
    } else if (type === 'PLAY_AUDIO') {
      // P1 Fix (§3 F3): Remote & Commander audio replay
      playAudio();
    } else if (type === 'MARK_CORRECT') {
      markCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // Keyboard shortcut listener (SPACE for audio, A-D for options)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        playAudio();
        return;
      }

      if (resolvedRef.current || allDone) return;

      const code = e.code.toUpperCase();
      let optIdx = -1;
      if (code === 'KEYA' || code === 'DIGIT1') optIdx = 0;
      else if (code === 'KEYB' || code === 'DIGIT2') optIdx = 1;
      else if (code === 'KEYC' || code === 'DIGIT3') optIdx = 2;
      else if (code === 'KEYD' || code === 'DIGIT4') optIdx = 3;

      if (optIdx !== -1) {
        if (currentPhase === 1 && currentItem?.imageOptions && optIdx < currentItem.imageOptions.length) {
          handlePhase1Select(optIdx);
        } else if (currentPhase === 2 && currentItem?.options && optIdx < currentItem.options.length) {
          handlePhase2Select(optIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPhase, currentItem, allDone, replayCount]);

  // Scoring handlers
  const itemSuccess = (modality: 'receptive' | 'productive', partialRatio = 1.0) => {
    if (!currentItem || resolvedRef.current) return;
    resolvedRef.current = true;
    playCue('correct');
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    if (nextStreak === 3 || nextStreak === 5) {
      playCue('streak');
      triggerConfetti();
    }
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || (modality === 'productive' ? 3 : 1);
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialRatio, nextStreak);
    if (picked && !awardedRef.current) {
      awardedRef.current = true;
      if (points > 0) addPoints(picked, points);
      logAttempt({
        state,
        picked,
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty,
        correctness: partialRatio >= 1 ? 'correct' : 'partial',
        modality,
        pushToRemediation,
      });
    }
  };

  const itemFailure = (modality: 'receptive' | 'productive') => {
    if (!currentItem || resolvedRef.current) return;
    playCue('wrong');
    setStreak(0);
    mistakesRef.current += 1;
    const picked = state.quickWheelWinner;
    if (picked) addPoints(picked, -MISTAKE_PENALTY);
    logAttempt({
      state,
      picked: picked || '',
      unitId,
      objectiveId: currentItem.poolItem.objective_id,
      exerciseType: currentItem.poolItem.exercise_type,
      difficulty: currentItem.poolItem.difficulty || (modality === 'productive' ? 3 : 1),
      correctness: 'incorrect',
      correct: false,
      modality,
      pushToRemediation,
    });
  };

  const revealAnswer = (advance: () => void) => {
    playCue('reveal');
    resolvedRef.current = true;
    setRevealed(true);
    advanceTimerRef.current = setTimeout(() => {
      setRevealed(false);
      advance();
    }, 2200);
  };

  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setAllDone(true);
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  const markCorrect = () => {
    if (!currentItem || resolvedRef.current || completeRef.current) return;
    if (currentPhase !== 3) setSelectedOption(currentItem.correctIndex);
    itemSuccess(currentPhase === 3 ? 'productive' : 'receptive', 1.0);
    setPhaseComplete(true);
    advanceTimerRef.current = setTimeout(() => advancePhase(), 900);
  };

  const handlePhase1Select = (idx: number) => {
    if (!currentItem || currentPhase !== 1 || resolvedRef.current) return;
    const correct = currentItem.correctIndex;
    setSelectedOption(idx);

    if (idx === correct) {
      itemSuccess('receptive');
      setPhaseComplete(true);
      advanceTimerRef.current = setTimeout(() => advancePhase1(), 1200);
    } else {
      itemFailure('receptive');
      if (mistakesRef.current >= 2) {
        revealAnswer(() => advancePhase1());
      } else {
        advanceTimerRef.current = setTimeout(() => setSelectedOption(null), 800);
      }
    }
  };

  const handlePhase2Select = (idx: number) => {
    if (!currentItem || currentPhase !== 2 || resolvedRef.current) return;
    const correct = currentItem.correctIndex;
    setSelectedOption(idx);

    if (idx === correct) {
      itemSuccess('receptive');
      setPhaseComplete(true);
      advanceTimerRef.current = setTimeout(() => advancePhase2(), 1200);
    } else {
      itemFailure('receptive');
      if (mistakesRef.current >= 2) {
        revealAnswer(() => advancePhase2());
      } else {
        advanceTimerRef.current = setTimeout(() => setSelectedOption(null), 800);
      }
    }
  };

  const advancePhase1 = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    if (phase1Idx < phase1Items.length - 1) {
      setPhase1Idx((prev) => prev + 1);
      setSelectedOption(null);
      setReplayCount(0);
      setPhaseComplete(false);
    } else {
      setCurrentPhase(2);
      setPhase2Idx(0);
      setSelectedOption(null);
      setReplayCount(0);
      setPhaseComplete(false);
    }
  };

  const advancePhase2 = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    if (phase2Idx < phase2Items.length - 1) {
      setPhase2Idx((prev) => prev + 1);
      setSelectedOption(null);
      setReplayCount(0);
      setPhaseComplete(false);
    } else {
      setCurrentPhase(3);
      setPhase3Idx(0);
      setSelectedOption(null);
      setReplayCount(0);
      setPhaseComplete(false);
    }
  };

  // P3 Fix (§3 F7): Full state reset on Phase 3 advances
  const advancePhase3 = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    phase3MissesRef.current = 0;
    setSelectedOption(null);
    setReplayCount(0);
    setPhase3Revealed(false);
    if (phase3Idx < phase3Items.length - 1) {
      setPhase3Idx((prev) => prev + 1);
      setPhaseComplete(false);
    } else {
      completeGame();
    }
  };

  const advancePhase = () => {
    if (currentPhase === 1) advancePhase1();
    else if (currentPhase === 2) advancePhase2();
    else advancePhase3();
  };

  // Total classroom score
  const classScore = (state.students || []).reduce((acc: number, s: any) => acc + (s.points || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#070c18] text-on-surface">
        <div className="flex items-center gap-3 text-2xl text-[#38bdf8] font-headline">
          <span className="w-4 h-4 rounded-full bg-[#38bdf8] animate-ping" />
          Loading Acoustic Lab…
        </div>
      </div>
    );
  }

  if (!hasAnyItems) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070c18] text-on-surface p-8 text-center">
        <div className="text-7xl mb-6">🎧</div>
        <h2 className="text-4xl font-extrabold text-[#38bdf8] mb-3 font-headline">Sound Lab</h2>
        <div className="text-xl text-slate-400 max-w-xl">
          No listening items found for this unit. Pre-generate exercises in Unit Studio or advance to the next slide.
        </div>
      </div>
    );
  }

  if (!currentItem && !allDone) return null;

  const allComplete = allDone || (currentPhase === 3 && phase3Idx >= phase3Items.length && phase3Items.length > 0 && phaseComplete);

  // Metered replay label & cost
  const isReplayCharged = replayCount >= 1 && Boolean(pickedStudent);
  const replayCostBadge = replayCount === 0 ? 'Free' : isReplayCharged ? '-1 pt' : 'Free';

  return (
    <div className="relative flex flex-col justify-between h-full w-full bg-[#070c18] text-slate-100 font-body p-3 md:p-5 select-none overflow-hidden antialiased">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#ff2d78]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#00ffcc]/10 rounded-full blur-3xl pointer-events-none" />

      {/* ================= TOP NAVIGATION & 3-STEP PROGRESS BAR ================= */}
      <header className="relative z-10 w-full shrink-0 flex items-center justify-between px-3 py-2 bg-[#0f0f1a]/80 border border-slate-800 backdrop-blur-md rounded-2xl pl-28 lg:pl-44 shadow-lg">
        {/* Left: Mode Chip */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1e30] border border-[#00ffcc]/40 text-[#00ffcc] font-mono text-xs uppercase font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-ping" />
            <span>SOUND LAB</span>
          </div>
          {pickedStudent ? (
            <div className="hidden sm:flex items-center gap-2 bg-[#141422] px-3 py-1 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-mono text-xs text-slate-300">
                {pickedStudent.name}&apos;s turn
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 bg-[#141422] px-3 py-1 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-[#00ffcc]" />
              <span className="font-mono text-xs text-[#00ffcc]">Choral Mode</span>
            </div>
          )}
        </div>

        {/* Center: 3-STEP PROGRESS NAV (Prominent projector ladder) */}
        <nav className="flex items-center gap-1.5 sm:gap-2 bg-[#0a0a12]/90 px-3 py-1 rounded-full border border-slate-800 shadow-inner">
          {/* Step 1: Listen & Tap */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              currentPhase === 1
                ? 'bg-[#00ffcc]/20 border border-[#00ffcc] text-[#00ffcc] shadow-[0_0_12px_rgba(0,255,204,0.3)]'
                : currentPhase > 1
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono bg-black/40">
              {currentPhase > 1 ? <Check size={10} className="stroke-[3]" /> : '1'}
            </span>
            <span className="hidden md:inline">Listen &amp; Tap</span>
          </div>

          <ChevronRight size={14} className="text-slate-600" />

          {/* Step 2: Listen & Match */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              currentPhase === 2
                ? 'bg-[#00ffcc]/20 border border-[#00ffcc] text-[#00ffcc] shadow-[0_0_12px_rgba(0,255,204,0.3)]'
                : currentPhase > 2
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono bg-black/40">
              {currentPhase > 2 ? <Check size={10} className="stroke-[3]" /> : '2'}
            </span>
            <span className="hidden md:inline">Listen &amp; Match</span>
          </div>

          <ChevronRight size={14} className="text-slate-600" />

          {/* Step 3: Hear & Say */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              currentPhase === 3
                ? 'bg-[#ff2d78]/20 border border-[#ff2d78] text-[#ff2d78] shadow-[0_0_12px_rgba(255,45,120,0.3)]'
                : 'text-slate-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono bg-black/40">
              3
            </span>
            <span className="hidden md:inline">Hear &amp; Say</span>
          </div>
        </nav>

        {/* Right: Round Info */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400 bg-[#141422] px-2.5 py-1 rounded border border-slate-800">
            {currentItemIdx + 1} / {totalPhaseItems}
          </span>
        </div>
      </header>

      {/* ================= MAIN PROJECTOR CANVAS ================= */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center gap-2 md:gap-4 w-full max-w-7xl mx-auto my-1">
        <AnimatePresence mode="wait">
          {!allComplete && currentItem && (
            <motion.div
              key={`phase-${currentPhase}-item-${currentItemIdx}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full flex flex-col items-center justify-center"
            >
              {/* CENTER ACOUSTIC HUB (Dynamic Equalizer & Replay Centerpiece) */}
              <section aria-label="Acoustic Center" className="flex flex-col items-center justify-center text-center relative w-full mb-1">
                <div className="relative flex items-center justify-center mb-1">
                  {/* Glowing Concentric Ripples during audio */}
                  {isPlayingAudio && (
                    <>
                      <div className="absolute w-28 h-28 md:w-36 md:h-36 rounded-full border border-[#00ffcc]/40 animate-ping pointer-events-none" />
                      <div className="absolute w-24 h-24 md:w-32 md:h-32 rounded-full border border-[#ff2d78]/30 animate-pulse pointer-events-none" />
                    </>
                  )}

                  {/* Center Audio Replay Button */}
                  <button
                    onClick={playAudio}
                    className={`relative group z-10 w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#1a1a2e] border-2 transition-all duration-300 hover:scale-105 active:scale-95 flex flex-col items-center justify-center shadow-2xl focus:outline-none ${
                      isPlayingAudio
                        ? 'border-[#00ffcc] text-[#00ffcc] shadow-[0_0_24px_rgba(0,255,204,0.5)]'
                        : 'border-[#38bdf8] text-[#38bdf8] hover:border-[#00ffcc] hover:text-[#00ffcc]'
                    }`}
                    type="button"
                    title="Play Audio (SPACE)"
                  >
                    <Volume2
                      size={28}
                      className={`transition-transform duration-300 ${isPlayingAudio ? 'scale-115 animate-bounce' : 'group-hover:scale-110'}`}
                    />
                    <span className="font-mono text-[9px] tracking-wider uppercase mt-0.5 text-slate-400 group-hover:text-[#00ffcc]">
                      [SPACE]
                    </span>
                  </button>
                </div>

                {/* Dynamic Frequency Visualizer */}
                <div className="flex items-center gap-1 h-6 mb-1 px-3 py-0.5 rounded-full bg-[#141422]/80 border border-slate-800">
                  <span className={`w-1 rounded-full bg-[#00ffcc] transition-all duration-200 ${isPlayingAudio ? 'h-5 animate-pulse' : 'h-2'}`} />
                  <span className={`w-1 rounded-full bg-[#38bdf8] transition-all duration-200 ${isPlayingAudio ? 'h-6 animate-pulse' : 'h-3'}`} />
                  <span className={`w-1 rounded-full bg-[#ff2d78] transition-all duration-200 ${isPlayingAudio ? 'h-4 animate-pulse' : 'h-1.5'}`} />
                  <span className={`w-1 rounded-full bg-[#00ffcc] transition-all duration-200 ${isPlayingAudio ? 'h-6 animate-pulse' : 'h-2.5'}`} />
                  <span className={`w-1 rounded-full bg-[#38bdf8] transition-all duration-200 ${isPlayingAudio ? 'h-3 animate-pulse' : 'h-1.5'}`} />
                </div>

                {/* Challenge Headline */}
                <h1 className="font-headline font-extrabold text-xl md:text-3xl text-white tracking-tight">
                  {currentPhase === 1 && (
                    <>
                      Listen… which picture <span className="text-[#00ffcc] drop-shadow-[0_0_12px_rgba(0,255,204,0.5)]">matches</span> the word?
                    </>
                  )}
                  {currentPhase === 2 && (
                    <>
                      Listen… which sentence did you <span className="text-[#00ffcc] drop-shadow-[0_0_12px_rgba(0,255,204,0.5)]">hear</span>?
                    </>
                  )}
                  {currentPhase === 3 && (
                    <>
                      Your turn to <span className="text-[#ff2d78] drop-shadow-[0_0_12px_rgba(255,45,120,0.5)]">speak</span>!
                    </>
                  )}
                </h1>
              </section>

              {/* PHASE 1: 1x4 HORIZONTAL LANDSCAPE CARDS */}
              {currentPhase === 1 && (
                <section aria-label="Image Options" className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 px-2">
                  {(currentItem.imageOptions || []).map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === currentItem.correctIndex;
                    const isRevealedAnswer = revealed && isCorrect;
                    const showLabel = revealed || selectedOption !== null;

                    let borderStyle = 'border-slate-800 hover:border-[#00ffcc] hover:shadow-[0_0_16px_rgba(0,255,204,0.3)]';
                    if (isSelected) {
                      borderStyle = isCorrect
                        ? 'border-2 border-[#00ffcc] shadow-[0_0_24px_rgba(0,255,204,0.6)] -translate-y-1'
                        : 'border-2 border-[#ff2d78] shadow-[0_0_20px_rgba(255,45,120,0.5)]';
                    } else if (isRevealedAnswer) {
                      borderStyle = 'border-2 border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.6)] animate-pulse';
                    }

                    return (
                      <article
                        key={idx}
                        onClick={() => handlePhase1Select(idx)}
                        className={`group relative rounded-2xl overflow-hidden bg-[#141422] border transition-all duration-300 aspect-[4/3] flex flex-col justify-end shadow-xl cursor-pointer ${borderStyle}`}
                        role="button"
                        tabIndex={0}
                      >
                        {/* Background Image */}
                        <div className="absolute inset-0 z-0">
                          <img
                            src={opt.imageUrl}
                            alt={opt.label || `Option ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12]/95 via-[#0a0a12]/20 to-transparent" />
                        </div>

                        {/* Letter Badge */}
                        <div
                          className={`absolute top-2.5 left-2.5 z-10 w-8 h-8 md:w-10 md:h-10 rounded-xl font-headline font-extrabold text-base md:text-lg flex items-center justify-center backdrop-blur-md border transition-all ${
                            isSelected && isCorrect
                              ? 'bg-[#00ffcc] text-[#0a0a12] border-[#00ffcc] shadow-[0_0_12px_#00ffcc]'
                              : isSelected && !isCorrect
                              ? 'bg-[#ff2d78] text-white border-[#ff2d78]'
                              : isRevealedAnswer
                              ? 'bg-amber-400 text-slate-900 border-amber-400 shadow-[0_0_12px_#fbbf24]'
                              : 'bg-[#1e1e30]/80 border-slate-700 text-slate-200 group-hover:border-[#00ffcc] group-hover:text-[#00ffcc]'
                          }`}
                        >
                          {OPTION_LETTERS[idx]}
                        </div>

                        {/* Selection check or cross badge */}
                        {isSelected && (
                          <div
                            className={`absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-full font-mono text-xs font-bold flex items-center gap-1 shadow-lg ${
                              isCorrect ? 'bg-[#00ffcc] text-[#0a0a12]' : 'bg-[#ff2d78] text-white'
                            }`}
                          >
                            {isCorrect ? <Check size={12} className="stroke-[3]" /> : <X size={12} className="stroke-[3]" />}
                            <span>{isCorrect ? 'CORRECT' : 'TRY AGAIN'}</span>
                          </div>
                        )}

                        {/* Auditory Purity: Word caption is HIDDEN during listening, revealed on feedback */}
                        {showLabel ? (
                          <div className="relative z-10 p-2.5 md:p-3 bg-[#1e1e30]/95 backdrop-blur-md border-t border-slate-700 flex items-center justify-between animate-fadeIn">
                            <span className="font-headline font-extrabold text-base md:text-xl text-[#00ffcc] tracking-wide uppercase truncate">
                              {opt.label || `Option ${idx + 1}`}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playAudio();
                              }}
                              className="w-7 h-7 rounded-lg bg-[#00ffcc] text-[#0a0a12] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shrink-0 ml-1"
                              title="Replay Audio"
                            >
                              <Volume2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative z-10 p-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="font-mono text-[10px] text-[#00ffcc] uppercase tracking-wider">
                              Press {OPTION_LETTERS[idx]}
                            </span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              )}

              {/* PHASE 2: 3 STACKED HORIZONTAL SENTENCE CARDS */}
              {currentPhase === 2 && (
                <section aria-label="Sentence Discrimination Options" className="w-full max-w-3xl flex flex-col gap-3 px-2">
                  {currentItem.options.map((option, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === currentItem.correctIndex;
                    const isRevealedAnswer = revealed && isCorrect;

                    let cardClass = 'bg-[#141422] border-slate-800 text-slate-200 hover:border-[#00ffcc] hover:bg-[#1a1a2e]';
                    if (isSelected) {
                      cardClass = isCorrect
                        ? 'bg-[#00ffcc]/20 border-2 border-[#00ffcc] text-[#00ffcc] shadow-[0_0_20px_rgba(0,255,204,0.4)]'
                        : 'bg-[#ff2d78]/20 border-2 border-[#ff2d78] text-[#ff2d78] shadow-[0_0_16px_rgba(255,45,120,0.4)]';
                    } else if (isRevealedAnswer) {
                      cardClass = 'bg-amber-400/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)] animate-pulse';
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handlePhase2Select(idx)}
                        className={`w-full p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between text-left shadow-lg cursor-pointer ${cardClass}`}
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          <span
                            className={`w-9 h-9 md:w-10 md:h-10 rounded-xl font-headline font-extrabold text-base md:text-lg flex items-center justify-center shrink-0 border ${
                              isSelected && isCorrect
                                ? 'bg-[#00ffcc] text-[#0a0a12] border-[#00ffcc]'
                                : isSelected && !isCorrect
                                ? 'bg-[#ff2d78] text-white border-[#ff2d78]'
                                : 'bg-[#1e1e30] border-slate-700 text-slate-300'
                            }`}
                          >
                            {OPTION_LETTERS[idx]}
                          </span>
                          <span className="font-headline font-bold text-base md:text-xl tracking-wide">
                            {option}
                          </span>
                        </div>

                        {isSelected && (
                          <div className="shrink-0 ml-2">
                            {isCorrect ? (
                              <CheckCircle size={24} className="text-[#00ffcc]" />
                            ) : (
                              <X size={24} className="text-[#ff2d78]" />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </section>
              )}

              {/* PHASE 3: VOICE PRODUCTION WITH 2-MISS MERCY */}
              {currentPhase === 3 && (
                <section aria-label="Speech Production Arena" className="w-full max-w-2xl flex flex-col items-center gap-4 px-2">
                  {/* Target Sentence Card */}
                  <div
                    className={`w-full p-6 rounded-2xl bg-[#141422] border text-center transition-all duration-300 shadow-2xl ${
                      phase3Revealed
                        ? 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.6)] bg-amber-500/10'
                        : speechPassed
                        ? 'border-[#00ffcc] shadow-[0_0_24px_rgba(0,255,204,0.5)]'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="font-mono text-xs uppercase tracking-wider text-slate-400 mb-2">
                      Target Sentence
                    </div>
                    <div className="font-headline font-extrabold text-2xl md:text-4xl text-white tracking-wide">
                      {currentItem.targetText}
                    </div>

                    {phase3Revealed && (
                      <div className="mt-3 inline-flex items-center gap-2 text-amber-300 font-bold text-sm bg-amber-400/20 px-3 py-1 rounded-full">
                        <Lightbulb size={16} />
                        Model Sentence Revealed · Advancing…
                      </div>
                    )}
                  </div>

                  {/* Mic & Recognition Area */}
                  {!speechSupported ? (
                    <div className="text-center p-4 bg-[#141422] rounded-xl border border-slate-800 text-slate-400">
                      <MicOff size={36} className="mx-auto mb-2 text-slate-500" />
                      <div>Speech recognition is not supported in this browser.</div>
                      <button
                        onClick={markCorrect}
                        className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm"
                      >
                        Teacher Override: Mark Correct ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <button
                        onClick={startListening}
                        disabled={isListening || phase3Revealed}
                        className={`group relative px-8 py-4 rounded-full font-headline font-extrabold text-lg md:text-xl flex items-center gap-3 shadow-2xl transition-all duration-300 active:scale-95 cursor-pointer ${
                          isListening
                            ? 'bg-[#ff2d78] text-white animate-pulse shadow-[0_0_24px_rgba(255,45,120,0.6)]'
                            : 'bg-[#00ffcc] text-[#0a0a12] hover:bg-[#00ffcc]/90 shadow-[0_0_20px_rgba(0,255,204,0.4)]'
                        }`}
                      >
                        <Mic size={26} className={isListening ? 'animate-bounce' : ''} />
                        <span>{isListening ? 'Listening… Speak Now!' : 'Tap to Speak 🎤'}</span>
                      </button>

                      {/* Live Speech Feedback */}
                      {speechTranscript && (
                        <div className="w-full p-4 rounded-xl bg-[#141422] border border-slate-800 text-center animate-fadeIn">
                          <div className="text-xs font-mono text-slate-400 mb-1">Detected Speech:</div>
                          <div className="text-lg md:text-xl font-bold text-slate-200 mb-2">
                            &ldquo;{speechTranscript}&rdquo;
                          </div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1e30] border border-slate-700">
                            <span className="text-xs font-mono text-slate-400">Similarity:</span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                speechPassed ? 'text-[#00ffcc]' : 'text-[#ff2d78]'
                              }`}
                            >
                              {Math.round((speechScore || 0) * 100)}%
                            </span>
                            {speechPassed && <Check size={14} className="text-[#00ffcc]" />}
                          </div>
                        </div>
                      )}

                      {/* Teacher instant pronunciation override */}
                      <button
                        onClick={markCorrect}
                        className="text-xs font-mono text-slate-400 hover:text-[#00ffcc] underline underline-offset-4 cursor-pointer mt-1"
                      >
                        Teacher Override: Accept Pronunciation ✓
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Reveal-on-wrong teaching explanation */}
              {revealed && currentItem.explanation && (
                <div className="mt-3 p-3 bg-amber-500/15 border border-amber-400/40 rounded-xl text-center max-w-lg mx-auto text-amber-200 text-sm animate-fadeIn">
                  <div className="flex items-center justify-center gap-2 font-bold">
                    <Lightbulb size={16} />
                    <span>{currentItem.explanation}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ALL PHASES COMPLETE CELEBRATION */}
          {allComplete && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center p-8 bg-[#141422]/90 border border-slate-800 rounded-3xl backdrop-blur-md shadow-2xl"
            >
              <div className="w-20 h-20 rounded-full bg-[#00ffcc]/20 border-2 border-[#00ffcc] flex items-center justify-center text-4xl mb-4 shadow-[0_0_24px_rgba(0,255,204,0.4)]">
                🎧
              </div>
              <h2 className="font-headline font-extrabold text-3xl md:text-5xl text-white mb-2">
                Sound Lab Mastered!
              </h2>
              <p className="text-slate-400 text-lg max-w-md mb-6">
                All 3 listening &amp; speaking phases completed with flying colors! 🌟
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e1e30] border border-slate-700 text-[#00ffcc] font-mono font-bold text-sm">
                <Sparkles size={16} />
                <span>Classroom Streak: {streak} in a row</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ================= PROJECTOR HUD BOTTOM FOOTER BAR ================= */}
      <footer className="relative z-10 w-full shrink-0 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#0f0f1a]/90 border border-slate-800 rounded-2xl backdrop-blur-md shadow-lg">
          {/* Left: Class Score & Streak */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-base">★</span>
              <span className="font-headline font-bold text-xs text-slate-300">Class Score:</span>
              <span className="font-mono font-bold text-xs text-amber-400">{classScore} pts</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🔥</span>
              <span className="font-headline font-bold text-xs text-slate-300">Streak:</span>
              <span className="font-mono font-bold text-xs text-[#ff2d78]">{streak}</span>
            </div>
          </div>

          {/* Center: Stage Cue */}
          <div className="hidden lg:flex items-center gap-2 bg-[#141422] px-3 py-1 rounded-lg border border-slate-800">
            <Headphones size={14} className="text-[#00ffcc]" />
            <span className="font-mono text-xs text-slate-400">
              {currentPhase === 1 && 'Phase 1: Pure Auditory Tap'}
              {currentPhase === 2 && 'Phase 2: Sentence Discrimination'}
              {currentPhase === 3 && 'Phase 3: Articulation & Speech'}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={playAudio}
              className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-700 hover:border-[#00ffcc] text-slate-300 hover:text-white font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
              type="button"
            >
              <Volume2 size={15} />
              <span>Replay</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-normal ${
                  replayCostBadge === '-1 pt'
                    ? 'bg-[#ff2d78]/20 text-[#ff2d78] border border-[#ff2d78]/40'
                    : 'bg-[#00ffcc]/20 text-[#00ffcc]'
                }`}
              >
                {replayCostBadge}
              </span>
            </button>

            <button
              onClick={advancePhase}
              className="group relative px-4 py-1.5 rounded-xl bg-[#ff2d78] hover:bg-[#ff2d78]/90 text-white font-headline font-bold text-xs tracking-wide transition-all shadow-[0_0_16px_rgba(255,45,120,0.4)] active:scale-95 flex items-center gap-1.5 cursor-pointer"
              type="button"
            >
              <span>Next</span>
              <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BoardSoundLab;
