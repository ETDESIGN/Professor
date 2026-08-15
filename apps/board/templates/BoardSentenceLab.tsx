// BoardSentenceLab — Scaffolded sentence building game (NEW GEN)
//
// Replaces: BoardUnscramble (flat assembly, no scaffolding)
//
// Pedagogical Loop:
//   1. SHOW prompt (L1 translation + image + audio of target)
//   2. STUDENT builds sentence from word bank (tap tiles)
//   3. AUTO-HINTS after 5s/10s inactivity (highlight correct tile)
//   4. LCS PARTIAL CREDIT feedback → correct/amber tile colors
//   5. SHOW correct answer with audio → STUDENT self-corrects (5s window)
//   6. ESCALATE to next sentence (harder)
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem, WordBankBuildContent, TransformContent } from '../../../types/exercise';

interface SentenceItem {
  poolItem: PoolItem;
  promptText: string;
  targetTiles: string[];
  wordBank: string[];
  translation?: string;
  audioUrl?: string;
}

const BoardSentenceLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [buildTiles, setBuildTiles] = useState<string[]>([]);
  const [phase, setPhase] = useState<'building' | 'checking' | 'feedback' | 'complete'>('building');
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [lastAward, setLastAward] = useState(0);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull WORD_BANK_BUILD and TRANSFORM items
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'SENTENCE_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 9,
  });

  // Normalize pool items
  const sentenceItems: SentenceItem[] = React.useMemo(() => {
    const items: SentenceItem[] = [];
    for (const pi of poolItems) {
      const content = pi.content as any;

      if (pi.exercise_type === 'WORD_BANK_BUILD') {
        const wbb = content as WordBankBuildContent;
        items.push({
          poolItem: pi,
          promptText: '',
          targetTiles: wbb.target_sentence.split(' '),
          wordBank: wbb.word_bank,
          translation: wbb.translation,
          audioUrl: wbb.audio_url,
        });
      } else if (pi.exercise_type === 'TRANSFORM') {
        const transform = content as TransformContent;
        const correctSentence = transform.options[transform.correct_index];
        items.push({
          poolItem: pi,
          promptText: transform.prompt_sentence,
          targetTiles: correctSentence.split(' '),
          wordBank: correctSentence.split(' '), // shuffle
          translation: transform.instruction,
        });
      }
    }
    return items;
  }, [poolItems]);

  const currentItem = sentenceItems[currentItemIdx];

  // CRITICAL: shuffle the word bank ONCE per item (not per render), so tiles
  // don't re-shuffle on every tap/state change.
  const shuffledWordBank = useMemo(() => {
    if (!currentItem) return [];
    return shuffle(currentItem.wordBank);
  }, [currentItemIdx, currentItem]);

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCurrentItemIdx(0);
    setBuildTiles([]);
    setPhase('building');
    setHintLevel(0);
  }, [turnId]);

  // Inactivity hints
  useEffect(() => {
    if (phase !== 'building') return;

    const timer5 = setTimeout(() => {
      setHintLevel((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev));
    }, 5000);

    const timer10 = setTimeout(() => {
      setHintLevel((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev));
    }, 10000);

    return () => {
      clearTimeout(timer5);
      clearTimeout(timer10);
    };
  }, [phase, currentItemIdx, buildTiles.length]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx(0);
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'CHECK_ANSWER') {
      handleCheck();
    } else if (type === 'REVEAL_HINT') {
      setHintLevel((prev) => Math.min(prev + 1, 2) as 0 | 1 | 2);
    }
  }, [state.lastAction]);

  const handleTileTap = (tile: string) => {
    if (phase !== 'building' || !currentItem) return;
    setBuildTiles((prev) => [...prev, tile]);
    setHintLevel(0); // Reset hint on activity
  };

  const handleRemoveTile = (idx: number) => {
    if (phase !== 'building') return;
    setBuildTiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCheck = () => {
    if (!currentItem || phase !== 'building') return;

    const partialCredit = computeLCSPartialCredit(buildTiles, currentItem.targetTiles);
    const difficulty = currentItem.poolItem.difficulty || 2;

    if (partialCredit >= PARTIAL_PASS_THRESHOLD) {
      // Success (with partial credit)
      const picked = state.quickWheelWinner;
      const points = scoreForAttempt(mistakesRef.current, difficulty, partialCredit);
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
          correctness: partialCredit >= 1 ? 'correct' : 'partial',
          modality: 'productive',
          pushToRemediation,
        });
      }
      setLastAward(points);
      setPhase('feedback');
      setTimeout(() => advanceToNext(), 2500);
    } else {
      // Failed - penalty + analytics + remediation
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
        difficulty,
        correctness: 'incorrect',
        correct: false,
        modality: 'productive',
        pushToRemediation,
      });
      setPhase('checking');
      setTimeout(() => {
        setPhase('building');
        setBuildTiles([]);
      }, 1500);
    }
  };

  const advanceToNext = () => {
    if (currentItemIdx < sentenceItems.length - 1) {
      // Per-item attempt reset.
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx((prev) => prev + 1);
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
    } else {
      setPhase('complete');
    }
  };

  const playAudio = () => {
    if (currentItem?.audioUrl) {
      playAudioUrl(currentItem.audioUrl).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-green-50 to-teal-50">
        <div className="text-2xl text-gray-400">Loading sentences…</div>
      </div>
    );
  }
  if (!currentItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-green-50 to-teal-50 p-8 text-center">
        <div className="text-7xl mb-6">✍️</div>
        <h2 className="text-4xl font-bold text-green-900 mb-3">Sentence Lab</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No sentence items ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  const isCorrectTile = (idx: number) => {
    if (hintLevel === 0) return false;
    if (hintLevel === 1 && idx === 0) return true;
    if (hintLevel === 2 && idx < 2) return true;
    return false;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-green-50 to-teal-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={currentItemIdx}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-green-900 mb-2"
        >
          Sentence Lab
        </motion.h1>
        <div className="text-sm text-gray-500 mt-1">
          Sentence {currentItemIdx + 1} of {sentenceItems.length}
        </div>
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase !== 'complete' && (
          <motion.div
            key={`item-${currentItemIdx}`}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full mb-6">
              {/* Prompt area */}
              <div className="text-center mb-6">
                {currentItem.translation && (
                  <div className="text-lg text-gray-600 mb-2">{currentItem.translation}</div>
                )}
                {currentItem.promptText && (
                  <div className="text-xl text-gray-800 mb-2">{currentItem.promptText}</div>
                )}
                {currentItem.audioUrl && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                  >
                    <Volume2 size={20} />
                    Listen
                  </motion.button>
                )}
              </div>

              {/* Build area */}
              <div className="min-h-24 bg-gray-50 rounded-xl p-6 mb-6 flex flex-wrap gap-2 justify-center items-center">
                {buildTiles.length === 0 && (
                  <div className="text-gray-400 text-lg">Tap tiles below to build the sentence</div>
                )}
                {buildTiles.map((tile, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    onClick={() => handleRemoveTile(idx)}
                    className="px-4 py-3 bg-green-500 text-white rounded-lg text-xl font-medium hover:bg-green-600"
                  >
                    {tile}
                  </motion.button>
                ))}
              </div>

              {/* Word bank */}
              <div className="flex flex-wrap gap-3 justify-center mb-6">
                {shuffledWordBank.map((tile, idx) => {
                  const isUsed = buildTiles.includes(tile);
                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: isUsed ? 1 : 1.05 }}
                      whileTap={{ scale: isUsed ? 1 : 0.95 }}
                      onClick={() => handleTileTap(tile)}
                      disabled={isUsed}
                      className={`px-4 py-3 rounded-lg text-xl font-medium transition-all ${
                        isUsed
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : isCorrectTile(idx)
                          ? 'bg-yellow-200 border-2 border-yellow-400 text-gray-800'
                          : 'bg-white border-2 border-green-300 hover:border-green-500 text-green-700'
                      }`}
                    >
                      {tile}
                    </motion.button>
                  );
                })}
              </div>

              {/* Check button */}
              {buildTiles.length > 0 && phase === 'building' && (
                <div className="text-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCheck}
                    className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-2xl font-bold shadow-lg flex items-center gap-3 mx-auto"
                  >
                    <Check size={28} />
                    Check
                  </motion.button>
                </div>
              )}

              {/* Checking phase */}
              {phase === 'checking' && (
                <div className="text-center text-red-500 text-xl font-bold">
                  Not quite right. Try again!
                </div>
              )}
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
                {pickedStudent ? `${pickedStudent.name} built it perfectly!` : 'Excellent!'}
              </h2>
              <div className="text-2xl text-gray-600">
                +{lastAward} points
              </div>
              {currentItem.audioUrl && (
                <div className="mt-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                  >
                    <Volume2 size={20} />
                    Hear the sentence
                  </motion.button>
                </div>
              )}
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
              <h2 className="text-5xl font-bold text-green-900 mb-4">Sentence Lab Complete!</h2>
              <div className="text-2xl text-gray-600">All sentences mastered</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardSentenceLab;
