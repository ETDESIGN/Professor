// BoardGrammarLab — Interactive grammar game (NEW GEN, audited rewrite 2026-08-07)
//
// Replaces: BoardGrammarSandbox (passive presentation) + BoardGrammarForge
// (teacher-typing Rung 4) + BoardGrammarPractice (legacy).
//
// Pedagogical loop (per item, per MASTER_ROADMAP.md):
//   SHOW pattern/instruction (2s) → STUDENT answers the item in its own rung
//   shape → INSTANT visual feedback → triple-write (points + attempt analytics
//   + FSRS) → next item.
//
// Rung shapes follow the REAL exercise contract (types/exercise.ts):
//   ERROR_SPOT   → sentence shown; MCQ over the correction options (rung 2, receptive)
//   TRANSFORM    → prompt + instruction; tile-assembly of the target with LCS
//                  partial credit (rung 3, productive)
//   GRAMMAR_FILL → sentence-with-blank; MCQ "which sentence is correct?" (rung 4, receptive)
//
// Lifecycle: NEW_TURN reset on currentTurnId, mistakesRef + awardedRef reset
// PER ITEM (multi-item slide — each item is its own scored attempt), remote
// controls via state.lastAction (RESET_GAME / REVEAL_HINT / SKIP_ITEM /
// MARK_CORRECT teacher override). Zero teacher typing.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem, ErrorSpotContent, TransformContent, GrammarFillContent } from '../../../types/exercise';

type RungShape = 'error_spot' | 'transform' | 'fill_blank';

interface GrammarItem {
  poolItem: PoolItem;
  shape: RungShape;
  ruleName: string;
}

const BoardGrammarLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [phase, setPhase] = useState<'pattern' | 'answer' | 'feedback' | 'complete' | 'empty'>('pattern');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [buildTiles, setBuildTiles] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [lastAward, setLastAward] = useState(0);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Content: ERROR_SPOT / TRANSFORM / GRAMMAR_FILL via the director ────
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'GRAMMAR_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 6,
  });

  const grammarItems: GrammarItem[] = useMemo(() => {
    const items: GrammarItem[] = [];
    for (const pi of poolItems) {
      const content = pi.content as any;
      const ruleName = content.rule_name || content.instruction || 'Grammar Rule';
      if (pi.exercise_type === 'ERROR_SPOT') items.push({ poolItem: pi, shape: 'error_spot', ruleName });
      else if (pi.exercise_type === 'TRANSFORM') items.push({ poolItem: pi, shape: 'transform', ruleName });
      else if (pi.exercise_type === 'GRAMMAR_FILL') items.push({ poolItem: pi, shape: 'fill_blank', ruleName });
    }
    return items;
  }, [poolItems]);

  const currentItem = grammarItems[currentItemIdx];

  // TRANSFORM tile bank — shuffled ONCE per item (not per render).
  const transformBank = useMemo(() => {
    if (!currentItem || currentItem.shape !== 'transform') return [];
    const content = currentItem.poolItem.content as TransformContent;
    const target = content.options?.[content.correct_index] || '';
    return shuffle(target.split(' '));
  }, [currentItemIdx, currentItem]);

  // ── Lifecycle: reset everything on a NEW picked student ─────────────────
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCurrentItemIdx(0);
    setPhase('pattern');
    setSelectedOption(null);
    setBuildTiles([]);
    setShowHint(false);
  }, [turnId]);

  // ── Empty state once the pool resolves with nothing usable ─────────────
  useEffect(() => {
    if (!loading && grammarItems.length === 0) setPhase('empty');
  }, [loading, grammarItems.length]);

  // ── Remote controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentItemIdx(0);
      setPhase('pattern');
      setSelectedOption(null);
      setBuildTiles([]);
      setShowHint(false);
    } else if (type === 'REVEAL_HINT') {
      setShowHint(true);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      // Teacher override for a defensible oral answer: force success.
      handleSuccess(1.0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Pattern beat: 2s read-time, then the item's interaction ────────────
  useEffect(() => {
    if (phase !== 'pattern') return;
    const timer = setTimeout(() => setPhase('answer'), 2000);
    return () => clearTimeout(timer);
  }, [phase, currentItemIdx]);

  // ── Scoring helpers (per-item attempt lifecycle) ────────────────────────
  const handleSuccess = (partialCreditRatio: number, forced = false) => {
    if (!currentItem) return;
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || 2;
    const points = forced
      ? scoreForAttempt(mistakesRef.current, difficulty, 1.0)
      : scoreForAttempt(mistakesRef.current, difficulty, partialCreditRatio);

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
        correctness: partialCreditRatio >= 1 ? 'correct' : 'partial',
        modality: currentItem.shape === 'transform' ? 'productive' : 'receptive',
        pushToRemediation,
      });
    }
    setLastAward(points);
    setPhase('feedback');
    setTimeout(() => advanceToNext(), 2200);
  };

  const handleMiss = () => {
    const picked = state.quickWheelWinner;
    if (picked) {
      mistakesRef.current += 1;
      addPoints(picked, -MISTAKE_PENALTY);
    }
    if (currentItem) {
      logAttempt({
        state,
        picked: picked || '',
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty: currentItem.poolItem.difficulty || 2,
        correctness: 'incorrect',
        correct: false,
        modality: currentItem.shape === 'transform' ? 'productive' : 'receptive',
        pushToRemediation,
      });
    }
  };

  // ── MCQ (ERROR_SPOT corrections / GRAMMAR_FILL sentences) ──────────────
  const handleMcqSelect = (idx: number) => {
    if (!currentItem || phase !== 'answer') return;
    const content = currentItem.poolItem.content as ErrorSpotContent | GrammarFillContent;
    setSelectedOption(idx);
    if (idx === content.correct_index) {
      handleSuccess(1.0);
    } else {
      handleMiss();
      setTimeout(() => setSelectedOption(null), 700);
    }
  };

  // ── Tile assembly (TRANSFORM) ───────────────────────────────────────────
  const handleTileTap = (tile: string) => {
    if (phase !== 'answer') return;
    setBuildTiles((prev) => [...prev, tile]);
  };
  const handleRemoveTile = (idx: number) => {
    if (phase !== 'answer') return;
    setBuildTiles((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleCheckAssembly = () => {
    if (!currentItem || currentItem.shape !== 'transform') return;
    const content = currentItem.poolItem.content as TransformContent;
    const target = (content.options?.[content.correct_index] || '').split(' ');
    const ratio = computeLCSPartialCredit(buildTiles, target);
    if (ratio >= PARTIAL_PASS_THRESHOLD) {
      handleSuccess(ratio);
    } else {
      handleMiss();
      setTimeout(() => setBuildTiles([]), 700);
    }
  };

  const advanceToNext = () => {
    setCurrentItemIdx((prev) => {
      if (prev < grammarItems.length - 1) {
        // Per-item attempt reset — each item is its own scored attempt.
        mistakesRef.current = 0;
        awardedRef.current = false;
        setSelectedOption(null);
        setBuildTiles([]);
        setShowHint(false);
        setPhase('pattern');
        return prev + 1;
      }
      setPhase('complete');
      return prev;
    });
  };

  // ── Loading / empty states (never a forever spinner) ────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-2xl text-gray-400">Loading grammar items…</div>
      </div>
    );
  }
  if (phase === 'empty' || (!loading && grammarItems.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-indigo-50 to-purple-50 p-8 text-center">
        <div className="text-7xl mb-6">🧪</div>
        <h2 className="text-4xl font-bold text-indigo-900 mb-3">Grammar Lab</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No practice items ready yet. Grammar objectives unlock here after the class has been
          introduced to the rule (run the Grammar presentation first) — or skip to the next slide.
        </div>
      </div>
    );
  }
  if (!currentItem) return null;

  const content = currentItem.poolItem.content as any;
  const mcqOptions: string[] = content.options || [];

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 to-purple-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={currentItemIdx}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-indigo-900 mb-2"
        >
          Grammar Lab
        </motion.h1>
        <div className="text-lg text-indigo-600 font-medium">{currentItem.ruleName}</div>
        <div className="text-sm text-gray-500 mt-1">
          Item {currentItemIdx + 1} of {grammarItems.length}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Pattern beat */}
        {phase === 'pattern' && (
          <motion.div
            key="pattern"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-12 max-w-2xl text-center">
              <div className="text-sm text-gray-500 mb-4">Pattern</div>
              <div className="text-3xl font-mono text-indigo-900 mb-4">
                {content.pattern_template || content.instruction || 'Subject + Verb + Object'}
              </div>
              {content.explanation && <div className="text-lg text-gray-600">{content.explanation}</div>}
            </div>
          </motion.div>
        )}

        {/* Answer phase — shape depends on the item type */}
        {phase === 'answer' && (
          <motion.div
            key={`answer-${currentItemIdx}`}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -80 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              {/* ERROR_SPOT: find the fix */}
              {currentItem.shape === 'error_spot' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 2: Spot the Error</div>
                    <div className="text-2xl text-gray-800 mb-2">{content.sentence}</div>
                    <div className="text-lg text-gray-600">Which fix is correct?</div>
                  </div>
                  <div className="space-y-3">
                    {mcqOptions.map((option: string, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleMcqSelect(idx)}
                        className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                          selectedOption === idx
                            ? idx === content.correct_index
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : showHint && idx === content.correct_index
                            ? 'bg-yellow-100 border-2 border-yellow-400 text-gray-800'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                        }`}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}

              {/* TRANSFORM: tile assembly */}
              {currentItem.shape === 'transform' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 3: Transform It</div>
                    <div className="text-xl text-indigo-700 font-semibold mb-1">{content.instruction}</div>
                    <div className="text-lg text-gray-500 line-through decoration-gray-300">{content.prompt_sentence}</div>
                  </div>
                  {/* Build area */}
                  <div className="min-h-20 bg-gray-50 rounded-xl p-4 mb-6 flex flex-wrap gap-2 justify-center items-center">
                    {buildTiles.length === 0 && (
                      <div className="text-gray-400 text-lg">Tap tiles to build the new sentence</div>
                    )}
                    {buildTiles.map((tile, idx) => (
                      <motion.button
                        key={`${tile}-${idx}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        onClick={() => handleRemoveTile(idx)}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-lg font-medium"
                      >
                        {tile}
                      </motion.button>
                    ))}
                  </div>
                  {/* Tile bank */}
                  <div className="flex flex-wrap gap-2 justify-center mb-6">
                    {transformBank.map((tile, idx) => {
                      const usedCount = buildTiles.filter((t) => t === tile).length;
                      const bankCount = transformBank.slice(0, idx + 1).filter((t) => t === tile).length;
                      const isUsed = usedCount >= bankCount;
                      return (
                        <motion.button
                          key={`${tile}-${idx}`}
                          whileHover={isUsed ? undefined : { scale: 1.05 }}
                          whileTap={isUsed ? undefined : { scale: 0.95 }}
                          onClick={() => handleTileTap(tile)}
                          disabled={isUsed}
                          className={`px-4 py-2 rounded-lg text-lg font-medium transition-all ${
                            isUsed
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : showHint && buildTiles.length === transformBank.indexOf(tile)
                              ? 'bg-yellow-200 border-2 border-yellow-400 text-gray-800'
                              : 'bg-white border-2 border-indigo-300 hover:border-indigo-500 text-indigo-700'
                          }`}
                        >
                          {tile}
                        </motion.button>
                      );
                    })}
                  </div>
                  {buildTiles.length > 0 && (
                    <div className="text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCheckAssembly}
                        className="px-8 py-3 bg-green-500 text-white rounded-xl text-xl font-bold shadow-lg"
                      >
                        Check
                      </motion.button>
                    </div>
                  )}
                </>
              )}

              {/* GRAMMAR_FILL: which sentence is correct */}
              {currentItem.shape === 'fill_blank' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 4: Use the Rule</div>
                    {content.sentence_with_blank && (
                      <div className="text-2xl text-gray-800 mb-2">{content.sentence_with_blank}</div>
                    )}
                    <div className="text-lg text-gray-600">Which sentence uses the rule correctly?</div>
                  </div>
                  <div className="space-y-3">
                    {mcqOptions.map((option: string, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleMcqSelect(idx)}
                        className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                          selectedOption === idx
                            ? idx === content.correct_index
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : showHint && idx === content.correct_index
                            ? 'bg-yellow-100 border-2 border-yellow-400 text-gray-800'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                        }`}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Feedback */}
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
                {pickedStudent ? `${pickedStudent.name} cracked the grammar!` : 'Excellent!'}
              </h2>
              <div className="text-2xl text-gray-600">+{lastAward} points</div>
              {content.options?.[content.correct_index] && currentItem.shape !== 'transform' && (
                <button
                  onClick={() => content.audio_url && playAudioUrl(content.audio_url)}
                  className="mt-4 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold inline-flex items-center gap-2"
                >
                  <Volume2 size={20} /> Hear it
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-8xl mb-6">🏆</div>
              <h2 className="text-5xl font-bold text-indigo-900 mb-4">Grammar Lab Complete!</h2>
              <div className="text-2xl text-gray-600">All items practiced</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardGrammarLab;
