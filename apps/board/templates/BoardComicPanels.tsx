// BoardComicPanels — slide-the-panels storytelling (doc 12 §4, approved
// 2026-08-30). The class rebuilds a BOOK comic in reading order from the
// book's own panel crops: a shuffled tray + numbered slots (tap-to-place,
// the BoardStorySequencing interaction), where EVERY placement immediately
// reveals that panel's narration + verbatim bubble text — the story
// literally assembles as the class reorders it.
//
// Owner decisions locked 2026-08-30:
//   * tray shows ART ONLY (text reveals on placement — the mechanic);
//   * speaker names are HIDDEN (audit doc 12 §1.2: ~60% are mis-attributed
//     to the addressee; verbatim text only until a scan-v8 re-scan proves
//     attribution);
//   * one slide per comic, selected per-comic in the PlanComposer (each of
//     the unit's comics is its own library item); orchestrate-lesson's
//     transformer defaults to the richest comic when composing server-side.
//
// Wiring follows LIVE_GAME_LIFECYCLE.md §5 (the 4 must-dos): NEW_TURN reset
// keyed on currentTurnId, mistake refs, addPoints + scoreForAttempt gated on
// quickWheelWinner, personalized message. Check grades with LCS partial
// credit (difficulty 2 — the documented sequencing shell override, same
// rationale as BoardStorySequencing: constrained production).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BookOpen, Check, RefreshCcw, ArrowRight } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { supabase } from '../../../services/supabaseClient';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { computeLCSPartialCredit } from './BoardUnscramble';
import type { ContextualControlsSpec } from '../lessonDirector';

/** A frozen comic panel as produced by orchestrate-lesson / PlanComposer. */
export interface ComicPanelCard {
  /** Stable id (`structure_id:index`) — LCS grades against these. */
  id: string;
  /** True reading order (0-based). */
  order: number;
  /** Book panel crop URL (assets pool 'panel'); undefined → 📖 placeholder. */
  image_url?: string;
  /** Narration box text, verbatim (may be empty). */
  narration?: string;
  /** Bubble texts, verbatim, reading order. NO speaker names (audit §1.2). */
  texts: string[];
}

export interface ComicPanelsData {
  title?: string;
  /** e.g. "printed p8" — which comic of the unit this slide plays. */
  comic_label?: string;
  panels: ComicPanelCard[];
}

const PASS_THRESHOLD = 0.5;      // same floor as StorySequencing/Unscramble
const SEQUENCING_DIFFICULTY = 2; // documented shell-level override (doc 12 §4.2)

// ── Contextual controls contract (mirrors STORY_SEQUENCING_CONTROLS) ──────
export const COMIC_PANELS_ACTION_TYPES = {
  check: 'CHECK_ANSWER',
  skip: 'SKIP_ROUND',
  revealHint: 'REVEAL_HINT',
  forceCorrect: 'MARK_CORRECT',
  nextRound: 'NEXT_ROUND',
  endSlide: 'SLIDE_COMPLETE',
  reset: 'RESET_GAME',
} as const;

const noop = () => {};
export const COMIC_PANELS_CONTROLS: ContextualControlsSpec = {
  shellType: 'COMIC_PANELS',
  controls: {
    check:         { label: 'Check', enabled: true, onTrigger: noop },
    skip:          { label: 'Skip', enabled: true, onTrigger: noop },
    revealHint:    { label: 'Hint', enabled: true, onTrigger: noop }, // highlight a misplaced panel
    forceCorrect:  { label: 'Mark Correct', enabled: true, onTrigger: noop },
    nextRound:     { label: 'Next', enabled: true, onTrigger: noop },
    endSlide:      { label: 'End', enabled: true, onTrigger: noop },
  },
};

const BoardComicPanels = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';

  const panels: ComicPanelCard[] = useMemo(() => {
    const raw = Array.isArray(data?.panels) ? data.panels : [];
    return raw
      .filter((p: any) => p && typeof p.id === 'string' && typeof p.order === 'number')
      .map((p: any) => ({
        id: p.id,
        order: p.order,
        image_url: typeof p.image_url === 'string' ? p.image_url : undefined,
        narration: p.narration ? String(p.narration) : undefined,
        texts: Array.isArray(p.texts) ? p.texts.map((t: any) => String(t)).filter(Boolean) : [],
      }));
  }, [data?.panels]);

  // The REAL story objective (BoardStorySequencing B1 fix pattern): grade
  // against the objectives row, not a literal string.
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

  // ── Game state ────────────────────────────────────────────────────────
  const [complete, setComplete] = useState(false);
  const [tray, setTray] = useState<ComicPanelCard[]>([]);
  const [slots, setSlots] = useState<(ComicPanelCard | null)[]>([]);
  const [outcome, setOutcome] = useState<'correct' | 'partial' | null>(null);
  const [misplacedHint, setMisplacedHint] = useState<number>(-1);

  // ── Lifecycle refs (the 4 must-dos) ────────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const streakRef = useRef(0);

  const deal = useCallback(() => {
    setTray(seededShuffle(panels, makeRng(seedBase, state.currentTurnId ?? 'choral', 'comic-panels')));
    setSlots(new Array(panels.length).fill(null));
    setOutcome(null);
    setMisplacedHint(-1);
    mistakesRef.current = 0;
    awardedRef.current = false;
  }, [panels, seedBase, state.currentTurnId]);

  useEffect(() => {
    deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels]);

  // ── Dual-write + cognitive capture (same shape as StorySequencing) ─────
  const doScoring = useCallback((opts: {
    correctness: 'correct' | 'partial' | 'incorrect';
    points: number;
    passed: boolean;
  }) => {
    const picked = state.quickWheelWinner;
    if (!picked) return; // choral/practice mode — never score
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (opts.points !== 0) addPoints(picked, opts.points);
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness: opts.correctness,
      objectiveId: storyObjectiveId ?? undefined,
      exerciseType: 'comic_sequencing_attempt',
      difficulty: SEQUENCING_DIFFICULTY,
    }).catch(() => {});
    if (unitId && storyObjectiveId) {
      gradeObjective(picked, unitId, storyObjectiveId, opts.passed, 'productive').catch(() => {});
    }
    if (opts.correctness === 'incorrect' && storyObjectiveId) pushToRemediation(storyObjectiveId, picked);
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, storyObjectiveId, pushToRemediation]);

  const finishSlide = useCallback(() => {
    playCue('win');
    setComplete(true);
    triggerAction('SLIDE_COMPLETE', { forced: false });
  }, [triggerAction]);

  // ── Check (LCS partial credit over panel ids) ──────────────────────────
  const targetOrder = useMemo(
    () => panels.slice().sort((a, b) => a.order - b.order).map((p) => p.id),
    [panels],
  );

  const checkOrder = useCallback(() => {
    if (complete || outcome) return;
    if (!slots.every((s) => s !== null)) return;

    const placedOrder = slots.map((s) => s!.id);
    const ratio = computeLCSPartialCredit(placedOrder, targetOrder);

    if (ratio >= PASS_THRESHOLD) {
      if (awardedRef.current) return;
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const clean = ratio >= 1;
      const points = scoreForAttempt(mistakesRef.current, SEQUENCING_DIFFICULTY, ratio, streakRef.current);
      setOutcome(clean ? 'correct' : 'partial');
      doScoring({ correctness: clean ? 'correct' : 'partial', points, passed: true });
      setTimeout(finishSlide, 2200);
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      playCue('wrong');
      doScoring({ correctness: 'incorrect', points: -MISTAKE_PENALTY, passed: false });
      // Targeted feedback: highlight ONE clearly-misplaced panel, then return
      // misplaced panels to the tray (panel counts are too high for a diff).
      const firstWrong = slots.findIndex((s, i) => s && s.order !== i);
      setMisplacedHint(firstWrong);
      setTimeout(() => {
        setMisplacedHint(-1);
        setSlots((prevSlots) => {
          const kept = prevSlots.map((s, i) => (s && s.order === i ? s : null));
          const returned = prevSlots.filter((s, i) => s && s.order !== i) as ComicPanelCard[];
          setTray((prevTray) => [...prevTray, ...returned]);
          return kept;
        });
      }, 1200);
    }
  }, [complete, outcome, slots, targetOrder, doScoring, finishSlide, triggerConfetti]);

  const forceCorrect = useCallback(() => {
    if (complete || outcome) return;
    if (awardedRef.current) return;
    awardedRef.current = true;
    playCue('correct');
    streakRef.current += 1;
    const points = scoreForAttempt(mistakesRef.current, SEQUENCING_DIFFICULTY, 1.0, streakRef.current);
    setOutcome('correct');
    doScoring({ correctness: 'correct', points, passed: true });
    setTimeout(finishSlide, 2200);
  }, [complete, outcome, doScoring, finishSlide]);

  const revealHint = useCallback(() => {
    if (outcome) return;
    const wrong = slots.findIndex((s, i) => s && s.order !== i);
    if (wrong !== -1) setMisplacedHint(wrong);
  }, [slots, outcome]);

  // ── Remote/commander action listener (same strings the controls emit) ──
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'CHECK_ANSWER': checkOrder(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'SKIP_ROUND':
      case 'NEXT_ROUND': finishSlide(); break;
      case 'RESET_GAME':
        setComplete(false);
        streakRef.current = 0;
        deal();
        break;
      case 'SLIDE_COMPLETE': setComplete(true); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Game-lifecycle: new responder (NEW_TURN) → fresh deal for this kid ─
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = choral/practice, stable board
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    setComplete(false);
    deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // Auto-dismiss the terminal celebration after 6s (SLIDE_COMPLETE already
  // broadcast — this is purely visual, mirroring StorySequencing).
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => { setComplete(false); deal(); }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // ── Panel interaction ─────────────────────────────────────────────────
  const handleTrayClick = (panel: ComicPanelCard) => {
    if (outcome) return;
    const firstEmpty = slots.findIndex((s) => s === null);
    if (firstEmpty !== -1) {
      const next = [...slots];
      next[firstEmpty] = panel;
      setSlots(next);
      setTray(tray.filter((p) => p.id !== panel.id));
      setMisplacedHint(-1);
    }
  };

  const handleSlotClick = (index: number) => {
    if (outcome) return;
    const panel = slots[index];
    if (panel) {
      setTray([...tray, panel]);
      const next = [...slots];
      next[index] = null;
      setSlots(next);
      setMisplacedHint(-1);
    }
  };

  // ── Empty state (absence = absence: no comic → nothing to rebuild) ─────
  if (panels.length < 2) {
    return (
      <div className="h-full bg-slate-100 flex flex-col items-center justify-center text-center p-8">
        <BookOpen size={56} className="text-slate-300 mb-4" />
        <h1 className="text-3xl font-bold text-slate-400 mb-2">Rebuild the Story</h1>
        <p className="text-slate-400 max-w-sm">No comic panels for this unit yet. Comics are captured when you scan book pages.</p>
      </div>
    );
  }

  const revealedText = (panel: ComicPanelCard) => (
    <div className="min-h-[3.5rem] px-1 pb-1">
      {panel.narration && (
        <p className="text-[11px] italic text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 mb-1 leading-snug">{panel.narration}</p>
      )}
      {panel.texts.map((t, i) => (
        <p key={i} className="text-[11px] font-semibold text-slate-600 leading-snug">“{t}”</p>
      ))}
    </div>
  );

  return (
    <div className="h-full bg-slate-100 flex flex-col p-6 font-sans relative">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Rebuild the Story</h1>
            <p className="text-slate-500">
              {data?.comic_label ? `${data.comic_label} · ` : ''}Put the panels in reading order — the story appears as you build it.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={deal} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600" title="Shuffle again">
            <RefreshCcw />
          </button>
          <button
            onClick={checkOrder}
            className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2 ${slots.every((s) => s) && !outcome ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300 cursor-not-allowed'}`}
          >
            Check Answer <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* ═══ SLOTS — the story reassembles here ═══ */}
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0">
        <div className="flex gap-3 justify-center items-stretch flex-1 max-h-[52%]">
          {slots.map((slot, i) => (
            <div
              key={i}
              onClick={() => handleSlotClick(i)}
              className={`
                flex-1 max-w-[17%] rounded-2xl border-4 transition-all relative group cursor-pointer flex flex-col bg-white
                ${slot ? 'border-purple-600 shadow-xl' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100'}
                ${outcome && slot ? (slot.order === i ? 'ring-4 ring-green-400 border-green-500' : 'ring-4 ring-yellow-400 border-yellow-500') : ''}
                ${misplacedHint === i ? 'ring-4 ring-red-400 border-red-400 animate-pulse' : ''}
              `}
            >
              {slot ? (
                <div className="w-full h-full p-1.5 flex flex-col min-h-0">
                  {slot.image_url ? (
                    <img src={slot.image_url} alt="" className="w-full flex-1 min-h-0 object-cover rounded-xl" />
                  ) : (
                    <div className="w-full flex-1 min-h-0 rounded-xl bg-purple-50 flex items-center justify-center text-3xl">📖</div>
                  )}
                  {revealedText(slot)}
                  <div className="absolute -top-3 -left-3 w-9 h-9 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-lg border-4 border-slate-100 shadow-md">
                    {i + 1}
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-5xl font-black opacity-20">
                  {i + 1}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ═══ TRAY — art only; text reveals on placement ═══ */}
        <div className="flex gap-3 justify-center flex-wrap content-center min-h-[26%]">
          {tray.map((panel) => (
            <button
              key={panel.id}
              onClick={() => handleTrayClick(panel)}
              className="w-40 h-28 bg-white rounded-xl shadow-md border border-slate-200 p-1 hover:-translate-y-2 transition-transform hover:shadow-xl group text-left overflow-hidden"
              title="Place this panel in the next slot"
            >
              {panel.image_url ? (
                <img src={panel.image_url} alt="" className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full bg-purple-50 rounded-lg flex items-center justify-center text-2xl">📖</div>
              )}
            </button>
          ))}
          {tray.length === 0 && !outcome && (
            <div className="text-slate-400 font-bold animate-pulse self-center">Tap “Check Answer” when the story is in order!</div>
          )}
          {outcome && (
            <div className={`flex items-center gap-2 font-bold text-2xl animate-bounce self-center ${outcome === 'correct' ? 'text-green-600' : 'text-yellow-600'}`}>
              <Check size={32} />
              {outcome === 'correct'
                ? (pickedStudent ? `${pickedStudent.name} rebuilt the story!` : 'Perfect story order!')
                : (pickedStudent ? `So close, ${pickedStudent.name}!` : 'Almost right!')}
            </div>
          )}
        </div>
      </div>

      {/* ═══ COMPLETE — click to dismiss ═══ */}
      {complete && (
        <div
          onClick={() => { setComplete(false); deal(); }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-purple-100 text-purple-500 rounded-full flex items-center justify-center mb-6">
              <BookOpen size={60} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {pickedStudent ? `Great storytelling, ${pickedStudent.name}!` : 'Great storytelling, everyone!'}
            </h2>
            <p className="text-2xl text-slate-500 font-medium">The comic is back in book order.</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardComicPanels;
