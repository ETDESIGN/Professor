// FastVocabStep — the in-lesson surface of the shared Fast Vocab engine
// (components/games/fastVocab), for FAST_VOCAB blocks on the Student Path.
//
// Same loop as the standalone FastVocabGame (waves of match + speed
// questions on the unit's pool) minus the unit picker — the unit is the
// lesson's active unit — and minus the self-awarded XP: inside a lesson,
// completion flows through the player pipeline (handleNext → LessonComplete
// → finalizeLesson), which awards XP exactly once. recordAnswer still feeds
// the session accuracy, so stage stars reflect the real run.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, Star, Zap } from 'lucide-react';
import { useSoloSession } from '../../../store/SoloSessionContext';
import { supabase } from '../../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../../types/exercise';
import { scoreForAttempt, MISTAKE_PENALTY } from '../../board/templates/scoringDefaults';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import FastVocabHud from '../../../components/games/fastVocab/FastVocabHud';
import FastVocabMatchWave from '../../../components/games/fastVocab/FastVocabMatchWave';
import FastVocabSpeedRound from '../../../components/games/fastVocab/FastVocabSpeedRound';
import { useFastVocabTurn } from '../../../components/games/fastVocab/useFastVocabTurn';
import { preloadWaveAudio } from '../../../components/games/fastVocab/preloadWaveAudio';
import {
  detectMode,
  buildUnitPairs,
  takeWave,
  starsFor,
  shuffle,
  resolveWaveSize,
} from '../../../components/games/fastVocab/contentBuilder';
import type {
  FastVocabMode,
  FastVocabPair,
  FastVocabTurnSummary,
} from '../../../components/games/fastVocab/types';
import type { FastVocabMatchResult, FastVocabSpeedResult } from '../../../components/games/fastVocab/useFastVocabTurn';

const SPEED_COUNT = 2;
const SPEED_TIME_LIMIT = 10;
const WAVES_PER_RUN = 4;

interface FastVocabStepProps {
  unitId: string;
  unitTitle: string;
  /** Plan block setting: 3 (lightning default) or 5 (longer cycle). */
  waveSize?: number;
  onDone: () => void;
  onExit: () => void;
}

type Screen = 'loading' | 'play' | 'done' | 'error';

const FastVocabStep: React.FC<FastVocabStepProps> = ({ unitId, unitTitle, waveSize: waveSizeProp, onDone, onExit }) => {
  const { recordAnswer } = useSoloSession();
  const waveSize = resolveWaveSize(waveSizeProp);

  const [screen, setScreen] = useState<Screen>('loading');
  const [mode, setMode] = useState<FastVocabMode>('image');
  const [unitPairs, setUnitPairs] = useState<FastVocabPair[]>([]);

  const [wavePairs, setWavePairs] = useState<FastVocabPair[]>([]);
  const [waveIndex, setWaveIndex] = useState(0); // 0-based
  const [totalWaves, setTotalWaves] = useState(WAVES_PER_RUN);
  const cursorRef = useRef(0);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [correctCount, setCorrectCount] = useState(0);
  const correctCountRef = useRef(0);
  const totalsRef = useRef({ firstTry: 0, interactions: 0, bestStreak: 0 });
  const [finalStars, setFinalStars] = useState(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load the unit's pool (same query as the standalone surface) ─────────
  const loadRun = useCallback(async () => {
    setScreen('loading');
    const { data, error } = await supabase
      .from('pool_items')
      .select('*')
      .eq('unit_id', unitId)
      .in('exercise_type', ['IMAGE_SELECT', 'MEANING_MATCH'])
      .limit(500);
    if (error) {
      setScreen('error');
      return;
    }
    const items: PoolItem[] = (data || []).map(toPoolItem).filter((p): p is PoolItem => p !== null);
    const detected = detectMode(items);
    const pairs = buildUnitPairs(shuffle(items), detected);
    if (pairs.length === 0) {
      setScreen('error');
      return;
    }
    setMode(detected);
    setUnitPairs(pairs);
    const first = takeWave(pairs, 0, waveSize);
    cursorRef.current = first.nextCursor;
    setWavePairs(first.wave);
    setWaveIndex(0);
    setTotalWaves(Math.max(1, Math.min(WAVES_PER_RUN, Math.ceil(pairs.length / waveSize))));
    setScore(0);
    scoreRef.current = 0;
    setCorrectCount(0);
    correctCountRef.current = 0;
    totalsRef.current = { firstTry: 0, interactions: 0, bestStreak: 0 };
    setScreen('play');
  }, [unitId, waveSize]);

  useEffect(() => { loadRun(); }, [loadRun]);

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
          recordAnswer(true);
        } else {
          playCue('wrong');
          if (r.missCount === 2) playCue('reveal');
          scoreRef.current -= MISTAKE_PENALTY;
          setScore(scoreRef.current);
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
            const { wave, nextCursor } = takeWave(unitPairs, cursorRef.current, waveSize);
            cursorRef.current = nextCursor;
            setWaveIndex(nextWave);
            setWavePairs(wave);
          } else {
            setFinalStars(starsFor(totalsRef.current.firstTry, totalsRef.current.interactions));
            setScreen('done');
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

  // Fetch-only prefetch of the wave's stored audio.
  useEffect(() => {
    if (wavePairs.length > 0) preloadWaveAudio(wavePairs);
  }, [wavePairs]);

  useEffect(
    () => () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    },
    [],
  );

  if (screen === 'loading') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="animate-spin mb-3" size={28} />
        Loading words…
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
        <div className="w-16 h-16 bg-slate-800 text-amber-400 rounded-2xl flex items-center justify-center mb-4">
          <Zap size={30} />
        </div>
        <p className="text-lg font-bold mb-1">No vocabulary exercises yet</p>
        <p className="text-slate-400 text-sm mb-6 text-center">This round needs the unit's exercise pool — continue with the lesson for now.</p>
        <button onClick={onDone} className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-2xl">
          Continue
        </button>
      </div>
    );
  }

  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.interactions > 0 ? Math.round((t.firstTry / t.interactions) * 100) : 0;
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

        <p className="text-5xl font-black tabular-nums text-emerald-400 mb-1">{Math.max(0, score)}</p>
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
        </div>

        <div className="flex gap-3">
          <button onClick={loadRun} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-2xl font-bold">
            Play again
          </button>
          <button onClick={onDone} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl font-bold">
            Continue
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
        <button onClick={onExit} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-full shrink-0">
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

export default FastVocabStep;
