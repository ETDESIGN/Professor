// FastVocabGame — the student solo surface of the shared Fast Vocab engine
// (components/games/fastVocab). The single-player loop:
// pick a unit (with category filter & pacing settings) → 4 lightning waves of
// (3-pair match wave + 2 timed speed questions) on that unit's pool →
// star tally + score count-up + personal best.
//
// Scoring uses the SAME math as the board (scoreForAttempt + streak, −1 per
// wrong) but stays local: recordAnswer for session accuracy, Gamification XP
// awarded once at the end (pattern A — self-awarded, no onSessionEnd, so the
// parent never double-awards). FSRS/analytics writes are board-only.
//
// Redesigned to Wonder Atlas warmth × Duolingo accents per Stitch screens
// 20/1.html (Unit picker lobby) and 20/2.html (Mid-game play).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, Star, Trophy, Zap, AlertTriangle, ArrowRight } from 'lucide-react';
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
import { preloadWaveAudio } from '../../components/games/fastVocab/preloadWaveAudio';
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
type CategoryTab = 'current' | 'recent' | 'all';

const FastVocabGame: React.FC<FastVocabGameProps> = ({ onBack }) => {
  const { state: solo, recordAnswer } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('select');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('current');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [unitId, setUnitId] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [mode, setMode] = useState<FastVocabMode>('image');
  const [unitPairs, setUnitPairs] = useState<FastVocabPair[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [wavePairs, setWavePairs] = useState<FastVocabPair[]>([]);
  const [waveIndex, setWaveIndex] = useState(0); // 0-based
  const [totalWaves, setTotalWaves] = useState(WAVES_PER_RUN);
  const cursorRef = useRef(0);

  // Initialize selected unit from active unit or first unit in solo session
  useEffect(() => {
    if (!selectedUnitId) {
      if (solo.activeUnit?.id) {
        setSelectedUnitId(solo.activeUnit.id);
      } else if (solo.units && solo.units.length > 0) {
        setSelectedUnitId(solo.units[0].id);
      }
    }
  }, [solo.activeUnit, solo.units, selectedUnitId]);

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
      setShowExitConfirm(false);
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

  // Fetch-only prefetch of the wave's stored audio (covers the first wave and
  // every wave advance in one place).
  useEffect(() => {
    if (wavePairs.length > 0) preloadWaveAudio(wavePairs);
  }, [wavePairs]);

  // ── Run completion: stars, personal best, XP/gems/quests (once) ────────
  const finishRun = () => {
    const t = totalsRef.current;
    const stars = starsFor(t.firstTry, t.interactions);
    const finalScore = scoreRef.current;
    const finalCorrect = correctCountRef.current;
    setFinalStars(stars);
    setScreen('done');
    playCue('win');
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

  // Filter units for the picker tabs
  const units = solo.units || [];
  const filteredUnits = useMemo(() => {
    if (categoryTab === 'current') {
      if (solo.activeUnit) return [solo.activeUnit];
      return units.slice(0, 1);
    }
    if (categoryTab === 'recent') {
      return units.slice(0, 3);
    }
    return units;
  }, [units, categoryTab, solo.activeUnit]);

  const activeDeckUnit = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId) || solo.activeUnit || units[0] || null;
  }, [units, selectedUnitId, solo.activeUnit]);

  // ── Screen: unit select & lobby (Stitch Screen 1) ──────────────────────
  if (screen === 'select' || screen === 'loading') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none">
        {/* Universal 64px Header */}
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
              Fast Vocab Solo
            </h1>
            <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
              Speed Match Challenge
            </p>
          </div>

          <div className="h-10 px-3 bg-amber-50 border-2 border-amber-200/90 rounded-2xl flex items-center gap-1.5 shadow-sm">
            <span className="text-[16px] leading-none">⭐</span>
            <span className="font-fredoka font-bold text-sm text-[#D87A29]">Solo</span>
          </div>
        </header>

        {/* Subheader Section with Category Pills */}
        <section className="bg-[#EAE0D0] pt-3 pb-2.5 px-4 shrink-0 border-b border-[#E2D7C3]/70">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1D3557]/80 font-fredoka flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2A9D8F] inline-block"></span> Choose Unit to Practice
            </span>
            <span className="text-[10px] font-bold text-[#264653]/60 bg-[#FDFBF7]/80 px-2 py-0.5 rounded-full border border-[#E2D7C3]/60">
              {units.length} Units Ready
            </span>
          </div>

          <div className="flex gap-2 items-center" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={categoryTab === 'current'}
              onClick={() => setCategoryTab('current')}
              className={`flex-1 py-2 px-3 font-fredoka font-bold text-[13px] rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 ${
                categoryTab === 'current'
                  ? 'bg-[#2A9D8F] border-[#1E6F5C] text-white shadow-[0_3px_0_#1E6F5C]'
                  : 'bg-[#FDFBF7] border-[#E2D7C3] text-[#264653] shadow-[0_3px_0_#E2D7C3]'
              }`}
            >
              <span>Current Unit</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={categoryTab === 'recent'}
              onClick={() => setCategoryTab('recent')}
              className={`flex-1 py-2 px-3 font-fredoka font-bold text-[13px] rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 ${
                categoryTab === 'recent'
                  ? 'bg-[#2A9D8F] border-[#1E6F5C] text-white shadow-[0_3px_0_#1E6F5C]'
                  : 'bg-[#FDFBF7] border-[#E2D7C3] text-[#264653] shadow-[0_3px_0_#E2D7C3]'
              }`}
            >
              <span>Recent Units</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={categoryTab === 'all'}
              onClick={() => setCategoryTab('all')}
              className={`py-2 px-3 font-fredoka font-bold text-[13px] rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 ${
                categoryTab === 'all'
                  ? 'bg-[#2A9D8F] border-[#1E6F5C] text-white shadow-[0_3px_0_#1E6F5C]'
                  : 'bg-[#FDFBF7] border-[#E2D7C3] text-[#264653] shadow-[0_3px_0_#E2D7C3]'
              }`}
            >
              <span>All Units</span>
            </button>
          </div>
        </section>

        {/* Scrollable Main Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
          {/* Preferences Card: Game Mode Settings */}
          <section className="bg-[#FDFBF7] rounded-[20px] p-3.5 border-2 border-[#E2D7C3] shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#E2D7C3]/60">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#2A9D8F]/10 text-[#2A9D8F] flex items-center justify-center text-xs font-black">
                  ⚙️
                </div>
                <h2 className="font-fredoka font-bold text-[14px] text-[#1D3557] tracking-tight">
                  Game Mode Settings
                </h2>
              </div>
              <div className="px-2.5 py-1 bg-[#F7F3EB] border border-[#E2D7C3] rounded-full text-[11px] font-extrabold text-[#1D3557]/80 font-fredoka flex items-center gap-1">
                <span className="text-[#E76F51] text-xs">⏱</span>
                <span>Pacing: Standard 10s</span>
              </div>
            </div>

            {/* Toggle Row: Longer Waves */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="pr-2">
                <div className="text-[13px] font-bold text-[#1D3557] leading-tight flex items-center gap-1.5">
                  <span>Longer Waves</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-[#2A9D8F]/15 text-[#1E6F5C] rounded-md">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] text-[#264653]/65 font-medium leading-tight mt-0.5">
                  {longWaves ? '5 pairs per round (Higher XP!)' : '3 pairs per round (Fast & Focused)'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={longWaves}
                onClick={toggleLongWaves}
                className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors duration-200 relative shrink-0 ${
                  longWaves ? 'bg-[#2A9D8F] border-[#1E6F5C]' : 'bg-[#D6CBB8] border-[#B8AA94]'
                }`}
                title="Toggle between 3 and 5 images per wave"
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-[#FDFBF7] shadow-md transform transition-transform duration-200 border border-black/10 ${
                    longWaves ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          {loadError && (
            <div className="p-3 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Unit Cards Label */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80 flex items-center gap-1.5">
              <span>📚</span> Available Lesson Decks
            </span>
            <span className="text-[11px] font-bold text-[#2A9D8F] font-nunito">Tap to Select</span>
          </div>

          {screen === 'loading' ? (
            <div className="flex flex-col items-center justify-center text-[#1D3557]/60 py-12">
              <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={32} />
              <span className="font-fredoka text-sm">Preparing lightning vocabulary wave…</span>
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="bg-[#FDFBF7] rounded-[22px] p-6 text-center border-2 border-[#E2D7C3] text-[#264653]/70">
              <p className="font-bold text-sm">No units in this view.</p>
              <button
                onClick={() => setCategoryTab('all')}
                className="mt-3 px-4 py-2 bg-[#2A9D8F] text-white rounded-xl font-fredoka text-xs font-bold shadow-[0_3px_0_#1E6F5C]"
              >
                View All Units
              </button>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {filteredUnits.map((u) => {
                const isSelected = selectedUnitId === u.id;
                const best = readBest(u.id);
                return (
                  <article
                    key={u.id}
                    onClick={() => setSelectedUnitId(u.id)}
                    className={`relative bg-[#FDFBF7] rounded-[22px] p-3.5 border-[2.5px] cursor-pointer transition-all hover:translate-y-[-1px] ${
                      isSelected
                        ? 'border-[#2A9D8F] shadow-[0_4px_0_#2A9D8F]'
                        : 'border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3]'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-3 right-4 bg-[#2A9D8F] border-2 border-[#1E6F5C] text-white text-[10px] font-fredoka font-extrabold tracking-wider px-2.5 py-0.5 rounded-full shadow-[0_2px_0_#1E6F5C] flex items-center gap-1">
                        <span>⚡</span> ACTIVE SELECTION
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 border-2 ${
                            isSelected
                              ? 'bg-[#2A9D8F]/15 border-[#2A9D8F]/30 text-[#2A9D8F]'
                              : 'bg-amber-50 border-amber-200 text-amber-600'
                          }`}
                        >
                          <Zap size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557] leading-snug truncate">
                            {u.title}
                          </h3>
                          <p className="text-[11px] font-bold text-[#264653]/60 truncate mt-0.5">
                            {u.topic ? `${u.topic} · ` : ''}{u.level || 'Beginner'}
                          </p>
                        </div>
                      </div>

                      {best && (
                        <div className="text-right shrink-0">
                          <div className="flex gap-0.5 justify-end">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                size={12}
                                className={i < best.stars ? 'text-amber-400' : 'text-slate-200'}
                                fill={i < best.stars ? 'currentColor' : 'none'}
                              />
                            ))}
                          </div>
                          <span className="inline-block mt-1 text-[10px] font-fredoka font-bold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[#D87A29]">
                            Best: {best.score} pts
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Anchored Primary CTA Footer */}
        {activeDeckUnit && (
          <footer className="bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 shrink-0 shadow-lg">
            <button
              type="button"
              onClick={() => startUnit(activeDeckUnit.id, activeDeckUnit.title)}
              className="w-full h-14 bg-[#E76F51] hover:bg-[#d65f42] border-2 border-[#C4553B] text-white font-fredoka font-bold text-[16px] rounded-2xl shadow-[0_4px_0_#C4553B] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all"
            >
              <span>START FAST VOCAB ({activeDeckUnit.title.slice(0, 16)})</span>
              <Zap size={18} />
            </button>
          </footer>
        )}
      </div>
    );
  }

  // ── Screen: done (Wonder Atlas Celebration) ────────────────────────────
  if (screen === 'done') {
    const t = totalsRef.current;
    const accuracy = t.interactions > 0 ? Math.round((t.firstTry / t.interactions) * 100) : 0;
    const displayScore = Math.max(0, score);
    const earnedXp = Math.max(1, correctCount);

    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-5 font-nunito relative overflow-hidden select-none">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] shadow-[0_6px_0_#E2D7C3] p-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-[11px] font-fredoka font-extrabold uppercase mb-2">
            <span>⚡</span> FAST VOCAB RUN COMPLETE
          </div>

          <motion.h1
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-fredoka font-bold text-[#1D3557] mb-1"
          >
            Well Done!
          </motion.h1>
          <p className="text-xs font-bold text-[#264653]/70 mb-5 truncate">{unitTitle}</p>

          {/* Golden Stars Cascade */}
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

          {/* Final Score */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <p className="text-5xl font-fredoka font-bold text-[#2A9D8F] leading-none mb-1">
              {displayScore}
            </p>
            <p className="text-[11px] font-bold text-[#264653]/60 uppercase tracking-widest font-fredoka">
              Final Score Points
            </p>
          </motion.div>

          {/* 3-Stat Metric Row */}
          <div className="grid grid-cols-3 gap-2 bg-[#F7F3EB] rounded-2xl p-3 border border-[#E2D7C3] mb-6">
            <div>
              <p className="text-xl font-fredoka font-bold text-[#E76F51]">{t.bestStreak}</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Best Streak</p>
            </div>
            <div>
              <p className="text-xl font-fredoka font-bold text-[#1D3557]">{accuracy}%</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">First-Try</p>
            </div>
            <div>
              <p className="text-xl font-fredoka font-bold text-[#2A9D8F]">+{earnedXp} XP</p>
              <p className="text-[10px] font-bold text-[#264653]/60 uppercase">Earned</p>
            </div>
          </div>

          {/* Perfect Run Gem Banner (Pattern A, only when 5 stars) */}
          {finalStars === 5 && (
            <div className="mb-6 bg-[#E6F4F1] border-2 border-[#2A9D8F] rounded-2xl p-3 flex items-center justify-center gap-2 text-[#1E6F5C] font-fredoka font-bold text-sm shadow-sm">
              <Trophy size={18} />
              <span>+{GEM_REWARDS.PERFECT_LESSON} Gems — Perfect Run!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={() => startUnit(unitId, unitTitle)}
              className="w-full py-3.5 bg-[#E76F51] hover:bg-[#d65f42] text-white font-fredoka font-bold text-[15px] rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
            >
              <span>Play Again</span>
              <ArrowRight size={18} />
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

  // ── Screen: play (Stitch Screen 2) ──────────────────────────────────────
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
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito relative overflow-hidden select-none">
      {/* Mid-game Header */}
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
            timeRemaining={turn.phase === 'speed' ? turn.timeRemaining : undefined}
            timeLimit={turn.phase === 'speed' ? turn.timeLimit : undefined}
            compact
          />
        </div>

        <div className="px-3 py-1.5 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-xl font-fredoka font-bold text-[#E76F51] tabular-nums text-sm shrink-0 shadow-sm">
          ⭐ {Math.max(0, score)}
        </div>
      </header>

      {/* Main Play Arena */}
      <div className="flex-1 min-h-0 relative px-3 pb-4 pt-2">
        <AnimatePresence mode="wait">
          {turn.phase === 'match' && (
            <motion.div
              key={`match-${waveIndex}-${wavePairs.map((p) => p.id).join(',')}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 p-2"
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
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 p-2"
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
              className="absolute inset-0 flex flex-col items-center justify-center text-[#1D3557] p-6 text-center"
            >
              <div className="w-16 h-16 bg-[#2A9D8F]/15 text-[#2A9D8F] rounded-2xl border-2 border-[#2A9D8F]/30 flex items-center justify-center mb-3 text-3xl">
                ⚡
              </div>
              <p className="text-3xl font-fredoka font-bold mb-1">Wave {waveIndex + 1} Clear!</p>
              <p className="text-[#264653]/70 text-sm font-bold">
                {waveIndex + 1 < totalWaves ? 'Get ready for the next wave…' : 'Finalizing your score…'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Exit Confirmation Guard Modal (Protects Pattern A Sacred Award) */}
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
              <h3 className="font-fredoka font-bold text-lg text-[#1D3557] mb-1">Leave Practice?</h3>
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
