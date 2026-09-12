// SpellingBeeGame — the student solo surface of the shared Spelling Bee
// engine (components/games/spellingBee). The single-player loop:
// pick a unit & pre-game mode (Arcade 15s Sudden Death vs Relaxed 25s vs Untimed) →
// 3 rounds × 5 words of letter-by-letter spelling under the countdown →
// "Well Done" round interstitials → results with stars + personal best.
//
// Sudden death is KEPT BY DESIGN in Arcade Mode: a timeout ends the run with an
// honest timeout ended state screen per Stitch Screen 2 (9cb40f7c0e76438f98e2ae48e1e1d0d2).
//
// Scoring uses the SAME math as the board (scoreForAttempt + streak, −1 per
// wrong letter, +1 speed bonus at ≥50% clock left) but stays local:
// recordAnswer for session accuracy, Gamification XP awarded once at the end
// (pattern A — self-awarded, so the parent never double-awards).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  Loader2,
  SpellCheck,
  Star,
  Timer,
  TimerOff,
  Trophy,
  Keyboard,
  Volume2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Home,
} from 'lucide-react';
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

/** localStorage keys */
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
type BeeMode = 'arcade' | 'relaxed' | 'untimed';

const SpellingBeeGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { state: solo, recordAnswer } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('select');
  const [unitId, setUnitId] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [allWords, setAllWords] = useState<SpellingBeeWord[]>([]);
  const [totalRounds, setTotalRounds] = useState(ROUNDS_PER_RUN);
  const [roundIndex, setRoundIndex] = useState(1); // 1-based
  const [roundWords, setRoundWords] = useState<SpellingBeeWord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SoloSettings>(readSettings);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Derive bee mode from settings
  const beeMode: BeeMode = useMemo(() => {
    if (!settings.timer) return 'untimed';
    if (settings.slow) return 'relaxed';
    return 'arcade';
  }, [settings.timer, settings.slow]);

  const selectBeeMode = (m: BeeMode) => {
    if (m === 'arcade') updateSettings({ timer: true, slow: false });
    else if (m === 'relaxed') updateSettings({ timer: true, slow: true });
    else updateSettings({ timer: false, slow: false });
  };

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [badges, setBadges] = useState<WordBadge[]>([]);
  const totalsRef = useRef({ solved: 0, attempted: 0, mistakes: 0, bestStreak: 0, correct: 0 });
  const [finalStars, setFinalStars] = useState(0);
  const [timedOutEnd, setTimedOutEnd] = useState(false);
  const [lastTimedOutWord, setLastTimedOutWord] = useState<SpellingBeeWord | null>(null);
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

  // Default selected unit
  useEffect(() => {
    if (!selectedUnitId) {
      if (solo.activeUnit?.id) {
        setSelectedUnitId(solo.activeUnit.id);
      } else if (solo.units && solo.units.length > 0) {
        setSelectedUnitId(solo.units[0].id);
      }
    }
  }, [solo.activeUnit, solo.units, selectedUnitId]);

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
    setLastTimedOutWord(null);
    awardedRef.current = false;
    setShowExitConfirm(false);
    setScreen('play');
  }, []);

  // ── Events (same math as the board, local writes only) ─────────────────
  const turnRef = useRef<ReturnType<typeof useSpellingBeeTurn> | null>(null);

  const events = useMemo(
    () => ({
      onWrongLetter: () => {
        playCue('wrong');
        scoreRef.current -= MISTAKE_PENALTY;
        setScore(scoreRef.current);
        totalsRef.current.mistakes += 1;
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
          setLastTimedOutWord(r.word);

          // Sudden death in arcade mode: ends run! In relaxed mode, reveals and continues.
          if (beeMode === 'arcade') {
            turnRef.current?.forceComplete();
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
            endTimerRef.current = setTimeout(() => finishRun(true), 1800);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordAnswer, unitId, beeMode],
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
    if (!byTimeout) playCue('win');
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

  // ── Count-up total ──────────────────────────────────────────────────────
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
  }, [screen, roundIndex]);

  const units = solo.units || [];
  const activeDeckUnit = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId) || solo.activeUnit || units[0] || null;
  }, [units, selectedUnitId, solo.activeUnit]);

  // ── Screen: unit select & mode lobby (Stitch Screen 1) ──────────────────
  if (screen === 'select' || screen === 'loading') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none">
        {/* Header */}
        <header className="h-16 w-full bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
          <button
            type="button"
            onClick={onBack}
            className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] hover:bg-[#EAE0D0] active:translate-y-0.5 transition-all"
            aria-label="Back"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center flex-1 px-2">
            <h1 className="font-fredoka font-bold text-[19px] leading-tight text-[#1D3557]">
              Spelling Bee Solo
            </h1>
            <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
              Letter-by-Letter Mastery
            </p>
          </div>

          <div className="h-10 px-3 bg-amber-50 border-2 border-amber-200/90 rounded-2xl flex items-center gap-1.5 shadow-sm">
            <span className="text-[16px] leading-none">🐝</span>
            <span className="font-fredoka font-bold text-sm text-[#D87A29]">Arcade</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Active Unit Banner */}
          {activeDeckUnit && (
            <div className="bg-[#FDFBF7] rounded-[20px] p-3.5 border-2 border-[#2A9D8F] shadow-[0_3px_0_#2A9D8F]">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-fredoka font-extrabold uppercase px-2 py-0.5 rounded bg-[#2A9D8F]/15 text-[#1E6F5C]">
                    Active Practice Unit
                  </span>
                  <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] mt-1 truncate">
                    {activeDeckUnit.title}
                  </h3>
                  <p className="text-[11px] text-[#264653]/70 font-semibold mt-0.5">
                    {activeDeckUnit.topic || 'Curriculum Deck'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-lg">
                  📖
                </div>
              </div>
            </div>
          )}

          {/* Mode Selection Cards (Stitch Screen 1) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
                ⚡ Select Challenge Mode
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Mode 1: Arcade (Sudden Death) */}
              <button
                type="button"
                onClick={() => selectBeeMode('arcade')}
                className={`w-full p-3.5 rounded-[20px] border-2 text-left transition-all flex items-start justify-between gap-3 ${
                  beeMode === 'arcade'
                    ? 'bg-[#FDFBF7] border-[#E76F51] shadow-[0_4px_0_#C4553B]'
                    : 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-fredoka font-bold text-[15px] text-[#1D3557]">
                      ⚡ Arcade Run (Sudden Death)
                    </span>
                    <span className="text-[10px] font-fredoka font-black px-1.5 py-0.2 rounded bg-amber-100 text-[#C4553B]">
                      15s
                    </span>
                  </div>
                  <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5">
                    15s countdown per word. Timeout ends the run! High-stakes arcade thrill.
                  </p>
                </div>
                {beeMode === 'arcade' && (
                  <span className="text-xl text-[#E76F51] font-black">✓</span>
                )}
              </button>

              {/* Mode 2: Relaxed */}
              <button
                type="button"
                onClick={() => selectBeeMode('relaxed')}
                className={`w-full p-3.5 rounded-[20px] border-2 text-left transition-all flex items-start justify-between gap-3 ${
                  beeMode === 'relaxed'
                    ? 'bg-[#FDFBF7] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C]'
                    : 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-fredoka font-bold text-[15px] text-[#1D3557]">
                      🐢 Relaxed Mode
                    </span>
                    <span className="text-[10px] font-fredoka font-black px-1.5 py-0.2 rounded bg-emerald-100 text-[#1E6F5C]">
                      25s
                    </span>
                  </div>
                  <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5">
                    25s generous timer. Timeout reveals word without ending the run.
                  </p>
                </div>
                {beeMode === 'relaxed' && (
                  <span className="text-xl text-[#2A9D8F] font-black">✓</span>
                )}
              </button>

              {/* Mode 3: Untimed */}
              <button
                type="button"
                onClick={() => selectBeeMode('untimed')}
                className={`w-full p-3.5 rounded-[20px] border-2 text-left transition-all flex items-start justify-between gap-3 ${
                  beeMode === 'untimed'
                    ? 'bg-[#FDFBF7] border-[#E9C46A] shadow-[0_4px_0_#C99E32]'
                    : 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-fredoka font-bold text-[15px] text-[#1D3557]">
                      🧘 Untimed Practice
                    </span>
                    <span className="text-[10px] font-fredoka font-black px-1.5 py-0.2 rounded bg-amber-50 text-amber-700">
                      Zero Timer
                    </span>
                  </div>
                  <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5">
                    No countdown clocks. Take all the time you need for pure spelling practice.
                  </p>
                </div>
                {beeMode === 'untimed' && (
                  <span className="text-xl text-[#C99E32] font-black">✓</span>
                )}
              </button>
            </div>
          </div>

          {/* Keyboard Distractor Narrowing Toggle */}
          <div className="bg-[#FDFBF7] rounded-[20px] p-3.5 border-2 border-[#E2D7C3] shadow-sm flex items-center justify-between">
            <div>
              <p className="font-fredoka font-bold text-[13px] text-[#1D3557] flex items-center gap-1.5">
                <Keyboard size={15} className="text-[#2A9D8F]" />
                Narrow Keyboard (Fewer Distractors)
              </p>
              <p className="text-[11px] text-[#264653]/65 mt-0.5">
                {settings.removal ? 'Wrong keys drop away as you spell' : 'Full 26-letter keyboard'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.removal}
              onClick={() => updateSettings({ removal: !settings.removal })}
              className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors duration-200 relative shrink-0 ${
                settings.removal ? 'bg-[#2A9D8F] border-[#1E6F5C]' : 'bg-[#D6CBB8] border-[#B8AA94]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-[#FDFBF7] shadow-md transform transition-transform duration-200 border border-black/10 ${
                  settings.removal ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {loadError && (
            <div className="p-3 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Deck selector if child wants another unit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
                📚 Other Lesson Decks
              </span>
            </div>
            <div className="space-y-2">
              {units.map((u) => {
                const isCurrent = (activeDeckUnit?.id === u.id);
                const best = readBest(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUnitId(u.id)}
                    className={`p-3 rounded-2xl bg-[#FDFBF7] border-2 cursor-pointer transition-all flex items-center justify-between ${
                      isCurrent ? 'border-[#2A9D8F] shadow-[0_3px_0_#2A9D8F]' : 'border-[#E2D7C3]'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-fredoka font-bold text-sm text-[#1D3557] truncate">{u.title}</p>
                      <p className="text-[10px] text-[#264653]/60">{u.topic || 'Lesson Unit'}</p>
                    </div>
                    {best && (
                      <span className="text-[10px] font-fredoka font-bold text-[#D87A29] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 shrink-0">
                        🏆 Best: {best.score}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Primary CTA Footer */}
        {activeDeckUnit && (
          <footer className="bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 shrink-0 shadow-lg">
            <button
              type="button"
              onClick={() => startUnit(activeDeckUnit.id, activeDeckUnit.title)}
              className="w-full h-14 bg-[#E76F51] hover:bg-[#d65f42] border-2 border-[#C4553B] text-white font-fredoka font-bold text-[16px] rounded-2xl shadow-[0_4px_0_#C4553B] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all"
            >
              <span>
                {beeMode === 'arcade'
                  ? 'START ARCADE RUN (15s) 🐝'
                  : beeMode === 'relaxed'
                    ? 'START RELAXED RUN (25s) 🐢'
                    : 'START UNTIMED PRACTICE 🧘'}
              </span>
            </button>
          </footer>
        )}
      </div>
    );
  }

  // ── Screen: roundDone ───────────────────────────────────────────────────
  if (screen === 'roundDone') {
    const isLast = roundIndex >= totalRounds;
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#1D3557] font-nunito p-6 select-none">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] shadow-[0_6px_0_#E2D7C3] p-6 text-center">
          <motion.h1
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-fredoka font-bold text-[#1D3557] mb-1"
          >
            Well Done!
          </motion.h1>
          <p className="text-xs font-bold text-[#264653]/70 mb-5">
            {isLast ? 'Final round cleared!' : `Round ${roundIndex} of ${totalRounds}`}
          </p>

          {/* Per-word badges */}
          <div className="flex justify-center gap-2 mb-2">
            {Array.from({ length: WORDS_PER_ROUND }, (_, i) => {
              const b = badges[i];
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0, y: -10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 300, damping: 15 }}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-fredoka font-bold text-base border-2 ${
                    !b
                      ? 'bg-[#F7F3EB] border-[#E2D7C3] text-slate-400'
                      : b.solved
                        ? 'bg-[#2A9D8F] border-[#1E6F5C] text-white shadow-[0_2px_0_#1E6F5C]'
                        : 'bg-[#FF4B4B] border-[#BE185D] text-white'
                  }`}
                >
                  {b ? (b.solved ? b.points : '✗') : '·'}
                </motion.div>
              );
            })}
          </div>
          <div className="flex justify-center gap-2 mb-6 text-[10px] font-bold text-[#264653]/60">
            {badges.map((b, i) => (
              <span key={i} className="w-11 text-center truncate">{b.word}</span>
            ))}
          </div>

          <p className="text-4xl font-fredoka font-bold text-[#2A9D8F] mb-1">{displayTotal}</p>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#264653]/60 font-fredoka mb-6">
            Total Score
          </p>

          <button
            onClick={startNextRound}
            className="w-full py-3.5 bg-[#E76F51] hover:bg-[#d65f42] text-white text-lg font-fredoka font-bold rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-1 active:shadow-none transition-all"
          >
            {isLast ? 'See Final Results' : `Round ${roundIndex + 1}/${totalRounds} →`}
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: done (Stitch Screen 2 for timeout or normal complete) ───────
  if (screen === 'done') {
    const t = totalsRef.current;
    const best = readBest(unitId);
    const accuracy = t.correct + t.attempted > 0 ? Math.round((t.correct / (t.correct + t.attempted)) * 100) : 0;
    const earnedXp = Math.max(1, t.correct);

    // Sudden-Death Timeout Ended State per Stitch Screen 2
    if (timedOutEnd) {
      return (
        <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none">
          {/* Header */}
          <header className="h-16 px-4 bg-[#FDFBF7] border-b-2 border-[#E2D7C3] flex items-center justify-between shrink-0 shadow-sm">
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557]"
              aria-label="Exit"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="text-center">
              <span className="text-[10px] font-fredoka font-black px-2 py-0.5 rounded-full bg-[#FF4B4B]/15 text-[#FF4B4B] uppercase tracking-wider">
                ⚡ SUDDEN DEATH • RUN ENDED
              </span>
              <p className="font-fredoka font-bold text-sm text-[#1D3557] mt-0.5">{unitTitle}</p>
            </div>
            <div className="px-3 py-1 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-xl font-fredoka font-bold text-[#E76F51] text-sm">
              {score} pts
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {/* Timer Expired Chip */}
            <div className="flex items-center justify-center gap-1.5 py-1 text-red-600 font-fredoka font-bold text-xs bg-red-50 rounded-xl border border-red-200">
              <TimerOff size={16} />
              <span>Time Ran Out at 0:00 — Sudden Death Concluded</span>
            </div>

            {/* Honest Sudden Death Card */}
            <div className="bg-[#FDFBF7] rounded-[24px] border-[2.5px] border-[#E76F51] p-5 shadow-[0_4px_0_#C4553B] text-center">
              <span className="text-3xl mb-1 inline-block">⏰</span>
              <h2 className="font-fredoka font-bold text-2xl text-[#1D3557] mb-1">
                Arcade Run Ended
              </h2>
              <p className="text-xs text-[#264653]/70 font-semibold mb-4 leading-relaxed">
                In Arcade Sudden Death, the run concludes when the clock hits zero. Terrific effort!
              </p>

              {lastTimedOutWord && (
                <div className="bg-[#F7F3EB] rounded-2xl p-3 border border-[#E2D7C3] mb-4 flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-[#264653]/60 uppercase">Last Target Word</span>
                    <p className="font-fredoka font-bold text-base text-[#1D3557]">{lastTimedOutWord.word}</p>
                  </div>
                  <button
                    onClick={() => playAudioUrl(lastTimedOutWord.audioUrl, lastTimedOutWord.word).catch(() => {})}
                    className="w-10 h-10 rounded-xl bg-[#2A9D8F] text-white flex items-center justify-center shadow-[0_2px_0_#1E6F5C]"
                    aria-label="Hear Word"
                  >
                    <Volume2 size={18} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-center py-1 border-t border-[#E2D7C3]/60 pt-3">
                <div>
                  <p className="text-xl font-fredoka font-bold text-[#2A9D8F]">{t.correct}</p>
                  <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Words Spelled</p>
                </div>
                <div>
                  <p className="text-xl font-fredoka font-bold text-[#E76F51]">{score}</p>
                  <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Solo Score</p>
                </div>
              </div>
            </div>

            {/* Sacred Award Card (Pattern A) */}
            <div className="bg-[#E6F4F1] border-2 border-[#2A9D8F] rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2A9D8F] text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
                ⭐
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="font-fredoka font-bold text-sm text-[#1E6F5C]">
                  Rewards Saved! (+{earnedXp} XP Awarded)
                </p>
                <p className="text-[11px] text-[#264653]/70 font-medium">
                  Your correct spellings were saved to your profile.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => startUnit(unitId, unitTitle)}
                className="w-full py-3.5 bg-[#E76F51] hover:bg-[#d65f42] text-white font-fredoka font-bold text-[15px] rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                <span>TRY ARCADE AGAIN</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  selectBeeMode('relaxed');
                  startUnit(unitId, unitTitle);
                }}
                className="w-full py-3 bg-[#E9C46A] hover:bg-[#dfba5f] text-[#1D3557] font-fredoka font-bold text-sm rounded-2xl shadow-[0_3px_0_#C99E32] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <span>SWITCH TO RELAXED MODE 🐢</span>
              </button>

              <button
                type="button"
                onClick={onBack}
                className="w-full py-2.5 text-[#1D3557] font-fredoka font-bold text-xs rounded-xl hover:bg-[#FDFBF7] transition-colors"
              >
                Back to Practice Arena
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Normal Completion Screen
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-5 font-nunito relative overflow-hidden select-none">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] shadow-[0_6px_0_#E2D7C3] p-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-[11px] font-fredoka font-extrabold uppercase mb-2">
            <span>🐝</span> SPELLING BEE COMPLETE
          </div>

          <motion.h1
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-fredoka font-bold text-[#1D3557] mb-1"
          >
            Well Done!
          </motion.h1>
          <p className="text-xs font-bold text-[#264653]/70 mb-5 truncate">{unitTitle}</p>

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
                  className={i < finalStars ? 'text-amber-400' : 'text-slate-200'}
                  fill={i < finalStars ? 'currentColor' : 'none'}
                />
              </motion.span>
            ))}
          </div>

          <motion.p className="text-5xl font-fredoka font-bold text-[#2A9D8F] mb-1">
            {displayTotal}
          </motion.p>
          <p className="text-[11px] font-bold text-[#264653]/60 uppercase tracking-widest font-fredoka mb-6">
            Final Score
          </p>

          <div className="grid grid-cols-3 gap-2 bg-[#F7F3EB] rounded-2xl p-3 border border-[#E2D7C3] mb-6">
            <div>
              <p className="text-xl font-fredoka font-bold text-[#E76F51]">{t.bestStreak}</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Best Streak</p>
            </div>
            <div>
              <p className="text-xl font-fredoka font-bold text-[#1D3557]">{accuracy}%</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Accuracy</p>
            </div>
            <div>
              <p className="text-xl font-fredoka font-bold text-[#2A9D8F]">+{earnedXp} XP</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Earned</p>
            </div>
          </div>

          {best && (
            <p className="text-xs font-fredoka font-bold text-amber-700 bg-amber-50 rounded-xl py-1.5 px-3 border border-amber-200 mb-5 inline-flex items-center gap-1.5">
              <Trophy size={14} /> Personal Best: {best.score} pts
            </p>
          )}

          {finalStars === 5 && (
            <div className="mb-6 bg-[#E6F4F1] border-2 border-[#2A9D8F] rounded-2xl p-3 flex items-center justify-center gap-2 text-[#1E6F5C] font-fredoka font-bold text-sm shadow-sm">
              <Trophy size={18} />
              <span>+{GEM_REWARDS.PERFECT_LESSON} Gems — Perfect Run!</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={() => startUnit(unitId, unitTitle)}
              className="w-full py-3.5 bg-[#E76F51] hover:bg-[#d65f42] text-white font-fredoka font-bold text-[15px] rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
            >
              <span>Play Again</span>
              <RotateCcw size={18} />
            </button>
            <button
              onClick={onBack}
              className="w-full py-3 bg-[#FDFBF7] hover:bg-[#F7F3EB] text-[#1D3557] font-fredoka font-bold text-[14px] rounded-2xl border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] active:translate-y-0.5 active:shadow-none transition-all"
            >
              Done & Return to Arena
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: play ────────────────────────────────────────────────────────
  const hudProgress = Math.min(
    1,
    ((roundIndex - 1) * WORDS_PER_ROUND + turn.wordIdx + (turn.status === 'typing' ? 0 : 1)) /
      (totalRounds * WORDS_PER_ROUND),
  );
  const hudLabel =
    turn.status === 'complete'
      ? 'round complete'
      : `Round ${roundIndex}/${totalRounds} · word ${Math.min(turn.wordIdx + 1, turn.wordsTotal)}/${turn.wordsTotal}`;

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito relative overflow-hidden select-none">
      <header className="px-4 py-3 bg-[#FDFBF7] border-b-2 border-[#E2D7C3] flex items-center gap-3 shrink-0 z-20 shadow-sm">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="w-10 h-10 rounded-xl bg-[#F7F3EB] border border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3] text-[#1D3557] hover:bg-[#EAE0D0] flex items-center justify-center shrink-0 active:translate-y-0.5 transition-all"
          aria-label="Exit Game"
        >
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

        <div className="px-3 py-1.5 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-xl font-fredoka font-bold text-[#E76F51] tabular-nums text-sm shrink-0 shadow-sm">
          ⭐ {Math.max(0, score)}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3 pb-4 pt-2">
        <AnimatePresence mode="wait">
          {turn.currentWord && turn.status !== 'complete' && (
            <motion.div
              key={`${turn.wordIdx}-${turn.currentWord.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
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
              />
            </motion.div>
          )}

          {turn.status === 'complete' && (
            <motion.div
              key="round-clear"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-[#1D3557] p-6 text-center"
            >
              <div className="w-16 h-16 bg-[#2A9D8F]/15 text-[#2A9D8F] rounded-2xl border-2 border-[#2A9D8F]/30 flex items-center justify-center mb-3 text-3xl">
                🐝
              </div>
              <p className="text-3xl font-fredoka font-bold mb-1">Round {roundIndex} Clear!</p>
              <p className="text-[#264653]/70 text-sm font-bold">Preparing next round…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Exit Confirmation Guard Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-xs bg-[#FDFBF7] rounded-[24px] border-[2.5px] border-[#E2D7C3] p-6 shadow-2xl text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={24} />
              </div>
              <h3 className="font-fredoka font-bold text-lg text-[#1D3557] mb-1">Leave Spelling Bee?</h3>
              <p className="text-xs font-medium text-[#264653]/70 mb-5 leading-relaxed">
                Exiting now will forfeit this run's points and XP. Are you sure you want to quit?
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full py-3 bg-[#2A9D8F] hover:bg-[#23877b] text-white font-fredoka font-bold text-sm rounded-xl shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Keep Playing
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full py-2.5 bg-transparent hover:bg-[#EAE0D0]/50 text-[#E76F51] font-fredoka font-bold text-xs rounded-xl transition-colors"
                >
                  Yes, Leave Run
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SpellingBeeGame;
