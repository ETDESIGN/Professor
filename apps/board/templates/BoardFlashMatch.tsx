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
import { useSession } from '../../../store/SessionContext';
import { scoreForAttempt, MISTAKE_PENALTY, type Difficulty } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useEscalatingPool } from '../useEscalatingPool';
import { recordAttempt } from '../../../services/attemptsLog';
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
  const { state, triggerAction, addPoints, triggerConfetti } = useSession();
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
    setRightItems(matchPairs.map((p) => ({ ...p.right, pairId: p.id, matched: false }))
      .sort(() => Math.random() - 0.5));
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
  }, [matchPairs]);

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
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (correctness === 'correct') {
      const mistakes = mistakesByPairRef.current[pair.id] ?? 0;
      // streakRef holds the streak INCLUDING this pair (the caller bumps it
      // before scoring) — 3+ = 1.25x, 5+ = 1.5x on the success award.
      const points = scoreForAttempt(mistakes, pair.difficulty, 1.0, streakRef.current);
      addPoints(picked, points);
    } else {
      addPoints(picked, -MISTAKE_PENALTY);
    }
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId: pair.objectiveId,
      exerciseType: pair.exerciseType,
      difficulty: pair.difficulty,
    }).catch(() => {});
  }, [state.quickWheelWinner, state.activeClassId, state.students, addPoints]);

  // ── Match attempt handler ─────────────────────────────────────────────
  const handleMatch = useCallback((pairId: string, leftId: string, rightId: string) => {
    const pair = matchPairs.find(p => p.id === pairId);
    const leftItem = leftItems.find(l => l.id === leftId);
    const rightItem = rightItems.find(r => r.id === rightId);
    if (!pair || !leftItem || !rightItem) return;

    const correct = pairId === pair.id && rightItem.pairId === pair.id;

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
        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
          <h2 className="text-4xl font-bold text-slate-500 mb-2">Flash Match</h2>
          <p className="text-slate-600 text-xl">Content isn't ready for this round yet.</p>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Round
          </button>
        </div>
      );
    }
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-500 mb-2">Flash Match</h2>
        <p className="text-slate-600 text-xl">Loading…</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 flex flex-col p-8 font-display">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="bg-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/10">
          <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center text-white text-2xl font-bold">⚡</div>
          <div>
            <h1 className="text-2xl font-bold text-white">Flash Match</h1>
            <p className="text-slate-400 text-sm">Round {roundIndex}/{TOTAL_ROUNDS} — Match word pairs</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 text-white font-bold text-lg">
            {matchedCount} / {matchPairs.length}
          </div>
          <button onClick={() => triggerAction('RESET_GAME')}
            className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white">
            <RefreshCcw />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 bg-slate-800 rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${(matchedCount / Math.max(1, matchPairs.length)) * 100}%` }} />
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center gap-12 max-w-6xl mx-auto w-full">
        {/* Left Column — Prompts */}
        <div className="flex flex-col gap-4 w-[45%]">
          {leftItems.map((item) => (
            <button key={item.id} onClick={() => handleLeftClick(item.id)} disabled={item.matched}
              className={`text-left px-6 py-4 rounded-2xl text-xl font-bold transition-all duration-300 border-2 flex items-center gap-3
                ${item.matched ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 opacity-50'
                  : selectedLeft === item.id ? 'bg-blue-600 border-blue-400 text-white scale-105 shadow-lg shadow-blue-500/30'
                  : isWrong ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-800 border-slate-600 text-white hover:border-blue-400'}`}>
              {item.kind === 'audio' ? (
                <><Volume2 size={24} className="text-blue-300 shrink-0" /><span className="text-sm text-blue-300">Tap to hear</span></>
              ) : (
                <span>{item.display}</span>
              )}
            </button>
          ))}
        </div>

        {/* Center Connector */}
        <div className="flex flex-col items-center gap-4 text-slate-600">
          {matchPairs.map((_, i) => (
            <div key={i} className="w-8 h-14 flex items-center justify-center">
              {i < matchedCount ? '✓' : '→'}
            </div>
          ))}
        </div>

        {/* Right Column — Answers (text + image tiles) */}
        <div className="flex flex-col gap-4 w-[45%]">
          {rightItems.map((item) => {
            const isHint = hintTileId === item.id;
            return (
              <button key={item.id} onClick={() => handleRightClick(item.id)} disabled={item.matched}
                className={`text-left px-6 py-4 rounded-2xl text-lg font-medium transition-all duration-300 border-2 flex items-center gap-3
                  ${item.matched ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 opacity-50'
                    : selectedRight === item.id ? 'bg-purple-600 border-purple-400 text-white scale-105 shadow-lg shadow-purple-500/30'
                    : isHint ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200 animate-pulse shadow-lg shadow-yellow-500/30'
                    : isWrong ? 'bg-slate-800 border-red-500 text-white animate-shake'
                    : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-purple-400'}`}>
                {item.kind === 'image' ? (
                  <img src={item.display} alt="" className="w-16 h-16 object-contain drop-shadow-lg" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                ) : (
                  <span>{item.display}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Micro-explanation overlay (2nd miss feedback) */}
      {showMicroExplanation && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-fade-in max-w-md">
            <Lightbulb size={40} className="text-amber-500 mb-3" />
            <p className="text-2xl font-bold text-slate-800">{showMicroExplanation.left.display}</p>
            <p className="text-xl text-slate-500 mt-1">= {showMicroExplanation.right.display}</p>
          </div>
        </div>
      )}

      {/* Round Complete Overlay — click to advance immediately */}
      {roundComplete && !allComplete && (
        <div
          onClick={advanceRound}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 cursor-pointer">
          <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <Check size={56} className="text-emerald-500 mb-3" strokeWidth={4} />
            <h2 className="text-3xl font-black text-slate-800">Round {roundIndex} Complete!</h2>
            <p className="text-lg text-slate-500 mt-1">Next round loading…</p>
          </div>
        </div>
      )}

      {/* All Complete Overlay — click to dismiss (scoring already fired before this showed) */}
      {allComplete && (
        <div
          onClick={() => setAllComplete(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-purple-100 text-purple-500 rounded-full flex items-center justify-center mb-6">
              <Check size={64} strokeWidth={4} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {pickedStudent ? `${pickedStudent.name} nailed it!` : 'All Matched!'}
            </h2>
            <p className="text-2xl text-slate-500 font-medium">Great job connecting the pairs!</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardFlashMatch;
