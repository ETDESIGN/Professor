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
import { Volume2, Mic, MicOff, Flame, Check } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useSpeechRecognition } from './useSpeechRecognition';
import { logAttempt } from './scoreAttempt';
import { shuffle } from './scoringUtils';
import { playCue } from './playCue';
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
  /** Optional teaching note shown during the reveal-on-wrong hold. */
  explanation?: string;
}

// ONE source of truth for the answer (audit fix ~:81-99): the MCQ option when
// the generator filled it in, else the pair member at correct_index, else
// pair[0]. BOTH the spoken text and the answer validation use correctWord —
// previously the audio could speak pair[0] while the answer was
// options[correct_index].text (audio/answer mismatch).
const LETTERS = ['A', 'B', 'C', 'D'];

const toPhonicsItem = (pi: PoolItem): PhonicsItem => {
  const content = pi.content as MinimalPairSwipeContent;
  const correctWord =
    content.options?.[content.correct_index]?.text ??
    content.pair?.[content.correct_index] ??
    content.pair?.[0] ??
    '';
  return {
    poolItem: pi,
    word1: content.pair?.[0] || '',
    word2: content.pair?.[1] || '',
    audioUrl: content.audio_url,
    speechText: content.prompt_text || correctWord,
    correctWord,
    explanation: (content as any).explanation,
  };
};

const BoardPhonicsArena = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded option order (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Per-item resolve latch (success / MARK_CORRECT / reveal) — prevents stale
   *  speech results or double remote taps from resolving an item twice. */
  const resolvedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);

  const [currentRound, setCurrentRound] = useState<1 | 2 | 3>(1);
  const [round1Idx, setRound1Idx] = useState(0);
  const [round2Idx, setRound2Idx] = useState(0);
  const [round3Idx, setRound3Idx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // games-v3 audit §2 owner rule + §3 F3 (Sound Lab parity): the target audio
  // AUTO-PLAYS once per item (free); every manual replay after that docks the
  // picked student −1 point. replayCost counts chargeable replays for the UI.
  const autoPlayedRef = useRef<string | null>(null);
  const replayCostRef = useRef(0);
  const [replayCost, setReplayCost] = useState(0);

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
  const minimalPairs = useMemo(
    () => poolItems.filter((pi) => pi.exercise_type === 'MINIMAL_PAIR_SWIPE'),
    [poolItems]
  );

  // Round 1: the first 5 pairs. Round 2: the NEXT 4 pairs — but when the pool
  // is too small for a disjoint draw, round 2 replays round 1's pairs (at 4
  // options instead of 2 via currentWords below) so the round actually
  // happens instead of being skipped (audit fix).
  const round1Items: PhonicsItem[] = useMemo(
    () => minimalPairs.slice(0, 5).map(toPhonicsItem),
    [minimalPairs]
  );

  const round2Items: PhonicsItem[] = useMemo(() => {
    const tail = minimalPairs.slice(5, 9).map(toPhonicsItem);
    return tail.length > 0 ? tail : round1Items.map((it) => toPhonicsItem(it.poolItem));
  }, [minimalPairs, round1Items]);

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

  const hasAnyItems = round1Items.length > 0 || round2Items.length > 0 || round3Items.length > 0;

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

  // Skip empty rounds in an effect — the previous render-time setCurrentRound
  // was a setState-during-render anti-pattern (audit fix). When EVERY round is
  // empty the branded empty-state card below wins (hasAnyItems gate), so zero
  // items can never cascade into a fake victory celebration.
  useEffect(() => {
    if (allDone || !hasAnyItems || currentItem) return;
    if (currentRound === 1 && round1Items.length === 0) setCurrentRound(2);
    else if (currentRound === 2 && round2Items.length === 0) setCurrentRound(3);
    else if (currentRound === 3 && round3Items.length === 0) completeGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, hasAnyItems, currentItem, currentRound, round1Items.length, round2Items.length, round3Items.length]);

  // ── Real option sets (no fake placeholder words). Round 1 = the 2 pair
  //    words; Round 2 = the pair + 2 real distractors drawn from the OTHER
  //    minimal pairs in the pool, shuffled so the answer isn't positional.
  const currentWords: string[] = useMemo(() => {
    if (!currentItem || currentRound === 3) return [];
    // games-v3 audit (P1 exploit): generation stamps correct_index 0 and
    // this row used to return [word1, word2] UNshuffled — the audio always
    // named the LEFT tablet, so "always tap left" scored 100% without
    // listening. Shuffle with the same seeded pattern as round 2 (validation
    // is by word text, so shuffling is safe).
    if (currentRound === 1) {
      return shuffle([currentItem.word1, currentItem.word2], makeRng(seedBase, currentItem.poolItem.id, currentRound, 'options'));
    }
    // Round 2: gather candidate distractors from every other minimal pair.
    const others = [...round1Items, ...round2Items]
      .filter((it) => it.poolItem.id !== currentItem.poolItem.id)
      .flatMap((it) => [it.word1, it.word2])
      .filter((w) => w && w !== currentItem.word1 && w !== currentItem.word2);
    const distractors = Array.from(new Set(others)).slice(0, 2);
    return shuffle([currentItem.word1, currentItem.word2, ...distractors], makeRng(seedBase, currentItem.poolItem.id, currentRound, 'options'));
  }, [currentItem, currentRound, round1Items, round2Items, seedBase]);

  // ── Unified per-item success/failure (triple-write) ────────────────────
  const itemSuccess = (modality: 'receptive' | 'productive', partialRatio = 1.0) => {
    if (!currentItem || resolvedRef.current) return;
    resolvedRef.current = true;
    playCue('correct');
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    if (nextStreak === 3 || nextStreak === 5) {
      playCue('streak');
      triggerConfetti();
    }
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || (modality === 'productive' ? 2 : 1);
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialRatio, nextStreak);
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
        correctness: partialRatio >= 1 ? 'correct' : 'partial',
        modality,
        pushToRemediation,
      });
    }
  };
  const itemFailure = (modality: 'receptive' | 'productive') => {
    if (!currentItem || resolvedRef.current) return;
    playCue('wrong');
    setStreak(0);
    mistakesRef.current += 1;
    const picked = state.quickWheelWinner;
    if (picked) addPoints(picked, -MISTAKE_PENALTY);
    logAttempt({
      state,
      picked: picked || '',
      unitId,
      objectiveId: currentItem.poolItem.objective_id,
      exerciseType: currentItem.poolItem.exercise_type,
      difficulty: currentItem.poolItem.difficulty || (modality === 'productive' ? 2 : 1),
      correctness: 'incorrect',
      correct: false,
      modality,
      pushToRemediation,
    });
  };

  // Shared reveal-on-wrong: 2nd consecutive miss on an item → highlight the
  // correct word (amber ring), show the explanation when the content has one,
  // hold ~2.2s (teaching beat), then advance. Reset per item.
  const revealAnswer = (advance: () => void) => {
    playCue('reveal');
    resolvedRef.current = true;
    setRevealed(true);
    setTimeout(() => {
      setRevealed(false);
      advance();
    }, 2200);
  };

  // Natural completion → terminal card + SLIDE_COMPLETE broadcast. The ref
  // makes it idempotent across the optimistic lastAction echo and the
  // remote's forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setAllDone(true);
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  // MARK_CORRECT body (invoked from the lastAction listener): clean correct
  // award with mistakesRef preserved, then advance on the short hold. In
  // round 3 this is the "accept that pronunciation" teacher override.
  const markCorrect = () => {
    if (!currentItem || resolvedRef.current || completeRef.current) return;
    if (currentRound !== 3) {
      const idx = currentWords.indexOf(currentItem.correctWord);
      if (idx >= 0) setSelectedWord(idx);
    }
    itemSuccess(currentRound === 3 ? 'productive' : 'receptive', 1.0);
    setPhaseComplete(true);
    setTimeout(() => advanceCurrentRound(), 900);
  };

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
        // Productive success — partial credit = pronunciation similarity.
        // Hold ~2s: the transcript + score card is teaching content.
        itemSuccess('productive', Math.max(0.6, Math.min(1, score)));
        setPhaseComplete(true);
        setTimeout(() => advanceRound3(), 2000);
      } else {
        itemFailure('productive');
      }
    },
  });

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    setCurrentRound(1);
    setRound1Idx(0);
    setRound2Idx(0);
    setRound3Idx(0);
    setSelectedWord(null);
    setStreak(0);
    setPhaseComplete(false);
    setAllDone(false);
    setRevealed(false);
    autoPlayedRef.current = null;
    replayCostRef.current = 0;
    setReplayCost(0);
  }, [turnId]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      setCurrentRound(1);
      setRound1Idx(0);
      setRound2Idx(0);
      setRound3Idx(0);
      setSelectedWord(null);
      setStreak(0);
      setPhaseComplete(false);
      setAllDone(false);
      setRevealed(false);
      autoPlayedRef.current = null;
      replayCostRef.current = 0;
      setReplayCost(0);
    } else if (type === 'NEXT_ITEM') {
      advanceCurrentRound();
    } else if (type === 'PLAY_AUDIO') {
      // Audit F4: teacher replay path from commander/remote (metered above).
      playAudio();
    } else if (type === 'MARK_CORRECT') {
      // Teacher override ("Correct" on the remote): score the current item
      // as a clean correct (mistakesRef preserved) and advance. In round 3
      // this doubles as "accept that pronunciation" when recognition is
      // being unfair.
      markCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      // completeRef stops us echoing the broadcast back (our own optimistic
      // lastAction update re-enters this listener).
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // Auto-play the target audio once per item (rounds 1-2, the listening
  // rounds). Sound Lab parity per audit F2/§2 — previously strictly manual.
  useEffect(() => {
    if (!currentItem || currentRound === 3 || allDone) return;
    if (autoPlayedRef.current === currentItem.poolItem.id) return;
    autoPlayedRef.current = currentItem.poolItem.id;
    const t = setTimeout(() => {
      if (currentItem?.audioUrl || currentItem?.speechText) playCurrentSpeech();
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.poolItem.id, currentRound]);

  const playAudio = () => {
    if (currentItem?.audioUrl || currentItem?.speechText) {
      // Metered replay (audit §2/F3): free auto-play has fired → every manual
      // replay costs the picked student 1 point. Resource cost, NOT a logged
      // attempt (no recordAttempt/gradeObjective here).
      if (autoPlayedRef.current === currentItem.poolItem.id) {
        replayCostRef.current += 1;
        setReplayCost(replayCostRef.current);
        const picked = state.quickWheelWinner;
        if (picked) addPoints(picked, -1);
      } else {
        autoPlayedRef.current = currentItem.poolItem.id;
      }
      playCurrentSpeech();
    }
  };

  const handleWordSelect = (idx: number) => {
    if (!currentItem || currentRound === 3 || resolvedRef.current) return;
    const selected = currentWords[idx];
    const isCorrect = selected === currentItem.correctWord;

    setSelectedWord(idx);

    if (isCorrect) {
      itemSuccess('receptive');
      setPhaseComplete(true);
      setTimeout(() => advanceCurrentRound(), 900);
    } else {
      itemFailure('receptive');
      if (mistakesRef.current >= 2) revealAnswer(() => advanceCurrentRound());
      else setTimeout(() => setSelectedWord(null), 800);
    }
  };

  const advanceCurrentRound = () => {
    // Per-item attempt reset — each pair/word is its own scored attempt.
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    replayCostRef.current = 0;
    setReplayCost(0);
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
    resolvedRef.current = false;
    replayCostRef.current = 0;
    setReplayCost(0);
    if (round3Idx < round3Items.length - 1) {
      setRound3Idx((prev) => prev + 1);
      setPhaseComplete(false);
    } else {
      completeGame();
    }
  };

  if (loading) {
    return (
      <div className="pa-root flex items-center justify-center h-full bg-[#070C18]">
        <div className="text-2xl text-slate-400 font-bold">Loading phonics items…</div>
      </div>
    );
  }

  // Zero items (all rounds empty) → the branded empty-state card, never the
  // completion celebration (audit fix).
  if (!hasAnyItems) {
    return (
      <div className="pa-root flex flex-col items-center justify-center h-full bg-[#070C18] p-8 text-center">
        <Volume2 size={56} className="text-sky-500/40 mb-5" />
        <h2 className="text-4xl font-bold text-white mb-3">Phonics Arena</h2>
        <div className="text-xl text-slate-400 max-w-xl">
          No phonics items ready yet — run the exercise generator for this unit, or skip to the next slide.
        </div>
      </div>
    );
  }

  // Transient frame while the skip-empty-rounds effect above catches up —
  // never dereference a missing currentItem in the option grids below.
  if (!currentItem && !allDone) return null;

  const allComplete = allDone || (currentRound === 3 && round3Idx >= round3Items.length && phaseComplete);
  const itemIdx = currentRound === 1 ? round1Idx : currentRound === 2 ? round2Idx : round3Idx;
  const itemTotal = currentRound === 1 ? round1Items.length : currentRound === 2 ? round2Items.length : round3Items.length;
  const TIERS = [
    { n: 1, label: 'TIER 1 · SOUND DUEL', hint: 'Which word did you hear?' },
    { n: 2, label: 'TIER 2 · SOUND ARENA', hint: 'Pick from four words' },
    { n: 3, label: 'TIER 3 · VOICE CHAMPION', hint: 'Say the word!' },
  ];

  // ── Render pieces (v3 "Phonics Arena" per stitch/22-phonics-arena) ─────

  const header = (
    <header className="w-full flex items-center justify-between gap-3 pr-1 pl-40 lg:pl-48 h-12 lg:h-14 [@media(max-height:430px)]:h-9 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="pa-mono px-2.5 py-1.5 rounded-lg bg-[#FF2E79]/15 border border-[#FF2E79]/50 text-[#FF2E79] text-[10px] lg:text-xs font-black tracking-widest shrink-0">
          PHONICS
        </div>
        {/* Tier strip — design's Tier 1/2/3 ladder maps to rounds 1/2/3 */}
        <nav className="hidden md:flex items-center gap-1">
          {TIERS.map((t) => (
            <span key={t.n}
              className={`pa-mono px-2.5 py-1 rounded-md text-[9px] lg:text-[10px] font-bold tracking-wider whitespace-nowrap ${
                t.n === currentRound
                  ? 'bg-slate-800 border-b-2 border-[#FF2E79] text-white'
                  : t.n < currentRound
                    ? 'bg-slate-900 text-emerald-400/80'
                    : 'bg-slate-900/60 text-slate-500'
              }`}>
              {t.label}
            </span>
          ))}
        </nav>
        <span className="md:hidden pa-mono text-[10px] font-bold text-[#FF2E79] tracking-wider shrink-0">T{currentRound}/3</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="pa-mono text-[10px] lg:text-xs text-slate-400 font-bold whitespace-nowrap">
          {currentRound !== 3 ? `Pair ${itemIdx + 1}/${itemTotal}` : `Word ${itemIdx + 1}/${itemTotal}`}
        </span>
        {streak > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/50">
            <Flame size={13} className="text-amber-400" />
            <span className="pa-mono text-[10px] lg:text-xs font-bold tracking-wider text-amber-300">STREAK {streak}</span>
          </div>
        )}
      </div>
    </header>
  );

  // Acoustic hub (design #1/#2): ripple rings + METERED replay core + EQ bars.
  const acousticHub = (
    <div className="shrink-0 flex flex-col items-center gap-1.5 py-1">
      <div className="relative flex items-center justify-center">
        <span className="pa-ring absolute w-28 h-28 lg:w-40 lg:h-40 rounded-full border border-[#38BDF8]/30" />
        <span className="pa-ring absolute w-40 h-40 lg:w-56 lg:h-56 rounded-full border border-[#38BDF8]/20" style={{ animationDelay: '0.6s' }} />
        <button onClick={playAudio} aria-label="Replay the target audio"
          className="relative z-10 w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-slate-800 border-2 border-[#38BDF8] flex flex-col items-center justify-center hover:shadow-[0_0_24px_-4px_rgba(56,189,248,0.6)] transition-all active:scale-95">
          <Volume2 size={22} className="text-[#38BDF8]" />
          <span className="pa-mono text-[8px] uppercase tracking-widest text-[#38BDF8] mt-0.5">Listen</span>
          {/* Metered replay penalty pill (design #2) */}
          {replayCost > 0 && (
            <span className="absolute -bottom-2.5 bg-rose-500 text-white pa-mono text-[9px] font-bold px-2 py-0.5 rounded-full border-2 border-[#070C18] whitespace-nowrap">
              −{replayCost} pt{replayCost > 1 ? 's' : ''}
            </span>
          )}
        </button>
      </div>
      <div className="flex items-end justify-center gap-1 h-5" aria-hidden>
        {[10, 16, 20, 13, 8, 17, 11].map((h, i) => (
          <span key={i} className="w-1 rounded-full bg-[#38BDF8] pa-eq" style={{ height: h, animationDelay: `${i * 0.11}s` }} />
        ))}
      </div>
      <div className="flex items-center gap-2 bg-slate-800/80 px-4 lg:px-6 py-1.5 rounded-full border border-slate-700">
        <span className="text-sm lg:text-base font-bold text-white">
          {currentRound === 3 ? 'Listen first — then say the word!' : 'Listen carefully! Which word did you hear?'}
        </span>
        <span className="hidden lg:inline pa-mono text-[10px] text-slate-500 uppercase tracking-wider">(auto-plays · replay −1 pt)</span>
      </div>
    </div>
  );

  // Word tablet (design #1's massive arcade tablets). No phoneme-letter
  // highlight — the content model carries no phoneme span or IPA (fidelity
  // log); the whole word renders in display type.
  const renderTablet = (word: string, idx: number) => {
    const isSelected = selectedWord === idx;
    const isCorrect = word === currentItem.correctWord;
    const solved = phaseComplete && isSelected && isCorrect;
    const wrongPick = isSelected && !isCorrect && !revealed;
    return (
      <motion.button
        key={`${word}-${idx}`}
        initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.07, duration: 0.28 }}
        whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
        onClick={() => handleWordSelect(idx)}
        className={`relative rounded-2xl border-2 p-3 lg:p-5 flex flex-col justify-between min-h-0 overflow-hidden transition-colors
          ${solved ? 'border-emerald-400 bg-emerald-950/40 pa-glow-correct'
            : wrongPick ? 'border-rose-400 bg-rose-950/30 pa-shake'
            : revealed && isCorrect ? 'border-amber-400 bg-amber-950/25 pa-pulse-hint'
            : isSelected ? 'border-[#38BDF8] bg-[#38BDF8]/10'
            : 'border-slate-700 bg-[#111C3D] hover:border-[#38BDF8]/70'}`}>
        {/* Corner accent decals (design) */}
        <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#38BDF8]/50 rounded-tl-2xl pointer-events-none" />
        <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#38BDF8]/50 rounded-tr-2xl pointer-events-none" />
        <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#38BDF8]/50 rounded-bl-2xl pointer-events-none" />
        <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#38BDF8]/50 rounded-br-2xl pointer-events-none" />
        <span className={`pa-mono text-[9px] lg:text-[10px] font-bold tracking-[0.18em] uppercase self-start px-2 py-0.5 rounded
          ${isSelected ? 'bg-[#38BDF8]/20 text-[#7DD3FC]' : 'bg-slate-800 text-slate-400'}`}>
          Option {LETTERS[idx]}
        </span>
        <span className={`text-center font-black tracking-tight leading-none my-1 lg:my-2
          ${currentWords.length > 2 ? 'text-3xl lg:text-5xl xl:text-6xl' : 'text-5xl lg:text-7xl'}
          ${solved ? 'text-emerald-300' : revealed && isCorrect ? 'text-amber-300' : isSelected ? 'text-[#7DD3FC]' : 'text-white'}`}>
          {word}
        </span>
        <span className={`pa-mono w-full py-1.5 lg:py-2.5 rounded-lg text-[9px] lg:text-[11px] font-bold tracking-[0.16em] uppercase text-center border
          ${solved ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            : isSelected ? 'bg-[#38BDF8]/10 border-[#38BDF8]/40 text-[#7DD3FC]'
            : 'bg-slate-800/80 border-slate-700 text-slate-300 group-hover:text-[#7DD3FC]'}`}>
          {solved ? '✓ Correct' : `Tap to choose ${word}`}
        </span>
      </motion.button>
    );
  };

  return (
    <div className="pa-root h-full w-full flex flex-col gap-1.5 lg:gap-2.5 p-2 lg:p-4 [@media(max-height:430px)]:gap-1 [@media(max-height:430px)]:p-1.5 bg-[#070C18] relative overflow-hidden">
      <style>{`
        .pa-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .pa-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .pa-glow-correct { box-shadow: 0 0 30px -4px rgba(16,185,129,0.55), inset 0 0 24px rgba(16,185,129,0.1); }
        @keyframes pa-ring { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.18); opacity: 0.12; } }
        .pa-ring { animation: pa-ring 2s ease-in-out infinite; }
        @keyframes pa-eq { 0%, 100% { transform: scaleY(0.5); opacity: 0.5; } 50% { transform: scaleY(1.2); opacity: 1; } }
        .pa-eq { animation: pa-eq 0.9s ease-in-out infinite; transform-origin: bottom; }
        @keyframes pa-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
        .pa-shake { animation: pa-shake 0.4s ease-in-out; }
        @keyframes pa-pulse-hint { 0%, 100% { box-shadow: 0 0 8px -2px rgba(245,158,11,0.4); } 50% { box-shadow: 0 0 26px -2px rgba(245,158,11,0.75); } }
        .pa-pulse-hint { animation: pa-pulse-hint 0.8s ease-in-out infinite; }
        @keyframes pa-mic { 0%, 100% { box-shadow: 0 0 12px -2px rgba(255,46,121,0.4); } 50% { box-shadow: 0 0 34px -2px rgba(255,46,121,0.8); } }
        .pa-mic-live { animation: pa-mic 1.1s ease-in-out infinite; }
      `}</style>

      {header}

      <AnimatePresence mode="wait">
        {!allComplete && (
          <motion.div
            key={`round-${currentRound}-item-${itemIdx}`}
            initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
            className="flex-1 min-h-0 flex flex-col gap-1.5 lg:gap-2.5">
            {acousticHub}

            {/* Rounds 1-2: the duel tablets (2-up or 2×2) */}
            {currentRound !== 3 && (
              <>
                <div className={`flex-1 min-h-0 grid gap-2.5 lg:gap-6 ${currentWords.length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
                  {currentWords.map((word, idx) => renderTablet(word, idx))}
                </div>
                {/* Reveal-on-wrong teaching note (content-provided) */}
                {revealed && currentItem.explanation && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="shrink-0 p-3 bg-amber-950/50 border-2 border-amber-400/60 rounded-xl text-base lg:text-lg text-amber-200 text-center">
                    {currentItem.explanation}
                  </motion.div>
                )}
              </>
            )}

            {/* Round 3 (Voice Champion): produce view */}
            {currentRound === 3 && (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 lg:gap-5">
                <div className="text-center">
                  <span className="pa-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Say the word</span>
                  <div className="text-5xl lg:text-7xl font-black text-white tracking-tight leading-tall">{currentItem.targetText}</div>
                </div>
                {!speechSupported ? (
                  <div className="text-center text-slate-400 text-lg flex flex-col items-center gap-3">
                    <MicOff size={44} className="text-slate-500" />
                    Speech recognition not supported on this board
                  </div>
                ) : (
                  <button onClick={startListening} disabled={isListening}
                    className={`px-8 lg:px-12 py-4 lg:py-6 rounded-full font-bold text-xl lg:text-2xl flex items-center gap-3 transition-all
                      ${isListening
                        ? 'bg-[#FF2E79] text-white pa-mic-live'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95'}`}>
                    <Mic size={26} />
                    {isListening ? 'Listening…' : 'Tap to Speak'}
                  </button>
                )}
                {speechTranscript && (
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    className={`p-4 lg:p-5 rounded-2xl border-2 w-full max-w-xl text-center ${
                      speechPassed ? 'border-emerald-400/70 bg-emerald-950/30' : 'border-rose-400/60 bg-rose-950/20'
                    }`}>
                    <div className="pa-mono text-[9px] uppercase tracking-widest text-slate-400 mb-1">You said</div>
                    <div className="text-2xl font-bold text-white">“{speechTranscript}”</div>
                    <div className="mt-1 text-sm text-slate-400">
                      Score: <span className={`font-bold ${speechPassed ? 'text-emerald-400' : 'text-rose-400'}`}>{Math.round((speechScore || 0) * 100)}%</span>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {allComplete && (
          <motion.div key="complete" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center pa-glow-correct">
              <Check size={52} className="text-emerald-400" strokeWidth={3} />
            </div>
            <h2 className="text-4xl lg:text-5xl font-black text-white">Arena Complete!</h2>
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-950/60 border border-amber-500/50">
              <Flame size={18} className="text-amber-400" />
              <span className="text-lg font-bold text-amber-300">Final streak: {streak}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardPhonicsArena;