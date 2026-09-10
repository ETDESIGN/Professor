// BoardComicPanels — slide-the-panels storytelling (doc 12 §4, approved
// 2026-08-30, games-v3 Stitch redesign 2026-09-11).
// The class rebuilds a BOOK comic in reading order from the book's own panel
// crops: a shuffled tray + numbered slots (tap-to-place, the BoardStorySequencing
// interaction), where EVERY placement immediately reveals that panel's narration
// + verbatim bubble text — the story literally assembles as the class reorders it.
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
// credit (difficulty 2 — the documented sequencing shell override).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen,
  Check,
  RefreshCw,
  ArrowRight,
  Lightbulb,
  Volume2,
  Trophy,
  Star,
  Lock,
  Plus,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { supabase } from '../../../services/supabaseClient';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { computeLCSPartialCredit } from './BoardUnscramble';
import { browserSpeak } from '../../../services/SpeechService';
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
    revealHint:    { label: 'Hint', enabled: true, onTrigger: noop },
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
  const [candidateHint, setCandidateHint] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Lifecycle refs (the 4 must-dos) ────────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const streakRef = useRef(0);
  const pointsAwardedRef = useRef(0);

  const deal = useCallback(() => {
    setTray(seededShuffle(panels, makeRng(seedBase, state.currentTurnId ?? 'choral', 'comic-panels')));
    setSlots(new Array(panels.length).fill(null));
    setOutcome(null);
    setMisplacedHint(-1);
    setCandidateHint(null);
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

  // ── Target sequence & sorted story ────────────────────────────────────
  const targetOrder = useMemo(
    () => panels.slice().sort((a, b) => a.order - b.order).map((p) => p.id),
    [panels],
  );

  const sortedPanels = useMemo(
    () => panels.slice().sort((a, b) => a.order - b.order),
    [panels],
  );

  // ── Whole-Story Read Aloud (TTS) ──────────────────────────────────────
  const handleReadAloud = useCallback(() => {
    const sourceList = complete ? sortedPanels : slots.filter(Boolean) as ComicPanelCard[];
    const speechChunks: string[] = [];
    sourceList.forEach((p) => {
      if (p.narration) speechChunks.push(p.narration);
      p.texts.forEach((t) => speechChunks.push(t));
    });
    if (speechChunks.length === 0) {
      browserSpeak("Let's look at the comic pictures and rebuild the story!", 'en');
      return;
    }
    setIsSpeaking(true);
    browserSpeak(speechChunks.join('. '), 'en');
    setTimeout(() => setIsSpeaking(false), 3000);
  }, [complete, sortedPanels, slots]);

  // ── Check (LCS partial credit over panel ids) ──────────────────────────
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
      pointsAwardedRef.current = points;
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
    pointsAwardedRef.current = points;
    setOutcome('correct');
    doScoring({ correctness: 'correct', points, passed: true });
    setTimeout(finishSlide, 2200);
  }, [complete, outcome, doScoring, finishSlide]);

  // F8: Hint is never a dead button. If an error exists, highlight it;
  // if empty or all placed are correct, highlight the next candidate card in tray!
  const revealHint = useCallback(() => {
    if (outcome) return;
    const wrong = slots.findIndex((s, i) => s && s.order !== i);
    if (wrong !== -1) {
      setMisplacedHint(wrong);
      setTimeout(() => setMisplacedHint(-1), 2200);
      return;
    }
    const firstEmpty = slots.findIndex((s) => s === null);
    if (firstEmpty !== -1) {
      const nextNeededId = targetOrder[firstEmpty];
      const matchInTray = tray.find((p) => p.id === nextNeededId);
      if (matchInTray) {
        setCandidateHint(matchInTray.id);
        setTimeout(() => setCandidateHint(null), 2500);
      }
    }
  }, [slots, outcome, targetOrder, tray]);

  // ── Remote/commander action listener ──────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'CHECK_ANSWER': checkOrder(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'PLAY_AUDIO': handleReadAloud(); break;
      case 'SKIP_ROUND': finishSlide(); break;
      case 'NEXT_ROUND':
        // F7: Differentiate Next from Skip. If complete advance; if playing, re-deal fresh turn.
        if (complete) {
          finishSlide();
        } else {
          deal();
        }
        break;
      case 'RESET_GAME':
        setComplete(false);
        streakRef.current = 0;
        deal();
        break;
      case 'SLIDE_COMPLETE': setComplete(true); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction, complete]);

  // ── Game-lifecycle: new responder (NEW_TURN) → fresh deal for this kid ─
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    setComplete(false);
    deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // Auto-dismiss the terminal celebration after 7s
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => { setComplete(false); deal(); }, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // ── Panel interaction ─────────────────────────────────────────────────
  const handleTrayClick = (panel: ComicPanelCard) => {
    if (outcome) return;
    const firstEmpty = slots.findIndex((s) => s === null);
    if (firstEmpty !== -1) {
      playCue('reveal');
      const next = [...slots];
      next[firstEmpty] = panel;
      setSlots(next);
      setTray(tray.filter((p) => p.id !== panel.id));
      setMisplacedHint(-1);
      setCandidateHint(null);
    }
  };

  const handleSlotClick = (index: number) => {
    if (outcome) return;
    const panel = slots[index];
    if (panel) {
      playCue('reveal');
      setTray([...tray, panel]);
      const next = [...slots];
      next[index] = null;
      setSlots(next);
      setMisplacedHint(-1);
      setCandidateHint(null);
    }
  };

  // ── Helper counts & states ────────────────────────────────────────────
  const placedCount = useMemo(() => slots.filter((s) => s !== null).length, [slots]);
  const totalCount = panels.length;
  const activeDropIndex = useMemo(() => slots.findIndex((s) => s === null), [slots]);
  const allFilled = slots.length > 0 && slots.every((s) => s !== null);

  // ── Empty state (absence = absence) ───────────────────────────────────
  if (panels.length < 2) {
    return (
      <div className="h-full bg-[#070C18] flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-[#0B132B] border border-slate-800 flex items-center justify-center text-sky-400 mb-6 shadow-lg shadow-sky-500/10">
          <BookOpen size={42} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 font-display">Rebuild the Story</h1>
        <p className="text-slate-400 max-w-md font-mono text-sm leading-relaxed">
          No comic panels for this unit yet. Comics are captured when you scan book pages.
        </p>
      </div>
    );
  }

  // ── Story Solved Showcase (Screen 4 / 2-complete.html) ───────────────────
  if (complete) {
    return (
      <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-7 relative overflow-hidden select-none font-sans comic-stage-root">
        <style>{`
          @media (max-height: 450px) {
            .comic-stage-root { padding: 0.5rem !important; }
            .comic-header { height: 2.25rem !important; margin-bottom: 0.25rem !important; }
            .comic-hero-banner { padding: 0.5rem 1rem !important; margin: 0.25rem 0 !important; }
            .comic-filmstrip-panel { max-height: 120px !important; }
            .comic-story-recap { padding: 0.5rem 1rem !important; margin: 0.25rem 0 !important; }
          }
        `}</style>

        {/* TOP APP BAR / HEADER */}
        <header className="w-full flex items-center justify-between h-12 sm:h-14 relative z-20 flex-none comic-header">
          <div className="flex items-center gap-3 pl-28 lg:pl-44">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0B132B] border border-slate-800 text-xs font-mono font-semibold tracking-wider text-sky-400 uppercase shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>PHASE: STORY COMPLETE</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-slate-400 font-mono text-xs">
              <span className="text-slate-600">•</span>
              <span>{data?.comic_label || "Leo's Quest"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0B132B] border border-emerald-500/40 text-emerald-400 font-mono font-bold text-xs">
              <CheckCircle2 size={16} />
              <span>{totalCount} / {totalCount} PANELS LOCKED</span>
            </div>
            <button
              onClick={handleReadAloud}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0B132B] border border-slate-700 hover:border-sky-400 flex items-center justify-center text-slate-300 hover:text-sky-400 transition-colors ${isSpeaking ? 'text-sky-400 animate-pulse' : ''}`}
              title="Read aloud whole story"
            >
              <Volume2 size={18} />
            </button>
          </div>
        </header>

        {/* CELEBRATION HERO BANNER */}
        <section className="w-full flex items-center justify-between px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-[#0B132B] via-[#111C3D] to-[#0B132B] border border-emerald-500/40 shadow-xl shadow-emerald-500/10 relative overflow-hidden my-1 comic-hero-banner">
          <div className="flex items-center gap-4 sm:gap-5 relative z-10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg">
              <Trophy size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono text-xs font-bold uppercase tracking-wider">
                  Story Solved!
                </span>
                <span className="text-slate-400 text-xs font-mono hidden sm:inline">100% Sequence Accuracy</span>
              </div>
              <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight mt-0.5">
                Fantastic job, <span className="text-emerald-400">{pickedStudent ? pickedStudent.name : 'Class'}</span>!
              </h2>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 relative z-10 px-5 py-2 rounded-xl bg-[#0B132B]/80 border border-slate-800">
            {[...Array(5)].map((_, idx) => (
              <Star key={idx} size={22} className="text-amber-400 fill-amber-400 drop-shadow" />
            ))}
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="text-right">
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-400">Points Awarded</div>
              <div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-400">
                +{pointsAwardedRef.current > 0 ? pointsAwardedRef.current : 3} PTS
              </div>
            </div>
          </div>
        </section>

        {/* COMPLETE HORIZONTAL FILMSTRIP RUNWAY */}
        <main className="w-full flex-1 flex flex-col justify-center my-1 relative min-h-0">
          <div className="w-full flex items-center justify-between gap-2 sm:gap-3 px-1 py-1 overflow-x-auto">
            {sortedPanels.map((panel, idx) => (
              <React.Fragment key={panel.id}>
                <div className="flex-1 min-w-[140px] max-w-[260px] flex flex-col bg-[#0B132B] rounded-xl sm:rounded-2xl p-2 border-2 border-emerald-500/70 shadow-lg relative group comic-filmstrip-panel">
                  <div className="flex items-center justify-between px-1.5 py-0.5 mb-1">
                    <span className="font-mono font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      {idx === 0 ? 'START' : idx === sortedPanels.length - 1 ? 'FINALE' : `STEP 0${idx + 1}`}
                    </span>
                    <Check size={14} className="text-emerald-400" />
                  </div>

                  <div className="w-full aspect-[3/2] rounded-lg overflow-hidden relative border border-slate-700/60 bg-slate-950 flex items-center justify-center">
                    {panel.image_url ? (
                      <img
                        src={panel.image_url}
                        alt={`Comic Panel ${idx + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-3xl text-slate-600">📖</div>
                    )}
                    {panel.texts.length > 0 && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-1.5 pt-3">
                        <p className="text-[11px] sm:text-xs font-bold text-white text-center leading-tight truncate">
                          “{panel.texts[0]}”
                        </p>
                      </div>
                    )}
                  </div>

                  {panel.narration && (
                    <div className="mt-1 text-center truncate">
                      <span className="text-[10px] font-mono text-amber-300 italic">{panel.narration}</span>
                    </div>
                  )}
                </div>

                {idx < sortedPanels.length - 1 && (
                  <div className="hidden sm:flex flex-col items-center justify-center flex-none px-0.5">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 text-xs">
                      <ArrowRight size={14} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </main>

        {/* WHOLE-CLASS ORAL CHANT RECAP */}
        <section className="w-full px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-[#0B132B] border border-slate-800 flex items-center justify-between gap-4 my-1 comic-story-recap">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Sparkles size={18} />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold block">Whole-Class Oral Chant</span>
              <span className="text-xs font-bold text-white">The Complete Story:</span>
            </div>
          </div>

          <div className="flex-1 text-center bg-[#111C3D]/80 px-4 py-1.5 rounded-xl border border-slate-700/60 overflow-hidden">
            <p className="font-display text-sm sm:text-base lg:text-lg font-bold tracking-tight text-white leading-snug truncate">
              {sortedPanels.map((p, i) => {
                const prefix = i === 0 ? 'First, ' : i === sortedPanels.length - 1 ? 'Finally, ' : 'Then, ';
                const line = p.narration || p.texts.join(' ') || `Step ${i + 1}`;
                return `${prefix}${line} `;
              })}
            </p>
          </div>

          <button
            onClick={handleReadAloud}
            className="px-3 py-1.5 rounded-xl bg-[#111C3D] hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1.5 text-xs font-mono font-bold transition-colors"
          >
            <Volume2 size={15} className="text-sky-400" />
            <span>PLAY AUDIO</span>
          </button>
        </section>

        {/* BOTTOM ACTION BAR */}
        <footer className="w-full flex items-center justify-between h-12 relative z-20 pt-1 flex-none">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Lightbulb size={16} className="text-amber-400" />
            <span>Choral-read the story as a class before proceeding.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setComplete(false); deal(); }}
              className="px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-[#111C3D] border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <RefreshCw size={14} />
              <span>Replay Story</span>
            </button>
            <button
              onClick={() => { setComplete(false); triggerAction('SLIDE_COMPLETE', { forced: true }); }}
              className="px-6 py-2 rounded-xl bg-[#FF2E79] hover:bg-[#ff1667] text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-pink-500/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <span>NEXT CHAPTER</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ── Main Gameplay (Screens 1 & 2 / 1-rebuild.html) ───────────────────────
  return (
    <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-3 sm:p-5 lg:p-6 select-none relative overflow-hidden font-sans comic-stage-root">
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(56, 189, 248, 0.85); box-shadow: 0 0 24px rgba(56, 189, 248, 0.4); }
          50% { border-color: rgba(56, 189, 248, 0.35); box-shadow: 0 0 10px rgba(56, 189, 248, 0.15); }
        }
        .pulse-target {
          animation: pulse-border 2.2s infinite ease-in-out;
        }
        @media (max-height: 450px) {
          .comic-stage-root { padding: 0.35rem !important; }
          .comic-header { height: 2rem !important; margin-bottom: 0.15rem !important; }
          .comic-runway-container { padding: 0.2rem 0 !important; }
          .comic-tray-container { height: 6.5rem !important; padding: 0.25rem !important; }
          .comic-slot-card { padding: 0.25rem !important; }
          .comic-story-text { font-size: 0.65rem !important; line-height: 0.8rem !important; }
          .comic-tray-card { width: 8.5rem !important; min-width: 8.5rem !important; padding: 0.25rem !important; }
        }
      `}</style>

      {/* TOP HEADER */}
      <header className="h-12 sm:h-14 flex-none flex items-center justify-between px-2 sm:px-4 border-b border-slate-800/80 bg-[#070C18]/95 z-20 comic-header">
        {/* Left: Overscan clearance + Phase badge */}
        <div className="flex items-center gap-3 pl-28 lg:pl-44">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest font-bold bg-sky-500/10 border border-sky-400/40 text-sky-400 shadow-lg shadow-sky-500/10">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
            PHASE: STORY REBUILD
          </span>
          <div className="hidden xl:flex items-center gap-2 text-slate-400 font-mono text-xs">
            <span className="text-slate-700">|</span>
            <span className="text-white font-bold tracking-tight">REBUILD THE STORY</span>
            {data?.comic_label && <span className="text-slate-400 font-normal">· {data.comic_label}</span>}
          </div>
        </div>

        {/* Center: Segmented narrative progress */}
        <div className="flex items-center gap-3 bg-[#0B132B] border border-slate-800 px-3 sm:px-4 py-1.5 rounded-full">
          <span className="text-xs font-mono font-bold tracking-wider text-slate-300 mr-1">
            {placedCount} OF {totalCount} PLACED
          </span>
          <div className="flex items-center gap-1.5">
            {panels.map((_, idx) => {
              const isPlaced = slots[idx] !== null;
              const isCurrent = idx === activeDropIndex;
              return (
                <div
                  key={idx}
                  className={`w-4 sm:w-5 h-2 rounded-sm transition-all ${
                    isPlaced
                      ? 'bg-emerald-400 shadow-md shadow-emerald-500/40'
                      : isCurrent
                      ? 'bg-sky-400 animate-pulse'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Right: Roster context + Audio + Primary CTA */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#0B132B] border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{pickedStudent ? `${pickedStudent.name}'s turn` : 'Choral Class Mode'}</span>
          </div>

          <button
            onClick={handleReadAloud}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#0B132B] border border-slate-700 hover:border-sky-400 flex items-center justify-center text-slate-300 hover:text-sky-400 transition-colors ${isSpeaking ? 'text-sky-400 animate-pulse' : ''}`}
            title="Read Aloud Story"
          >
            <Volume2 size={16} />
          </button>

          <button
            onClick={checkOrder}
            disabled={!allFilled || outcome !== null}
            aria-label="Check Answer"
            className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-xs sm:text-sm tracking-wide shadow-lg transition-all flex items-center gap-2 ${
              allFilled && !outcome
                ? 'bg-[#FF2E79] hover:bg-[#ff1667] text-white shadow-pink-500/30 hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            <span>Check Answer</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      {/* STORY SEQUENCE RUNWAY (Center stage) */}
      <main className="flex-1 px-2 sm:px-6 py-2 sm:py-3 flex flex-col justify-center min-h-0 comic-runway-container">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-sky-400 uppercase">
              STORY SEQUENCE RUNWAY
            </span>
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
              · Chronological order (1 to {totalCount}) across the story
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest hidden md:inline">
            Widescreen 3:2 Classroom Ratio
          </span>
        </div>

        {/* Dynamic Horizontal Grid for Target Slots */}
        <div className={`grid gap-2.5 sm:gap-3.5 items-stretch w-full mx-auto ${
          totalCount <= 3 ? 'grid-cols-3 max-w-4xl' :
          totalCount === 4 ? 'grid-cols-4 max-w-5xl' :
          totalCount === 5 ? 'grid-cols-5 max-w-6xl' :
          'grid-cols-6 max-w-7xl'
        }`}>
          {slots.map((slot, idx) => {
            const isPlaced = slot !== null;
            const isActiveTarget = !isPlaced && idx === activeDropIndex;
            const isLockedEmpty = !isPlaced && idx > activeDropIndex;

            // Slot state border styling
            let borderClass = 'border-2 border-dashed border-slate-800 bg-[#060a14]/60 opacity-60';
            if (isPlaced) {
              if (outcome === 'correct') {
                borderClass = 'border-2 border-emerald-400 ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20';
              } else if (outcome === 'partial') {
                borderClass = slot.order === idx
                  ? 'border-2 border-emerald-400 ring-2 ring-emerald-400'
                  : 'border-2 border-amber-400 ring-2 ring-amber-400';
              } else if (misplacedHint === idx) {
                borderClass = 'border-2 border-rose-500 ring-4 ring-rose-500 animate-pulse';
              } else {
                borderClass = 'border-2 border-emerald-500/70 shadow-lg hover:border-emerald-400';
              }
            } else if (isActiveTarget) {
              borderClass = 'border-2 border-dashed border-sky-400 pulse-target bg-[#07132e]/90 shadow-lg shadow-sky-500/20';
            }

            return (
              <div
                key={idx}
                onClick={() => handleSlotClick(idx)}
                className={`bg-[#0B132B] rounded-xl p-2 flex flex-col justify-between relative group transition-all comic-slot-card ${borderClass} ${
                  isPlaced && !outcome ? 'cursor-pointer' : ''
                }`}
              >
                {/* Slot Header */}
                <div className="flex items-center justify-between mb-1 px-1">
                  <span className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    isPlaced
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                      : isActiveTarget
                      ? 'text-sky-400 bg-sky-500/20 border-sky-400/40 animate-pulse'
                      : 'text-slate-500 bg-slate-900 border-slate-800'
                  }`}>
                    0{idx + 1} · {idx === 0 ? 'START' : idx === totalCount - 1 ? 'FINALE' : `STEP 0${idx + 1}`}
                  </span>
                  <span className={`text-[9px] sm:text-[10px] font-mono font-bold uppercase ${
                    isPlaced ? 'text-emerald-400 flex items-center gap-1' :
                    isActiveTarget ? 'text-sky-400' : 'text-slate-600'
                  }`}>
                    {isPlaced ? (
                      <>
                        <Check size={12} />
                        LOCKED
                      </>
                    ) : isActiveTarget ? (
                      'READY'
                    ) : (
                      'LOCKED'
                    )}
                  </span>
                </div>

                {/* Slot Content */}
                {isPlaced ? (
                  <div className="relative aspect-[3/2] w-full rounded-lg overflow-hidden border border-slate-700/60 bg-slate-950 flex flex-col justify-between">
                    {slot.image_url ? (
                      <img
                        src={slot.image_url}
                        alt={`Slot ${idx + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl text-slate-600">
                        📖
                      </div>
                    )}

                    {/* Revealed Narration & Dialogue Overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-1 sm:p-1.5 pt-2">
                      {slot.narration && (
                        <p className="text-[10px] sm:text-[11px] italic text-amber-300 font-semibold leading-tight truncate">
                          {slot.narration}
                        </p>
                      )}
                      {slot.texts.map((t, tIdx) => (
                        <p key={tIdx} className="text-[11px] sm:text-xs font-bold text-white leading-tight truncate">
                          “{t}”
                        </p>
                      ))}
                    </div>
                  </div>
                ) : isActiveTarget ? (
                  <div className="relative aspect-[3/2] w-full rounded-lg border-2 border-dashed border-sky-400/50 bg-[#07132e]/90 flex flex-col items-center justify-center p-2 text-center">
                    <div className="w-8 h-8 rounded-full bg-sky-400/20 border border-sky-400/50 flex items-center justify-center text-sky-400 mb-1">
                      <Plus size={18} className="animate-bounce" />
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold text-sky-200 uppercase tracking-wide">
                      DROP PANEL 0{idx + 1}
                    </span>
                    <span className="text-[9px] text-sky-400 font-mono mt-0.5">Select from tray below</span>
                  </div>
                ) : (
                  <div className="relative aspect-[3/2] w-full rounded-lg border border-slate-800 bg-[#060a14] flex flex-col items-center justify-center text-slate-600">
                    <Lock size={20} className="mb-1 text-slate-700" />
                    <span className="text-[9px] font-mono tracking-wider uppercase text-slate-600">
                      Unlocks after slot 0{idx}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* SHUFFLED COMIC PANEL TRAY (Bottom stage) */}
      <section className="h-56 sm:h-64 flex-none px-3 sm:px-6 py-2.5 bg-[#0B132B]/95 border-t border-slate-800 flex flex-col justify-between comic-tray-container">
        {/* Tray Header & Classroom Guidance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs font-mono font-bold tracking-widest text-slate-200 uppercase flex items-center gap-1.5">
              <BookOpen size={14} className="text-sky-400" />
              COMIC PANEL TRAY (SELECT FOR ACTIVE SLOT 0{activeDropIndex + 1 || totalCount})
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <span>💡</span>
              <span>Observe characters and sequence before choosing!</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSlots(new Array(panels.length).fill(null)); setTray(seededShuffle(panels, makeRng(seedBase, state.currentTurnId ?? 'choral', 'comic-panels'))); }}
              className="px-3 py-1 rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Reset Runway
            </button>
            <button
              onClick={deal}
              className="px-3 py-1 rounded text-xs font-mono text-sky-400 hover:bg-sky-400/10 border border-sky-400/30 transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} />
              <span>Shuffle Tray</span>
            </button>
          </div>
        </div>

        {/* Candidate Cards Horizontal Row */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 py-1 overflow-x-auto">
          {tray.map((panel, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const isHinted = candidateHint === panel.id;

            return (
              <button
                key={panel.id}
                onClick={() => handleTrayClick(panel)}
                title="Place this panel in the next slot"
                className={`comic-tray-card w-40 sm:w-52 md:w-60 min-w-40 bg-[#111C3D] rounded-xl p-2 transition-all cursor-pointer text-left relative group border-2 ${
                  isHinted
                    ? 'border-sky-400 ring-4 ring-sky-400/60 shadow-lg shadow-sky-500/40 -translate-y-2'
                    : 'border-slate-700 hover:border-sky-400 hover:-translate-y-1 shadow-md hover:shadow-sky-500/20'
                }`}
              >
                {/* Candidate letter stamp */}
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-300 tracking-wide flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    CANDIDATE {letter}
                  </span>
                  <span className="text-[9px] font-mono uppercase text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded font-bold">
                    TAP TO PLACE
                  </span>
                </div>

                {/* 3:2 Landscape Image Container — ART ONLY per owner decision */}
                <div className="aspect-[3/2] w-full rounded-lg overflow-hidden border border-slate-700 relative bg-slate-950 flex items-center justify-center">
                  {panel.image_url ? (
                    <img
                      src={panel.image_url}
                      alt={`Candidate ${letter}`}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="text-2xl text-slate-600">📖</div>
                  )}
                </div>
              </button>
            );
          })}

          {tray.length === 0 && !outcome && (
            <div className="text-sky-300 font-mono font-bold text-sm animate-pulse self-center">
              All panels placed! Tap “Check Answer” to verify order.
            </div>
          )}

          {outcome && (
            <div className={`flex items-center gap-2 font-bold text-xl sm:text-2xl animate-bounce self-center ${
              outcome === 'correct' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              <Check size={28} />
              <span>
                {outcome === 'correct'
                  ? (pickedStudent ? `${pickedStudent.name} rebuilt the story!` : 'Perfect story order!')
                  : (pickedStudent ? `So close, ${pickedStudent.name}!` : 'Almost right!')}
              </span>
            </div>
          )}
        </div>

        {/* Tray Footer note */}
        <div className="text-center text-[10px] sm:text-[11px] font-mono text-slate-500 pb-0.5">
          Sequencing Rule: Order panels 1 to {totalCount} in book sequence. Tap any placed panel to return it to the tray.
        </div>
      </section>
    </div>
  );
};

export default BoardComicPanels;

