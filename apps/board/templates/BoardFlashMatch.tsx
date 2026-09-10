// BoardFlashMatch v2 — multi-payload matching game (PRACTICE phase).
//
// Rewritten per flashmatch-v2-spec.md. Consumes IMAGE_SELECT, MEANING_MATCH,
// and AUDIO_L1_SELECT via useEscalatingPool (mastery-gated escalation).
//
// Lifecycle: per-pair mistake tracking + award latching (adaptation of the
// standard 4-must-dos for a K-pair board). Both reset on currentTurnId change.
//
// Scoring: dual-write — addPoints(id, delta) for the leaderboard AND
// recordAttempt(...) for analytics on every scored event.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check, RefreshCcw, Volume2, Lightbulb } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { scoreForAttempt, MISTAKE_PENALTY, type Difficulty } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useEscalatingPool } from '../useEscalatingPool';
import { logAttempt } from './scoreAttempt';
import { playAudioUrl } from '../../../services/SpeechService';
import { playCue } from './playCue';
import type { PoolItem } from '../../../types/exercise';

// ── Types ────────────────────────────────────────────────────────────────
type TileKind = 'text' | 'image' | 'audio';

interface MatchTile {
  id: string;
  kind: TileKind;
  display: string;
}

interface MatchPair {
  id: string;
  objectiveId: string;
  exerciseType: 'MEANING_MATCH' | 'IMAGE_SELECT' | 'AUDIO_L1_SELECT';
  difficulty: 1 | 2 | 3;
  left: MatchTile;
  right: MatchTile;
}

// ── Normalizer (spec §1 — field names verified against types/exercise.ts) ─
function normalizeToMatchPair(item: PoolItem): MatchPair | null {
  const base = {
    id: item.id,
    objectiveId: item.objective_id,
    exerciseType: item.exercise_type as MatchPair['exerciseType'],
    difficulty: item.difficulty,
  };
  const c = item.content as any;
  switch (item.exercise_type) {
    case 'MEANING_MATCH': {
      const meaning = c.options?.[c.correct_index];
      if (!c?.prompt || meaning == null) return null;
      return {
        ...base,
        left:  { id: `${item.id}-L`, kind: 'text', display: c.prompt },
        right: { id: `${item.id}-R`, kind: 'text', display: String(meaning) },
      };
    }
    case 'IMAGE_SELECT': {
      const correctImg = c.options?.[c.correct_index]?.image_url;
      if (!c?.prompt || !correctImg) return null;
      return {
        ...base,
        left:  { id: `${item.id}-L`, kind: 'text', display: c.prompt },
        right: { id: `${item.id}-R`, kind: 'image', display: String(correctImg) },
      };
    }
    case 'AUDIO_L1_SELECT': {
      const meaning = c.options?.[c.correct_index];
      if (!c?.audio_url || meaning == null) return null;
      return {
        ...base,
        left:  { id: `${item.id}-L`, kind: 'audio', display: c.audio_url },
        right: { id: `${item.id}-R`, kind: 'text', display: String(meaning) },
      };
    }
    default:
      return null;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 4;
const MAX_PAIRS = 6;
const MIN_PAIRS = 3;

// ── Component ─────────────────────────────────────────────────────────────
const BoardFlashMatch = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded right-column shuffle (identical on every tab).
  const seedBase = useSeedBase();
  const unitId = state.activeUnit?.id || '';
  const phase = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);
  const pickedStudent = usePickedStudent();

  // ── Round tracking ────────────────────────────────────────────────────
  const [roundIndex, setRoundIndex] = useState(1);
  const [roundComplete, setRoundComplete] = useState(false);
  const [allComplete, setAllComplete] = useState(false);

  // ── Escalating pool ───────────────────────────────────────────────────
  const { items, loading } = useEscalatingPool({
    unitId,
    shellType: 'FLASH_MATCH',
    phase,
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: MAX_PAIRS,
  });

  // ── Normalize pool items → match pairs ────────────────────────────────
  // Frozen fallback (legacy data.pairs) for units without pool content.
  const frozenPairs: MatchPair[] = useMemo(() => {
    if (!Array.isArray(data?.pairs) || data.pairs.length === 0) return [];
    return data.pairs.slice(0, MAX_PAIRS).map((p: any, i: number) => ({
      id: `frozen-${i}`,
      objectiveId: `frozen-${i}`,
      exerciseType: 'MEANING_MATCH' as const,
      difficulty: 1 as const,
      left: { id: `frozen-${i}-L`, kind: 'text' as const, display: p.left || '' },
      right: { id: `frozen-${i}-R`, kind: 'text' as const, display: p.right || '' },
    }));
  }, [data?.pairs]);

  const matchPairs: MatchPair[] = useMemo(() => {
    const seen = new Set<string>();
    const out: MatchPair[] = [];
    for (const it of items) {
      if (seen.has(it.objective_id)) continue;
      const pair = normalizeToMatchPair(it);
      if (pair) { seen.add(it.objective_id); out.push(pair); }
      if (out.length >= MAX_PAIRS) break;
    }
    // Pool first (pool-coverage fix): the frozen legacy pairs used to override
    // the pool even when generate-exercises had produced full per-word items,
    // pinning the game to vocab.slice(0, 5). Frozen data is only a fallback
    // for units with no pool content at all.
    return out.length > 0 ? out : frozenPairs;
  }, [items, frozenPairs]);

  // ── Tile state ────────────────────────────────────────────────────────
  const [leftItems, setLeftItems] = useState<(MatchTile & { pairId: string; objectiveId: string; difficulty: number; matched: boolean })[]>([]);
  const [rightItems, setRightItems] = useState<(MatchTile & { pairId: string; matched: boolean })[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [isWrong, setIsWrong] = useState(false);
  const [hintTileId, setHintTileId] = useState<string | null>(null);
  const [showMicroExplanation, setShowMicroExplanation] = useState<MatchPair | null>(null);

  // ── Per-pair lifecycle refs (spec §3) ─────────────────────────────────
  const mistakesByPairRef = useRef<Record<string, number>>({});
  const awardedPairsRef = useRef<Set<string>>(new Set());
  const missedObjectivesRef = useRef<Map<string, { studentId: string }>>(new Map());
  // Slide-scoped streak for the picked responder (consecutive correct pairs,
  // across rounds; reset on a wrong match and on a new turn). Passed as the
  // 4th arg to scoreForAttempt — 3 = 1.25x, 5 = 1.5x.
  const streakRef = useRef(0);
  // Latch so the win cue plays exactly once per slide completion (our own
  // SLIDE_COMPLETE broadcast echoes back into the lastAction listener).
  const winCuedRef = useRef(false);

  // ── Build / rebuild the board ─────────────────────────────────────────
  const rebuild = useCallback(() => {
    setLeftItems(matchPairs.map((p) => ({
      ...p.left, pairId: p.id, objectiveId: p.objectiveId, difficulty: p.difficulty, matched: false,
    })));
    setRightItems(seededShuffle(
      matchPairs.map((p) => ({ ...p.right, pairId: p.id, matched: false })),
      makeRng(seedBase, state.currentTurnId ?? 'choral', 'right'),
    ));
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedCount(0);
    setIsWrong(false);
    setRoundComplete(false);
    setAllComplete(false);
    setHintTileId(null);
    setShowMicroExplanation(null);
    mistakesByPairRef.current = {};
    awardedPairsRef.current = new Set();
    winCuedRef.current = false;
  }, [matchPairs, seedBase, state.currentTurnId]);

  // Build on pair resolution + frozen sync
  useEffect(() => { if (matchPairs.length > 0) rebuild(); }, [rebuild]);

  // Reset on RESET_GAME action
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME' && matchPairs.length > 0) {
      streakRef.current = 0;
      rebuild();
    }
  }, [state.lastAction, rebuild]);

  // ── Game-lifecycle: new turn (currentTurnId change) ───────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    if (matchPairs.length > 0) rebuild();
    missedObjectivesRef.current = new Map();
    streakRef.current = 0; // fresh responder → fresh streak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Listen for remote/commander actions ───────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'SKIP_PAIR': {
        // Skip current selected pair (no penalty, no remediation push)
        if (selectedLeft) {
          const li = leftItems.find(l => l.id === selectedLeft);
          if (li) {
            setLeftItems(prev => prev.map(l => l.id === li.id ? { ...l, matched: true } : l));
            const ri = rightItems.find(r => r.pairId === li.pairId);
            if (ri) setRightItems(prev => prev.map(r => r.id === ri.id ? { ...r, matched: true } : r));
            setMatchedCount(c => c + 1);
          }
        }
        setSelectedLeft(null);
        setSelectedRight(null);
        break;
      }
      case 'REVEAL_HINT': {
        // Glow the correct right tile for the selected left tile
        if (selectedLeft) {
          const li = leftItems.find(l => l.id === selectedLeft);
          if (li) {
            const correctRight = rightItems.find(r => r.pairId === li.pairId && !r.matched);
            if (correctRight) {
              setHintTileId(correctRight.id);
              setTimeout(() => setHintTileId(null), 1500);
            }
          }
        }
        break;
      }
      case 'MARK_CORRECT': {
        // Force-correct: auto-match the first unmatched pair
        const unmatchedLeft = leftItems.find(l => !l.matched);
        if (unmatchedLeft) {
          const correctRight = rightItems.find(r => r.pairId === unmatchedLeft.pairId && !r.matched);
          if (correctRight && unmatchedLeft.pairId) {
            handleMatch(unmatchedLeft.pairId, unmatchedLeft.id, correctRight.id);
          }
        }
        break;
      }
      case 'NEXT_ROUND': {
        advanceRound();
        break;
      }
      case 'SLIDE_COMPLETE': {
        // Teacher forced end — mark all complete. Also fires for our own
        // natural-completion broadcast (optimistic lastAction echo), so this
        // is the single win-cue site: exactly one per completion. The only
        // forced:true producer is the empty-pool "Skip Round" button —
        // that one stays silent (nothing was played).
        setAllComplete(true);
        if (action.payload?.forced !== true && !winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Round advancement ─────────────────────────────────────────────────
  const pairsLenRef = useRef(matchPairs.length);
  pairsLenRef.current = matchPairs.length;

  const advanceRound = useCallback(() => {
    if (roundIndex >= TOTAL_ROUNDS) {
      setAllComplete(true);
      triggerAction('SLIDE_COMPLETE', { forced: false });
    } else {
      setRoundIndex(r => r + 1);
      setRoundComplete(false);
    }
  }, [roundIndex, TOTAL_ROUNDS, triggerAction]);

  // Auto-advance when round is complete (dead-time compression: pure
  // celebration hold, ≤900ms — the teacher can still click through faster).
  useEffect(() => {
    if (roundComplete && matchPairs.length > 0) {
      const t = setTimeout(advanceRound, 900);
      return () => clearTimeout(t);
    }
  }, [roundComplete, advanceRound, matchPairs.length]);

  // Auto-dismiss the terminal celebration after 6s so a forgotten tab never
  // leaves the board stuck behind the "All Matched!" overlay. The SLIDE_COMPLETE
  // broadcast already happened (see advanceRound), so this is purely cosmetic.
  useEffect(() => {
    if (!allComplete) return;
    const t = setTimeout(() => setAllComplete(false), 6000);
    return () => clearTimeout(t);
  }, [allComplete]);

  // ── Dual-write helper ─────────────────────────────────────────────────
  const doDualWrite = useCallback((pair: MatchPair, correctness: 'correct' | 'incorrect') => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    if (correctness === 'correct') {
      const mistakes = mistakesByPairRef.current[pair.id] ?? 0;
      // streakRef holds the streak INCLUDING this pair (the caller bumps it
      // before scoring) — 3+ = 1.25x, 5+ = 1.5x on the success award.
      const points = scoreForAttempt(mistakes, pair.difficulty, 1.0, streakRef.current);
      addPoints(picked, points);
    } else {
      addPoints(picked, -MISTAKE_PENALTY);
    }
    // FIXPLAN P3.3 — unified triple-write: previously analytics-only, so this
    // game's objectives never reached the FSRS ladder or remediation queue.
    logAttempt({
      state, picked, unitId,
      objectiveId: pair.objectiveId,
      exerciseType: pair.exerciseType,
      difficulty: pair.difficulty,
      correctness,
      modality: 'receptive',
      pushToRemediation,
    });
  }, [state.quickWheelWinner, state.activeClassId, state.students, addPoints, unitId, pushToRemediation]);

  // ── Match attempt handler ─────────────────────────────────────────────
  const handleMatch = useCallback((_pairId: string, leftId: string, rightId: string) => {
    const leftItem = leftItems.find(l => l.id === leftId);
    const rightItem = rightItems.find(r => r.id === rightId);
    if (!leftItem || !rightItem) return;

    // games-v3 audit F1 (P1): the old check compared `pairId === pair.id`
    // (a tautology — pair was FOUND by that id) and handleRightClick passed
    // the CLICKED RIGHT tile's own pairId, so any left-then-right click
    // validated the right tile against itself and always locked "correct".
    // Correctness is pair membership of BOTH tiles; the scored pair is the
    // LEFT (prompt/word) tile's pair.
    const pair = matchPairs.find(p => p.id === leftItem.pairId);
    if (!pair) return;
    const correct = leftItem.pairId === rightItem.pairId;

    if (correct) {
      if (awardedPairsRef.current.has(pair.id)) return; // duplicate guard
      awardedPairsRef.current.add(pair.id);

      // Mark tiles matched
      setLeftItems(prev => prev.map(l => l.id === leftId ? { ...l, matched: true } : l));
      setRightItems(prev => prev.map(r => r.id === rightId ? { ...r, matched: true } : r));

      streakRef.current += 1; // bumped before scoring so the award sees it
      doDualWrite(pair, 'correct');
      playCue('correct');
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }

      const newCount = matchedCount + 1;
      setMatchedCount(newCount);

      // Check round completion
      if (newCount >= pairsLenRef.current && pairsLenRef.current > 0) {
        setRoundComplete(true);
        if (roundIndex >= TOTAL_ROUNDS) {
          setAllComplete(true);
          triggerAction('SLIDE_COMPLETE', { forced: false });
        }
      }
    } else {
      // Wrong match — the previously-silent red flash now has a voice, and
      // the responder's streak resets.
      playCue('wrong');
      streakRef.current = 0;
      setIsWrong(true);
      setTimeout(() => setIsWrong(false), 800);

      const picked = state.quickWheelWinner;
      if (picked) {
        mistakesByPairRef.current[pair.id] = (mistakesByPairRef.current[pair.id] ?? 0) + 1;
        doDualWrite(pair, 'incorrect');

        // Track missed objectives for remediation queue
        if (!missedObjectivesRef.current.has(pair.objectiveId)) {
          missedObjectivesRef.current.set(pair.objectiveId, { studentId: picked });
        }

        const missCount = mistakesByPairRef.current[pair.id];
        // 1st miss: glow correct right tile (narrowed hint)
        if (missCount === 1) {
          const correctRight = rightItems.find(r => r.pairId === pair.id && !r.matched);
          if (correctRight) {
            setHintTileId(correctRight.id);
            setTimeout(() => setHintTileId(null), 1500);
          }
        }
        // 2nd miss: show micro-explanation card (the pair itself — teaching
        // hold ~3s, click-through unaffected) + the reveal cue.
        if (missCount === 2) {
          playCue('reveal');
          setShowMicroExplanation(pair);
          setTimeout(() => setShowMicroExplanation(null), 3000);
        }
      }
    }

    setSelectedLeft(null);
    setSelectedRight(null);
  }, [matchPairs, leftItems, rightItems, matchedCount, roundIndex, doDualWrite,
      state.quickWheelWinner, triggerAction]);

  // ── Tile click handlers ───────────────────────────────────────────────
  const handleLeftClick = useCallback((id: string) => {
    if (roundComplete || allComplete) return;
    const item = leftItems.find(l => l.id === id);
    if (item?.matched) return;
    setSelectedLeft(id);
    setIsWrong(false);
    // Audio tile: play + select on tap
    if (item?.kind === 'audio') playAudioUrl(item.display).catch(() => {});
    if (selectedRight) handleMatch(item!.pairId, id, selectedRight);
  }, [leftItems, selectedRight, roundComplete, allComplete, handleMatch]);

  const handleRightClick = useCallback((id: string) => {
    if (roundComplete || allComplete) return;
    const item = rightItems.find(r => r.id === id);
    if (item?.matched) return;
    setSelectedRight(id);
    setIsWrong(false);
    if (selectedLeft) handleMatch(item!.pairId, selectedLeft, id);
  }, [rightItems, selectedLeft, roundComplete, allComplete, handleMatch]);

  // ── Empty pool state (spec §7) ────────────────────────────────────────
  if (loading || (matchPairs.length === 0 && !frozenPairs.length)) {
    if (matchPairs.length === 0 && !loading) {
      return (
        <div className="fm-root h-full bg-[#070C18] flex flex-col items-center justify-center text-white text-center px-8">
          <h2 className="text-4xl font-bold text-slate-400 mb-2">Flash Match</h2>
          <p className="text-slate-500 text-xl">Content isn't ready for this round yet.</p>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Round
          </button>
        </div>
      );
    }
    return (
      <div className="fm-root h-full bg-[#070C18] flex flex-col items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-400 mb-2">Flash Match</h2>
        <p className="text-slate-500 text-xl">Loading…</p>
      </div>
    );
  }

  const pairCount = matchPairs.length;

  return (
    <div className="fm-root h-full w-full flex flex-col gap-1.5 lg:gap-2 p-2 lg:p-3.5 [@media(max-height:430px)]:gap-1 [@media(max-height:430px)]:p-1.5 bg-[#070C18] relative overflow-hidden">
      <style>{`
        .fm-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .fm-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .fm-glow-sky { box-shadow: 0 0 22px -4px rgba(56,189,248,0.55), inset 0 0 18px rgba(56,189,248,0.08); }
        .fm-glow-correct { box-shadow: 0 0 26px -4px rgba(16,185,129,0.55), inset 0 0 20px rgba(16,185,129,0.1); }
        @keyframes fm-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
        .fm-shake { animation: fm-shake 0.4s ease-in-out; }
        @keyframes fm-pulse-hint { 0%, 100% { box-shadow: 0 0 8px -2px rgba(245,158,11,0.4); } 50% { box-shadow: 0 0 26px -2px rgba(245,158,11,0.75); } }
        .fm-pulse-hint { animation: fm-pulse-hint 0.8s ease-in-out infinite; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.35s ease-out; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
      `}</style>

      {/* Header — compressed per the Stitch revision; pl-40/lg:pl-48 clears
          BoardShell's phase pill (owner's #1 complaint was the clipped 6th
          row, killed by the compact header + 2x3 grids). */}
      <header className="w-full flex items-center justify-between gap-3 pr-1 pl-40 lg:pl-48 h-11 lg:h-13 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-gradient-to-br from-[#FF2E79] to-rose-600 flex items-center justify-center font-black text-white text-xs shadow-md shrink-0">
            FM
          </div>
          <h1 className="text-lg lg:text-xl font-extrabold tracking-tight text-white truncate">Flash Match</h1>
          <span className="fm-mono px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] lg:text-xs font-bold text-slate-300 whitespace-nowrap">
            ROUND <span className="text-white">{roundIndex}/{TOTAL_ROUNDS}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="fm-mono px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[10px] lg:text-xs uppercase text-slate-400">Matched</span>
            <span className="text-[10px] lg:text-xs font-bold text-amber-300 px-1.5 py-px rounded bg-amber-400/15 border border-amber-400/30">
              {matchedCount}/{pairCount}
            </span>
          </span>
          <button onClick={() => triggerAction('RESET_GAME')} title="Re-deal this round"
            className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <RefreshCcw size={14} />
          </button>
        </div>
      </header>

      {/* Instruction banner */}
      <div className="w-full shrink-0 py-1.5 px-3.5 rounded-xl bg-[#0B132B]/90 border border-slate-800 flex items-center justify-between gap-3">
        <p className="text-xs lg:text-sm text-slate-300 truncate">
          <span className="text-white font-bold">{matchedCount === 0 ? 'Fresh deal!' : 'Keep going!'}</span> Tap a word, then tap its matching photo.
        </p>
        <span className="fm-mono text-[9px] lg:text-[10px] text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          {pairCount} pairs hidden
        </span>
      </div>

      {/* Matching arena: two balanced columns, each a 2-col grid (3 rows for a
          6-pair deal — nothing clips, per the Stitch revision). */}
      <main className={`w-full flex-1 min-h-0 grid gap-3 lg:gap-5 items-stretch ${pairCount > 4 ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {/* Column A — word tablets */}
        <section className="h-full min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-1 px-1 shrink-0">
            <span className="fm-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
              Column A <span className="text-slate-500 normal-case">· words</span>
            </span>
            <span className="fm-mono text-[9px] lg:text-[10px] text-slate-500 uppercase hidden sm:block">Tap word first</span>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 lg:gap-3.5">
            {leftItems.map((item, i) => (
              <button key={item.id} onClick={() => handleLeftClick(item.id)} disabled={item.matched}
                className={`relative rounded-xl border-2 px-2.5 lg:px-3.5 flex flex-col justify-center min-h-0 transition-all duration-200
                  ${item.matched ? 'border-emerald-500/40 bg-emerald-950/30 opacity-45'
                    : selectedLeft === item.id ? 'border-[#38BDF8] bg-[#38BDF8]/10 fm-glow-sky'
                    : 'border-slate-700 bg-[#111C3D] hover:border-[#38BDF8]/70'}`}>
                <span className="fm-mono absolute top-1 left-1.5 text-[8px] lg:text-[9px] font-bold px-1.5 py-px rounded bg-slate-800/90 text-slate-500 border border-slate-700/60">
                  W{i + 1}
                </span>
                {item.kind === 'audio' ? (
                  <span className="flex items-center gap-2 py-1.5">
                    <Volume2 size={16} className="text-[#7DD3FC] shrink-0" />
                    <span className="text-xs lg:text-sm font-bold text-[#7DD3FC]">Tap to hear</span>
                  </span>
                ) : (
                  <span className={`font-extrabold tracking-wide truncate text-center ${pairCount > 4 ? 'text-base lg:text-xl' : 'text-xl lg:text-2xl'}
                    ${item.matched ? 'text-emerald-400' : selectedLeft === item.id ? 'text-[#7DD3FC]' : 'text-white'}`}>
                    {item.display}
                  </span>
                )}
                {item.matched && <Check size={14} className="absolute top-1.5 right-1.5 text-emerald-400" strokeWidth={4} />}
              </button>
            ))}
          </div>
        </section>

        {/* Column B — photo tiles (landscape) */}
        <section className="h-full min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-1 px-1 shrink-0">
            <span className="fm-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#FF2E79]">
              Column B <span className="text-slate-500 normal-case">· photos</span>
            </span>
            <span className="fm-mono text-[9px] lg:text-[10px] text-slate-500 uppercase hidden sm:block">Match the word</span>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 lg:gap-3.5">
            {rightItems.map((item) => {
              const isHint = hintTileId === item.id;
              return (
                <button key={item.id} onClick={() => handleRightClick(item.id)} disabled={item.matched}
                  className={`relative rounded-xl border-2 overflow-hidden min-h-0 transition-all duration-200
                    ${item.matched ? 'border-emerald-500/40 opacity-45'
                      : selectedRight === item.id ? 'border-[#FF2E79] fm-glow-sky'
                      : isHint ? 'border-amber-400 fm-pulse-hint'
                      : isWrong ? 'border-rose-400 fm-shake'
                      : 'border-slate-700 bg-[#111C3D] hover:border-[#FF2E79]/70'}`}>
                  {item.kind === 'image' && String(item.display).startsWith('http') ? (
                    <img src={item.display} alt="" className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15'; }} />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-bold text-slate-300 text-base lg:text-xl px-2 text-center">
                      {item.display}
                    </span>
                  )}
                  {item.matched && (
                    <span className="absolute inset-0 bg-emerald-950/60 flex items-center justify-center">
                      <Check size={22} className="text-emerald-400" strokeWidth={4} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* Micro-explanation overlay (2nd miss feedback) */}
      {showMicroExplanation && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="bg-[#111C3D] border-2 border-amber-400/60 p-6 lg:p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-fade-in max-w-md">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={20} className="text-amber-400" />
              <span className="fm-mono text-[10px] font-bold tracking-widest uppercase text-amber-300">Remember this pair</span>
            </div>
            <p className="fm-mono text-2xl lg:text-3xl font-extrabold text-white">{showMicroExplanation.left.display}</p>
            <p className="text-lg text-slate-400 mt-1">= {showMicroExplanation.right.display}</p>
          </div>
        </div>
      )}

      {/* Round Complete Overlay — click to advance immediately */}
      {roundComplete && !allComplete && (
        <div
          onClick={advanceRound}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 cursor-pointer">
          <div className="bg-[#111C3D] border-2 border-emerald-400/60 p-8 lg:p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <Check size={52} className="text-emerald-400 mb-3" strokeWidth={4} />
            <h2 className="text-2xl lg:text-3xl font-black text-white">Round {roundIndex} Complete!</h2>
            <p className="text-base text-slate-400 mt-1">Next round loading…</p>
          </div>
        </div>
      )}

      {/* All Complete Overlay — click to dismiss (scoring already fired before this showed) */}
      {allComplete && (
        <div
          onClick={() => setAllComplete(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-[#111C3D] border-2 border-[#FF2E79]/60 p-8 lg:p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-24 h-24 bg-[#FF2E79]/15 text-[#FF2E79] rounded-full flex items-center justify-center mb-5">
              <Check size={56} strokeWidth={4} />
            </div>
            <h2 className="text-3xl lg:text-5xl font-black text-white mb-2">
              {pickedStudent ? `${pickedStudent.name} nailed it!` : 'All Matched!'}
            </h2>
            <p className="text-lg lg:text-2xl text-slate-400">Great job connecting the pairs!</p>
            <p className="text-xs text-slate-500 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardFlashMatch;