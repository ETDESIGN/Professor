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
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
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
}

const BoardWordDetective = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [phase, setPhase] = useState<'prompt' | 'revealing' | 'feedback' | 'complete'>('prompt');
  const [showHint, setShowHint] = useState(false);

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

      if (pi.exercise_type === 'SPELL_CLOZE') {
        const cloze = content as SpellClozeContent;
        items.push({
          poolItem: pi,
          sentence: cloze.sentence_with_blank,
          options: cloze.options,
          correctIndex: cloze.correct_index,
          audioUrl: cloze.audio_url,
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
        });
      }
    }
    return items;
  }, [poolItems]);

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
    setCurrentItemIdx(0);
    setSelectedWord(null);
    setPhase('prompt');
    setShowHint(false);
  }, [turnId]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx(0);
      setSelectedWord(null);
      setPhase('prompt');
      setShowHint(false);
    } else if (type === 'REVEAL_HINT') {
      setShowHint(true);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    }
  }, [state.lastAction]);

  const handleWordSelect = (idx: number) => {
    if (!currentItem || phase !== 'prompt') return;
    const correct = currentItem.correctIndex;

    setSelectedWord(idx);

    if (idx === correct) {
      // Correct - award points
      const picked = state.quickWheelWinner;
      const difficulty = currentItem.poolItem.difficulty || 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0);
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
      setTimeout(() => {
        setPhase('feedback');
        setTimeout(() => advanceToNext(), 2000);
      }, 1500);
    } else {
      // Wrong - penalty + analytics + remediation push
      const picked = state.quickWheelWinner;
      if (picked) {
        mistakesRef.current += 1;
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
      setTimeout(() => setSelectedWord(null), 800);
    }
  };

  const advanceToNext = () => {
    if (currentItemIdx < vocabItems.length - 1) {
      // Per-item attempt reset — each sentence is its own scored attempt.
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx((prev) => prev + 1);
      setSelectedWord(null);
      setPhase('prompt');
      setShowHint(false);
    } else {
      setPhase('complete');
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
        <div className="text-sm text-gray-500 mt-1">
          Sentence {currentItemIdx + 1} of {vocabItems.length}
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
                        : showHint && idx === currentItem.correctIndex
                        ? 'bg-yellow-100 border-yellow-400 text-gray-800'
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
              <div className="text-2xl text-gray-600">+{scoreForAttempt(mistakesRef.current, currentItem.poolItem.difficulty || 1)} points</div>
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
