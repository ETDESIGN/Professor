// BoardWordDetective — Vocabulary-in-context game (NEW GEN)
//
// Replaces: BoardFlashMatch (isolated matching) + BoardFocusCards (passive vocab presentation)
//
// Pedagogical Loop:
//   1. SHOW sentence with blank + context image
//   2. STUDENT picks the word that fits context (4 options)
//   3. FEEDBACK: complete sentence lights up + audio plays + illustration appears
//   4. ESCALATE to next sentence (harder context / closer distractors)
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { useSpeech } from './useSpeech';
import { preloadRoundSpeech } from './speechPreload';
import type { PoolItem, SpellClozeContent, MeaningMatchContent, ImageSelectContent, AudioL1SelectContent } from '../../../types/exercise';

interface VocabItem {
  poolItem: PoolItem;
  sentence: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string;
  audioUrl?: string;
  /** TTS source text when audioUrl is absent (reference-based audio). */
  speechText?: string;
  translation?: string;
  /** Teaching text shown on the reveal beat (ERROR_SPOT/GRAMMAR_FILL carry one). */
  explanation?: string;
}

const BoardWordDetective = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded hint elimination (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [phase, setPhase] = useState<'prompt' | 'revealing' | 'feedback' | 'complete'>('prompt');
  // REVEAL_HINT eliminates one wrong option (50/50-style) instead of
  // spotlighting the answer.
  const [eliminatedIdx, setEliminatedIdx] = useState<number | null>(null);
  // Reveal-on-wrong: latched on the 2nd consecutive miss — the correct option
  // gets the amber ring, the explanation shows, and the item advances after
  // the teaching hold. No further attempts.
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastAward, setLastAward] = useState(0);
  const streakRef = useRef(0);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull SPELL_CLOZE and MEANING_MATCH items
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'WORD_DETECTIVE',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 8,
  });

  // Normalize pool items into vocab items (SPELL_CLOZE / MEANING_MATCH /
  // IMAGE_SELECT / AUDIO_L1_SELECT — all prompt+options+correct_index MCQs).
  const vocabItems: VocabItem[] = React.useMemo(() => {
    const items: VocabItem[] = [];
    for (const pi of poolItems) {
      const content = pi.content as any;
      const explanation: string | undefined = content.explanation;

      if (pi.exercise_type === 'SPELL_CLOZE') {
        const cloze = content as SpellClozeContent;
        items.push({
          poolItem: pi,
          sentence: cloze.sentence_with_blank,
          options: cloze.options,
          correctIndex: cloze.correct_index,
          audioUrl: cloze.audio_url,
          explanation,
        });
      } else if (pi.exercise_type === 'MEANING_MATCH') {
        const match = content as MeaningMatchContent;
        items.push({
          poolItem: pi,
          sentence: `"${match.prompt}" — which meaning fits?`,
          options: match.options,
          correctIndex: match.correct_index,
          audioUrl: match.prompt_audio,
          speechText: match.prompt,
          explanation,
        });
      } else if (pi.exercise_type === 'IMAGE_SELECT') {
        const img = content as ImageSelectContent;
        const hasImages = img.options?.every((o) => !!o.image_url);
        if (!hasImages) continue; // text-only IMAGE_SELECT rows can't render here
        items.push({
          poolItem: pi,
          sentence: img.prompt_translation ? `${img.prompt} (${img.prompt_translation})` : img.prompt,
          options: img.options.map((o) => o.image_url),
          correctIndex: img.correct_index,
          audioUrl: img.prompt_audio,
          speechText: img.prompt,
          imageUrl: img.options[img.correct_index]?.image_url,
          explanation,
        });
      } else if (pi.exercise_type === 'AUDIO_L1_SELECT') {
        const a = content as AudioL1SelectContent;
        items.push({
          poolItem: pi,
          sentence: a.prompt_text || 'Listen — which meaning did you hear?',
          options: a.options,
          correctIndex: a.correct_index,
          audioUrl: a.audio_url,
          speechText: a.prompt_text,
          explanation,
        });
      }
    }

    // Per-turn option order (per-turn variety, 2026-08-30): without this the
    // correct answer sits in the same slot for every student (options render
    // in stored order) and kids pattern-match the position. Seeded on shared
    // state (turnToken broadcast/live_state, resetCount) → identical on every
    // tab, different per wheel pick / Reset.
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

  // Reference-based audio: background-resolve the current item's speech;
  // play() never blocks — browser voice covers the not-ready case.
  const { play: playCurrentSpeech } = useSpeech({
    text: currentItem?.speechText,
    audioUrl: currentItem?.audioUrl,
    unitId,
  });

  // Warm the TTS cache for the whole round (bounded, fire-and-forget).
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
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

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
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
      // 50/50-style hint: eliminate one wrong option (dim/strike). Never
      // eliminates down to only the correct answer remaining.
      if (currentItem && revealedIdx === null) {
        const wrongs = currentItem.options
          .map((_, i) => i)
          .filter((i) => i !== currentItem.correctIndex && i !== eliminatedIdx);
        if (wrongs.length > 1) {
          const draw = makeRng(seedBase, currentItem.poolItem?.id ?? currentItemIdx, 'hint')();
          setEliminatedIdx(wrongs[Math.floor(draw * wrongs.length)]);
        }
      }
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      handleForceCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced end from the teacher — settle into the complete state.
      setPhase('complete');
    }
  }, [state.lastAction]);

  const handleWordSelect = (idx: number) => {
    if (!currentItem || phase !== 'prompt' || revealedIdx !== null || idx === eliminatedIdx) return;
    const correct = currentItem.correctIndex;

    setSelectedWord(idx);

    if (idx === correct) {
      // Correct - award points (streak multiplier kicks in at 3/5 consecutive).
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
      // Dead-time compression: 700ms reveal beat + 700ms feedback (was
      // 1500+2000). The full sentence stays on screen as the teaching visual.
      setPhase('revealing');
      // Speak the resolved content during the reveal beat (browser voice
      // covers the not-yet-resolved case; play() never blocks).
      playCurrentSpeech();
      setTimeout(() => {
        setPhase('feedback');
        setTimeout(() => advanceToNext(), 700);
      }, 700);
    } else {
      // Wrong - penalty + analytics + remediation push
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
        // Second consecutive miss — reveal the correct option (amber ring +
        // explanation), teach for a beat, then advance. No further attempts.
        playCue('reveal');
        setRevealedIdx(correct);
        setTimeout(() => advanceToNext(), 2200);
      } else {
        setTimeout(() => setSelectedWord(null), 800);
      }
    }
  };

  // MARK_CORRECT (teacher override): score the current item as a clean correct
  // (mistakesRef preserved), then advance.
  const handleForceCorrect = () => {
    if (!currentItem || phase !== 'prompt' || awardedRef.current || revealedIdx !== null) return;
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
    playCurrentSpeech();
    setTimeout(() => advanceToNext(), 900);
  };

  const advanceToNext = () => {
    if (currentItemIdx < vocabItems.length - 1) {
      // Per-item attempt reset — each sentence is its own scored attempt.
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
  };

  const playAudio = () => {
    if (currentItem?.audioUrl || currentItem?.speechText) {
      playCurrentSpeech();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="text-2xl text-gray-400">Loading vocabulary items…</div>
      </div>
    );
  }
  if (!currentItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-blue-50 to-cyan-50 p-8 text-center">
        <div className="text-7xl mb-6">🔍</div>
        <h2 className="text-4xl font-bold text-blue-900 mb-3">Word Detective</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No vocabulary items ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={currentItemIdx}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-blue-900 mb-2"
        >
          Word Detective
        </motion.h1>
        <div className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-3">
          <span>
            Sentence {currentItemIdx + 1} of {vocabItems.length}
          </span>
          {streak > 1 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-500 text-white rounded-full font-bold">
              🔥 {streak}
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase === 'prompt' && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full mb-6">
              {/* Sentence with blank */}
              <div className="text-center mb-8">
                <div className="text-sm text-gray-500 mb-3">Fill in the blank</div>
                <div className="text-3xl text-gray-800 leading-relaxed">
                  {currentItem.sentence.split('___').map((part, idx, arr) => (
                    <React.Fragment key={idx}>
                      {part}
                      {idx < arr.length - 1 && (
                        <span className="inline-block mx-2 px-6 py-2 bg-blue-100 border-2 border-blue-300 rounded-lg text-blue-600 font-bold">
                          ___
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {currentItem.translation && (
                  <div className="text-lg text-gray-500 mt-4">{currentItem.translation}</div>
                )}
              </div>

              {/* Audio button */}
              {(currentItem.audioUrl || currentItem.speechText) && (
                <div className="text-center mb-6">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                  >
                    <Volume2 size={20} />
                    Listen
                  </motion.button>
                </div>
              )}

              {/* Options — images for IMAGE_SELECT items, text otherwise */}
              <div className="grid grid-cols-2 gap-4">
                {currentItem.options.map((option, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleWordSelect(idx)}
                    className={`rounded-xl font-semibold transition-all overflow-hidden ${
                      currentItem.imageUrl ? 'aspect-square p-0 border-4' : 'p-6 text-2xl border-2'
                    } ${
                      selectedWord === idx
                        ? idx === currentItem.correctIndex
                          ? 'bg-green-500 text-white border-green-600'
                          : 'bg-red-500 text-white border-red-600'
                        : revealedIdx === idx
                        ? 'bg-amber-100 border-amber-400 text-gray-800 ring-4 ring-amber-400'
                        : eliminatedIdx === idx
                        ? 'bg-gray-50 border-gray-200 text-gray-300 opacity-40 line-through pointer-events-none grayscale'
                        : currentItem.imageUrl
                        ? 'bg-gray-50 border-gray-200 hover:border-blue-400'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-gray-200'
                    }`}
                  >
                    {currentItem.imageUrl ? (
                      <img src={option} alt={`Option ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      option
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Reveal-on-wrong teaching beat: the why behind the answer. */}
              {revealedIdx !== null && currentItem.explanation && (
                <div className="mt-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl text-center text-lg text-amber-900">
                  {currentItem.explanation}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'revealing' && (
          <motion.div
            key="revealing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              <div className="text-center mb-6">
                <div className="text-sm text-gray-500 mb-3">Complete sentence</div>
                <div className="text-3xl text-gray-800 leading-relaxed">
                  {currentItem.sentence.replace('___', currentItem.options[currentItem.correctIndex])}
                </div>
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="text-center"
              >
                <div className="text-6xl mb-4">✅</div>
                <div className="text-2xl text-green-600 font-bold">Correct!</div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {phase === 'feedback' && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="text-8xl mb-6"
              >
                🎉
              </motion.div>
              <h2 className="text-4xl font-bold text-green-600 mb-4">
                {pickedStudent ? `${pickedStudent.name} nailed it!` : 'Excellent!'}
              </h2>
              <div className="text-2xl text-gray-600">+{lastAward} points</div>
            </div>
          </motion.div>
        )}

        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-8xl mb-6">🏆</div>
              <h2 className="text-5xl font-bold text-blue-900 mb-4">Word Detective Complete!</h2>
              <div className="text-2xl text-gray-600">All sentences mastered</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardWordDetective;
