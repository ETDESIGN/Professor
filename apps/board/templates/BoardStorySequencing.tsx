// BoardStorySequencing v2 — sequence → comprehend (PRACTICE phase).
//
// Rewritten per unscramble-storysequencing-v2-spec.md Part B:
//   • B1 FIX: grades against the REAL story objective_id (objectives row,
//     type='story') instead of the literal string 'story_sequencing' — the
//     old bug blended every story in the unit into one fake srs_items row.
//     The exercise-type-ish tag now lives in the attempt metadata.
//   • Round 1 (spec B0/B2): panel sequencing from the story manifest — NOT
//     pool-driven. Now LCS partial-credit (reused from Part A; panel ids
//     stand in for tiles) with the documented difficulty=2 shell override
//     (constrained production — narrative causality is more than recognition,
//     less than free production).
//   • Rounds 2..N (spec B2): STORY_COMPREHENSION MCQs from the pool via
//     useEscalatingPool — consumes the pool items that existed but no board
//     game rendered. Cap at 4 questions for live-class pacing. Binary scoring
//     (MCQ stays binary, architecture §3.2), item.difficulty used directly.
//   • Both rounds write to the same story objective — two operations on one
//     objective, the pattern the architecture is built on.
//   • Empty-state (spec B4): fewer than 2 comprehension items → run
//     sequencing alone and finish cleanly.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { History, Check, RefreshCcw, ArrowRight, Lightbulb } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getStory } from '../../../services/manifest';
import { supabase } from '../../../services/supabaseClient';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { useEscalatingPool } from '../useEscalatingPool';
import { computeLCSPartialCredit } from './BoardUnscramble';
import type { ContextualControlsSpec } from '../lessonDirector';
import type { PoolItem } from '../../../types/exercise';

interface StoryCard {
  id: string;
  image: string;
  text: string;
  order: number;
}

// ── Constants (spec B2/B4) ────────────────────────────────────────────────
const MAX_COMPREHENSION_QUESTIONS = 4; // tight pacing for a live class
const MIN_COMPREHENSION_QUESTIONS = 2; // below this: sequencing alone, clean end
const SEQUENCING_DIFFICULTY = 2;       // documented shell-level override (spec B2)
const SEQUENCING_PASS_THRESHOLD = 0.5; // same pass floor as Unscramble

// ── Contextual controls contract (architecture §4.1, spec B4) ─────────────
export const STORY_SEQUENCING_ACTION_TYPES = {
  check: 'CHECK_ANSWER',
  skip: 'SKIP_ROUND',
  revealHint: 'REVEAL_HINT',
  forceCorrect: 'MARK_CORRECT',
  nextRound: 'NEXT_ROUND',
  endSlide: 'SLIDE_COMPLETE',
  reset: 'RESET_GAME',
} as const;

const noop = () => {};
export const STORY_SEQUENCING_CONTROLS: ContextualControlsSpec = {
  shellType: 'STORY_SEQUENCING',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: noop },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: noop }, // sequencing: mark a misplaced panel; comprehension: eliminate a distractor
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    nextRound:    { label: 'Next', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
  },
};

type Stage = 'sequencing' | 'comprehension' | 'complete';

const BoardStorySequencing = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phaseTag = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── The REAL story objective id (spec B1 fix) ─────────────────────────
  const [storyObjectiveId, setStoryObjectiveId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setStoryObjectiveId(null); return; }
    (async () => {
      const { data: rows, error } = await supabase
        .from('objectives')
        .select('id')
        .eq('unit_id', unitId)
        .eq('type', 'story')
        .limit(1);
      if (cancelled) return;
      setStoryObjectiveId(!error && rows && rows.length > 0 ? String(rows[0].id) : null);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // ── Round 2 content: STORY_COMPREHENSION pool items (useEscalatingPool
  //    drives ONLY this round — round 1 is manifest-driven, spec B0). ─────
  const { items: poolItems, loading: poolLoading } = useEscalatingPool({
    unitId,
    shellType: 'STORY_SEQUENCING',
    phase: phaseTag,
    roster,
    roundIndex: 1,
    totalRounds: 1,
    roundSize: MAX_COMPREHENSION_QUESTIONS,
  });

  const comprehensionItems: PoolItem[] = useMemo(() => {
    const seen = new Set<string>();
    const out: PoolItem[] = [];
    for (const it of poolItems) {
      if (it.exercise_type !== 'STORY_COMPREHENSION' || seen.has(it.id)) continue;
      const c = it.content as any;
      if (!c?.prompt || !Array.isArray(c.options) || c.options.length < 2) continue;
      if (typeof c.correct_index !== 'number') continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= MAX_COMPREHENSION_QUESTIONS) break;
    }
    return out;
  }, [poolItems]);

  // ── Round 1 content: story panels (frozen data.cards OR manifest) ─────
  const buildCards = useCallback((): StoryCard[] => {
    if (Array.isArray(data?.cards) && data.cards.length > 0) {
      return data.cards.map((c: any, i: number) => ({ ...c, id: c.id || `frozen-${i}`, order: i }));
    }
    const pages = getStory(state.activeUnit?.manifest).pages || [];
    return pages
      .map((p: any, i: number) => ({ id: `story-${i}`, image: p.image || '', text: p.text || '', order: i }))
      .filter((c: StoryCard) => c.text);
  }, [data?.cards, state.activeUnit?.manifest]);

  // ── Game state ────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('sequencing');
  const [cards, setCards] = useState<StoryCard[]>([]);
  const [slots, setSlots] = useState<(StoryCard | null)[]>([]);
  const [seqOutcome, setSeqOutcome] = useState<'correct' | 'partial' | null>(null);
  const [misplacedHint, setMisplacedHint] = useState<number>(-1); // slot index highlighted as wrong
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);
  // 2nd-miss comprehension reveal: correct option amber-ringed + explanation.
  const [revealedAnswer, setRevealedAnswer] = useState(false);

  // ── Lifecycle refs (the 4 must-dos) — fresh per activity (sequence
  //    submission and each comprehension question are separate attempts). ──
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  // Consecutive-correct streak across scored attempts (4th scoreForAttempt
  // arg; resets on a miss or a new turn).
  const streakRef = useRef(0);

  const initializeSequencing = useCallback(() => {
    const items = buildCards();
    setCards([...items].sort(() => Math.random() - 0.5));
    setSlots(new Array(items.length).fill(null));
    setSeqOutcome(null);
    setMisplacedHint(-1);
    mistakesRef.current = 0;
    awardedRef.current = false;
  }, [buildCards]);

  useEffect(() => {
    initializeSequencing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeUnit?.id, data?.cards]);

  // ── Dual-write + cognitive capture helpers ────────────────────────────
  const doScoring = useCallback((opts: {
    correctness: 'correct' | 'partial' | 'incorrect';
    points: number;
    objectiveId: string | null;
    exerciseType: string;
    difficulty: number;
    passed: boolean;
    modality: 'receptive' | 'productive';
  }) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (opts.points !== 0) addPoints(picked, opts.points);
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness: opts.correctness,
      objectiveId: opts.objectiveId ?? undefined,
      exerciseType: opts.exerciseType,
      difficulty: opts.difficulty,
    }).catch(() => {});
    if (unitId && opts.objectiveId) {
      gradeObjective(picked, unitId, opts.objectiveId, opts.passed, opts.modality).catch(() => {});
    }
    if (opts.correctness === 'incorrect' && opts.objectiveId) pushToRemediation(opts.objectiveId, picked);
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  const storyCards = useMemo(() => buildCards(), [buildCards]);
  const hasComprehensionRound = comprehensionItems.length >= MIN_COMPREHENSION_QUESTIONS;

  // ── Stage advancement ───────────────────────────────────────────────────
  const afterSequenceResolved = useCallback(() => {
    setTimeout(() => {
      if (hasComprehensionRound) {
        setStage('comprehension');
        setQIndex(0);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealedAnswer(false);
        mistakesRef.current = 0; // fresh attempt refs per question (spec B3)
        awardedRef.current = false;
      } else {
        playCue('win');
        setStage('complete');
        triggerAction('SLIDE_COMPLETE', { forced: false });
      }
    }, 2200);
  }, [hasComprehensionRound, triggerAction]);

  const afterQuestionResolved = useCallback((idx: number) => {
    setTimeout(() => {
      if (idx + 1 >= comprehensionItems.length) {
        playCue('win');
        setStage('complete');
        triggerAction('SLIDE_COMPLETE', { forced: false });
      } else {
        setQIndex(idx + 1);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealedAnswer(false);
        mistakesRef.current = 0; // fresh attempt refs per question (spec B3)
        awardedRef.current = false;
      }
    }, 900); // pure celebration — ≤900ms (dead-time rule)
  }, [comprehensionItems.length, triggerAction]);

  // ── Round 1 — sequencing submit (spec B3, LCS partial credit) ─────────
  const checkOrder = useCallback(() => {
    if (stage !== 'sequencing' || seqOutcome) return;
    const isFull = slots.every((s) => s !== null);
    if (!isFull) return;

    const placedOrder = slots.map((s) => s!.id);
    const targetOrder = storyCards.slice().sort((a, b) => a.order - b.order).map((c) => c.id);
    const ratio = computeLCSPartialCredit(placedOrder, targetOrder);

    if (ratio >= SEQUENCING_PASS_THRESHOLD) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const clean = ratio >= 1;
      const points = scoreForAttempt(mistakesRef.current, SEQUENCING_DIFFICULTY, ratio, streakRef.current);
      setSeqOutcome(clean ? 'correct' : 'partial');
      doScoring({
        correctness: clean ? 'correct' : 'partial',
        points,
        objectiveId: storyObjectiveId, // the REAL objective (B1) — not the literal string
        exerciseType: 'story_sequencing_attempt', // tag moved into attempt metadata (B1)
        difficulty: SEQUENCING_DIFFICULTY,
        passed: true,
        modality: 'productive',
      });
      afterSequenceResolved();
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      playCue('wrong');
      doScoring({
        correctness: 'incorrect',
        points: -MISTAKE_PENALTY,
        objectiveId: storyObjectiveId,
        exerciseType: 'story_sequencing_attempt',
        difficulty: SEQUENCING_DIFFICULTY,
        passed: false,
        modality: 'productive',
      });
      // Targeted feedback (spec B4): highlight ONE clearly-misplaced panel,
      // then return misplaced panels to the tray (panel counts are usually
      // too high for a full diff to be useful).
      const firstWrong = slots.findIndex((s, i) => s && s.order !== i);
      setMisplacedHint(firstWrong);
      setTimeout(() => {
        setMisplacedHint(-1);
        setSlots((prevSlots) => {
          const newSlots = prevSlots.map((s, i) => (s && s.order === i ? s : null));
          const returned = prevSlots.filter((s, i) => s && s.order !== i) as StoryCard[];
          setCards((prevCards) => [...prevCards, ...returned]);
          return newSlots;
        });
      }, 1200);
    }
  }, [stage, seqOutcome, slots, storyCards, storyObjectiveId, doScoring, afterSequenceResolved, showAlreadyScored, triggerConfetti]);

  // ── Round 2 — comprehension MCQ (spec B2/B3, binary) ──────────────────
  const currentQuestion = stage === 'comprehension' ? comprehensionItems[qIndex] : null;

  const handleOptionTap = useCallback((optIndex: number) => {
    const item = currentQuestion;
    if (!item || selectedOption !== null) return;
    const c = item.content as any;
    const correctIndex = Number(c.correct_index);
    setSelectedOption(optIndex);
    const correct = optIndex === correctIndex;
    const objectiveId = item.objective_id || storyObjectiveId;

    if (correct) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
      doScoring({
        correctness: 'correct',
        points,
        objectiveId,
        exerciseType: 'STORY_COMPREHENSION',
        difficulty: item.difficulty,
        passed: true,
        modality: 'receptive',
      });
      afterQuestionResolved(qIndex);
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      doScoring({
        correctness: 'incorrect',
        points: -MISTAKE_PENALTY,
        objectiveId,
        exerciseType: 'STORY_COMPREHENSION',
        difficulty: item.difficulty,
        passed: false,
        modality: 'receptive',
      });
      // Standard MCQ hint: eliminate one distractor on 1st miss (spec B4).
      setEliminatedOptions((prev) => {
        const next = prev.includes(optIndex) ? prev : [...prev, optIndex];
        const extra = Array.from({ length: c.options.length }, (_, i) => i)
          .find((i) => i !== correctIndex && !next.includes(i));
        return extra !== undefined && mistakesRef.current === 1 ? [...next, extra] : next;
      });
      if (mistakesRef.current >= 2) {
        // 2nd miss → teaching reveal: correct option amber-ringed + the
        // explanation when the content carries one, ~2.2s hold, then advance.
        playCue('reveal');
        setRevealedAnswer(true);
        setTimeout(() => {
          setRevealedAnswer(false);
          afterQuestionResolved(qIndex);
        }, 2200);
      } else {
        // 1st miss: retry with the distractor eliminated.
        playCue('wrong');
        setTimeout(() => setSelectedOption(null), 900);
      }
    }
  }, [currentQuestion, selectedOption, storyObjectiveId, doScoring, afterQuestionResolved, qIndex, showAlreadyScored, triggerConfetti]);

  // ── Teacher controls ──────────────────────────────────────────────────
  const revealHint = useCallback(() => {
    if (stage === 'sequencing' && !seqOutcome) {
      // Highlight one correctly-placed vs. one misplaced panel (spec B4).
      const wrong = slots.findIndex((s, i) => s && s.order !== i);
      if (wrong !== -1) setMisplacedHint(wrong);
    } else if (stage === 'comprehension' && currentQuestion) {
      const c = currentQuestion.content as any;
      const correctIndex = Number(c.correct_index);
      setEliminatedOptions((prev) => {
        const idx = Array.from({ length: c.options.length }, (_, i) => i)
          .find((i) => i !== correctIndex && !prev.includes(i));
        return idx === undefined ? prev : [...prev, idx];
      });
    }
  }, [stage, seqOutcome, slots, currentQuestion]);

  const forceCorrect = useCallback(() => {
    if (stage === 'sequencing') {
      if (seqOutcome) return;
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const points = scoreForAttempt(mistakesRef.current, SEQUENCING_DIFFICULTY, 1.0, streakRef.current);
      setSeqOutcome('correct');
      doScoring({
        correctness: 'correct',
        points,
        objectiveId: storyObjectiveId,
        exerciseType: 'story_sequencing_attempt',
        difficulty: SEQUENCING_DIFFICULTY,
        passed: true,
        modality: 'productive',
      });
      afterSequenceResolved();
    } else if (stage === 'comprehension' && currentQuestion) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const points = scoreForAttempt(mistakesRef.current, currentQuestion.difficulty, 1.0, streakRef.current);
      doScoring({
        correctness: 'correct',
        points,
        objectiveId: currentQuestion.objective_id || storyObjectiveId,
        exerciseType: 'STORY_COMPREHENSION',
        difficulty: currentQuestion.difficulty,
        passed: true,
        modality: 'receptive',
      });
      afterQuestionResolved(qIndex);
    }
  }, [stage, seqOutcome, currentQuestion, storyObjectiveId, doScoring, afterSequenceResolved, afterQuestionResolved, qIndex, showAlreadyScored, triggerConfetti]);

  const skipActivity = useCallback(() => {
    // Skip: no penalty, no remediation push.
    if (stage === 'sequencing') {
      afterSequenceResolved();
    } else if (stage === 'comprehension') {
      afterQuestionResolved(qIndex);
    }
  }, [stage, afterSequenceResolved, afterQuestionResolved, qIndex]);

  const advanceActivity = useCallback(() => {
    skipActivity(); // manual "Next" advances the current activity without scoring
  }, [skipActivity]);

  // ── Remote/commander action listener ──────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'CHECK_ANSWER': checkOrder(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'SKIP_ROUND': skipActivity(); break;
      case 'NEXT_ROUND': advanceActivity(); break;
      case 'RESET_GAME':
        setStage('sequencing');
        setQIndex(0);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealedAnswer(false);
        streakRef.current = 0;
        initializeSequencing();
        break;
      case 'SLIDE_COMPLETE': setStage('complete'); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Game-lifecycle: new responder (NEW_TURN) → fresh turn refs + board ─
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = practice mode
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    initializeSequencing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // Auto-dismiss the terminal celebration after 6s. SLIDE_COMPLETE already
  // broadcast (see handleAction), so this is purely visual.
  useEffect(() => {
    if (stage !== 'complete') return;
    const t = setTimeout(() => setStage('sequencing'), 6000);
    return () => clearTimeout(t);
  }, [stage]);

  // ── Panel interaction (round 1) ───────────────────────────────────────
  const handleCardClick = (card: StoryCard) => {
    if (seqOutcome) return;
    const firstEmptyIndex = slots.findIndex((s) => s === null);
    if (firstEmptyIndex !== -1) {
      const newSlots = [...slots];
      newSlots[firstEmptyIndex] = card;
      setSlots(newSlots);
      setCards(cards.filter((c) => c.id !== card.id));
      setMisplacedHint(-1);
    }
  };

  const handleSlotClick = (index: number) => {
    if (seqOutcome) return;
    const card = slots[index];
    if (card) {
      setCards([...cards, card]);
      const newSlots = [...slots];
      newSlots[index] = null;
      setSlots(newSlots);
      setMisplacedHint(-1);
    }
  };

  // ── Empty state ───────────────────────────────────────────────────────
  if (storyCards.length === 0) {
    return (
      <div className="h-full bg-slate-100 flex flex-col items-center justify-center text-center p-8">
        <History size={56} className="text-slate-300 mb-4" />
        <h1 className="text-3xl font-bold text-slate-400 mb-2">Story Sequencing</h1>
        <p className="text-slate-400 max-w-sm">No story for this unit yet. Stories are generated during enrichment.</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-100 flex flex-col p-8 font-sans relative">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <History size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Story Sequencing</h1>
            <p className="text-slate-500">
              {stage === 'sequencing' && 'Put the events in the correct order.'}
              {stage === 'comprehension' && `Story check — question ${qIndex + 1}/${comprehensionItems.length}`}
              {stage === 'complete' && 'Well done!'}
            </p>
          </div>
        </div>
        {stage === 'sequencing' && (
          <div className="flex gap-3">
            <button onClick={initializeSequencing} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
              <RefreshCcw />
            </button>
            <button
              onClick={checkOrder}
              className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2 ${slots.every((s) => s) && !seqOutcome ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              Check Answer <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* ═══ ROUND 1 — SEQUENCING ═══ */}
      {stage === 'sequencing' && (
        <div className="flex-1 flex flex-col justify-center gap-8">
          {/* Drop Zones */}
          <div className="flex gap-4 justify-center items-stretch h-64">
            {slots.map((slot, i) => (
              <div
                key={i}
                onClick={() => handleSlotClick(i)}
                className={`
                  flex-1 max-w-xs rounded-2xl border-4 transition-all relative group cursor-pointer
                  ${slot ? 'border-purple-600 bg-white shadow-xl' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100'}
                  ${seqOutcome && slot ? (slot.order === i ? 'ring-4 ring-green-400 border-green-500' : 'ring-4 ring-yellow-400 border-yellow-500') : ''}
                  ${misplacedHint === i ? 'ring-4 ring-red-400 border-red-400 animate-pulse' : ''}
                `}
              >
                {slot ? (
                  <div className="w-full h-full p-2 flex flex-col">
                    <img src={slot.image} className="w-full h-40 object-cover rounded-xl mb-3" />
                    <p className="text-center font-bold text-slate-700 leading-tight">{slot.text}</p>
                    <div className="absolute -top-4 -left-4 w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-xl border-4 border-slate-100 shadow-md">
                      {i + 1}
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-6xl font-black opacity-20">
                    {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Arrow Divider */}
          <div className="flex items-center justify-center text-slate-300">
            <div className="h-1 bg-slate-200 flex-1 max-w-xl rounded-full"></div>
          </div>

          {/* Source Cards */}
          <div className="flex gap-4 justify-center flex-wrap h-48 content-center">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => handleCardClick(card)}
                className="w-48 bg-white rounded-xl shadow-md border border-slate-200 p-2 hover:-translate-y-2 transition-transform hover:shadow-xl group text-left"
              >
                <div className="h-24 overflow-hidden rounded-lg mb-2 relative">
                  <img src={card.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                </div>
                <p className="text-xs font-bold text-slate-600 line-clamp-2">{card.text}</p>
              </button>
            ))}
            {cards.length === 0 && !seqOutcome && (
              <div className="text-slate-400 font-bold animate-pulse">Tap "Check Answer" when ready!</div>
            )}
            {seqOutcome && (
              <div className={`flex items-center gap-2 font-bold text-2xl animate-bounce ${seqOutcome === 'correct' ? 'text-green-600' : 'text-yellow-600'}`}>
                <Check size={32} />
                {seqOutcome === 'correct'
                  ? (pickedStudent ? `${pickedStudent.name} sequenced it!` : 'Correct Sequence!')
                  : (pickedStudent ? `So close, ${pickedStudent.name}!` : 'Almost right!')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ROUND 2 — COMPREHENSION (previously unconsumed pool items) ═══ */}
      {stage === 'comprehension' && currentQuestion && (() => {
        const c = currentQuestion.content as any;
        const correctIndex = Number(c.correct_index);
        const resolved = selectedOption === correctIndex;
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-4xl mx-auto w-full">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 px-10 py-8 w-full text-center">
              <p className="text-3xl font-bold text-slate-800">{c.prompt}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              {(c.options as string[]).map((opt, i) => {
                const isCorrect = i === correctIndex;
                const isSelected = selectedOption === i;
                const isEliminated = eliminatedOptions.includes(i);
                const showResult = selectedOption !== null;
                return (
                  <button key={i} onClick={() => handleOptionTap(i)} disabled={isEliminated || (showResult && resolved)}
                    className={`px-8 py-5 rounded-2xl text-2xl font-bold border-4 transition-all text-left
                      ${showResult && isCorrect ? 'bg-green-100 border-green-500 text-green-800'
                        : showResult && isSelected && !isCorrect ? 'bg-red-100 border-red-400 text-red-700 animate-shake'
                        : isEliminated ? 'bg-slate-100 border-slate-200 text-slate-300 opacity-40 cursor-not-allowed'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-purple-400 hover:-translate-y-1 shadow-md'}
                      ${revealedAnswer && isCorrect ? 'ring-4 ring-amber-400' : ''}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
            {resolved && (
              <div className="flex items-center gap-2 text-green-600 font-bold text-2xl animate-bounce">
                <Check size={32} /> {pickedStudent ? `${pickedStudent.name} got it!` : 'Correct!'}
              </div>
            )}
            {/* 2nd-miss reveal: the correct option prominent + the
                explanation when the content carries one. */}
            {revealedAnswer && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-8 py-4 text-center max-w-2xl">
                <div className="text-xl font-bold text-amber-900">The answer: {c.options[correctIndex]}</div>
                {c.explanation && <p className="text-amber-800 mt-1">{c.explanation}</p>}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ COMPLETE — click to dismiss ═══ */}
      {stage === 'complete' && (
        <div
          onClick={() => setStage('sequencing')}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-purple-100 text-purple-500 rounded-full flex items-center justify-center mb-6">
              <History size={60} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {pickedStudent ? `Great story work, ${pickedStudent.name}!` : 'Great story work, everyone!'}
            </h2>
            <p className="text-2xl text-slate-500 font-medium">Ready for the next slide.</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Already-scored chip */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 text-white px-5 py-2 rounded-full font-bold animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      <style>{`
        @keyframes ss-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: ss-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardStorySequencing;
