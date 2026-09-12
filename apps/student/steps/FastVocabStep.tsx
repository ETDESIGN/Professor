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
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#8C7A68] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-8 shadow-md flex flex-col items-center">
          <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={36} />
          <p className="font-bold text-[#1D3557] text-base">Loading words…</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-md max-w-sm text-center w-full">
          <div className="w-16 h-16 bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#E76F51] rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
            <Zap size={32} />
          </div>
          <p className="text-lg font-bold text-[#1D3557] mb-1">No vocabulary exercises yet</p>
          <p className="text-[#8C7A68] text-sm mb-6">This round needs the unit's exercise pool — continue with the lesson for now.</p>
          <button
            onClick={onDone}
            className="w-full py-3 bg-[#2A9D8F] hover:brightness-105 text-white font-bold rounded-2xl shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.interactions > 0 ? Math.round((t.firstTry / t.interactions) * 100) : 0;
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 relative overflow-y-auto select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-xl max-w-sm text-center w-full">
          <motion.h1
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="text-3xl font-black text-[#1D3557] mb-1 font-fredoka"
          >
            Well Done! 🎉
          </motion.h1>
          <p className="text-[#8C7A68] text-sm mb-5 font-semibold">{unitTitle}</p>

          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: 5 }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <Star
                  size={36}
                  className={i < finalStars ? 'text-[#E9C46A] drop-shadow-sm' : 'text-[#E2D7C3]'}
                  fill={i < finalStars ? 'currentColor' : 'none'}
                />
              </motion.span>
            ))}
          </div>

          <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-4 mb-6 shadow-xs">
            <p className="text-4xl font-black tabular-nums text-[#2A9D8F] mb-0.5">{Math.max(0, score)}</p>
            <p className="text-[10px] font-bold text-[#8C7A68] uppercase tracking-widest">final score</p>
          </div>

          <div className="flex justify-around text-center mb-6">
            <div>
              <p className="text-2xl font-black text-[#E76F51] tabular-nums">{t.bestStreak}</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">best streak</p>
            </div>
            <div className="w-px bg-[#E2D7C3]" />
            <div>
              <p className="text-2xl font-black text-[#1D3557] tabular-nums">{accuracy}%</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">first-try</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={loadRun}
              className="flex-1 py-3 bg-[#F7F3E8] hover:bg-white text-[#264653] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Play again
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-3 bg-[#2A9D8F] hover:brightness-105 text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: play ────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-sans relative overflow-hidden select-none">
      {/* Universal light header */}
      <header className="h-16 px-4 bg-[#FDFBF7] border-b-2 border-[#E2D7C3] flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onExit}
          className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] flex items-center justify-center text-[#8C7A68] hover:text-[#264653] active:translate-y-0.5 transition-all shadow-[0_2px_0_#D5C7B0]"
          title="Exit Lesson"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="flex items-center gap-2">
          {/* Terracotta/Amber Step Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E76F51] text-white text-xs font-bold shadow-xs">
            <span>⚡</span>
            <span>FAST VOCAB • WAVE {waveIndex + 1}/{totalWaves}</span>
          </div>

          {turn.streak >= 2 && (
            <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF3CD] border border-[#FFE082] text-[#B7791F] text-xs font-bold animate-pulse">
              <span>🔥</span>
              <span>Streak x{turn.streak}</span>
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-xl font-black text-[#2A9D8F] tabular-nums text-sm shrink-0 shadow-xs flex items-center gap-1">
          <span>⭐</span>
          <span>{Math.max(0, score)}</span>
        </div>
      </header>

      {/* Subheader banner: Match instructions or Speed countdown */}
      {turn.phase === 'speed' ? (
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="bg-[#FDFBF7] border border-[#E2D7C3] rounded-2xl p-2.5 shadow-xs flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#1D3557] flex items-center gap-1">
                <Zap size={14} className="text-[#E76F51]" />
                <span>Speed Question {turn.qIdx + 1}/{turn.speedQs.length}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono font-bold text-[#0284C7] bg-[#E0F2FE] border border-[#BAE6FD] px-2 py-0.5 rounded-full text-[11px] animate-pulse">
                ⏱️ {turn.timeRemaining}s left
              </span>
            </div>
            <div className="w-full bg-[#E2D7C3] h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  turn.timeRemaining <= 3 ? 'bg-[#EF4444]' : 'bg-[#38BDF8]'
                }`}
                style={{ width: `${Math.round((turn.timeRemaining / (turn.timeLimit || SPEED_TIME_LIMIT)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : turn.phase === 'match' ? (
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="bg-[#FDFBF7]/90 border border-[#E2D7C3] rounded-2xl px-3.5 py-1.5 flex items-center justify-between shadow-xs">
            <p className="text-xs text-[#1D3557] font-bold leading-tight flex items-center gap-1">
              <span className="text-[#2A9D8F]">✦</span> Match words &amp; pictures!
              <span className="text-[11px] text-[#8C7A68] font-normal ml-1">匹配单词与图片</span>
            </p>
            <span className="text-[10px] font-mono text-[#8C7A68] bg-[#F7F3E8] border border-[#E2D7C3] px-2 py-0.5 rounded-full">
              {turn.matchedPairIds.length}/{wavePairs.length} pairs
            </span>
          </div>
        </div>
      ) : null}

      {/* Main play stage */}
      <div className="fv-stage flex-1 min-h-0 relative px-3 pb-4">
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
              className="absolute inset-0 flex flex-col items-center justify-center text-[#1D3557] select-none"
            >
              <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-xl text-center max-w-xs">
                <p className="text-3xl font-black mb-1 font-fredoka">Wave {waveIndex + 1} Clear! 🎉</p>
                <p className="text-[#8C7A68] text-sm">{waveIndex + 1 < totalWaves ? 'Get ready for next wave…' : 'Finishing up…'}</p>
              </div>
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

        /* Wonder Atlas tactile paper card overrides */
        .fv-stage .bg-slate-800 {
          background-color: #FDFBF7 !important;
          border-color: #E2D7C3 !important;
          box-shadow: 0 4px 0 #D5C7B0 !important;
          color: #1D3557 !important;
        }
        .fv-stage .bg-slate-800:hover:not(:disabled) {
          border-color: #2A9D8F !important;
        }
        .fv-stage .text-white {
          color: #1D3557 !important;
        }
        .fv-stage .text-slate-300,
        .fv-stage .text-slate-400 {
          color: #8C7A68 !important;
        }
        .fv-stage .bg-indigo-600 {
          background-color: #E6F4F1 !important;
          border-color: #2A9D8F !important;
          box-shadow: 0 4px 0 #1E6F5C !important;
          color: #1E6F5C !important;
        }
        .fv-stage .bg-emerald-500 {
          background-color: #2A9D8F !important;
          border-color: #1E6F5C !important;
          box-shadow: 0 4px 0 #1E6F5C !important;
          color: #FFFFFF !important;
        }
        .fv-stage .bg-emerald-500\/15 {
          background-color: #E6F4F1 !important;
          border-color: #2A9D8F !important;
          box-shadow: 0 4px 0 #2A9D8F !important;
        }
        .fv-stage .border-emerald-400\/50 {
          border-color: #2A9D8F !important;
        }
        .fv-stage .bg-amber-400\/15 {
          background-color: #FEF3C7 !important;
          border-color: #FCD34D !important;
          box-shadow: 0 4px 0 #FCD34D !important;
        }
        .fv-stage .border-slate-600 {
          border-color: #E2D7C3 !important;
        }
        .fv-stage .border-slate-700 {
          border-color: #E2D7C3 !important;
        }
      `}</style>
    </div>
  );
};

export default FastVocabStep;
