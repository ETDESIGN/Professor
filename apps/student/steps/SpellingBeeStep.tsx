// SpellingBeeStep — the in-lesson surface of the shared Spelling Bee engine
// (components/games/spellingBee), for SPELLING_BEE blocks on the Student
// Path.
//
// Same loop as the standalone SpellingBeeGame (rounds × words of
// letter-by-letter spelling under the countdown, "Well Done" interstitials,
// results with stars) minus the unit picker — the unit is the lesson's
// active unit — and minus the self-awarded XP: inside a lesson, completion
// flows through the player pipeline (handleNext → LessonComplete →
// finalizeLesson), which awards XP exactly once. recordAnswer still feeds
// the session accuracy, so stage stars reflect the real run.
//
// The SPLIT fail rule lives here too: a timeout ENDS THE RUN.
// Game settings come from the plan block (teacher's choice), not
// localStorage preferences.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, SpellCheck, Star } from 'lucide-react';
import { useSoloSession } from '../../../store/SoloSessionContext';
import { supabase } from '../../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../../types/exercise';
import { scoreForAttempt, MISTAKE_PENALTY } from '../../board/templates/scoringDefaults';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import FastVocabHud from '../../../components/games/fastVocab/FastVocabHud';
import SpellingBeeStage from '../../../components/games/spellingBee/SpellingBeeStage';
import { useSpellingBeeTurn } from '../../../components/games/spellingBee/useSpellingBeeTurn';
import {
  poolToWords,
  vocabularyToWords,
  takeRound,
  starsForRun,
} from '../../../components/games/spellingBee/contentBuilder';
import type {
  SpellingBeeWord,
  SpellingBeeWordResult,
} from '../../../components/games/spellingBee/types';

const ROUNDS_PER_RUN = 3;
const DEFAULT_WORDS_PER_ROUND = 5;
const DEFAULT_TIMER = 15;

interface SpellingBeeStepProps {
  unitId: string;
  unitTitle: string;
  /** Plan block settings (teacher's choice in the Student Path composer). */
  wordsPerRound?: number;
  timerSeconds?: number;
  letterRemoval?: boolean;
  onDone: () => void;
  onExit: () => void;
}

interface WordBadge {
  word: string;
  solved: boolean;
  points: number;
}

type Screen = 'loading' | 'play' | 'roundDone' | 'done' | 'error';

const SpellingBeeStep: React.FC<SpellingBeeStepProps> = ({
  unitId,
  unitTitle,
  wordsPerRound: wordsPerRoundProp,
  timerSeconds: timerSecondsProp,
  letterRemoval,
  onDone,
  onExit,
}) => {
  const { recordAnswer } = useSoloSession();
  const wordsPerRound = Math.max(1, wordsPerRoundProp ?? DEFAULT_WORDS_PER_ROUND);
  const timerSeconds = timerSecondsProp ?? DEFAULT_TIMER;

  const [screen, setScreen] = useState<Screen>('loading');
  const [allWords, setAllWords] = useState<SpellingBeeWord[]>([]);
  const [totalRounds, setTotalRounds] = useState(ROUNDS_PER_RUN);
  const [roundIndex, setRoundIndex] = useState(1); // 1-based
  const [roundWords, setRoundWords] = useState<SpellingBeeWord[]>([]);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [badges, setBadges] = useState<WordBadge[]>([]);
  const totalsRef = useRef({ solved: 0, attempted: 0, mistakes: 0, bestStreak: 0, correct: 0 });
  const [finalStars, setFinalStars] = useState(0);
  const [timedOutEnd, setTimedOutEnd] = useState(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load the unit's words (pool → vocabulary_items fallback) ────────────
  const loadRun = useCallback(async () => {
    setScreen('loading');

    let words: SpellingBeeWord[] = [];
    const { data: poolRows } = await supabase
      .from('pool_items')
      .select('*')
      .eq('unit_id', unitId)
      .in('exercise_type', ['IMAGE_SELECT', 'MEANING_MATCH', 'DICTATION'])
      .limit(500);
    const items: PoolItem[] = (poolRows || []).map(toPoolItem).filter((p): p is PoolItem => p !== null);
    words = poolToWords(items);

    if (words.length === 0) {
      // pool_items is still empty on many production units — fall back to the
      // vocabulary via get_unit_bundle (SECURITY DEFINER; a DIRECT
      // vocabulary_items select is RLS-blocked for students).
      try {
        const { data: bundle } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        const vocabRows = (bundle as any)?.vocabulary_items;
        if (Array.isArray(vocabRows)) words = vocabularyToWords(vocabRows);
      } catch {
        /* fall through to the empty-pool error below */
      }
    }

    if (words.length === 0) {
      setScreen('error');
      return;
    }

    setAllWords(words);
    const rounds = Math.max(1, Math.min(ROUNDS_PER_RUN, Math.ceil(words.length / wordsPerRound)));
    setTotalRounds(rounds);
    setRoundIndex(1);
    setRoundWords(takeRound(words, unitId, 1, wordsPerRound));
    setScore(0);
    scoreRef.current = 0;
    setDisplayTotal(0);
    setBadges([]);
    totalsRef.current = { solved: 0, attempted: 0, mistakes: 0, bestStreak: 0, correct: 0 };
    setTimedOutEnd(false);
    setScreen('play');
  }, [unitId, wordsPerRound]);

  useEffect(() => { loadRun(); }, [loadRun]);

  // ── Events (same math as the board, local writes only) ─────────────────
  const turnRef = useRef<ReturnType<typeof useSpellingBeeTurn> | null>(null);

  const events = useMemo(
    () => ({
      onWrongLetter: () => {
        playCue('wrong');
        scoreRef.current -= MISTAKE_PENALTY;
        setScore(scoreRef.current);
        totalsRef.current.mistakes += 1;
        // Session accuracy is recorded per WORD (in onWordResult).
      },
      onWordResult: (r: SpellingBeeWordResult) => {
        if (r.solved) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) playCue('streak');
          playAudioUrl(r.word.audioUrl, r.word.word).catch(() => {});
          const base = scoreForAttempt(r.mistakes, r.word.difficulty, 1.0, r.streak);
          const points = Math.min(5, base + (r.timeFrac >= 0.5 ? 1 : 0));
          scoreRef.current += points;
          setScore(scoreRef.current);
          totalsRef.current.solved += 1;
          totalsRef.current.correct += 1;
          totalsRef.current.bestStreak = Math.max(totalsRef.current.bestStreak, r.streak);
          setBadges((prev) => [...prev, { word: r.word.word, solved: true, points }]);
          recordAnswer(true);
        } else if (r.timedOut) {
          playCue('reveal');
          playAudioUrl(r.word.audioUrl, r.word.word).catch(() => {});
          totalsRef.current.attempted += 1;
          setBadges((prev) => [...prev, { word: r.word.word, solved: false, points: 0 }]);
          recordAnswer(false);
          // The SPLIT fail rule: solo timeout ends the run. Halt the engine
          // FIRST so no phantom word can be played on the results screen.
          turnRef.current?.forceComplete();
          if (endTimerRef.current) clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => finishRun(true), 1800);
        } else if (r.skipped) {
          totalsRef.current.attempted += 1;
          setBadges((prev) => [...prev, { word: r.word.word, solved: false, points: 0 }]);
        }
      },
      onComplete: () => {
        if (endTimerRef.current) clearTimeout(endTimerRef.current);
        setScreen('roundDone');
      },
    }),
    // The controller holds events in a ref; refs keep score fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordAnswer, unitId],
  );

  const turn = useSpellingBeeTurn({
    waveWords: roundWords,
    settings: { timerSeconds, letterRemoval: letterRemoval !== false },
    events,
    seedKey: unitId,
  });
  turnRef.current = turn;

  const finishRun = (byTimeout: boolean) => {
    const t = totalsRef.current;
    const stars = starsForRun(t.solved, Math.max(1, t.solved + t.attempted), t.mistakes);
    setFinalStars(stars);
    setTimedOutEnd(byTimeout);
    setScreen('done');
  };

  const startNextRound = () => {
    const next = roundIndex + 1;
    if (next > totalRounds) {
      finishRun(false);
      return;
    }
    setRoundIndex(next);
    setRoundWords(takeRound(allWords, unitId, next, wordsPerRound));
    setBadges([]);
    setScreen('play');
  };

  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  // ── Count-up total (the mechanical score roll) ──────────────────────────
  const [displayTotal, setDisplayTotal] = useState(0);
  useEffect(() => {
    if (screen !== 'roundDone' && screen !== 'done') return;
    const target = Math.max(0, scoreRef.current);
    if (displayTotal >= target) return;
    const step = Math.max(1, Math.ceil(target / 24));
    const t = setInterval(() => {
      setDisplayTotal((prev) => {
        const next = Math.min(target, prev + step);
        if (next >= target) clearInterval(t);
        return next;
      });
    }, 50);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, roundIndex]);

  if (screen === 'loading') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="animate-spin mb-3" size={28} /> Loading words…
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
        <div className="w-16 h-16 bg-slate-800 text-amber-400 rounded-2xl flex items-center justify-center mb-4">
          <SpellCheck size={30} />
        </div>
        <p className="text-lg font-bold mb-1">No spelling words yet</p>
        <p className="text-slate-400 text-sm mb-6 text-center">This round needs the unit's words — continue with the lesson for now.</p>
        <button onClick={onDone} className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-2xl">
          Continue
        </button>
      </div>
    );
  }

  if (screen === 'roundDone') {
    const isLast = roundIndex >= totalRounds;
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="text-4xl font-black mb-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 bg-clip-text text-transparent"
        >
          Well Done!
        </motion.h1>
        <p className="text-slate-400 mb-6">
          {isLast ? 'That was the last round' : `Round ${roundIndex} of ${totalRounds}`}
        </p>

        <div className="flex gap-2 mb-2">
          {Array.from({ length: wordsPerRound }, (_, i) => {
            const b = badges[i];
            return (
              <motion.div
                key={i}
                initial={{ scale: 0, y: -12 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.15, type: 'spring', stiffness: 300, damping: 15 }}
                className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${
                  !b ? 'bg-slate-800 text-slate-600'
                    : b.solved ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {b ? (b.solved ? b.points : '✗') : '·'}
              </motion.div>
            );
          })}
        </div>
        <div className="flex gap-2 mb-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {badges.map((b, i) => (
            <span key={i} className="w-12 text-center truncate">{b.word}</span>
          ))}
        </div>

        <p className="text-5xl font-black tabular-nums text-emerald-400">{displayTotal}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">total score</p>

        <button
          onClick={startNextRound}
          className="px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xl font-bold rounded-2xl shadow-[0_6px_0_0_#b45309] active:translate-y-1 active:shadow-none transition-all"
        >
          {isLast ? 'See Results' : `Round ${roundIndex + 1}/${totalRounds} →`}
        </button>
      </div>
    );
  }

  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.correct + t.attempted > 0 ? Math.round((t.correct / (t.correct + t.attempted)) * 100) : 0;
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6 relative overflow-hidden">
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className={`text-4xl font-black mb-1 ${timedOutEnd ? 'text-rose-400' : ''}`}
        >
          {timedOutEnd ? "Time's Up!" : 'Well Done!'}
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

        <p className="text-5xl font-black tabular-nums text-emerald-400 mb-1">{displayTotal}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">final score</p>

        <div className="flex gap-6 text-center mb-8">
          <div>
            <p className="text-2xl font-black text-orange-400 tabular-nums">{t.bestStreak}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">best streak</p>
          </div>
          <div>
            <p className="text-2xl font-black text-indigo-300 tabular-nums">{accuracy}%</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">accuracy</p>
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
  const hudProgress = Math.min(1, ((roundIndex - 1) * wordsPerRound + turn.wordIdx + (turn.status === 'typing' ? 0 : 1)) / (totalRounds * wordsPerRound));
  const hudLabel =
    turn.status === 'complete'
      ? 'round complete'
      : `Round ${roundIndex}/${totalRounds} · word ${Math.min(turn.wordIdx + 1, turn.wordsTotal)}/${turn.wordsTotal}`;

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
            timeRemaining={timerSeconds > 0 && turn.status === 'typing' ? turn.timeRemaining : undefined}
            timeLimit={timerSeconds > 0 ? timerSeconds : undefined}
            compact
          />
        </div>
        <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl font-black text-emerald-400 tabular-nums text-sm shrink-0">
          {Math.max(0, score)}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3 pb-4">
        <AnimatePresence mode="wait">
          {turn.currentWord && turn.status !== 'complete' && (
            <motion.div
              key={`${turn.wordIdx}-${turn.currentWord.id}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.22 }}
              className="w-full"
            >
              <SpellingBeeStage
                word={turn.currentWord}
                typedCount={turn.typedCount}
                wrongLetter={turn.wrongLetter}
                removedKeys={turn.removedKeys}
                hintKey={turn.hintKey}
                status={turn.status}
                onType={turn.typeLetter}
                onReplayAudio={() => playAudioUrl(turn.currentWord?.audioUrl, turn.currentWord?.word).catch(() => {})}
                compact
              />
            </motion.div>
          )}
          {turn.status === 'complete' && (
            <motion.div
              key="round-clear"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-white"
            >
              <p className="text-3xl font-black mb-1">Round {roundIndex} clear!</p>
              <p className="text-slate-400 text-sm">loading the next round…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SpellingBeeStep;
