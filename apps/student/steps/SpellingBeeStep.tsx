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
// THE SPELLING RULE (11): in-lesson timeouts do NOT end the run. A timed-out
// word records answer(false), presents the acoustic pronunciation + spelling
// reveal hold (2.8s), and smoothly advances to the next word.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, SpellCheck, Star } from 'lucide-react';
import { useSoloSession } from '../../../store/SoloSessionContext';
import { supabase } from '../../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../../types/exercise';
import { scoreForAttempt, MISTAKE_PENALTY } from '../../board/templates/scoringDefaults';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';
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
const DEFAULT_TIMER = 20; // Relaxed 20s default timer for solo learners

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
    setScreen('play');
  }, [unitId, wordsPerRound]);

  useEffect(() => { loadRun(); }, [loadRun]);

  // ── Events (same math as the board, local writes only) ─────────────────
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
          // THE SPELLING RULE: timeout records false + reveal + pronunciation + advance
          // (never ends the run).
          playCue('reveal');
          playAudioUrl(r.word.audioUrl, r.word.word).catch(() => {});
          totalsRef.current.attempted += 1;
          setBadges((prev) => [...prev, { word: r.word.word, solved: false, points: 0 }]);
          recordAnswer(false);
        } else if (r.skipped) {
          totalsRef.current.attempted += 1;
          setBadges((prev) => [...prev, { word: r.word.word, solved: false, points: 0 }]);
        }
      },
      onComplete: () => {
        playCue('win');
        setScreen('roundDone');
      },
    }),
    // The controller holds events in a ref; refs keep score fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordAnswer, unitId],
  );

  const turn = useSpellingBeeTurn({
    waveWords: roundWords,
    settings: {
      timerSeconds,
      letterRemoval: letterRemoval !== false,
      noClockPenalty: true, // In-lesson: mistakes do not shave clock time
    },
    events,
    seedKey: unitId,
  });

  const finishRun = () => {
    const t = totalsRef.current;
    const stars = starsForRun(t.solved, Math.max(1, t.solved + t.attempted), t.mistakes);
    setFinalStars(stars);
    playCue('win');
    setScreen('done');
  };

  const startNextRound = () => {
    const next = roundIndex + 1;
    if (next > totalRounds) {
      finishRun();
      return;
    }
    setRoundIndex(next);
    setRoundWords(takeRound(allWords, unitId, next, wordsPerRound));
    setBadges([]);
    setScreen('play');
  };

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
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#8C7A68] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-8 shadow-md flex flex-col items-center">
          <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={36} />
          <p className="font-bold text-[#1D3557] text-base">Loading spelling words…</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-md max-w-sm text-center w-full">
          <div className="w-16 h-16 bg-[#F7F3E8] text-[#E76F51] border-2 border-[#E2D7C3] rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
            <SpellCheck size={32} />
          </div>
          <p className="text-lg font-bold text-[#1D3557] mb-1">No spelling words yet</p>
          <p className="text-[#8C7A68] text-sm mb-6">This round needs the unit's words — continue with the lesson for now.</p>
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

  if (screen === 'roundDone') {
    const isLast = roundIndex >= totalRounds;
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 select-none overflow-y-auto">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-xl max-w-sm text-center w-full">
          <motion.h1
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="text-3xl font-black text-[#1D3557] mb-1 font-fredoka"
          >
            Well Done! 🎉
          </motion.h1>
          <p className="text-[#8C7A68] text-sm mb-5 font-semibold">
            {isLast ? 'That was the last round' : `Round ${roundIndex} of ${totalRounds} Complete`}
          </p>

          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {badges.map((b, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 300, damping: 15 }}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold text-xs shadow-xs ${
                  b.solved
                    ? 'bg-[#E6F4F1] border-2 border-[#2A9D8F] text-[#1E6F5C]'
                    : 'bg-[#FEF2F2] border-2 border-[#FF4B4B] text-[#DC2626]'
                }`}
              >
                <span>{b.word}</span>
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/10">
                  {b.solved ? `+${b.points}` : '✗'}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="my-4">
            <p className="text-4xl font-black tabular-nums text-[#2A9D8F]">{displayTotal}</p>
            <p className="text-[11px] font-bold text-[#8C7A68] uppercase tracking-widest mt-0.5">total score</p>
          </div>

          <button
            onClick={startNextRound}
            className="w-full py-3.5 bg-[#E76F51] hover:brightness-105 text-white font-bold text-base rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-0.5 active:shadow-none transition-all mt-2"
          >
            {isLast ? 'See Results →' : `Round ${roundIndex + 1}/${totalRounds} →`}
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.correct + t.attempted > 0 ? Math.round((t.correct / (t.correct + t.attempted)) * 100) : 0;
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
          <p className="text-[#8C7A68] text-sm mb-4 font-semibold">{unitTitle}</p>

          <div className="flex justify-center gap-1.5 mb-6">
            {Array.from({ length: 5 }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2 + i * 0.18, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <Star
                  size={36}
                  className={i < finalStars ? 'text-[#E9C46A] drop-shadow-sm' : 'text-[#E2D7C3]'}
                  fill={i < finalStars ? 'currentColor' : 'none'}
                />
              </motion.span>
            ))}
          </div>

          <p className="text-4xl font-black tabular-nums text-[#2A9D8F] mb-0.5">{displayTotal}</p>
          <p className="text-[11px] font-bold text-[#8C7A68] uppercase tracking-widest mb-6">final score</p>

          <div className="flex justify-around text-center mb-6 bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3">
            <div>
              <p className="text-xl font-black text-[#E76F51] tabular-nums">{t.bestStreak}</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">best streak</p>
            </div>
            <div>
              <p className="text-xl font-black text-[#1D3557] tabular-nums">{accuracy}%</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">accuracy</p>
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
  const wordsTotal = roundWords.length || wordsPerRound;
  const timeFrac = timerSeconds > 0 && turn.status === 'typing'
    ? Math.max(0, Math.min(1, turn.timeRemaining / timerSeconds))
    : 1;

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
          {/* Honeycomb Amber Pill Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E9C46A] border-2 border-[#C99E32] text-[#1D3557] font-bold text-xs shadow-xs">
            <span>🐝</span>
            <span>SPELLING BEE • WORD {turn.wordIdx + 1} OF {wordsTotal}</span>
          </div>

          <div className="px-2.5 py-1 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] text-[#8C7A68] font-semibold text-xs shadow-xs">
            🎯 Round {roundIndex}/{totalRounds}
          </div>
        </div>

        <div className="px-3 py-1.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-xl font-black text-[#2A9D8F] tabular-nums text-sm shrink-0 shadow-xs">
          ⭐ {Math.max(0, score)} pts
        </div>
      </header>

      {/* Relaxed countdown timer HUD */}
      {timerSeconds > 0 && turn.status === 'typing' && (
        <div className="px-4 pt-2.5 pb-1 shrink-0">
          <div className="flex items-center gap-2.5 bg-[#FDFBF7]/90 border border-[#E2D7C3] px-3 py-1.5 rounded-2xl shadow-xs">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs">⏱️</span>
              <span className="font-bold text-xs text-[#0284C7] tracking-wide tabular-nums">{turn.timeRemaining}s</span>
            </div>
            <div className="w-full bg-[#E2D7C3] h-2.5 rounded-full overflow-hidden p-[1px]">
              <div
                className="bg-[#38BDF8] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round(timeFrac * 100)}%`, boxShadow: 'inset 0 -1.5px 0 #0284C7' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Timeout Alert Banner in 'revealed' state (Acoustic Reveal / Safe Continue per Stitch Screen 2) */}
      {turn.status === 'revealed' && (
        <div className="px-4 pt-2 shrink-0">
          <div className="flex items-center justify-between bg-[#FFF3D6] border-2 border-[#E9C46A] rounded-xl px-3.5 py-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-base animate-bounce">⏰</span>
              <div>
                <p className="font-bold text-xs text-[#8C6D1F] leading-tight">Time's Up! • Acoustic Reveal</p>
                <p className="text-[10px] text-[#A68024] font-medium leading-none">Lesson continues • Listen to correct word</p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-[#F7E5B5] text-[#7A5B10] px-2 py-0.5 rounded border border-[#DEC482]">
              🛡️ Safe Continue
            </span>
          </div>
        </div>
      )}

      {/* Stage: Word Card + Honeycomb Slots + Adaptive Keyboard */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 py-2 overflow-y-auto">
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
                onReady={turn.beginTyping}
                onType={turn.typeLetter}
                onReplayAudio={() => playAudioUrl(turn.currentWord?.audioUrl, turn.currentWord?.word).catch(() => {})}
                compact
                lightTheme
              />
            </motion.div>
          )}
          {turn.status === 'complete' && (
            <motion.div
              key="round-clear"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-[#1D3557] bg-[#FDFBF7] border-2 border-[#2A9D8F] rounded-3xl p-6 shadow-md"
            >
              <p className="text-2xl font-black mb-1 font-fredoka">Round {roundIndex} clear! 🎉</p>
              <p className="text-[#8C7A68] text-sm">loading the next round…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SpellingBeeStep;
