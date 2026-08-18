// BoardGrammarForge — the grammar PRACTICE/OUTPUT game (grammar-strand spec §2 /
// architecture §5.2). Replaces BoardGrammarPractice.
//
// The flagship H1 fix: the FIRST real grammar game where the student produces/
// transforms, not a teacher-operated reveal-and-credit screen.
//
// Three escalating rungs:
//   • Rung 2 — Recognize (ERROR_SPOT MCQ, difficulty 1–2): pool-driven via
//     useEscalatingPool. Teacher relays the class's oral pick. Binary scoring.
//   • Rung 3 — Apply (TRANSFORM, difficulty 2): the pool item is an MCQ; per
//     the spec's "path b" resolution, take the correct option's text and split
//     IT into tiles for assembly, with prompt_sentence as the reference line.
//     Reuses computeLCSPartialCredit / detectSwappedPair from BoardUnscramble.
//   • Rung 4 — Produce (difficulty 3): reads grammar_rules DIRECTLY (the
//     reserved held-out transformation_pair, NOT the pool). Teacher 3-way
//     rating (correct/partial/incorrect → ratio 1.0/0.6/0). Choral/picked
//     toggle (decision 4): choral = no score, no FSRS write.
//
// Hybrid shell: rungs 2–3 go through useEscalatingPool; rung 4 reads
// grammar_rules directly (like StorySequencing's manifest-driven round 1).
// SHELL_CAPABILITIES.GRAMMAR_PRACTICE = { consumes: ['ERROR_SPOT','TRANSFORM'],
// rungRange: [2,3] } — rung 4 is deliberately outside the declaration.
//
// Lifecycle contract (4 must-dos): reset on currentTurnId, mistakes/awarded
// refs, scoreForAttempt + addPoints + recordAttempt, usePickedStudent.
// Dual-write: addPoints for leaderboard + recordAttempt for analytics.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, RotateCcw, Sparkles, UserCheck, Zap } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { usePickedStudent } from './usePickedStudent';
import { scoreForAttempt, MISTAKE_PENALTY, type Difficulty } from './scoringDefaults';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { getGrammar, type CanonicalGrammar } from '../../../services/manifest';
import {
  computeLCSPartialCredit,
  detectSwappedPair,
  highlightFirstWrongPosition,
  UNSCRAMBLE_PASS_THRESHOLD,
} from './BoardUnscramble';

// ── Types ─────────────────────────────────────────────────────────────

type ForgePhase = 'error_spot' | 'transform' | 'produce' | 'complete';

interface ErrorSpotRound {
  kind: 'ERROR_SPOT';
  item: any; // PoolItem<ErrorSpotContent>
  sentence: string;          // = content.sentence (the wrong sentence)
  options: string[];         // = content.options
  correctIndex: number;      // = content.correct_index
  explanation?: string;
  difficulty: Difficulty;
}

interface TransformRound {
  kind: 'TRANSFORM';
  item: any; // PoolItem<TransformContent>
  promptSentence: string;    // = content.prompt_sentence (the reference line)
  instruction: string;       // = content.instruction (the rule name)
  targetTiles: string[];     // correct option's text, split into tiles
  trayTiles: { id: string; text: string }[]; // shuffled target tiles
  difficulty: Difficulty;
}

interface ProduceRound {
  kind: 'PRODUCE';
  rule: CanonicalGrammar;
  objectiveId: string;
  patternTemplate?: string;
  promptOriginal: string;        // the reserved pair's original
  targetTransformed: string;     // the reserved pair's transformed (for reveal)
  scoringMode: 'choral' | 'picked';
}

type Round = ErrorSpotRound | TransformRound | ProduceRound;

const ROUNDS_BY_RUNG = { error_spot: 2, transform: 2, produce: 1 } as const;

// ── Component ─────────────────────────────────────────────────────────

const BoardGrammarForge: React.FC<{ data?: any }> = ({ data }) => {
  const { state, addPoints, pushToRemediation, triggerAction } = useSession();
  // FIXPLAN E1.5 — seeded tile order (identical on every tab).
  const seedBase = useSeedBase();
  const unitId = state.activeUnit?.id || '';
  const pickedStudent = usePickedStudent();
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // The grammar rules for this unit (for rung 4's direct read + objective lookup).
  const grammarRules = useMemo<CanonicalGrammar[]>(() => {
    return state.activeUnit?.manifest ? getGrammar(state.activeUnit.manifest) : [];
  }, [state.activeUnit?.manifest]);

  // ── Rung 2 + 3: pool-driven content via useEscalatingPool ────────────
  // GRAMMAR_PRACTICE capability: { consumes: ['ERROR_SPOT','TRANSFORM'], rungRange: [2,3] }
  const { items: poolItems, loading: poolLoading } = useEscalatingPool({
    unitId,
    shellType: 'GRAMMAR_PRACTICE',
    phase: 'PRACTICE',
    roster,
    roundIndex: 1,
    totalRounds: ROUNDS_BY_RUNG.error_spot + ROUNDS_BY_RUNG.transform,
    roundSize: ROUNDS_BY_RUNG.error_spot + ROUNDS_BY_RUNG.transform,
  });

  // Split pool items into ERROR_SPOT + TRANSFORM rounds.
  const errorSpotItems = useMemo(() => poolItems.filter((it) => it.exercise_type === 'ERROR_SPOT'), [poolItems]);
  const transformItems = useMemo(() => poolItems.filter((it) => it.exercise_type === 'TRANSFORM'), [poolItems]);

  // ── Build the full round list (rung 2 + rung 3 + rung 4 if eligible) ──
  const rounds = useMemo<Round[]>(() => {
    const out: Round[] = [];

    // Rung 2 — ERROR_SPOT (up to 2 rounds)
    errorSpotItems.slice(0, ROUNDS_BY_RUNG.error_spot).forEach((item) => {
      const c = item.content as any;
      if (typeof c?.correct_index !== 'number' || !Array.isArray(c?.options)) return;
      out.push({
        kind: 'ERROR_SPOT',
        item,
        sentence: String(c.sentence ?? ''),
        options: c.options as string[],
        correctIndex: c.correct_index,
        explanation: c.explanation,
        difficulty: (item.difficulty >= 1 && item.difficulty <= 3 ? item.difficulty : 2) as Difficulty,
      });
    });

    // Rung 3 — TRANSFORM (up to 2 rounds, path b)
    transformItems.slice(0, ROUNDS_BY_RUNG.transform).forEach((item) => {
      const c = item.content as any;
      if (typeof c?.correct_index !== 'number' || !Array.isArray(c?.options)) return;
      const correctText = String(c.options[c.correct_index] ?? '');
      if (!correctText) return;
      const targetTiles = correctText.split(/\s+/).filter(Boolean);
      const shuffled = seededShuffle(targetTiles, makeRng(seedBase, item.id, 'transform'));
      out.push({
        kind: 'TRANSFORM',
        item,
        promptSentence: String(c.prompt_sentence ?? ''),
        instruction: String(c.instruction ?? ''),
        targetTiles,
        trayTiles: shuffled.map((text, i) => ({ id: `tile-${item.id}-${i}`, text })),
        difficulty: (item.difficulty >= 1 && item.difficulty <= 3 ? item.difficulty : 2) as Difficulty,
      });
    });

    // Rung 4 — PRODUCE (1 round, only if rules have ≥3 transformation_pairs)
    // Uses the SAME "last index reserved" convention as the deployed
    // buildGrammarItems: pairs[pairs.length - 1] is the held-out pair.
    const rule = grammarRules[0]; // the rule this slide covers
    if (rule && Array.isArray(rule.transformation_pairs) && rule.transformation_pairs.length >= 3) {
      const reserved = rule.transformation_pairs[rule.transformation_pairs.length - 1] as any;
      const objectiveId = data?.objectiveId || data?.grammarRuleId || '';
      out.push({
        kind: 'PRODUCE',
        rule,
        objectiveId,
        patternTemplate: rule.pattern_template,
        promptOriginal: String(reserved?.original ?? ''),
        targetTransformed: String(reserved?.transformed ?? ''),
        scoringMode: 'picked', // default; teacher can toggle to choral
      });
    }

    return out;
  }, [errorSpotItems, transformItems, grammarRules, data, seedBase]);

  // ── Game state ──────────────────────────────────────────────────────
  const [roundIndex, setRoundIndex] = useState(0);
  const round = rounds[roundIndex];

  // Lifecycle refs (4 must-dos).
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  // Per-turn tile state for TRANSFORM rounds.
  const [placed, setPlaced] = useState<{ id: string; text: string }[]>([]);
  const [tray, setTray] = useState<{ id: string; text: string }[]>([]);
  // Reveal / outcome state.
  const [revealed, setRevealed] = useState(false);            // ERROR_SPOT: answer revealed
  const [outcome, setOutcome] = useState<null | 'correct' | 'partial' | 'incorrect'>(null);
  const [produceRevealed, setProduceRevealed] = useState(false); // PRODUCE: model answer shown
  const [lastRatio, setLastRatio] = useState<number | null>(null);
  const [swapHint, setSwapHint] = useState<[number, number] | null>(null);
  const [wrongIdx, setWrongIdx] = useState(-1);
  const [scoringMode, setScoringMode] = useState<'choral' | 'picked'>('picked');
  // Transient "already scored this turn" chip — shown when awardedRef blocks a
  // re-pay (teacher double-taps, or a remote MARK_CORRECT fires after a resolve).
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);

  // Reset on new turn (must-do #1) — clears mistakes/awarded, re-initializes the round.
  const turnId = state.currentTurnId;
  useEffect(() => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    setRevealed(false);
    setOutcome(null);
    setProduceRevealed(false);
    setLastRatio(null);
    setPlaced([]);
    setTray(round?.kind === 'TRANSFORM' ? round.trayTiles : []);
    setSwapHint(null);
    setWrongIdx(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, roundIndex]);

  // ── Scoring helpers ─────────────────────────────────────────────────
  const doScoring = useCallback((result: 'correct' | 'partial' | 'incorrect', points: number, r: Round, ratio: number) => {
    if (!pickedStudent) return;
    const objectiveId = r.kind === 'PRODUCE' ? r.objectiveId : (r as any).item.objective_id;
    const exerciseType = r.kind === 'ERROR_SPOT' ? 'ERROR_SPOT' : r.kind === 'TRANSFORM' ? 'TRANSFORM' : 'TRANSFORM';
    const difficulty = r.kind === 'PRODUCE' ? 3 : (r as any).difficulty;
    addPoints(pickedStudent.id, points);
    recordAttempt({
      rosterId: pickedStudent.id,
      classId: state.activeClassId,
      profileId: (state.students.find((s: any) => s.id === pickedStudent.id) as any)?.claimed_profile_id,
      correctness: result,
      objectiveId,
      exerciseType,
      difficulty,
    }).catch(() => {});
    // FSRS cognitive write (claimed students only).
    if (objectiveId && unitId) {
      gradeObjective(pickedStudent.id, unitId, objectiveId, result === 'correct', r.kind === 'PRODUCE' ? 'productive' : 'receptive').catch(() => {});
    }
    setLastRatio(ratio);
    if (result === 'incorrect' || result === 'partial') {
      pushToRemediation(objectiveId, pickedStudent.id);
    }
  }, [pickedStudent, state.activeClassId, state.students, unitId, addPoints, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    // Surface the "🔁 already scored this turn" chip when awardedRef blocks a
    // re-pay (teacher double-taps an answer, or a remote MARK_CORRECT fires after
    // the round already resolved). Auto-dismisses after 1.5s (matches Unscramble).
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── ERROR_SPOT: MCQ answer ──────────────────────────────────────────
  const onErrorSpotAnswer = useCallback((chosenIndex: number) => {
    if (awardedRef.current) { showAlreadyScored(); return; }
    if (!round || round.kind !== 'ERROR_SPOT') return;
    const correct = chosenIndex === round.correctIndex;
    setRevealed(true);
    if (correct) {
      awardedRef.current = true;
      setOutcome('correct');
      const points = scoreForAttempt(mistakesRef.current, round.difficulty, 1.0);
      doScoring('correct', points, round, 1.0);
    } else {
      mistakesRef.current += 1;
      setOutcome('incorrect');
      // Write the wrong attempt to BOTH ledgers (analytics + FSRS), matching the
      // dual-write contract other games honor (Unscramble's doScoring('incorrect')).
      // Previously this branch called only addPoints — so grammar analytics were
      // artificially strong (only correct/partial attempts were recorded) and
      // FSRS never saw the miss (audit G1, 2026-08-06). awardedRef stays false so
      // the student can retry; mistakesRef has already counted the miss for the
      // eventual success's scoreForAttempt(mistakes, ...).
      doScoring('incorrect', -MISTAKE_PENALTY, round, 0);
      // 1st miss: narrowed hint (eliminate one wrong distractor visually) — handled by reveal coloring.
      // End-of-turn push to remediation happens only if the round never resolves correct (see advanceRound).
    }
  }, [round, awardedRef, mistakesRef, pickedStudent, doScoring, showAlreadyScored]);

  // ── TRANSFORM: tile assembly + check ────────────────────────────────
  const onTileTap = useCallback((tileId: string) => {
    if (awardedRef.current || outcome) return;
    setSwapHint(null); setWrongIdx(-1);
    setTray((prev) => {
      const tile = prev.find((t) => t.id === tileId);
      if (!tile) return prev;
      setPlaced((p) => [...p, tile]);
      return prev.filter((t) => t.id !== tileId);
    });
  }, [awardedRef, outcome]);

  const onPlacedTap = useCallback((tileId: string) => {
    if (awardedRef.current || outcome) return;
    setPlaced((prev) => {
      const tile = prev.find((t) => t.id === tileId);
      if (!tile) return prev;
      setTray((t) => [...t, tile]);
      return prev.filter((t) => t.id !== tileId);
    });
  }, [awardedRef, outcome]);

  const checkTransform = useCallback(() => {
    if (awardedRef.current || !round || round.kind !== 'TRANSFORM') return;
    const placedTexts = placed.map((t) => t.text);
    if (placedTexts.length < round.targetTiles.length) return; // not all tiles placed
    const ratio = computeLCSPartialCredit(placedTexts, round.targetTiles);
    if (ratio >= UNSCRAMBLE_PASS_THRESHOLD) {
      awardedRef.current = true;
      const result = ratio === 1 ? 'correct' : 'partial';
      setOutcome(result);
      const points = scoreForAttempt(mistakesRef.current, round.difficulty, ratio);
      doScoring(result, points, round, ratio);
    } else {
      mistakesRef.current += 1;
      setOutcome('incorrect');
      // Same dual-write fix as onErrorSpotAnswer's wrong branch (audit G1):
      // route through doScoring so analytics + FSRS see the miss, not just addPoints.
      doScoring('incorrect', -MISTAKE_PENALTY, round, 0);
      const swap = detectSwappedPair(placedTexts, round.targetTiles);
      if (swap) setSwapHint(swap); else setWrongIdx(highlightFirstWrongPosition(placedTexts, round.targetTiles));
    }
  }, [awardedRef, round, placed, mistakesRef, pickedStudent, doScoring]);

  // ── PRODUCE: teacher 3-way rating ───────────────────────────────────
  const onProduceRating = useCallback((rating: 'correct' | 'partial' | 'incorrect') => {
    if (awardedRef.current || !round || round.kind !== 'PRODUCE') return;
    setProduceRevealed(true); // always reveal the model answer
    if (round.scoringMode === 'choral' || scoringMode === 'choral') {
      // Choral: no score, no FSRS write — engagement only.
      setOutcome(rating);
      return;
    }
    awardedRef.current = true;
    const ratio = rating === 'correct' ? 1.0 : rating === 'partial' ? 0.6 : 0;
    setOutcome(rating);
    // Difficulty 3 override (no pool item to read difficulty from).
    const points = scoreForAttempt(mistakesRef.current, 3, ratio);
    doScoring(rating, points, round, ratio);
  }, [awardedRef, round, scoringMode, mistakesRef, doScoring]);

  // ── Advance round ───────────────────────────────────────────────────
  const advanceRound = useCallback(() => {
    // If the current ERROR_SPOT round was never resolved correct, push to remediation.
    if (round && round.kind === 'ERROR_SPOT' && !awardedRef.current && pickedStudent && round.item.objective_id) {
      pushToRemediation(round.item.objective_id, pickedStudent.id);
    }
    if (roundIndex < rounds.length - 1) {
      setRoundIndex(roundIndex + 1);
    } else {
      triggerAction('SLIDE_COMPLETE', { forced: false });
    }
  }, [round, roundIndex, rounds.length, pickedStudent, pushToRemediation, triggerAction]);

  // ── Remote/commander action listener ────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    switch (a.type) {
      case 'REVEAL_ANSWER':
      case 'REVEAL':
        if (round?.kind === 'ERROR_SPOT') setRevealed(true);
        else if (round?.kind === 'TRANSFORM') checkTransform();
        else if (round?.kind === 'PRODUCE') setProduceRevealed(true);
        break;
      case 'CHECK_ANSWER': checkTransform(); break;
      case 'MARK_CORRECT':
        // Force-correct: teacher override for defensible oral answers.
        if (awardedRef.current) { showAlreadyScored(); return; }
        if (!round) return;
        awardedRef.current = true;
        setOutcome('correct');
        const points = scoreForAttempt(mistakesRef.current, round.kind === 'PRODUCE' ? 3 : (round as any).difficulty, 1.0);
        doScoring('correct', points, round, 1.0);
        if (round.kind === 'PRODUCE') setProduceRevealed(true);
        break;
      case 'RATE_CORRECT': onProduceRating('correct'); break;
      case 'RATE_PARTIAL': onProduceRating('partial'); break;
      case 'RATE_INCORRECT': onProduceRating('incorrect'); break;
      case 'TOGGLE_SCORING_MODE': setScoringMode((m) => m === 'choral' ? 'picked' : 'choral'); break;
      case 'NEXT':
      case 'NEXT_ROUND':
        if (round?.kind === 'ERROR_SPOT' && !revealed) setRevealed(true);
        else advanceRound();
        break;
      case 'SKIP_ROUND': advanceRound(); break;
      case 'RESET_GAME':
        setRoundIndex(0);
        mistakesRef.current = 0;
        awardedRef.current = false;
        setRevealed(false); setOutcome(null); setProduceRevealed(false);
        setPlaced([]); setTray(round?.kind === 'TRANSFORM' ? round.trayTiles : []);
        break;
      default: break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Empty-state ─────────────────────────────────────────────────────
  if (!poolLoading && rounds.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-12 text-center">
        <BookOpen size={64} className="text-slate-300 mb-4" />
        <h2 className="text-4xl font-bold text-slate-400 mb-2">Grammar Practice</h2>
        <p className="text-slate-400 text-xl">No grammar exercises available. Generate the exercise pool for this unit to unlock error-spotting, transformation, and free-production drills.</p>
      </div>
    );
  }

  if (poolLoading || !round) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 text-slate-400 font-mono text-2xl">
        Loading grammar practice…
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  const phaseLabel = round.kind === 'ERROR_SPOT' ? 'Spot the Error' : round.kind === 'TRANSFORM' ? 'Transform the Sentence' : 'Produce Freely';
  const phaseColor = round.kind === 'ERROR_SPOT' ? 'rose' : round.kind === 'TRANSFORM' ? 'indigo' : 'purple';

  return (
    <div className={`h-full w-full bg-gradient-to-br ${phaseColor === 'rose' ? 'from-rose-50 to-pink-50' : phaseColor === 'indigo' ? 'from-indigo-50 to-purple-50' : 'from-purple-50 to-fuchsia-50'} flex flex-col p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 ${phaseColor === 'rose' ? 'bg-rose-500' : phaseColor === 'indigo' ? 'bg-indigo-500' : 'bg-purple-500'} rounded-2xl flex items-center justify-center`}>
            <Zap size={28} className="text-white" />
          </div>
          <div>
            <div className={`text-${phaseColor}-500 font-bold uppercase tracking-widest text-sm`}>Grammar Forge · Rung {round.kind === 'ERROR_SPOT' ? 2 : round.kind === 'TRANSFORM' ? 3 : 4}</div>
            <div className="text-slate-800 font-bold text-2xl">{phaseLabel}</div>
          </div>
        </div>
        <div className="text-slate-400 font-mono text-xl">{roundIndex + 1} / {rounds.length}</div>
      </div>

      {/* Round content */}
      {round.kind === 'ERROR_SPOT' && (
        <ErrorSpotView round={round} revealed={revealed} outcome={outcome} onAnswer={onErrorSpotAnswer} />
      )}
      {round.kind === 'TRANSFORM' && (
        <TransformView
          round={round} placed={placed} tray={tray} outcome={outcome}
          onTileTap={onTileTap} onPlacedTap={onPlacedTap} onCheck={checkTransform}
          swapHint={swapHint} wrongIdx={wrongIdx}
        />
      )}
      {round.kind === 'PRODUCE' && (
        <ProduceView
          round={round} scoringMode={scoringMode} outcome={outcome} produceRevealed={produceRevealed}
          onRate={onProduceRating}
        />
      )}

      {/* Already-scored chip — shown briefly when awardedRef blocks a re-pay */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 text-white px-5 py-2 rounded-full font-bold animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-end gap-4 mt-6">
        {round.kind === 'TRANSFORM' && !outcome && (
          <button
            onClick={checkTransform}
            disabled={placed.length < round.targetTiles.length}
            className="bg-indigo-500 text-white font-bold text-xl px-8 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-2"
          >
            Check Answer
          </button>
        )}
        {round.kind === 'PRODUCE' && !outcome && !produceRevealed && (
          <>
            <button
              onClick={() => setScoringMode((m) => m === 'choral' ? 'picked' : 'choral')}
              className="px-5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
            >
              Mode: {scoringMode === 'choral' ? '👥 Choral' : '🎯 Picked Student'}
            </button>
            <span className="text-slate-400 text-sm mr-2">Rate the student's production:</span>
            <button onClick={() => onProduceRating('incorrect')} className="px-5 py-3 rounded-xl bg-rose-100 text-rose-700 font-bold hover:bg-rose-200">✗ Incorrect</button>
            <button onClick={() => onProduceRating('partial')} className="px-5 py-3 rounded-xl bg-amber-100 text-amber-700 font-bold hover:bg-amber-200">~ Partial</button>
            <button onClick={() => onProduceRating('correct')} className="px-5 py-3 rounded-xl bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200">✓ Correct</button>
          </>
        )}
        {outcome && (
          <button
            onClick={advanceRound}
            disabled={roundIndex >= rounds.length - 1 && round.kind !== 'PRODUCE'}
            className="bg-indigo-500 text-white font-bold text-2xl px-10 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center gap-2"
          >
            {roundIndex >= rounds.length - 1 ? 'Done' : 'Next'} <ArrowRight size={26} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Rung 2 view: ERROR_SPOT MCQ ───────────────────────────────────────
const ErrorSpotView: React.FC<{
  round: ErrorSpotRound; revealed: boolean; outcome: string | null; onAnswer: (i: number) => void;
}> = ({ round, revealed, outcome, onAnswer }) => (
  <>
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 mb-6">
      <div className="text-rose-400 font-bold text-lg mb-2">Find the mistake in this sentence:</div>
      <p className="text-slate-800 text-4xl font-bold leading-snug">{round.sentence}</p>
    </div>
    <div className="grid grid-cols-2 gap-5 flex-1 content-start">
      {round.options.map((opt, i) => {
        const isCorrect = i === round.correctIndex;
        const state = revealed ? (isCorrect ? 'correct' : outcome === 'incorrect' ? 'wrong' : 'dim') : 'idle';
        return (
          <button
            key={i}
            onClick={() => !revealed && onAnswer(i)}
            disabled={revealed}
            className={`rounded-3xl p-6 border-4 text-2xl font-bold transition-all text-left ${
              state === 'correct' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' :
              state === 'wrong' ? 'bg-rose-100 border-rose-400 text-rose-800' :
              state === 'dim' ? 'bg-slate-50 border-slate-200 text-slate-400' :
              'bg-white border-slate-200 text-slate-800 hover:border-indigo-300'
            }`}
          >
            <span className="flex items-center justify-between">
              <span>{opt}</span>
              {state === 'correct' && <Check size={28} className="text-emerald-600" strokeWidth={4} />}
            </span>
          </button>
        );
      })}
    </div>
    {revealed && round.explanation && (
      <div className="mt-4 bg-indigo-50 rounded-2xl p-4 text-indigo-700 text-lg">
        <strong>Why:</strong> {round.explanation}
      </div>
    )}
  </>
);

// ── Rung 3 view: TRANSFORM tile assembly (path b) ─────────────────────
const TransformView: React.FC<{
  round: TransformRound;
  placed: { id: string; text: string }[];
  tray: { id: string; text: string }[];
  outcome: string | null;
  onTileTap: (id: string) => void;
  onPlacedTap: (id: string) => void;
  onCheck: () => void;
  swapHint: [number, number] | null;
  wrongIdx: number;
}> = ({ round, placed, tray, outcome, onTileTap, onPlacedTap, swapHint, wrongIdx }) => (
  <>
    {/* Reference line (the original sentence to transform) */}
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5 mb-6">
      <div className="text-indigo-400 font-bold text-sm uppercase tracking-widest mb-1">{round.instruction} — transform:</div>
      <p className="text-slate-700 text-2xl font-medium">{round.promptSentence}</p>
    </div>

    {/* Drop zone (the placed tiles = the student's transformed sentence) */}
    <div className="bg-slate-50 rounded-3xl border-4 border-dashed border-slate-300 p-6 mb-6 min-h-[120px] flex flex-wrap gap-3 items-center content-start">
      {placed.length === 0 && <span className="text-slate-400 text-lg italic">Tap word tiles below to build the transformed sentence…</span>}
      {placed.map((tile, i) => {
        const isSwap = swapHint && (swapHint[0] === i || swapHint[1] === i);
        const isWrong = wrongIdx === i;
        return (
          <button
            key={tile.id}
            onClick={() => onPlacedTap(tile.id)}
            className={`px-5 py-3 rounded-xl text-xl font-bold border-2 transition-all ${
              isSwap ? 'bg-yellow-100 border-yellow-400 text-yellow-800 animate-pulse' :
              isWrong ? 'bg-rose-100 border-rose-400 text-rose-800' :
              outcome === 'correct' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' :
              'bg-white border-indigo-200 text-slate-800 hover:border-indigo-400'
            }`}
          >
            {tile.text}
          </button>
        );
      })}
    </div>

    {/* Word bank (the tray of shuffled tiles) */}
    <div className="flex flex-wrap gap-3 justify-center">
      {tray.map((tile) => (
        <button
          key={tile.id}
          onClick={() => onTileTap(tile.id)}
          disabled={!!outcome}
          className="px-5 py-3 rounded-xl text-xl font-bold bg-indigo-500 text-white shadow-md hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40"
        >
          {tile.text}
        </button>
      ))}
    </div>

    {outcome === 'incorrect' && (
      <div className="mt-4 text-center text-rose-500 font-medium">
        {swapHint ? '↔ Try swapping those two tiles.' : 'Some tiles are in the wrong spot. Try again.'}
      </div>
    )}
  </>
);

// ── Rung 4 view: PRODUCE free production (teacher 3-way rating) ────────
const ProduceView: React.FC<{
  round: ProduceRound; scoringMode: 'choral' | 'picked'; outcome: string | null; produceRevealed: boolean;
  onRate: (rating: 'correct' | 'partial' | 'incorrect') => void;
}> = ({ round, scoringMode, outcome, produceRevealed }) => (
  <>
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 mb-6">
      <div className="text-purple-400 font-bold text-lg mb-2 flex items-center gap-2">
        <Sparkles size={20} /> Apply the rule — produce the {round.targetTransformed.includes('?') ? 'question' : 'sentence'}:
      </div>
      <p className="text-slate-800 text-4xl font-bold leading-snug">{round.promptOriginal}</p>
      {round.patternTemplate && (
        <div className="mt-4 bg-purple-50 rounded-xl p-3 text-purple-600 text-sm">
          <strong>Pattern:</strong> {round.patternTemplate}
        </div>
      )}
    </div>

    <div className="bg-amber-50 rounded-2xl p-6 mb-6 text-center">
      <div className="text-amber-500 font-bold text-sm uppercase tracking-widest mb-2">
        {scoringMode === 'choral' ? '👥 Choral — class produces together' : '🎯 Teacher rates the picked student'}
      </div>
      <p className="text-slate-600 text-lg">
        Have the {scoringMode === 'choral' ? 'class' : 'student'} say the transformed sentence aloud. Then rate it below.
      </p>
    </div>

    {produceRevealed && (
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl shadow-lg p-6 border-4 border-emerald-300 animate-fade-in">
        <div className="text-emerald-500 font-bold text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
          <UserCheck size={14} /> Model answer
        </div>
        <p className="text-slate-800 text-3xl font-bold text-center">{round.targetTransformed}</p>
      </div>
    )}

    {outcome && !produceRevealed && (
      <div className="text-center text-slate-400 text-sm italic">
        <RotateCcw size={16} className="inline mr-1" /> Tap a rating to reveal the model answer.
      </div>
    )}
  </>
);

export default BoardGrammarForge;
