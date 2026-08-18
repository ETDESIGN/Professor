// BoardSoundLab — 3-phase listening game (NEW GEN)
//
// Replaces: BoardListenTap (flat MCQ + teacher-typing dictation)
//
// Pedagogical Loop:
//   Phase 1 (Recognition): PLAY audio (word) → STUDENT taps matching image
//   Phase 2 (Discrimination): PLAY audio (sentence) → STUDENT taps matching sentence
//   Phase 3 (Production): SHOW word+image → STUDENT speaks → speech recognition scores
//   → Each phase escalates → FSRS push per phase → Zero teacher typing
//
// All automated. Speech recognition replaces dictation teacher-typing.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Mic, MicOff } from 'lucide-react';
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
  /** Pre-stored audio (legacy); optional — reference-based items resolve at play time. */
  audioUrl?: string;
  /** TTS source text when audioUrl is absent. */
  speechText?: string;
  options: string[];
  /** Phase 1 image options: the image plus its caption label (audit fix —
   *  `options` used to collapse label||image_url into the img src). */
  imageOptions?: { imageUrl: string; label?: string }[];
  correctIndex: number;
  imageUrl?: string;
  targetText?: string;
  /** Optional teaching note shown during the reveal-on-wrong hold. */
  explanation?: string;
}

const BoardSoundLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded option order (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Per-item resolve latch (success / MARK_CORRECT / reveal) — prevents stale
   *  speech results or double remote taps from resolving an item twice. */
  const resolvedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);

  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [phase1Idx, setPhase1Idx] = useState(0);
  const [phase2Idx, setPhase2Idx] = useState(0);
  const [phase3Idx, setPhase3Idx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [replayCount, setReplayCount] = useState(0);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull listening items
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
          // Audit fix: the grid renders image_url in the <img> and label as a
          // caption below — never label||image_url mashed into the src.
          imageOptions: content.options.map((o) => ({ imageUrl: o.image_url, label: o.label })),
          correctIndex: content.correct_index,
          imageUrl: content.options[content.correct_index]?.image_url,
          explanation: (content as any).explanation,
        };
      });
  }, [poolItems]);

  const phase2Items: SoundItem[] = React.useMemo(() => {
    const dictation = poolItems.filter((pi) => pi.exercise_type === 'DICTATION').slice(0, 3);
    // Real distractors: sibling dictation sentences stand in as the wrong
    // options (no synthetic "She X" padding, and the correct one is shuffled
    // to a random position per item).
    const allTexts = dictation.map((pi) => (pi.content as DictationContent).correct_text);
    return dictation.map((pi) => {
      const content = pi.content as DictationContent;
      const distractors = allTexts.filter((t) => t !== content.correct_text).slice(0, 2);
      const options = shuffle([content.correct_text, ...distractors], makeRng(seedBase, pi.id, 'options'));
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

  const hasAnyItems = phase1Items.length > 0 || phase2Items.length > 0 || phase3Items.length > 0;

  // Reference-based audio: resolve the current item's speech in the background;
  // play() below never blocks — browser voice covers the not-ready case.
  const { play: playCurrentSpeech } = useSpeech({
    text: currentItem?.speechText,
    audioUrl: currentItem?.audioUrl,
    unitId,
  });

  // Warm the TTS cache for the whole round (bounded, fire-and-forget).
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // Skip empty phases in an effect — the previous render-time setCurrentPhase
  // was a setState-during-render anti-pattern (audit fix). When every phase
  // is empty the branded empty-state card below wins (hasAnyItems gate), so
  // an empty pool can never cascade into a fake completion.
  useEffect(() => {
    if (allDone || !hasAnyItems || currentItem) return;
    if (currentPhase === 1 && phase1Items.length === 0) setCurrentPhase(2);
    else if (currentPhase === 2 && phase2Items.length === 0) setCurrentPhase(3);
    else if (currentPhase === 3 && phase3Items.length === 0) completeGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, hasAnyItems, currentItem, currentPhase, phase1Items.length, phase2Items.length, phase3Items.length]);

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
      if (passed) {
        // Productive success — partial credit = pronunciation similarity.
        itemSuccess('productive', Math.max(0.6, Math.min(1, score)));
        setPhaseComplete(true);
        setTimeout(() => advancePhase3(), 2000);
      } else {
        itemFailure('productive');
      }
    },
  });

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    setCurrentPhase(1);
    setPhase1Idx(0);
    setPhase2Idx(0);
    setPhase3Idx(0);
    setSelectedOption(null);
    setReplayCount(0);
    setPhaseComplete(false);
    setAllDone(false);
    setStreak(0);
    setRevealed(false);
  }, [turnId]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      setCurrentPhase(1);
      setPhase1Idx(0);
      setPhase2Idx(0);
      setPhase3Idx(0);
      setSelectedOption(null);
      setReplayCount(0);
      setPhaseComplete(false);
      setAllDone(false);
      setStreak(0);
      setRevealed(false);
    } else if (type === 'SKIP_PHASE') {
      advancePhase();
    } else if (type === 'MARK_CORRECT') {
      // Teacher override ("Correct" on the remote): score the current item
      // as a clean correct (mistakesRef preserved) and advance. In phase 3
      // this doubles as "accept that pronunciation" when recognition is
      // being unfair.
      markCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      // completeRef stops us echoing the broadcast back (our own optimistic
      // lastAction update re-enters this listener).
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const playAudio = () => {
    if (!currentItem?.audioUrl && !currentItem?.speechText) return;
    playCurrentSpeech();
    // Replays cost points AFTER the first free listen (spec: 2–3 replays).
    if (replayCount >= 1) {
      const picked = state.quickWheelWinner;
      if (picked) addPoints(picked, -MISTAKE_PENALTY);
    }
    setReplayCount((prev) => prev + 1);
  };

  // ── Unified per-item success/failure (triple-write) ────────────────────
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
      // Same fallback as itemSuccess — the failure path used to hardcode 1,
      // so productive misses were logged as receptive difficulty (audit fix).
      difficulty: currentItem.poolItem.difficulty || (modality === 'productive' ? 3 : 1),
      correctness: 'incorrect',
      correct: false,
      modality,
      pushToRemediation,
    });
  };

  // Shared reveal-on-wrong: 2nd consecutive miss on an item → highlight the
  // correct option (amber ring), show the explanation when the content has
  // one, hold ~2.2s (teaching beat), then advance. Reset per item.
  const revealAnswer = (advance: () => void) => {
    playCue('reveal');
    resolvedRef.current = true;
    setRevealed(true);
    setTimeout(() => {
      setRevealed(false);
      advance();
    }, 2200);
  };

  // Natural completion → terminal card + SLIDE_COMPLETE broadcast. The ref
  // makes it idempotent across the optimistic lastAction echo and the
  // remote's forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setAllDone(true);
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  // MARK_CORRECT body (invoked from the lastAction listener): clean correct
  // award with mistakesRef preserved, then advance on the short hold.
  const markCorrect = () => {
    if (!currentItem || resolvedRef.current || completeRef.current) return;
    if (currentPhase !== 3) setSelectedOption(currentItem.correctIndex);
    itemSuccess(currentPhase === 3 ? 'productive' : 'receptive', 1.0);
    setPhaseComplete(true);
    setTimeout(() => advancePhase(), 900);
  };

  const handlePhase1Select = (idx: number) => {
    if (!currentItem || currentPhase !== 1 || resolvedRef.current) return;
    const correct = currentItem.correctIndex;

    setSelectedOption(idx);

    if (idx === correct) {
      itemSuccess('receptive');
      setPhaseComplete(true);
      setTimeout(() => advancePhase1(), 900);
    } else {
      itemFailure('receptive');
      if (mistakesRef.current >= 2) revealAnswer(() => advancePhase1());
      else setTimeout(() => setSelectedOption(null), 800);
    }
  };

  const handlePhase2Select = (idx: number) => {
    if (!currentItem || currentPhase !== 2 || resolvedRef.current) return;
    const correct = currentItem.correctIndex;

    setSelectedOption(idx);

    if (idx === correct) {
      itemSuccess('receptive');
      setPhaseComplete(true);
      setTimeout(() => advancePhase2(), 900);
    } else {
      itemFailure('receptive');
      if (mistakesRef.current >= 2) revealAnswer(() => advancePhase2());
      else setTimeout(() => setSelectedOption(null), 800);
    }
  };

  const advancePhase1 = () => {
    // Per-item attempt reset — each phase item is its own scored attempt.
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

  const advancePhase3 = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-2xl text-gray-400">Loading sound items…</div>
      </div>
    );
  }

  if (!hasAnyItems) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-purple-50 to-pink-50 p-8 text-center">
        <div className="text-7xl mb-6">🎧</div>
        <h2 className="text-4xl font-bold text-purple-900 mb-3">Sound Lab</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No listening items ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  // Transient frame while the skip-empty-phases effect above catches up —
  // never dereference a missing currentItem in the grids below.
  if (!currentItem && !allDone) return null;

  // Replay-cost copy is surfaced in ALL phases (audit fix — used to be
  // phase 1 only): after the first free listen each replay costs −5.
  const replayHint = replayCount > 0 && replayCount < 2 ? (
    <div className="text-sm text-gray-500 mt-2">Replay: {2 - replayCount} left (−1 pt each)</div>
  ) : null;

  const allComplete = allDone || (currentPhase === 3 && phase3Idx >= phase3Items.length && phase3Items.length > 0 && phaseComplete);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 to-pink-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={`phase-${currentPhase}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-purple-900 mb-2"
        >
          Sound Lab
        </motion.h1>
        <div className="flex items-center justify-center gap-2 mb-2">
          {[1, 2, 3].map((p) => (
            <div
              key={p}
              className={`w-3 h-3 rounded-full ${
                p === currentPhase ? 'bg-purple-600 animate-pulse' : p < currentPhase ? 'bg-purple-400' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <div className="text-sm text-gray-500">
          Phase {currentPhase}: {currentPhase === 1 ? 'Listen & Tap' : currentPhase === 2 ? 'Listen & Match' : 'Hear & Say'}
        </div>
        {streak > 1 && (
          <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-purple-500 text-white rounded-full font-bold text-sm">
            🔥 Streak x{streak}
          </div>
        )}
      </div>

      {/* Phase content */}
      <AnimatePresence mode="wait">
        {!allComplete && (
          <motion.div
            key={`phase-${currentPhase}-item-${currentPhase === 1 ? phase1Idx : currentPhase === 2 ? phase2Idx : phase3Idx}`}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              {/* Phase 1: Recognition */}
              {currentPhase === 1 && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Phase 1: Listen & Tap</div>
                    <div className="text-xl text-gray-700">Which image matches the word?</div>
                  </div>

                  {/* Audio player */}
                  <div className="text-center mb-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={playAudio}
                      className="px-8 py-4 bg-purple-500 hover:bg-purple-600 text-white rounded-2xl font-bold flex items-center gap-3 mx-auto text-2xl"
                    >
                      <Volume2 size={32} />
                      Listen
                    </motion.button>
                    {replayHint}
                  </div>

                  {/* Image grid — audit fix: the img src is the option's
                      image_url; the label renders as a caption below it. */}
                  <div className="grid grid-cols-2 gap-4">
                    {(currentItem.imageOptions || []).map((opt, idx) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handlePhase1Select(idx)}
                        className={`flex flex-col rounded-xl overflow-hidden border-4 bg-white transition-all ${
                          selectedOption === idx
                            ? idx === currentItem.correctIndex
                              ? 'border-green-500'
                              : 'border-red-500'
                            : 'border-gray-200 hover:border-purple-400'
                        } ${revealed && idx === currentItem.correctIndex ? 'ring-4 ring-amber-400' : ''}`}
                      >
                        <div className="aspect-square bg-gray-100">
                          <img
                            src={opt.imageUrl}
                            alt={opt.label || `Option ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="py-2 px-2 text-center text-lg font-bold text-gray-700 bg-white border-t border-gray-100 truncate">
                          {opt.label || '\u00A0'}
                        </div>
                      </motion.button>
                    ))}
                  </div>

                  {/* Reveal-on-wrong teaching note (only when the content carries one) */}
                  {revealed && currentItem.explanation && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-lg text-amber-900 text-center"
                    >
                      {currentItem.explanation}
                    </motion.div>
                  )}
                </>
              )}

              {/* Phase 2: Discrimination */}
              {currentPhase === 2 && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Phase 2: Listen & Match</div>
                    <div className="text-xl text-gray-700">Which sentence did you hear?</div>
                  </div>

                  {/* Audio player */}
                  <div className="text-center mb-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={playAudio}
                      className="px-8 py-4 bg-purple-500 hover:bg-purple-600 text-white rounded-2xl font-bold flex items-center gap-3 mx-auto text-2xl"
                    >
                      <Volume2 size={32} />
                      Listen
                    </motion.button>
                    {replayHint}
                  </div>

                  {/* Sentence options */}
                  <div className="space-y-3">
                    {currentItem.options.map((option, idx) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handlePhase2Select(idx)}
                        className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                          selectedOption === idx
                            ? idx === currentItem.correctIndex
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                        } ${revealed && idx === currentItem.correctIndex ? 'ring-4 ring-amber-400' : ''}`}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>

                  {/* Reveal-on-wrong teaching note (only when the content carries one) */}
                  {revealed && currentItem.explanation && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-lg text-amber-900 text-center"
                    >
                      {currentItem.explanation}
                    </motion.div>
                  )}
                </>
              )}

              {/* Phase 3: Production */}
              {currentPhase === 3 && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Phase 3: Hear & Say</div>
                    <div className="text-xl text-gray-700">Say the word!</div>
                  </div>

                  {/* Target display */}
                  <div className="text-center mb-8">
                    <div className="text-4xl font-bold text-purple-900 mb-4">{currentItem.targetText}</div>
                    {(currentItem.audioUrl || currentItem.speechText) && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={playAudio}
                        className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                      >
                        <Volume2 size={20} />
                        Listen first
                      </motion.button>
                    )}
                    {replayHint}
                  </div>

                  {/* Mic button */}
                  {!speechSupported ? (
                    <div className="text-center text-gray-500 text-lg">
                      <MicOff size={48} className="mx-auto mb-4 text-gray-400" />
                      Speech recognition not supported in this browser
                    </div>
                  ) : (
                    <div className="text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={startListening}
                        disabled={isListening}
                        className={`px-12 py-6 rounded-full font-bold text-2xl flex items-center gap-3 mx-auto ${
                          isListening
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                      >
                        <Mic size={32} />
                        {isListening ? 'Listening...' : 'Tap to Speak'}
                      </motion.button>

                      {/* Speech result */}
                      {speechTranscript && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 p-4 bg-gray-50 rounded-xl"
                        >
                          <div className="text-sm text-gray-500 mb-2">You said:</div>
                          <div className="text-2xl text-gray-800 mb-3">{speechTranscript}</div>
                          <div className="flex items-center justify-center gap-4">
                            <div className="text-lg">
                              Score:{' '}
                              <span className={`font-bold ${speechPassed ? 'text-green-600' : 'text-red-600'}`}>
                                {Math.round((speechScore || 0) * 100)}%
                              </span>
                            </div>
                            {speechPassed && <div className="text-2xl">✅</div>}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}

        {allComplete && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-8xl mb-6">🎧</div>
              <h2 className="text-5xl font-bold text-purple-900 mb-4">Sound Lab Complete!</h2>
              <div className="text-2xl text-gray-600">All phases mastered</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && !allComplete && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardSoundLab;
