// BoardPhonicsArena — 3-round phonics game (NEW GEN)
//
// Replaces: BoardISayYouSay (unscored choral phase)
//
// Pedagogical Loop:
//   Round 1 "Discriminate": PLAY pair audio → STUDENT taps which word (2 options)
//   Round 2 "Identify": PLAY pair audio → STUDENT taps from 4 options (harder)
//   Round 3 "Produce": SHOW word+image → STUDENT speaks → speech recognition validates
//   → Streak counter across rounds → Final celebration
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Mic, MicOff } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useSpeechRecognition } from './useSpeechRecognition';
import { logAttempt } from './scoreAttempt';
import { shuffle } from './scoringUtils';
import { useSpeech } from './useSpeech';
import { preloadRoundSpeech } from './speechPreload';
import type { PoolItem, MinimalPairSwipeContent, SpeakSentenceContent } from '../../../types/exercise';

interface PhonicsItem {
  poolItem: PoolItem;
  word1: string;
  word2: string;
  /** Pre-stored audio (legacy); optional — reference-based items resolve at play time. */
  audioUrl?: string;
  /** TTS source text (the played pair member) when audioUrl is absent. */
  speechText?: string;
  correctWord: string;
  targetText?: string;
}

const BoardPhonicsArena = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentRound, setCurrentRound] = useState<1 | 2 | 3>(1);
  const [round1Idx, setRound1Idx] = useState(0);
  const [round2Idx, setRound2Idx] = useState(0);
  const [round3Idx, setRound3Idx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Pull phonics items
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'PHONICS_ARENA',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: 10,
  });

  // Categorize items by round
  const round1Items: PhonicsItem[] = React.useMemo(() => {
    return poolItems
      .filter((pi) => pi.exercise_type === 'MINIMAL_PAIR_SWIPE')
      .slice(0, 5)
      .map((pi) => {
        const content = pi.content as MinimalPairSwipeContent;
        return {
          poolItem: pi,
          word1: content.pair[0],
          word2: content.pair[1],
          audioUrl: content.audio_url,
          speechText: content.prompt_text || content.pair[0],
          correctWord: content.options[content.correct_index]?.text || content.pair[0],
        };
      });
  }, [poolItems]);

  const round2Items: PhonicsItem[] = React.useMemo(() => {
    return poolItems
      .filter((pi) => pi.exercise_type === 'MINIMAL_PAIR_SWIPE')
      .slice(5, 9)
      .map((pi) => {
        const content = pi.content as MinimalPairSwipeContent;
        return {
          poolItem: pi,
          word1: content.pair[0],
          word2: content.pair[1],
          audioUrl: content.audio_url,
          speechText: content.prompt_text || content.pair[0],
          correctWord: content.options[content.correct_index]?.text || content.pair[0],
        };
      });
  }, [poolItems]);

  const round3Items: PhonicsItem[] = React.useMemo(() => {
    return poolItems
      .filter((pi) => pi.exercise_type === 'SPEAK_SENTENCE')
      .slice(0, 3)
      .map((pi) => {
        const content = pi.content as SpeakSentenceContent;
        return {
          poolItem: pi,
          word1: '',
          word2: '',
          audioUrl: content.target_audio || '',
          speechText: content.target_sentence || content.target_word,
          correctWord: content.target_word || content.target_sentence,
          targetText: content.target_word || content.target_sentence,
        };
      });
  }, [poolItems]);

  const currentItem = currentRound === 1 ? round1Items[round1Idx] : currentRound === 2 ? round2Items[round2Idx] : round3Items[round3Idx];

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

  // ── Real option sets (no fake placeholder words). Round 1 = the 2 pair
  //    words; Round 2 = the pair + 2 real distractors drawn from the OTHER
  //    minimal pairs in the pool, shuffled so the answer isn't positional.
  const currentWords: string[] = useMemo(() => {
    if (!currentItem || currentRound === 3) return [];
    if (currentRound === 1) return [currentItem.word1, currentItem.word2];
    // Round 2: gather candidate distractors from every other minimal pair.
    const others = [...round1Items, ...round2Items]
      .filter((it) => it.poolItem.id !== currentItem.poolItem.id)
      .flatMap((it) => [it.word1, it.word2])
      .filter((w) => w && w !== currentItem.word1 && w !== currentItem.word2);
    const distractors = Array.from(new Set(others)).slice(0, 2);
    return shuffle([currentItem.word1, currentItem.word2, ...distractors]);
  }, [currentItem, currentRound, round1Items, round2Items]);

  // Speech recognition for Round 3
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
        const picked = state.quickWheelWinner;
        const difficulty = currentItem?.poolItem.difficulty || 2;
        const points = scoreForAttempt(mistakesRef.current, difficulty, Math.max(0.6, Math.min(1, score)));
        if (picked && !awardedRef.current) {
          awardedRef.current = true;
          if (points > 0) addPoints(picked, points);
          logAttempt({
            state,
            picked,
            unitId,
            objectiveId: currentItem?.poolItem.objective_id,
            exerciseType: currentItem?.poolItem.exercise_type,
            difficulty,
            correctness: score >= 1 ? 'correct' : 'partial',
            modality: 'productive',
            pushToRemediation,
          });
        }
        setStreak((prev) => prev + 1);
        setPhaseComplete(true);
        setTimeout(() => advanceRound3(), 2000);
      } else {
        const picked = state.quickWheelWinner;
        if (picked) {
          mistakesRef.current += 1;
          addPoints(picked, -MISTAKE_PENALTY);
        }
        logAttempt({
          state,
          picked: picked || '',
          unitId,
          objectiveId: currentItem?.poolItem.objective_id,
          exerciseType: currentItem?.poolItem.exercise_type,
          difficulty: currentItem?.poolItem.difficulty || 2,
          correctness: 'incorrect',
          correct: false,
          modality: 'productive',
          pushToRemediation,
        });
        setStreak(0);
      }
    },
  });

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCurrentRound(1);
    setRound1Idx(0);
    setRound2Idx(0);
    setRound3Idx(0);
    setSelectedWord(null);
    setStreak(0);
    setPhaseComplete(false);
    setAllDone(false);
  }, [turnId]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentRound(1);
      setRound1Idx(0);
      setRound2Idx(0);
      setRound3Idx(0);
      setSelectedWord(null);
      setStreak(0);
      setPhaseComplete(false);
      setAllDone(false);
    } else if (type === 'NEXT_ITEM') {
      advanceCurrentRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const playAudio = () => {
    if (currentItem?.audioUrl || currentItem?.speechText) {
      playCurrentSpeech();
    }
  };

  const handleWordSelect = (idx: number) => {
    if (!currentItem || currentRound === 3) return;
    const selected = currentWords[idx];
    const isCorrect = selected === currentItem.correctWord;

    setSelectedWord(idx);

    if (isCorrect) {
      const picked = state.quickWheelWinner;
      const difficulty = currentItem.poolItem.difficulty || 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0);
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
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setStreak((prev) => prev + 1);
      setPhaseComplete(true);
      setTimeout(() => advanceCurrentRound(), 1500);
    } else {
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
      setStreak(0);
      setTimeout(() => setSelectedWord(null), 800);
    }
  };

  const advanceCurrentRound = () => {
    // Per-item attempt reset — each pair/word is its own scored attempt.
    mistakesRef.current = 0;
    awardedRef.current = false;
    if (currentRound === 1) {
      if (round1Idx < round1Items.length - 1) {
        setRound1Idx((prev) => prev + 1);
      } else {
        setCurrentRound(2);
        setRound2Idx(0);
      }
    } else if (currentRound === 2) {
      if (round2Idx < round2Items.length - 1) {
        setRound2Idx((prev) => prev + 1);
      } else {
        setCurrentRound(3);
        setRound3Idx(0);
      }
    } else {
      advanceRound3();
    }
    setSelectedWord(null);
    setPhaseComplete(false);
  };

  const advanceRound3 = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    if (round3Idx < round3Items.length - 1) {
      setRound3Idx((prev) => prev + 1);
      setPhaseComplete(false);
    } else {
      setAllDone(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-2xl text-gray-400">Loading phonics items…</div>
      </div>
    );
  }

  const hasAnyItems = round1Items.length > 0 || round2Items.length > 0 || round3Items.length > 0;
  if (!hasAnyItems) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-red-50 to-orange-50 p-8 text-center">
        <div className="text-7xl mb-6">🎯</div>
        <h2 className="text-4xl font-bold text-red-900 mb-3">Phonics Arena</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No phonics items ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  // Skip empty rounds gracefully (e.g. no SPEAK_SENTENCE items for round 3).
  if (!currentItem && !allDone) {
    if (currentRound === 1 && round1Items.length === 0) { setCurrentRound(2); return null; }
    if (currentRound === 2 && round2Items.length === 0) { setCurrentRound(3); return null; }
    if (currentRound === 3 && round3Items.length === 0) { setAllDone(true); return null; }
  }

  const allComplete = allDone || (currentRound === 3 && round3Idx >= round3Items.length && phaseComplete);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-red-50 to-orange-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={`round-${currentRound}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-red-900 mb-2"
        >
          Phonics Arena
        </motion.h1>
        <div className="flex items-center justify-center gap-2 mb-2">
          {[1, 2, 3].map((r) => (
            <div
              key={r}
              className={`w-3 h-3 rounded-full ${
                r === currentRound ? 'bg-red-600 animate-pulse' : r < currentRound ? 'bg-red-400' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <div className="text-sm text-gray-500">
          Round {currentRound}: {currentRound === 1 ? 'Discriminate' : currentRound === 2 ? 'Identify' : 'Produce'}
        </div>
        {streak > 1 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-orange-500 text-white rounded-full font-bold"
          >
            🔥 Streak x{streak}
          </motion.div>
        )}
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {!allComplete && (
          <motion.div
            key={`round-${currentRound}-item-${currentRound === 1 ? round1Idx : currentRound === 2 ? round2Idx : round3Idx}`}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              {/* Round 1 & 2: Discriminate/Identify */}
              {currentRound !== 3 && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">
                      {currentRound === 1 ? 'Round 1: Discriminate' : 'Round 2: Identify'}
                    </div>
                    <div className="text-xl text-gray-700">Which word did you hear?</div>
                  </div>

                  {/* Audio player */}
                  <div className="text-center mb-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={playAudio}
                      className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold flex items-center gap-3 mx-auto text-2xl"
                    >
                      <Volume2 size={32} />
                      Listen
                    </motion.button>
                  </div>

                  {/* Word options */}
                  <div className={`grid ${currentWords.length > 2 ? 'grid-cols-2' : 'grid-cols-2'} gap-4`}>
                    {currentWords.map((word, idx) => (
                      <motion.button
                        key={`${word}-${idx}`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleWordSelect(idx)}
                        className={`p-6 rounded-xl text-2xl font-bold transition-all ${
                          selectedWord === idx
                            ? word === currentItem.correctWord
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                        }`}
                      >
                        {word}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}

              {/* Round 3: Produce */}
              {currentRound === 3 && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Round 3: Produce</div>
                    <div className="text-xl text-gray-700">Say the word!</div>
                  </div>

                  {/* Target display */}
                  <div className="text-center mb-8">
                    <div className="text-4xl font-bold text-red-900 mb-4">{currentItem.targetText}</div>
                    {(currentItem.audioUrl || currentItem.speechText) && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={playAudio}
                        className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold flex items-center gap-2 mx-auto"
                      >
                        <Volume2 size={20} />
                        Listen first
                      </motion.button>
                    )}
                  </div>

                  {/* Mic button */}
                  {!speechSupported ? (
                    <div className="text-center text-gray-500 text-lg">
                      <MicOff size={48} className="mx-auto mb-4 text-gray-400" />
                      Speech recognition not supported
                    </div>
                  ) : (
                    <div className="text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={startListening}
                        disabled={isListening}
                        className={`px-12 py-6 rounded-full font-bold text-2xl flex items-center gap-3 mx-auto ${
                          isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                      >
                        <Mic size={32} />
                        {isListening ? 'Listening...' : 'Tap to Speak'}
                      </motion.button>

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
              <div className="text-8xl mb-6">🎯</div>
              <h2 className="text-5xl font-bold text-red-900 mb-4">Phonics Arena Complete!</h2>
              <div className="text-2xl text-gray-600">Final streak: {streak} 🔥</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && !allComplete && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardPhonicsArena;
