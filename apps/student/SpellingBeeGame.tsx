// SpellingBeeGame — the student solo surface of the shared Spelling Bee
// engine (components/games/spellingBee). The original single-player loop,
// adapted: pick a unit (the original's "category select") → 3 rounds × 5
// words of letter-by-letter spelling under the countdown → "Well Done"
// interstitials with per-word badges → results with stars + personal best.
//
// Scoring uses the SAME math as the board (scoreForAttempt + streak, −1 per
// wrong letter, +1 speed bonus at ≥50% clock left) but stays local:
// recordAnswer for session accuracy, Gamification XP awarded once at the end
// (pattern A — self-awarded, so the parent never double-awards).
//
// The SPLIT fail rule lives here: a timeout ENDS THE RUN (the original's
// tension) — the board surface is the forgiving one (reveal + advance).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, SpellCheck, Star, Timer, TimerOff, Trophy, Keyboard } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../types/exercise';
import { scoreForAttempt, MISTAKE_PENALTY } from '../board/templates/scoringDefaults';
import { playCue } from '../board/templates/playCue';
import { playAudioUrl } from '../../services/SpeechService';
import { GamificationService } from '../../services/GamificationService';
import { GEM_REWARDS, QUEST_TYPES } from '../../constants/gamification';
import FastVocabHud from '../../components/games/fastVocab/FastVocabHud';
import SpellingBeeStage from '../../components/games/spellingBee/SpellingBeeStage';
import { useSpellingBeeTurn } from '../../components/games/spellingBee/useSpellingBeeTurn';
import {
  poolToWords,
  vocabularyToWords,
  takeRound,
  starsForRun,
} from '../../components/games/spellingBee/contentBuilder';
import type {
  SpellingBeeWord,
  SpellingBeeWordResult,
} from '../../components/games/spellingBee/types';

const ROUNDS_PER_RUN = 3;
const WORDS_PER_ROUND = 5;
const TIMER_NORMAL = 15;
const TIMER_SLOW = 25;

/** localStorage keys (the Fast Vocab "Longer cycle" convention). */
const SETTINGS_KEY = 'spellingbee-settings';
interface SoloSettings {
  /** Countdown on/off (the original's "Countdown timer" toggle). */
  timer: boolean;
  /** Slow mode (the original's toggle — slower clock for beginners). */
  slow: boolean;
  /** Adaptive keyboard narrowing (the original's "Remove letters"). */
  removal: boolean;
}
const DEFAULT_SETTINGS: SoloSettings = { timer: true, slow: false, removal: true };
const readSettings = (): SoloSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SoloSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

interface PersonalBest {
  score: number;
  stars: number;
  at: string;
}
const bestKey = (unitId: string) => `spellingbee-best-${unitId}`;
const readBest = (unitId: string): PersonalBest | null => {
  try {
    const raw = localStorage.getItem(bestKey(unitId));
    return raw ? (JSON.parse(raw) as PersonalBest) : null;
  } catch {
    return null;
  }
};

interface WordBadge {
  word: string;
  solved: boolean;
  points: number;
}

type Screen = 'select' | 'loading' | 'play' | 'roundDone' | 'done';

const SpellingBeeGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { state: solo, recordAnswer } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('select');
  const [unitId, setUnitId] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [allWords, setAllWords] = useState<SpellingBeeWord[]>([]);
  const [totalRounds, setTotalRounds] = useState(ROUNDS_PER_RUN);
  const [roundIndex, setRoundIndex] = useState(1); // 1-based
  const [roundWords, setRoundWords] = useState<SpellingBeeWord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SoloSettings>(readSettings);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [badges, setBadges] = useState<WordBadge[]>([]);
  const totalsRef = useRef({ solved: 0, attempted: 0, mistakes: 0, bestStreak: 0, correct: 0 });
  const [finalStars, setFinalStars] = useState(0);
  const [timedOutEnd, setTimedOutEnd] = useState(false);
  const awardedRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timerSeconds = !settings.timer ? 0 : settings.slow ? TIMER_SLOW : TIMER_NORMAL;

  const updateSettings = (patch: Partial<SoloSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* preference persistence is a nicety, never load-bearing */
      }
      return next;
    });

  // ── Unit select → load the unit's words (pool → vocabulary_items) ───────
  const startUnit = useCallback(async (id: string, title: string) => {
    setScreen('loading');
    setLoadError(null);
    setUnitId(id);
    setUnitTitle(title);

    let words: SpellingBeeWord[] = [];
    const { data: poolRows } = await supabase
      .from('pool_items')
      .select('*')
      .eq('unit_id', id)
      .in('exercise_type', ['IMAGE_SELECT', 'MEANING_MATCH', 'DICTATION'])
      .limit(500);
    const items: PoolItem[] = (poolRows || []).map(toPoolItem).filter((p): p is PoolItem => p !== null);
    words = poolToWords(items);

    if (words.length === 0) {
      // pool_items is still empty on many production units — fall back to the
      // vocabulary via get_unit_bundle (SECURITY DEFINER). A DIRECT
      // vocabulary_items select is RLS-blocked for students on teacher-owned
      // units (the student branch is still assignment-gated — the pattern
      // migration 20260817000005 fixed everywhere else), which silently
      // returned 0 rows here.
      try {
        const { data: bundle } = await supabase.rpc('get_unit_bundle', { p_unit_id: id });
        const vocabRows = (bundle as any)?.vocabulary_items;
        if (Array.isArray(vocabRows)) words = vocabularyToWords(vocabRows);
      } catch {
        /* fall through to the empty-pool error below */
      }
    }

    if (words.length === 0) {
      setLoadError('No spelling words for this unit yet — try another unit.');
      setScreen('select');
      return;
    }

    setAllWords(words);
    const rounds = Math.max(1, Math.min(ROUNDS_PER_RUN, Math.ceil(words.length / WORDS_PER_ROUND)));
    setTotalRounds(rounds);
    setRoundIndex(1);
    setRoundWords(takeRound(words, id, 1, WORDS_PER_ROUND));
    setScore(0);
    scoreRef.current = 0;
    setDisplayTotal(0);
    setBadges([]);
    totalsRef.current = { solved: 0, attempted: 0, mistakes: 0, bestStreak: 0, correct: 0 };
    setTimedOutEnd(false);
    awardedRef.current = false;
    setScreen('play');
  }, []);

  // ── Events (same math as the board, local writes only) ─────────────────
  // The engine is created below; the ref lets events reach it (halting it on
  // the timeout fail rule) without a circular dependency.
  const turnRef = useRef<ReturnType<typeof useSpellingBeeTurn> | null>(null);

  const events = useMemo(
    () => ({
      onWrongLetter: () => {
        playCue('wrong');
        scoreRef.current -= MISTAKE_PENALTY;
        setScore(scoreRef.current);
        totalsRef.current.mistakes += 1;
        // Session accuracy is recorded per WORD (in onWordResult), matching
        // the Fast Vocab one-record-per-interaction contract.
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
          // FIRST (forceComplete kills the pending auto-advance, the clock
          // and all input) so no phantom word can be played on the results
          // screen, and the last-word timeout can't race the round-complete
          // path into a "Well Done!" instead of "Time's Up!".
          turnRef.current?.forceComplete();
          if (endTimerRef.current) clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => finishRun(true), 1800);
        } else if (r.skipped) {
          totalsRef.current.attempted += 1;
          setBadges((prev) => [...prev, { word: r.word.word, solved: false, points: 0 }]);
        }
      },
      onComplete: () => {
        // Round finished naturally → the Well Done interstitial.
        if (endTimerRef.current) clearTimeout(endTimerRef.current);
        setScreen('roundDone');
      },
    }),
    // The controller holds events in a ref; refs keep score fresh so the memo
    // deps only need the session recorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordAnswer, unitId],
  );

  const turn = useSpellingBeeTurn({
    waveWords: roundWords,
    settings: { timerSeconds, letterRemoval: settings.removal },
    events,
    seedKey: unitId,
  });
  turnRef.current = turn;

  // ── Run completion: stars, personal best, XP/gems/quests (once) ────────
  const finishRun = (byTimeout: boolean) => {
    const t = totalsRef.current;
    const stars = starsForRun(t.solved, Math.max(1, t.solved + t.attempted), t.mistakes);
    setFinalStars(stars);
    setTimedOutEnd(byTimeout);
    setScreen('done');
    try {
      const prev = readBest(unitId);
      if (!prev || scoreRef.current > prev.score) {
        localStorage.setItem(
          bestKey(unitId),
          JSON.stringify({ score: scoreRef.current, stars, at: new Date().toISOString() } satisfies PersonalBest),
        );
      }
    } catch {
      /* storage unavailable — personal best is a nicety, never load-bearing */
    }
    if (!awardedRef.current) {
      awardedRef.current = true;
      const xp = Math.max(1, t.correct);
      GamificationService.awardXP(xp, 'lesson_complete').catch(() => {});
      if (stars === 5) GamificationService.awardGems(GEM_REWARDS.PERFECT_LESSON, 'lesson_complete').catch(() => {});
      GamificationService.updateQuestProgress(QUEST_TYPES.COMPLETE_LESSONS, 1).catch(() => {});
      GamificationService.updateQuestProgress(QUEST_TYPES.EARN_XP, xp).catch(() => {});
    }
  };

  const startNextRound = () => {
    const next = roundIndex + 1;
    if (next > totalRounds) {
      finishRun(false);
      return;
    }
    setRoundIndex(next);
    setRoundWords(takeRound(allWords, unitId, next, WORDS_PER_ROUND));
    setBadges([]);
    setScreen('play');
  };

  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  // ── Count-up total (the original's mechanical score roll) ───────────────
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

  // ── Screen: unit select ─────────────────────────────────────────────────
  if (screen === 'select' || screen === 'loading') {
    const units = solo.units || [];
    const Toggle: React.FC<{ label: string; hint: string; on: boolean; icon: React.ReactNode; onToggle: () => void }> = ({
      label, hint, on, icon, onToggle,
    }) => (
      <div className="mx-auto max-w-xs bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">{icon}{label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    );

    return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
        <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <ChevronLeft size={24} />
          </button>
          <span className="font-bold text-slate-800">Spelling Bee</span>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-3 border-2 border-amber-200">
              <SpellCheck size={30} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Spell the words</h1>
            <p className="text-slate-500 text-sm">
              {WORDS_PER_ROUND} words a round, {ROUNDS_PER_RUN} rounds — beat the clock!
            </p>
            {/* The original's settings modal, as sticky toggle cards. */}
            <div className="mt-4 space-y-2">
              <Toggle
                label="Countdown timer" hint={settings.timer ? (settings.slow ? `${TIMER_SLOW}s per word (slow mode)` : `${TIMER_NORMAL}s per word`) : 'no timer — take your time'}
                on={settings.timer} icon={<Timer size={14} className="text-slate-400" />}
                onToggle={() => updateSettings({ timer: !settings.timer })}
              />
              {settings.timer && (
                <Toggle
                  label="Slow mode" hint={settings.slow ? 'more time per word' : 'normal speed'}
                  on={settings.slow} icon={<TimerOff size={14} className="text-slate-400" />}
                  onToggle={() => updateSettings({ slow: !settings.slow })}
                />
              )}
              <Toggle
                label="Remove letters" hint={settings.removal ? 'wrong keys drop off as you go' : 'full keyboard all game (harder)'}
                on={settings.removal} icon={<Keyboard size={14} className="text-slate-400" />}
                onToggle={() => updateSettings({ removal: !settings.removal })}
              />
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
                      <SpellCheck size={22} />
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

  // ── Screen: roundDone (the original's "Well Done" interstitial) ─────────
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

        {/* Per-word score badges (the original's two rows) */}
        <div className="flex gap-2 mb-2">
          {Array.from({ length: WORDS_PER_ROUND }, (_, i) => {
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

        {/* Mechanical count-up total */}
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

  // ── Screen: done (results + rewards) ────────────────────────────────────
  if (screen === 'done') {
    const t = totalsRef.current;
    const best = readBest(unitId);
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

        <motion.p className="text-5xl font-black tabular-nums text-emerald-400 mb-1">
          {displayTotal}
        </motion.p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">final score</p>

        <div className="flex gap-6 text-center mb-6">
          <div>
            <p className="text-2xl font-black text-orange-400 tabular-nums">{t.bestStreak}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">best streak</p>
          </div>
          <div>
            <p className="text-2xl font-black text-indigo-300 tabular-nums">{accuracy}%</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">accuracy</p>
          </div>
          <div>
            <p className="text-2xl font-black text-lime-400 tabular-nums">+{Math.max(1, t.correct)} XP</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">earned</p>
          </div>
        </div>

        {best && (
          <p className="flex items-center gap-2 text-amber-300 font-bold mb-6 text-sm">
            <Trophy size={16} /> personal best: {best.score}
          </p>
        )}
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
  const hudProgress = Math.min(1, ((roundIndex - 1) * WORDS_PER_ROUND + turn.wordIdx + (turn.status === 'typing' ? 0 : 1)) / (totalRounds * WORDS_PER_ROUND));
  const hudLabel =
    turn.status === 'complete'
      ? 'round complete'
      : `Round ${roundIndex}/${totalRounds} · word ${Math.min(turn.wordIdx + 1, turn.wordsTotal)}/${turn.wordsTotal}`;

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

export default SpellingBeeGame;
