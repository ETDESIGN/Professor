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
import { ArrowRight, BookOpen, Check, RotateCcw, Sparkles, UserCheck, Zap, Volume2, Lightbulb, Users } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { usePickedStudent } from './usePickedStudent';
import { scoreForAttempt, MISTAKE_PENALTY, type Difficulty } from './scoringDefaults';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { getGrammar, type CanonicalGrammar } from '../../../services/manifest';
import { browserSpeak } from '../../../services/SpeechService';
import { playCue } from './playCue';
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

// Streamlined 3-round arc (F5): 1 Spot → 1 Transform → 1 Produce
const ROUNDS_BY_RUNG = { error_spot: 1, transform: 1, produce: 1 } as const;

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

  const handledActionRef = useRef<any>(null);

  // ── ERROR_SPOT: MCQ answer ──────────────────────────────────────────
  const onErrorSpotAnswer = useCallback((chosenIndex: number) => {
    if (awardedRef.current) { showAlreadyScored(); return; }
    if (!round || round.kind !== 'ERROR_SPOT') return;
    const correct = chosenIndex === round.correctIndex;
    setRevealed(true);
    if (correct) {
      awardedRef.current = true;
      setOutcome('correct');
      playCue('correct');
      const points = scoreForAttempt(mistakesRef.current, round.difficulty, 1.0);
      doScoring('correct', points, round, 1.0);
    } else {
      mistakesRef.current += 1;
      setOutcome('incorrect');
      playCue('wrong');
      doScoring('incorrect', -MISTAKE_PENALTY, round, 0);
    }
  }, [round, doScoring, showAlreadyScored]);

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
  }, [outcome]);

  const onPlacedTap = useCallback((tileId: string) => {
    if (awardedRef.current || outcome) return;
    setPlaced((prev) => {
      const tile = prev.find((t) => t.id === tileId);
      if (!tile) return prev;
      setTray((t) => [...t, tile]);
      return prev.filter((t) => t.id !== tileId);
    });
  }, [outcome]);

  const checkTransform = useCallback(() => {
    if (awardedRef.current || !round || round.kind !== 'TRANSFORM') return;
    const placedTexts = placed.map((t) => t.text);
    if (placedTexts.length < round.targetTiles.length) return; // not all tiles placed
    const ratio = computeLCSPartialCredit(placedTexts, round.targetTiles);
    if (ratio >= UNSCRAMBLE_PASS_THRESHOLD) {
      awardedRef.current = true;
      const result = ratio === 1 ? 'correct' : 'partial';
      setOutcome(result);
      playCue('correct');
      // F6: Read-aloud on sentence completion
      browserSpeak(round.targetTiles.join(' '));
      const points = scoreForAttempt(mistakesRef.current, round.difficulty, ratio);
      doScoring(result, points, round, ratio);
    } else {
      mistakesRef.current += 1;
      setOutcome('incorrect');
      playCue('wrong');
      doScoring('incorrect', -MISTAKE_PENALTY, round, 0);
      const swap = detectSwappedPair(placedTexts, round.targetTiles);
      if (swap) setSwapHint(swap); else setWrongIdx(highlightFirstWrongPosition(placedTexts, round.targetTiles));
    }
  }, [round, placed, doScoring]);

  // ── PRODUCE: teacher 3-way rating ───────────────────────────────────
  const onProduceRating = useCallback((rating: 'correct' | 'partial' | 'incorrect') => {
    if (awardedRef.current || !round || round.kind !== 'PRODUCE') return;
    setProduceRevealed(true);
    // Audio read-aloud of model answer on reveal
    browserSpeak(round.targetTransformed);

    if (rating === 'correct') playCue('correct');
    else if (rating === 'partial') playCue('correct');
    else playCue('wrong');

    if (round.scoringMode === 'choral' || scoringMode === 'choral') {
      setOutcome(rating);
      return;
    }
    awardedRef.current = true;
    const ratio = rating === 'correct' ? 1.0 : rating === 'partial' ? 0.6 : 0;
    setOutcome(rating);
    const points = scoreForAttempt(mistakesRef.current, 3, ratio);
    doScoring(rating, points, round, ratio);
  }, [round, scoringMode, doScoring]);

  // ── Advance round ───────────────────────────────────────────────────
  const advanceRound = useCallback(() => {
    if (round && round.kind === 'ERROR_SPOT' && !awardedRef.current && pickedStudent && round.item.objective_id) {
      pushToRemediation(round.item.objective_id, pickedStudent.id);
    }
    if (roundIndex < rounds.length - 1) {
      setRoundIndex(roundIndex + 1);
    } else {
      playCue('win');
      triggerAction('SLIDE_COMPLETE', { forced: false });
    }
  }, [round, roundIndex, rounds.length, pickedStudent, pushToRemediation, triggerAction]);

  // ── Remote/commander action listener ────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a || a === handledActionRef.current) return;
    handledActionRef.current = a;
    switch (a.type) {
      case 'REVEAL_ANSWER':
        if (round?.kind === 'ERROR_SPOT') setRevealed(true);
        else if (round?.kind === 'TRANSFORM') checkTransform();
        else if (round?.kind === 'PRODUCE') {
          setProduceRevealed(true);
          browserSpeak(round.targetTransformed);
        }
        break;
      case 'CHECK_ANSWER': checkTransform(); break;
      case 'MARK_CORRECT':
        if (awardedRef.current) { showAlreadyScored(); return; }
        if (!round) return;
        awardedRef.current = true;
        setOutcome('correct');
        playCue('correct');
        {
          const points = scoreForAttempt(mistakesRef.current, round.kind === 'PRODUCE' ? 3 : (round as any).difficulty, 1.0);
          doScoring('correct', points, round, 1.0);
        }
        if (round.kind === 'PRODUCE') {
          setProduceRevealed(true);
          browserSpeak(round.targetTransformed);
        } else if (round.kind === 'TRANSFORM') {
          browserSpeak(round.targetTiles.join(' '));
        }
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
  }, [state.lastAction, round, revealed, checkTransform, onProduceRating, advanceRound, doScoring, showAlreadyScored]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (round?.kind === 'ERROR_SPOT' && !revealed) {
        if (e.key === '1' || e.key === 'a' || e.key === 'A') onErrorSpotAnswer(0);
        else if (e.key === '2' || e.key === 'b' || e.key === 'B') onErrorSpotAnswer(1);
        else if (e.key === '3' || e.key === 'c' || e.key === 'C') onErrorSpotAnswer(2);
        else if (e.key === '4' || e.key === 'd' || e.key === 'D') onErrorSpotAnswer(3);
      } else if (round?.kind === 'TRANSFORM') {
        if ((e.key === 'Enter' || e.key === ' ') && placed.length >= (round?.targetTiles?.length || 0)) {
          e.preventDefault();
          checkTransform();
        }
      } else if (round?.kind === 'PRODUCE' && !outcome) {
        if (e.key === '1') onProduceRating('incorrect');
        else if (e.key === '2') onProduceRating('partial');
        else if (e.key === '3') onProduceRating('correct');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [round, revealed, placed.length, outcome, onErrorSpotAnswer, checkTransform, onProduceRating]);

  // ── Empty-state ─────────────────────────────────────────────────────
  if (!poolLoading && rounds.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#0A0F1D] p-12 text-center text-slate-400">
        <BookOpen size={64} className="text-slate-600 mb-4 animate-pulse" />
        <h2 className="text-4xl font-bold text-white mb-2">Grammar Forge</h2>
        <p className="text-slate-400 text-xl max-w-xl">No grammar exercises available. Generate the exercise pool for this unit to unlock error-spotting, transformation, and free-production drills.</p>
      </div>
    );
  }

  if (poolLoading || !round) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0A0F1D] text-cyan-400 font-mono text-2xl">
        <div className="flex items-center gap-3">
          <Zap size={28} className="animate-spin text-cyan-400" />
          <span>Forging grammar exercises…</span>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  const rungNumber = round.kind === 'ERROR_SPOT' ? 2 : round.kind === 'TRANSFORM' ? 3 : 4;
  const phaseLabel = round.kind === 'ERROR_SPOT' ? 'Spot the Error' : round.kind === 'TRANSFORM' ? 'Transform the Sentence' : 'Produce Freely';

  return (
    <div className="h-full w-full bg-[#0A0F1D] text-white flex flex-col p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none gf-container">
      {/* Ambient cyber gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-[#0A0F1D] to-[#0A0F1D] pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 relative z-10 gf-header">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg ${
            round.kind === 'ERROR_SPOT' ? 'bg-rose-500 shadow-rose-950/50' :
            round.kind === 'TRANSFORM' ? 'bg-cyan-500 shadow-cyan-950/50' :
            'bg-purple-600 shadow-purple-950/50'
          }`}>
            <Zap size={26} className="text-white" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                round.kind === 'ERROR_SPOT' ? 'bg-rose-950/80 border border-rose-500/50 text-rose-300' :
                round.kind === 'TRANSFORM' ? 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-300' :
                'bg-purple-950/80 border border-purple-500/50 text-purple-300'
              }`}>
                Rung {rungNumber}
              </span>
              <span className="text-slate-400">Grammar Forge</span>
            </div>
            <div className="text-xl sm:text-3xl font-black text-white gf-title flex items-center gap-3">
              <span>{phaseLabel}</span>
              {pickedStudent && (
                <span className="text-xs sm:text-sm font-bold bg-amber-400/20 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  {pickedStudent.name}'s Turn
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-slate-400 font-mono text-lg sm:text-2xl font-bold bg-slate-900/80 border border-slate-800 px-4 py-1.5 rounded-xl shadow-inner">
          <span className="text-cyan-400">{roundIndex + 1}</span> / {rounds.length}
        </div>
      </div>

      {/* Main Round Content Area */}
      <div className="flex-1 flex flex-col justify-center relative z-10 overflow-hidden">
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
            pickedStudentName={pickedStudent?.name}
            onRate={onProduceRating}
          />
        )}
      </div>

      {/* Already-scored chip (spec: make the award latch visible) */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/95 border border-slate-700 text-white px-5 py-2 rounded-full font-bold shadow-2xl animate-fade-in flex items-center gap-2">
          <span>🔁</span> already scored this turn
        </div>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-between mt-4 sm:mt-6 relative z-10 border-t border-slate-800/60 pt-3 sm:pt-4 gf-footer">
        <div className="text-xs text-slate-500 hidden sm:block">
          {round.kind === 'ERROR_SPOT' ? 'Keyboard: 1-4 or A-D to choose' :
           round.kind === 'TRANSFORM' ? 'Keyboard: Space or Enter to check' :
           'Keyboard: 1 (✗), 2 (~), 3 (✓)'}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {round.kind === 'TRANSFORM' && !outcome && (
            <button
              onClick={checkTransform}
              disabled={placed.length < round.targetTiles.length}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base sm:text-xl px-6 sm:px-8 py-3 sm:py-3.5 rounded-2xl shadow-lg shadow-indigo-950/50 active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2 gf-btn"
            >
              <Check size={20} /> Check Answer
            </button>
          )}

          {round.kind === 'PRODUCE' && !outcome && !produceRevealed && (
            <>
              <button
                onClick={() => setScoringMode((m) => m === 'choral' ? 'picked' : 'choral')}
                className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-800 transition-colors gf-btn"
              >
                Mode: {scoringMode === 'choral' ? '👥 Choral' : '🎯 Picked Student'}
              </button>
              <span className="text-slate-400 text-xs sm:text-sm hidden md:inline">Rate production:</span>
              <button onClick={() => onProduceRating('incorrect')} className="px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold hover:bg-rose-900/80 transition-all gf-btn">✗ Incorrect</button>
              <button onClick={() => onProduceRating('partial')} className="px-4 py-2.5 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold hover:bg-amber-900/80 transition-all gf-btn">~ Partial</button>
              <button onClick={() => onProduceRating('correct')} className="px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold hover:bg-emerald-900/80 transition-all gf-btn">✓ Correct</button>
            </>
          )}

          {outcome && (
            <button
              onClick={advanceRound}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg sm:text-xl px-8 sm:px-10 py-3 sm:py-3.5 rounded-2xl shadow-lg shadow-indigo-950/50 active:scale-95 transition-all flex items-center gap-2 gf-btn animate-bounce-subtle"
            >
              {roundIndex >= rounds.length - 1 ? 'Complete Slide' : 'Next Round'} <ArrowRight size={22} />
            </button>
          )}
        </div>
      </div>

      {/* Responsive phone-landscape floor styling */}
      <style>{`
        @media (max-height: 450px) {
          .gf-container { padding: 0.5rem 1rem !important; }
          .gf-header { margin-bottom: 0.35rem !important; }
          .gf-title { font-size: 1.15rem !important; }
          .gf-prompt-card { padding: 0.5rem 0.75rem !important; margin-bottom: 0.35rem !important; border-radius: 1rem !important; }
          .gf-sentence { font-size: 1.25rem !important; line-height: 1.25 !important; }
          .gf-options-grid { gap: 0.35rem !important; }
          .gf-option-btn { padding: 0.4rem 0.75rem !important; font-size: 1rem !important; border-radius: 0.75rem !important; }
          .gf-dropzone { min-height: 44px !important; padding: 0.35rem !important; margin-bottom: 0.35rem !important; gap: 0.35rem !important; border-radius: 0.75rem !important; }
          .gf-tile { padding: 0.25rem 0.5rem !important; font-size: 0.85rem !important; border-radius: 0.5rem !important; }
          .gf-footer { margin-top: 0.25rem !important; padding-top: 0.25rem !important; }
          .gf-btn { height: 2.25rem !important; padding: 0 0.75rem !important; font-size: 0.875rem !important; border-radius: 0.75rem !important; }
        }
        @keyframes gf-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: gf-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

// ── Rung 2 view: ERROR_SPOT MCQ ───────────────────────────────────────
const ErrorSpotView: React.FC<{
  round: ErrorSpotRound; revealed: boolean; outcome: string | null; onAnswer: (i: number) => void;
}> = ({ round, revealed, outcome, onAnswer }) => {
  const isFix = !round.options.some((opt) => round.sentence.toLowerCase().includes(opt.toLowerCase()));
  const labels = ['A', 'B', 'C', 'D'];

  return (
    <>
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-4 sm:mb-6 shadow-2xl gf-prompt-card">
        <div className="text-rose-400 font-bold text-sm sm:text-base mb-2 flex items-center gap-2">
          <Zap size={18} />
          <span>{isFix ? 'Sentence with mistake — choose the correct word to fix it:' : 'Spot the wrong word in this sentence:'}</span>
        </div>
        <p className="text-white text-2xl sm:text-4xl font-black leading-snug gf-sentence">{round.sentence}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 flex-1 content-start gf-options-grid">
        {round.options.map((opt, i) => {
          const isCorrect = i === round.correctIndex;
          const state = revealed ? (isCorrect ? 'correct' : outcome === 'incorrect' ? 'wrong' : 'dim') : 'idle';
          return (
            <button
              key={i}
              onClick={() => !revealed && onAnswer(i)}
              disabled={revealed}
              className={`rounded-2xl p-4 sm:p-5 border-2 text-lg sm:text-2xl font-bold transition-all text-left flex items-center justify-between gf-option-btn ${
                state === 'correct' ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-950/50' :
                state === 'wrong' ? 'bg-rose-950/80 border-rose-500 text-rose-300 shadow-lg shadow-rose-950/50' :
                state === 'dim' ? 'bg-slate-900/40 border-slate-800/60 text-slate-500 opacity-60' :
                'bg-slate-900/90 border-slate-700/80 text-white hover:border-cyan-500 hover:bg-slate-800/90 active:scale-[0.98]'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold ${
                  state === 'correct' ? 'bg-emerald-500 text-white' :
                  state === 'wrong' ? 'bg-rose-500 text-white' :
                  'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  {labels[i] || i + 1}
                </span>
                <span>{opt}</span>
              </span>
              {state === 'correct' && <Check size={26} className="text-emerald-400" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {revealed && round.explanation && (
        <div className="mt-3 sm:mt-4 bg-indigo-950/70 border border-indigo-500/40 rounded-2xl p-3 sm:p-4 text-indigo-200 text-sm sm:text-base flex items-start gap-2.5 animate-fade-in">
          <Lightbulb size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-indigo-300 font-bold">Explanation:</strong> {round.explanation}
          </div>
        </div>
      )}
    </>
  );
};

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
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-3 sm:mb-5 gf-prompt-card">
      <div className="text-cyan-400 font-bold text-xs sm:text-sm uppercase tracking-widest mb-1 flex items-center gap-2">
        <Zap size={16} />
        <span>{round.instruction} — transform:</span>
      </div>
      <p className="text-white text-xl sm:text-3xl font-bold gf-sentence">{round.promptSentence}</p>
    </div>

    {/* Drop zone (the placed tiles = the student's transformed sentence) */}
    <div className={`bg-slate-950/80 rounded-2xl sm:rounded-3xl border-2 border-dashed p-4 sm:p-6 mb-4 sm:mb-6 min-h-[90px] sm:min-h-[120px] flex flex-wrap gap-2.5 sm:gap-3 items-center content-start transition-all gf-dropzone ${
      outcome === 'correct' ? 'border-emerald-500/80 bg-emerald-950/20' :
      outcome === 'incorrect' ? 'border-rose-500/80 bg-rose-950/20 animate-shake' :
      'border-slate-700 hover:border-slate-600'
    }`}>
      {placed.length === 0 && (
        <span className="text-slate-500 text-sm sm:text-lg italic">
          Tap word tiles below to forge the transformed sentence…
        </span>
      )}
      {placed.map((tile, i) => {
        const isSwap = swapHint && (swapHint[0] === i || swapHint[1] === i);
        const isWrong = wrongIdx === i;
        return (
          <button
            key={tile.id}
            onClick={() => onPlacedTap(tile.id)}
            disabled={outcome === 'correct'}
            className={`px-4 sm:px-5 py-2 sm:py-3 rounded-xl text-base sm:text-xl font-bold border-2 transition-all gf-tile active:scale-95 ${
              outcome === 'correct' ? 'bg-emerald-900/70 border-emerald-400 text-emerald-200 shadow-lg shadow-emerald-950/50' :
              isSwap ? 'bg-amber-950/80 border-amber-400 text-amber-300 animate-pulse' :
              isWrong ? 'bg-rose-950/80 border-rose-400 text-rose-300' :
              'bg-slate-800/90 border-cyan-500/50 text-white hover:border-cyan-400 hover:bg-slate-700'
            }`}
          >
            {tile.text}
          </button>
        );
      })}
    </div>

    {/* Word bank (the tray of shuffled tiles) */}
    <div className="flex flex-wrap gap-2.5 sm:gap-3 justify-center mb-3">
      {tray.map((tile) => (
        <button
          key={tile.id}
          onClick={() => onTileTap(tile.id)}
          disabled={!!outcome}
          className="px-4 sm:px-5 py-2 sm:py-3 rounded-xl text-base sm:text-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/40 shadow-md shadow-indigo-950/50 active:scale-95 transition-all disabled:opacity-30 gf-tile"
        >
          {tile.text}
        </button>
      ))}
    </div>

    {outcome === 'correct' && (
      <div className="flex items-center justify-center gap-3 mt-2">
        <button
          onClick={() => browserSpeak(round.targetTiles.join(' '))}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 hover:bg-emerald-900 text-sm font-bold shadow transition-all"
        >
          <Volume2 size={18} /> Listen to Sentence
        </button>
      </div>
    )}

    {outcome === 'incorrect' && (
      <div className="mt-2 text-center text-rose-400 font-semibold text-sm sm:text-base">
        {swapHint ? '↔ Try swapping those two highlighted tiles.' : 'Some tiles are in the wrong spot. Tap to remove and try again.'}
      </div>
    )}
  </>
);

// ── Rung 4 view: PRODUCE free production (teacher 3-way rating) ────────
const ProduceView: React.FC<{
  round: ProduceRound;
  scoringMode: 'choral' | 'picked';
  outcome: string | null;
  produceRevealed: boolean;
  pickedStudentName?: string;
  onRate: (rating: 'correct' | 'partial' | 'incorrect') => void;
}> = ({ round, scoringMode, outcome, produceRevealed, pickedStudentName }) => (
  <>
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-4 sm:mb-6 shadow-2xl gf-prompt-card">
      <div className="text-purple-400 font-bold text-sm sm:text-base mb-2 flex items-center gap-2">
        <Sparkles size={20} />
        <span>Apply the rule — produce the {round.targetTransformed.includes('?') ? 'question' : 'sentence'}:</span>
      </div>
      <p className="text-white text-2xl sm:text-4xl font-black leading-snug gf-sentence">{round.promptOriginal}</p>
      {round.patternTemplate && (
        <div className="mt-3 sm:mt-4 bg-purple-950/60 border border-purple-500/40 rounded-xl p-2.5 sm:p-3 text-purple-300 text-xs sm:text-sm font-mono flex items-center gap-2">
          <strong className="text-purple-200">Pattern:</strong> {round.patternTemplate}
        </div>
      )}
    </div>

    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-4 text-center">
      <div className="text-amber-400 font-bold text-xs sm:text-sm uppercase tracking-widest mb-1 flex items-center justify-center gap-2">
        {scoringMode === 'choral' ? (
          <>
            <Users size={16} /> Choral — Class Produces Together
          </>
        ) : (
          <>
            <UserCheck size={16} /> Rate Picked Student{pickedStudentName ? `: ${pickedStudentName}` : ''}
          </>
        )}
      </div>
      <p className="text-slate-400 text-sm sm:text-base">
        Have {scoringMode === 'choral' ? 'the entire class' : pickedStudentName || 'the student'} say the transformed sentence aloud. Then rate below.
      </p>
    </div>

    {produceRevealed && (
      <div className="bg-emerald-950/70 border-2 border-emerald-500/80 rounded-3xl p-5 sm:p-6 shadow-2xl animate-fade-in">
        <div className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Check size={16} /> Model Answer
          </span>
          <button
            onClick={() => browserSpeak(round.targetTransformed)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 text-xs font-bold border border-emerald-500/40 transition-all"
          >
            <Volume2 size={14} /> Listen
          </button>
        </div>
        <p className="text-white text-xl sm:text-3xl font-bold text-center">{round.targetTransformed}</p>
      </div>
    )}

    {outcome && !produceRevealed && (
      <div className="text-center text-slate-500 text-sm italic mt-2">
        <RotateCcw size={16} className="inline mr-1" /> Tap rating to reveal the model answer.
      </div>
    )}
  </>
);

export default BoardGrammarForge;
