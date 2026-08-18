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
// 2026-08-16 audit fixes: per-tile identity for duplicate words (bank tiles
// carry unique ids — `buildTiles.includes(tile)` used to disable every
// same-word tile), the hint now highlights the NEXT NEEDED bank tile (it used
// to light shuffled positions 0-1), per-position LCS feedback on check
// (green = right slot, amber = wrong slot), reveal-the-sentence on the 2nd
// miss (teaching hold ~2.4s), TRANSFORM banks carry 2 real distractors,
// 3 escalating rounds played from a per-round snapshot (no refetch flicker),
// streak bonuses, sound cues, MARK_CORRECT, SLIDE_COMPLETE broadcast +
// inbound handling.
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
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

/** A bank tile with a unique id — duplicate words must keep separate
 *  identities so each occurrence is independently tappable (audit fix). */
interface BankTile {
  id: number;
  text: string;
}

// 3 real rounds: buildRound escalates the exercise types/rungs per roundIndex,
// so round 3 pulls the higher-rung types via the engine.
const TOTAL_ROUNDS = 3;

const BoardSentenceLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded rng base: commander preview and projector must deal
  // identical distractors / tile banks for the same item.
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Per-item resolve latch (success / reveal / MARK_CORRECT) — an item can
   *  only resolve once; blocks double remote taps and post-reveal input. */
  const resolvedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [buildTiles, setBuildTiles] = useState<BankTile[]>([]);
  const [phase, setPhase] = useState<'building' | 'checking' | 'feedback' | 'complete'>('building');
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [lastAward, setLastAward] = useState(0);
  /** Per-position LCS feedback for the placed tiles (true = correct slot). */
  const [placedFeedback, setPlacedFeedback] = useState<boolean[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [roundIndex, setRoundIndex] = useState(1);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull WORD_BANK_BUILD and TRANSFORM items
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'SENTENCE_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: 2,
  });

  // Snapshot: play from the last resolved round's items so a refetch can't
  // blank the board mid-item. roundTransition covers the gap between rounds;
  // fetchStartedRef separates the real settle from the pre-fetch stale frame
  // (useBoardPool's loading flag flips one effect-pass after roundIndex does).
  const [roundItems, setRoundItems] = useState<PoolItem[]>([]);
  const [roundTransition, setRoundTransition] = useState(false);
  const fetchStartedRef = useRef(true);
  useEffect(() => {
    if (roundTransition) {
      if (loading) {
        fetchStartedRef.current = true;
        return;
      }
      if (!fetchStartedRef.current) return; // stale pre-fetch frame
      // Settled: adopt the new round, or end the slide if the higher rung
      // has no content for this unit yet.
      setRoundTransition(false);
      if (poolItems.length > 0) setRoundItems(poolItems);
      else completeGame();
      return;
    }
    if (!loading && poolItems.length > 0) setRoundItems(poolItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, poolItems, roundIndex, roundTransition]);

  // Normalize pool items
  const sentenceItems: SentenceItem[] = React.useMemo(() => {
    const items: SentenceItem[] = [];
    for (const pi of roundItems) {
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
        const targetTiles = correctSentence.split(' ');
        // Audit fix: the bank used to be ONLY the answer's own words (an
        // anagram, not a choice). Add 2 distractor words drawn from the item's
        // OTHER options so building requires a real decision.
        const targetSet = new Set(targetTiles);
        const distractorPool: string[] = [];
        transform.options.forEach((opt, i) => {
          if (i === transform.correct_index) return;
          for (const w of (opt || '').split(' ')) {
            if (!targetSet.has(w) && !distractorPool.includes(w)) distractorPool.push(w);
          }
        });
        const distractors = shuffle(distractorPool, makeRng(seedBase, pi.id, 'distractors')).slice(0, 2);
        items.push({
          poolItem: pi,
          promptText: transform.prompt_sentence,
          targetTiles,
          wordBank: [...targetTiles, ...distractors],
          translation: transform.instruction,
        });
      }
    }
    return items;
  }, [roundItems, seedBase]);

  const currentItem = sentenceItems[currentItemIdx];

  // CRITICAL: shuffle the word bank ONCE per item (not per render), so tiles
  // don't re-shuffle on every tap/state change. Every tile gets a unique id
  // so duplicate words keep separate identities (audit fix).
  const bankTiles = useMemo(() => {
    if (!currentItem) return [];
    return shuffle(currentItem.wordBank, makeRng(seedBase, currentItem.poolItem.id, 'bank')).map((text, idx) => ({ id: idx, text }));
  }, [currentItemIdx, currentItem, seedBase]);

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    fetchStartedRef.current = true;
    setCurrentItemIdx(0);
    setBuildTiles([]);
    setPhase('building');
    setHintLevel(0);
    setPlacedFeedback(null);
    setStreak(0);
    setRevealed(false);
    setRoundIndex(1);
    setRoundItems([]);
    setRoundTransition(false);
  }, [turnId]);

  // Inactivity hints
  useEffect(() => {
    if (phase !== 'building' || !currentItem) return;

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
  }, [phase, currentItemIdx, buildTiles.length, currentItem]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      fetchStartedRef.current = true;
      setCurrentItemIdx(0);
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
      setPlacedFeedback(null);
      setStreak(0);
      setRevealed(false);
      setRoundIndex(1);
      setRoundItems([]);
      setRoundTransition(false);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'CHECK_ANSWER') {
      handleCheck();
    } else if (type === 'REVEAL_HINT') {
      setHintLevel((prev) => Math.min(prev + 1, 2) as 0 | 1 | 2);
    } else if (type === 'MARK_CORRECT') {
      // Teacher override ("Correct" on the remote): score the current item
      // as a clean correct and advance. succeed's phase + resolvedRef guards
      // keep this from double-advancing during checking/feedback.
      succeed(1.0);
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      // completeRef stops us echoing our own broadcast back (our own
      // optimistic lastAction update re-enters this listener).
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const handleTileTap = (tile: BankTile) => {
    if (phase !== 'building' || !currentItem || resolvedRef.current) return;
    setBuildTiles((prev) => [...prev, tile]);
    setHintLevel(0); // Reset hint on activity
  };

  const handleRemoveTile = (idx: number) => {
    if (phase !== 'building' || resolvedRef.current) return;
    setBuildTiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Unified success path (natural pass + MARK_CORRECT): triple-write with the
  // streak bonus, then advance on the compressed celebration hold.
  const succeed = (partialCredit: number) => {
    if (!currentItem || resolvedRef.current || phase !== 'building' || completeRef.current) return;
    resolvedRef.current = true;
    playCue('correct');
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    if (nextStreak === 3 || nextStreak === 5) {
      playCue('streak');
      triggerConfetti();
    }
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || 2;
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialCredit, nextStreak);
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
    // Dead-time compression: pure celebration holds ≤900ms (audit fix).
    setTimeout(() => advanceToNext(), 900);
  };

  const handleCheck = () => {
    if (!currentItem || phase !== 'building' || resolvedRef.current) return;

    const placedTexts = buildTiles.map((t) => t.text);
    const partialCredit = computeLCSPartialCredit(placedTexts, currentItem.targetTiles);
    const difficulty = currentItem.poolItem.difficulty || 2;

    if (partialCredit >= PARTIAL_PASS_THRESHOLD) {
      // Success (with partial credit)
      succeed(partialCredit);
    } else {
      // Failed - penalty + analytics + remediation
      playCue('wrong');
      setStreak(0);
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
      // Per-position LCS feedback (the spec's promise): green = right word in
      // the right slot, amber = wrong slot (audit fix).
      setPlacedFeedback(placedTexts.map((t, i) => currentItem.targetTiles[i] === t));
      if (mistakesRef.current >= 2) {
        // 2nd consecutive miss: reveal the correct sentence, teach, advance.
        playCue('reveal');
        resolvedRef.current = true;
        setRevealed(true);
        setTimeout(() => advanceToNext(), 2400);
      } else {
        setPhase('checking');
        setTimeout(() => {
          setPhase('building');
          setBuildTiles([]);
          setPlacedFeedback(null);
        }, 1500);
      }
    }
  };

  // Natural completion → terminal card + SLIDE_COMPLETE broadcast. The ref
  // makes it idempotent across the optimistic lastAction echo and the remote's
  // forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  const advanceToNext = () => {
    if (completeRef.current) return;
    const resetItemState = () => {
      // Per-item attempt reset.
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
      setPlacedFeedback(null);
      setRevealed(false);
    };
    if (currentItemIdx < sentenceItems.length - 1) {
      resetItemState();
      setCurrentItemIdx((prev) => prev + 1);
    } else if (roundIndex < TOTAL_ROUNDS) {
      // Round done → escalate. Clear the snapshot + raise the transition flag
      // so the "level up" interstitial shows until the higher-rung items land.
      resetItemState();
      setCurrentItemIdx(0);
      setRoundItems([]);
      fetchStartedRef.current = false;
      setRoundTransition(true);
      setRoundIndex((r) => r + 1);
    } else {
      completeGame();
    }
  };

  const playAudio = () => {
    if (currentItem?.audioUrl) {
      playAudioUrl(currentItem.audioUrl).catch(() => {});
    }
  };

  // ── Round-transition interstitial / loading / empty states ──────────────
  if (roundTransition) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-green-50 to-teal-50">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="text-7xl mb-4">⚡</div>
          <h2 className="text-4xl font-bold text-green-900">Round {roundIndex} — Level up!</h2>
          <div className="text-lg text-gray-500 mt-2">Harder sentences coming…</div>
        </motion.div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-green-50 to-teal-50">
        <div className="text-2xl text-gray-400">Loading sentences…</div>
      </div>
    );
  }
  if (!currentItem && phase !== 'complete') {
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

  // Hint target (audit fix): the first UNUSED bank tile whose text equals the
  // NEXT NEEDED word (`targetTiles[placed.length]`) — the old hint lit
  // shuffled bank positions 0-1, which was usually the wrong tile.
  const nextNeededWord = currentItem ? currentItem.targetTiles[buildTiles.length] : undefined;
  const hintTile =
    hintLevel > 0 && nextNeededWord
      ? bankTiles.find((bt) => bt.text === nextNeededWord && !buildTiles.some((p) => p.id === bt.id))
      : undefined;

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
          Round {roundIndex} of {TOTAL_ROUNDS}
          {sentenceItems.length > 0 && ` · Sentence ${currentItemIdx + 1} of ${sentenceItems.length}`}
        </div>
        {streak > 1 && (
          <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-green-500 text-white rounded-full font-bold text-sm">
            🔥 Streak x{streak}
          </div>
        )}
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
                {currentItem?.translation && (
                  <div className="text-lg text-gray-600 mb-2">{currentItem.translation}</div>
                )}
                {currentItem?.promptText && (
                  <div className="text-xl text-gray-800 mb-2">{currentItem.promptText}</div>
                )}
                {currentItem?.audioUrl && (
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

              {/* Build area — placed tiles go amber when the failed check says
                  that slot holds the wrong word (per-position LCS feedback). */}
              <div className="min-h-24 bg-gray-50 rounded-xl p-6 mb-6 flex flex-wrap gap-2 justify-center items-center">
                {buildTiles.length === 0 && (
                  <div className="text-gray-400 text-lg">Tap tiles below to build the sentence</div>
                )}
                {buildTiles.map((tile, idx) => (
                  <motion.button
                    key={tile.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    onClick={() => handleRemoveTile(idx)}
                    className={`px-4 py-3 rounded-lg text-xl font-medium transition-all ${
                      placedFeedback && placedFeedback[idx] === false
                        ? 'bg-amber-400 text-white'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {tile.text}
                  </motion.button>
                ))}
              </div>

              {/* Word bank — per-tile ids: duplicate words stay independently
                  tappable, and only the tapped occurrence dims (audit fix). */}
              <div className="flex flex-wrap gap-3 justify-center mb-6">
                {bankTiles.map((tile) => {
                  const isUsed = buildTiles.some((t) => t.id === tile.id);
                  const isHint = hintLevel > 0 && hintTile?.id === tile.id;
                  return (
                    <motion.button
                      key={tile.id}
                      whileHover={{ scale: isUsed ? 1 : 1.05 }}
                      whileTap={{ scale: isUsed ? 1 : 0.95 }}
                      onClick={() => handleTileTap(tile)}
                      disabled={isUsed}
                      className={`px-4 py-3 rounded-lg text-xl font-medium transition-all ${
                        isUsed
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : isHint
                          ? `bg-yellow-200 border-2 border-yellow-400 text-gray-800${hintLevel >= 2 ? ' animate-pulse' : ''}`
                          : 'bg-white border-2 border-green-300 hover:border-green-500 text-green-700'
                      }`}
                    >
                      {tile.text}
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

              {/* Reveal (2nd miss): the correct sentence, amber — a teaching
                  hold (~2.4s), then advance. */}
              {revealed && currentItem && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-center"
                >
                  <div className="text-sm text-amber-700 font-semibold mb-2">The correct sentence:</div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {currentItem.targetTiles.map((w, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-lg text-lg font-medium"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </motion.div>
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
              {currentItem?.audioUrl && (
                <div className="mt-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
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
              <div className="text-2xl text-gray-600">All {TOTAL_ROUNDS} rounds mastered</div>
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
