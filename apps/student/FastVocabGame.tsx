// FastVocabGame — the student solo surface of the shared Fast Vocab engine
// (components/games/fastVocab). The original single-player loop, adapted:
// pick a unit (the original's "category select") → 4 lightning waves of
// (3-pair match wave + 2 timed speed questions) on that unit's pool →
// star tally + score count-up + personal best.
//
// Scoring uses the SAME math as the board (scoreForAttempt + streak, −1 per
// wrong) but stays local: recordAnswer for session accuracy, Gamification XP
// awarded once at the end (pattern A — self-awarded, no onSessionEnd, so the
// parent never double-awards). FSRS/analytics writes are board-only.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, Star, Trophy, Zap } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../types/exercise';
import { scoreForAttempt, MISTAKE_PENALTY } from '../board/templates/scoringDefaults';
import { playCue } from '../board/templates/playCue';
import { playAudioUrl } from '../../services/SpeechService';
import { GamificationService } from '../../services/GamificationService';
import { GEM_REWARDS, QUEST_TYPES } from '../../constants/gamification';
import FastVocabHud from '../../components/games/fastVocab/FastVocabHud';
import FastVocabMatchWave from '../../components/games/fastVocab/FastVocabMatchWave';
import FastVocabSpeedRound from '../../components/games/fastVocab/FastVocabSpeedRound';
import { useFastVocabTurn } from '../../components/games/fastVocab/useFastVocabTurn';
import {
  detectMode,
  buildUnitPairs,
  takeWave,
  starsFor,
  shuffle,
  resolveWaveSize,
} from '../../components/games/fastVocab/contentBuilder';
import type {
  FastVocabMode,
  FastVocabPair,
  FastVocabTurnSummary,
} from '../../components/games/fastVocab/types';
import type { FastVocabMatchResult, FastVocabSpeedResult } from '../../components/games/fastVocab/useFastVocabTurn';

const SPEED_COUNT = 2;
const SPEED_TIME_LIMIT = 10;
const WAVES_PER_RUN = 4;
/** localStorage key for the "Longer cycle" preference (5-pair waves). */
const LONG_WAVES_KEY = 'fastvocab-longwaves';

interface FastVocabGameProps {
  onBack: () => void;
}

interface PersonalBest {
  score: number;
  stars: number;
  accuracy: number;
  at: string;
}

const bestKey = (unitId: string) => `fastvocab-best-${unitId}`;
const readBest = (unitId: string): PersonalBest | null => {
  try {
    const raw = localStorage.getItem(bestKey(unitId));
    return raw ? (JSON.parse(raw) as PersonalBest) : null;
  } catch {
    return null;
  }
};

type Screen = 'select' | 'loading' | 'play' | 'done';

const FastVocabGame: React.FC<FastVocabGameProps> = ({ onBack }) => {
  const { state: solo, recordAnswer } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('select');
  const [unitId, setUnitId] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [mode, setMode] = useState<FastVocabMode>('image');
  const [unitPairs, setUnitPairs] = useState<FastVocabPair[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wavePairs, setWavePairs] = useState<FastVocabPair[]>([]);
  const [waveIndex, setWaveIndex] = useState(0); // 0-based
  const [totalWaves, setTotalWaves] = useState(WAVES_PER_RUN);
  const cursorRef = useRef(0);

  // "Longer cycle" game setting — 5-pair match waves instead of the 3-pair
  // lightning default. Persisted so the student's choice sticks between runs.
  const [longWaves, setLongWaves] = useState(() => {
    try {
      return localStorage.getItem(LONG_WAVES_KEY) === '1';
    } catch {
      return false;
    }
  });
  const waveSize = resolveWaveSize(longWaves ? 5 : 3);
  const toggleLongWaves = () =>
    setLongWaves((on) => {
      try {
        localStorage.setItem(LONG_WAVES_KEY, on ? '0' : '1');
      } catch {
        /* preference persistence is a nicety, never load-bearing */
      }
      return !on;
    });

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [correctCount, setCorrectCount] = useState(0);
  const correctCountRef = useRef(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const totalsRef = useRef({ firstTry: 0, interactions: 0, bestStreak: 0 });
  const [finalStars, setFinalStars] = useState(0);
  const awardedRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Unit select → load the unit's pool ──────────────────────────────────
  const startUnit = useCallback(
    async (id: string, title: string) => {
      setScreen('loading');
      setLoadError(null);
      setUnitId(id);
      setUnitTitle(title);
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', id)
        .in('exercise_type', ['IMAGE_SELECT', 'MEANING_MATCH'])
        .limit(500);
      if (error) {
        setLoadError('Could not load this unit. Please try again.');
        setScreen('select');
        return;
      }
      const items: PoolItem[] = (data || []).map(toPoolItem).filter((p): p is PoolItem => p !== null);
      const detected = detectMode(items);
      const pairs = buildUnitPairs(shuffle(items), detected);
      if (pairs.length === 0) {
        setLoadError('No vocabulary exercises for this unit yet — try another unit.');
        setScreen('select');
        return;
      }
      setMode(detected);
      setUnitPairs(pairs);
      const first = takeWave(pairs, 0, waveSize);
      cursorRef.current = first.nextCursor;
      setWavePairs(first.wave);
      setWaveIndex(0);
      // Tiny pools wrap the cursor, so cap waves at the pool's fresh-content
      // capacity (a 4-word unit gets 2 distinct waves, not 4 repeats).
      setTotalWaves(Math.max(1, Math.min(WAVES_PER_RUN, Math.ceil(pairs.length / waveSize))));
      setScore(0);
      scoreRef.current = 0;
      setCorrectCount(0);
      correctCountRef.current = 0;
      setTotalAttempts(0);
      totalsRef.current = { firstTry: 0, interactions: 0, bestStreak: 0 };
      awardedRef.current = false;
      setScreen('play');
    },
    [waveSize],
  );

  // ── Events (same math as the board, local writes only) ─────────────────
  const events = useMemo(
    () => ({
      onMatchResult: (pair: FastVocabPair, r: FastVocabMatchResult) => {
        if (r.correct) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) playCue('streak');
          playAudioUrl(pair.audioUrl, pair.word).catch(() => {});
          const pts = scoreForAttempt(0, pair.difficulty, 1.0, r.streak);
          scoreRef.current += pts;
          setScore(scoreRef.current);
          correctCountRef.current += 1;
          setCorrectCount(correctCountRef.current);
          setTotalAttempts((t) => t + 1);
          recordAnswer(true);
        } else {
          playCue('wrong');
          if (r.missCount === 2) playCue('reveal');
          scoreRef.current -= MISTAKE_PENALTY;
          setScore(scoreRef.current);
          setTotalAttempts((t) => t + 1);
          recordAnswer(false);
        }
      },
      onSpeedResult: (q: { difficulty: 1 | 2 | 3; correctWord: string; audioUrl?: string }, r: FastVocabSpeedResult) => {
        if (r.correct) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) playCue('streak');
          playAudioUrl(q.audioUrl, q.correctWord).catch(() => {});
          const pts = scoreForAttempt(0, q.difficulty, 1.0, r.streak);
          scoreRef.current += pts;
          setScore(scoreRef.current);
          correctCountRef.current += 1;
          setCorrectCount(correctCountRef.current);
          setTotalAttempts((t) => t + 1);
          recordAnswer(true);
        } else {
          if (!r.timedOut) playCue('wrong');
          else {
            playCue('reveal');
            playAudioUrl(q.audioUrl, q.correctWord).catch(() => {});
          }
          if (!r.timedOut) {
            // timeout costs nothing (clock-anxiety rule)
            scoreRef.current -= MISTAKE_PENALTY;
            setScore(scoreRef.current);
          }
          setTotalAttempts((t) => t + 1);
          recordAnswer(false);
        }
      },
      onComplete: (summary: FastVocabTurnSummary) => {
        totalsRef.current.firstTry += summary.firstTryCorrect;
        totalsRef.current.interactions += summary.totalInteractions;
        totalsRef.current.bestStreak = Math.max(totalsRef.current.bestStreak, summary.bestStreak);
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          const nextWave = waveIndex + 1;
          if (nextWave < totalWaves) {
            // advance to the next wave (wraps the pool cursor)
            const { wave, nextCursor } = takeWave(unitPairs, cursorRef.current, waveSize);
            cursorRef.current = nextCursor;
            setWaveIndex(nextWave);
            setWavePairs(wave);
          } else {
            finishRun();
          }
        }, 1400);
      },
    }),
    // The controller holds events in a ref; refs keep score/correct fresh so
    // the memo deps only need the wave-advance inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitPairs, waveIndex, totalWaves, recordAnswer],
  );

  const turn = useFastVocabTurn({
    wavePairs,
    poolPairs: unitPairs,
    mode,
    speedCount: SPEED_COUNT,
    timeLimit: SPEED_TIME_LIMIT,
    events,
  });

  // ── Run completion: stars, personal best, XP/gems/quests (once) ────────
  const finishRun = () => {
    const t = totalsRef.current;
    const stars = starsFor(t.firstTry, t.interactions);
    const finalScore = scoreRef.current;
    const finalCorrect = correctCountRef.current;
    setFinalStars(stars);
    setScreen('done');
    try {
      const prev = readBest(unitId);
      const accuracy = t.interactions > 0 ? Math.round((t.firstTry / t.interactions) * 100) : 0;
      if (!prev || finalScore > prev.score) {
        localStorage.setItem(
          bestKey(unitId),
          JSON.stringify({ score: finalScore, stars, accuracy, at: new Date().toISOString() } satisfies PersonalBest),
        );
      }
    } catch {
      /* storage unavailable — personal best is a nicety, never load-bearing */
    }
    if (!awardedRef.current) {
      awardedRef.current = true;
      const xp = Math.max(1, finalCorrect);
      GamificationService.awardXP(xp, 'lesson_complete').catch(() => {});
      if (stars === 5) GamificationService.awardGems(GEM_REWARDS.PERFECT_LESSON, 'lesson_complete').catch(() => {});
      GamificationService.updateQuestProgress(QUEST_TYPES.COMPLETE_LESSONS, 1).catch(() => {});
      GamificationService.updateQuestProgress(QUEST_TYPES.EARN_XP, xp).catch(() => {});
    }
  };

  useEffect(
    () => () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    },
    [],
  );

  // ── Screen: unit select ─────────────────────────────────────────────────
  if (screen === 'select' || screen === 'loading') {
    const units = solo.units || [];
    return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
        <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <ChevronLeft size={24} />
          </button>
          <span className="font-bold text-slate-800">Fast Vocab</span>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-3 border-2 border-amber-200">
              <Zap size={30} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Pick your words</h1>
            <p className="text-slate-500 text-sm">
              Match {waveSize} pairs, then beat the clock — up to {WAVES_PER_RUN} waves.
            </p>
            {/* Longer-cycle game setting — same option the teacher has on the plan block. */}
            <div className="mt-4 mx-auto max-w-xs bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-left min-w-0">
                <p className="text-sm font-bold text-slate-800">Longer cycle</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {longWaves ? '5 images per wave' : '3 images per wave (default)'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={longWaves}
                onClick={toggleLongWaves}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${longWaves ? 'bg-amber-500' : 'bg-slate-300'}`}
                title="Toggle the match wave between 3 and 5 images"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${longWaves ? 'translate-x-5' : ''}`}
                />
              </button>
            </div>
            {loadError && <p className="text-red-500 text-sm mt-3 font-medium">{loadError}</p>}
          </div>
          {screen === 'loading' ? (
            <div className="flex flex-col items-center text-slate-400 py-10">
              <Loader2 className="animate-spin mb-3" size={28} /> Loading words…
            </div>
          ) : units.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 text-slate-500">
              No units yet — join a class or open a lesson first.
            </div>
          ) : (
            <div className="space-y-3">
              {units.map((u) => {
                const best = readBest(u.id);
                return (
                  <motion.button
                    key={u.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => startUnit(u.id, u.title)}
                    className="w-full bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-amber-300 flex items-center gap-4 text-left"
                  >
                    <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center shrink-0">
                      <Zap size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{u.title}</p>
                      <p className="text-xs text-slate-400 truncate">{u.topic ? `${u.topic} · ` : ''}{u.level || ''}</p>
                    </div>
                    {best && (
                      <div className="text-right shrink-0">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star key={i} size={12} className={i < best.stars ? 'text-amber-400' : 'text-slate-200'} fill={i < best.stars ? 'currentColor' : 'none'} />
                          ))}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 tabular-nums">best {best.score}</p>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Screen: done (star tally + count-up + rewards) ──────────────────────
  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.interactions > 0 ? Math.round((t.firstTry / t.interactions) * 100) : 0;
    const displayScore = Math.max(0, score);
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6 relative overflow-hidden">
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="text-4xl font-black mb-1"
        >
          Well Done!
        </motion.h1>
        <p className="text-slate-400 mb-6">{unitTitle}</p>

        <div className="flex gap-2 mb-8">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3 + i * 0.22, type: 'spring', stiffness: 300, damping: 14 }}
            >
              <Star size={44} className={i < finalStars ? 'text-amber-400' : 'text-slate-700'} fill={i < finalStars ? 'currentColor' : 'none'} />
            </motion.span>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-5xl font-black tabular-nums text-emerald-400 mb-1"
        >
          {displayScore}
        </motion.p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">final score</p>

        <div className="flex gap-6 text-center mb-8">
          <div>
            <p className="text-2xl font-black text-orange-400 tabular-nums">{t.bestStreak}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">best streak</p>
          </div>
          <div>
            <p className="text-2xl font-black text-indigo-300 tabular-nums">{accuracy}%</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">first-try</p>
          </div>
          <div>
            <p className="text-2xl font-black text-lime-400 tabular-nums">+{Math.max(1, correctCount)} XP</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">earned</p>
          </div>
        </div>

        {finalStars === 5 && (
          <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.4, type: 'spring' }} className="flex items-center gap-2 text-amber-300 font-bold mb-6">
            <Trophy size={18} /> +{GEM_REWARDS.PERFECT_LESSON} gems — perfect run!
          </motion.p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => startUnit(unitId, unitTitle)}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 rounded-2xl font-bold text-slate-900"
          >
            Play again
          </button>
          <button onClick={onBack} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-2xl font-bold">
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: play ────────────────────────────────────────────────────────
  const matchProgress = turn.phase === 'match' ? turn.matchedPairIds.length / Math.max(1, wavePairs.length) : 1;
  const hudProgress =
    (waveIndex + (turn.phase === 'match' ? matchProgress * 0.5 : 0.5 + (turn.qIdx / Math.max(1, turn.speedQs.length)) * 0.5)) /
    totalWaves;
  const hudLabel =
    turn.phase === 'match'
      ? `Wave ${waveIndex + 1}/${totalWaves} · match`
      : turn.phase === 'speed'
        ? `Wave ${waveIndex + 1}/${totalWaves} · speed ${turn.qIdx + 1}/${turn.speedQs.length}`
        : 'wave complete';

  return (
    <div className="h-full bg-slate-900 flex flex-col font-sans relative overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-full shrink-0">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <FastVocabHud
            streak={turn.streak}
            progressLabel={hudLabel}
            progress={hudProgress}
            timeRemaining={turn.phase === 'speed' ? turn.timeRemaining : undefined}
            timeLimit={turn.phase === 'speed' ? turn.timeLimit : undefined}
            compact
          />
        </div>
        <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl font-black text-emerald-400 tabular-nums text-sm shrink-0">
          {Math.max(0, score)}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative px-3 pb-4">
        <AnimatePresence mode="wait">
          {turn.phase === 'match' && (
            <motion.div
              key={`match-${waveIndex}-${wavePairs.map((p) => p.id).join(',')}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0"
            >
              <FastVocabMatchWave
                pairs={wavePairs}
                mode={mode}
                matchedPairIds={turn.matchedPairIds}
                hintPairId={turn.hintPairId}
                revealPair={turn.revealPair}
                wrongPairId={turn.wrongPairId}
                onPairAttempt={turn.attemptPair}
              />
            </motion.div>
          )}
          {turn.phase === 'speed' && turn.currentQ && (
            <motion.div
              key={`speed-${turn.currentQ.id}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0"
            >
              <FastVocabSpeedRound
                question={turn.currentQ}
                mode={mode}
                qIndex={turn.qIdx}
                qTotal={turn.speedQs.length}
                selectedChoice={turn.selectedChoice}
                revealCorrect={turn.revealCorrect}
                wrongChoice={turn.wrongChoice}
                eliminatedChoices={turn.eliminatedChoices}
                locked={turn.selectedChoice !== null}
                onChoose={turn.chooseAnswer}
                compact
              />
            </motion.div>
          )}
          {turn.phase === 'complete' && (
            <motion.div
              key={`wave-done-${waveIndex}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-white"
            >
              <p className="text-3xl font-black mb-1">Wave {waveIndex + 1} clear!</p>
              <p className="text-slate-400 text-sm">{waveIndex + 1 < totalWaves ? 'next wave loading…' : 'finishing up…'}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes fv-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-fv-shake { animation: fv-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default FastVocabGame;
