// BoardStoryQuest — Active story comprehension game (NEW GEN)
//
// Replaces: BoardStoryStage (passive read-along) + BoardStorySequencing (isolated MCQs)
//
// Pedagogical Loop:
//   1. SHOW story panel + text with highlighted vocab
//   2. PREDICTION GATE: "What happens next?" (3 image options)
//   3. REVEAL next panel (celebrate correct predictions)
//   4. COMPREHENSION CHECK every 2 panels (MCQ)
//   5. VOCAB TAPS record FSRS exposure throughout
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { getStory, getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem, StoryComprehensionContent } from '../../../types/exercise';

interface StoryPanel {
  id: string;
  imageUrl: string;
  text: string;
  audioUrl?: string;
}

const BoardStoryQuest = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded prediction options (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);

  const [currentPanelIdx, setCurrentPanelIdx] = useState(0);
  const [phase, setPhase] = useState<'reading' | 'prediction' | 'comprehension' | 'complete'>('reading');
  const [selectedPrediction, setSelectedPrediction] = useState<number | null>(null);
  const [selectedComprehension, setSelectedComprehension] = useState<number | null>(null);
  const [vocabTaps, setVocabTaps] = useState<Set<string>>(new Set());
  const [comprehensionIdx, setComprehensionIdx] = useState(0);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  /** Options eliminated by REVEAL_HINT (dimmed + struck) on the current question. */
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  /** Reveal-on-wrong: the correct option carries the amber ring during the hold. */
  const [revealed, setRevealed] = useState(false);
  /** Simple completion summary: pages read + comprehension score. */
  const [comprehensionStats, setComprehensionStats] = useState({ correct: 0, total: 0 });

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // ── Story panels: relational/manifest first (like BoardStoryStage), frozen
  //    data.pages fallback. Pages carry text + image; vocab is overlaid below.
  const storyPanels: StoryPanel[] = useMemo(() => {
    const relPages = getStory(state.activeUnit?.manifest).pages || [];
    const raw = (relPages.length > 0 ? relPages : data?.pages) || [];
    return raw.map((p: any, i: number) => ({
      id: String(p.id ?? i),
      imageUrl: p.imageUrl || p.image || p.image_url || '',
      text: p.text || '',
      audioUrl: p.audioUrl || p.audio_url,
    }));
  }, [state.activeUnit?.manifest, data]);

  // ── Vocab overlay: highlight unit vocabulary words that appear in each panel.
  const vocabByWord = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of getVocabulary(state.activeUnit?.manifest)) {
      if (v.word) m.set(v.word.toLowerCase(), v);
    }
    return m;
  }, [state.activeUnit?.manifest]);

  // Comprehension questions from pool
  const { items: comprehensionItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['STORY_COMPREHENSION'],
    limit: 10,
  });

  const currentItem = storyPanels[currentPanelIdx];

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    completeRef.current = false;
    setCurrentPanelIdx(0);
    setPhase('reading');
    setSelectedPrediction(null);
    setSelectedComprehension(null);
    setVocabTaps(new Set());
    setComprehensionIdx(0);
    setStreak(0);
    setEliminatedOptions([]);
    setRevealed(false);
    setComprehensionStats({ correct: 0, total: 0 });
  }, [turnId]);

  // Natural completion → terminal summary card + SLIDE_COMPLETE broadcast.
  // The ref makes it idempotent across the optimistic lastAction echo and the
  // remote's forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      completeRef.current = false;
      setCurrentPanelIdx(0);
      setPhase('reading');
      setSelectedPrediction(null);
      setSelectedComprehension(null);
      setVocabTaps(new Set());
      setComprehensionIdx(0);
      setStreak(0);
      setEliminatedOptions([]);
      setRevealed(false);
      setComprehensionStats({ correct: 0, total: 0 });
    } else if (type === 'NEXT_PANEL') {
      advanceToNext();
    } else if (type === 'REVEAL_HINT') {
      // Audit fix — the remote's Hint button used to be a dead action here.
      // During a comprehension question: eliminate (dim + strike) one wrong
      // option. No-op once an answer is picked or outside comprehension.
      if (phase !== 'comprehension' || selectedComprehension !== null) return;
      const question = comprehensionItems[comprehensionIdx];
      if (!question) return;
      const content = question.content as StoryComprehensionContent;
      const idx = content.options.findIndex(
        (_, i) => i !== content.correct_index && !eliminatedOptions.includes(i)
      );
      if (idx >= 0) setEliminatedOptions((prev) => [...prev, idx]);
    } else if (type === 'MARK_CORRECT') {
      // Teacher override ("Correct" on the remote): score the current
      // comprehension question as a clean correct (mistakesRef preserved)
      // and advance. No-op outside comprehension.
      if (phase !== 'comprehension' || selectedComprehension !== null) return;
      const question = comprehensionItems[comprehensionIdx];
      if (!question) return;
      const content = question.content as StoryComprehensionContent;
      const difficulty = question.difficulty || 2;
      playCue('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak === 3 || nextStreak === 5) {
        playCue('streak');
        triggerConfetti();
      }
      setComprehensionStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      setSelectedComprehension(content.correct_index);
      const picked = state.quickWheelWinner;
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, nextStreak);
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: question.objective_id,
          exerciseType: 'STORY_COMPREHENSION',
          difficulty,
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setTimeout(() => {
        setComprehensionIdx((prev) => prev + 1);
        advanceToNext();
      }, 900);
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const handleVocabTap = (word: string, audioUrl?: string) => {
    if (audioUrl) playAudioUrl(audioUrl).catch(() => {});
    setVocabTaps((prev) => new Set(prev).add(word));
    // NOTE: full FSRS RecordExposure for vocab taps needs a word→objective_id
    // join that isn't available client-side yet (CanonicalVocab carries no
    // objective id). Tap audio + visual state work now; exposure write is a
    // tracked follow-up so we don't ship a broken FSRS call.
  };

  // ── Prediction gate: REAL options from the NEXT panel (no fake content) ──
  const predictionOptions = React.useMemo(() => {
    const next = storyPanels[currentPanelIdx + 1];
    const current = storyPanels[currentPanelIdx];
    if (!next) return [];
    // Option 1 = the actual next panel text (correct). Options 2-3 = distractors
    // built from OTHER panels in the story (real content, not generated filler).
    const distractors = storyPanels
      .filter((_, i) => i !== currentPanelIdx && i !== currentPanelIdx + 1)
      .slice(0, 2)
      .map((p) => p.text);
    const opts = [
      { text: next.text, correct: true },
      ...distractors.map((t) => ({ text: t, correct: false })),
    ];
    // Shuffle so correct isn't always first — seeded (E1.5): same order on
    // every tab.
    return seededShuffle(opts, makeRng(seedBase, currentPanelIdx, 'predict'));
  }, [currentPanelIdx, storyPanels, seedBase]);

  const handlePredictionSelect = (idx: number) => {
    if (!currentItem || phase !== 'prediction') return;
    setSelectedPrediction(idx);
    // Predictions are engagement, not mastery — no scoring, no FSRS. A
    // correct guess still earns the positive cue.
    if (predictionOptions[idx]?.correct) playCue('correct');
    setTimeout(() => {
      const isEveryTwo = (currentPanelIdx + 1) % 2 === 0;
      if (isEveryTwo && comprehensionIdx < comprehensionItems.length) {
        setPhase('comprehension');
      } else {
        advanceToNext();
      }
    }, 900);
  };

  const handleComprehensionSelect = (idx: number) => {
    if (phase !== 'comprehension' || selectedComprehension !== null) return;
    const question = comprehensionItems[comprehensionIdx];
    if (!question) return;

    const content = question.content as StoryComprehensionContent;
    const correct = content.correct_index;
    const difficulty = question.difficulty || 2;

    setSelectedComprehension(idx);

    if (idx === correct) {
      playCue('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak === 3 || nextStreak === 5) {
        playCue('streak');
        triggerConfetti();
      }
      setComprehensionStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      const picked = state.quickWheelWinner;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, nextStreak);
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: question.objective_id,
          exerciseType: 'STORY_COMPREHENSION',
          difficulty,
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setLastAward(points);
      setTimeout(() => {
        setComprehensionIdx((prev) => prev + 1);
        advanceToNext();
      }, 900);
    } else {
      playCue('wrong');
      setStreak(0);
      setComprehensionStats((prev) => ({ ...prev, total: prev.total + 1 }));
      mistakesRef.current += 1;
      const picked = state.quickWheelWinner;
      if (picked) addPoints(picked, -MISTAKE_PENALTY);
      logAttempt({
        state,
        picked: picked || '',
        unitId,
        objectiveId: question.objective_id,
        exerciseType: 'STORY_COMPREHENSION',
        difficulty,
        correctness: 'incorrect',
        correct: false,
        modality: 'receptive',
        pushToRemediation,
      });
      if (mistakesRef.current >= 2) {
        // Shared reveal-on-wrong: highlight the correct option, hold the
        // teaching beat, then advance (audit fix — used to loop forever).
        playCue('reveal');
        setRevealed(true);
        setTimeout(() => {
          setRevealed(false);
          setComprehensionIdx((prev) => prev + 1);
          advanceToNext();
        }, 2200);
      } else {
        setTimeout(() => setSelectedComprehension(null), 800);
      }
    }
  };

  const advanceToNext = () => {
    if (currentPanelIdx < storyPanels.length - 1) {
      // Per-panel attempt reset for the next comprehension check.
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentPanelIdx((prev) => prev + 1);
      setPhase('reading');
      setSelectedPrediction(null);
      setSelectedComprehension(null);
      setEliminatedOptions([]);
      setRevealed(false);
    } else {
      completeGame();
    }
  };

  const playAudio = () => {
    if (currentItem?.audioUrl) {
      playAudioUrl(currentItem.audioUrl).catch(() => {});
    }
  };

  // Terminal empty state (audit fix — a story-less unit used to spin on
  // "Loading story…" forever): no pages once loading is done → tell the
  // teacher to move on instead of waiting.
  if (!loading && storyPanels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center">
        <div className="text-7xl mb-6">📚</div>
        <h2 className="text-4xl font-bold text-orange-900 mb-3">Story Quest</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          This unit has no story pages yet — skip to the next slide.
        </div>
      </div>
    );
  }

  if (loading || !currentItem) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="text-2xl text-gray-400">Loading story…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-amber-50 to-orange-50 p-8">
      {/* Story map bar */}
      <div className="mb-6">
        <div className="flex items-center justify-center gap-2">
          {storyPanels.map((_, idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all ${
                idx === currentPanelIdx
                  ? 'bg-orange-500 animate-pulse scale-125'
                  : idx < currentPanelIdx
                  ? 'bg-orange-400'
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <div className="text-center text-sm text-gray-500 mt-2">
          Page {currentPanelIdx + 1} of {storyPanels.length}
        </div>
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase === 'reading' && (
          <motion.div
            key="reading"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl w-full">
              {/* Story image */}
              {currentItem.imageUrl && (
                <div className="mb-6 rounded-xl overflow-hidden">
                  <img src={currentItem.imageUrl} alt="Story panel" className="w-full h-64 object-cover" />
                </div>
              )}

              {/* Story text with vocab highlighting */}
              <div className="text-2xl text-gray-800 leading-relaxed mb-6">
                {currentItem.text.split(' ').map((rawWord, idx) => {
                  const cleaned = rawWord.toLowerCase().replace(/[^\w']/g, '');
                  const vocabWord = cleaned ? vocabByWord.get(cleaned) : undefined;
                  if (vocabWord) {
                    return (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleVocabTap(vocabWord.word, vocabWord.audio_url)}
                        className={`inline-block mx-1 px-2 py-1 rounded-lg font-semibold transition-all ${
                          vocabTaps.has(vocabWord.word)
                            ? 'bg-green-200 text-green-800'
                            : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        }`}
                        title={vocabWord.translation || vocabWord.l1_translation || ''}
                      >
                        {rawWord}
                      </motion.button>
                    );
                  }
                  return <span key={idx}>{rawWord} </span>;
                })}
              </div>

              {/* Audio button */}
              {currentItem.audioUrl && (
                <div className="text-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                  >
                    <Volume2 size={20} />
                    Listen
                  </motion.button>
                </div>
              )}

              {/* Continue button */}
              <div className="text-center mt-6">
                {currentPanelIdx < storyPanels.length - 1 && predictionOptions.length > 0 ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPhase('prediction')}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-xl"
                  >
                    What happens next? →
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => advanceToNext()}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-xl"
                  >
                    Continue →
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'prediction' && predictionOptions.length > 0 && (
          <motion.div
            key="prediction"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              <div className="text-center mb-6">
                <div className="text-sm text-gray-500 mb-2">Prediction Time!</div>
                <div className="text-2xl text-gray-800">What happens next?</div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {predictionOptions.map((option, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePredictionSelect(idx)}
                    className={`p-6 rounded-xl text-left text-xl transition-all ${
                      selectedPrediction === idx
                        ? option.correct
                          ? 'bg-green-500 text-white'
                          : 'bg-amber-400 text-white'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                    }`}
                  >
                    {option.text}
                  </motion.button>
                ))}
              </div>
              {selectedPrediction !== null && (
                <div className="text-center mt-4 text-lg">
                  {predictionOptions[selectedPrediction]?.correct
                    ? <span className="text-green-600 font-bold">Great prediction! 🎯</span>
                    : <span className="text-amber-600 font-bold">Let's find out! →</span>}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'comprehension' && comprehensionItems[comprehensionIdx] && (
          <motion.div
            key={`comprehension-${comprehensionIdx}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              <div className="text-center mb-6">
                <div className="text-sm text-gray-500 mb-2">
                  Comprehension Check ({comprehensionIdx + 1} of {comprehensionItems.length})
                </div>
                <div className="text-2xl text-gray-800">
                  {(comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).prompt}
                </div>
              </div>
              <div className="space-y-3">
                {(comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).options.map((option, idx) => {
                  const isEliminated = eliminatedOptions.includes(idx);
                  const isCorrectIdx =
                    idx === (comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).correct_index;
                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => !isEliminated && handleComprehensionSelect(idx)}
                      className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                        isEliminated
                          ? 'opacity-40 line-through bg-gray-100 text-gray-400 cursor-not-allowed'
                          : selectedComprehension === idx
                          ? isCorrectIdx
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                      } ${revealed && isCorrectIdx ? 'ring-4 ring-amber-400' : ''}`}
                    >
                      {option}
                    </motion.button>
                  );
                })}
              </div>
              {/* Reveal-on-wrong teaching note (only when the content carries one) */}
              {revealed && (comprehensionItems[comprehensionIdx].content as any).explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-lg text-amber-900 text-center"
                >
                  {(comprehensionItems[comprehensionIdx].content as any).explanation}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-8xl mb-6">📚</div>
              <h2 className="text-5xl font-bold text-orange-900 mb-4">Story Complete!</h2>
              <div className="text-2xl text-gray-600 mb-2">{storyPanels.length} pages read</div>
              {comprehensionStats.total > 0 && (
                <div className="text-2xl text-gray-600">
                  Comprehension: {comprehensionStats.correct}/{comprehensionStats.total} correct
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardStoryQuest;
