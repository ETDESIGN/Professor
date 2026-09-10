// BoardStoryStage v2 — storybook read-through + scored comprehension closer
// (OUTPUT phase).
//
// Rewritten per storystage-dialoguestage-v2-spec §1:
//   • Keep the existing storybook read-through (hook → pages, unchanged).
//   • After the last page, present STORY_COMPREHENSION pool items sequentially
//     as scored MCQs, picked-student-answered via teacher relay.
//   • Use the corrected shape: { prompt, options: string[], correct_index,
//     story_page_id? } — index-based comparison, NOT string equality.
//   • Coordinate with StorySequencing over the shared item pool via a
//     session-scoped askedComprehensionItems Map (module-level singleton).
//   • Standard lifecycle, dual-write, SLIDE_COMPLETE after last question.
//   • Empty-state: if no remaining STORY_COMPREHENSION items, end after the
//     read-through (a story read without a check is still complete).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, Check } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary, getStory, getCharacters } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { useBoardPool } from '../useBoardPool';
import { logAttempt } from './scoreAttempt';
import { supabase } from '../../../services/supabaseClient';
import type { PoolItem } from '../../../types/exercise';

// ── Session-scoped coordination with BoardStorySequencing ──────────────
// Whichever of the two shells runs first in a lesson claims items; the second
// automatically avoids repeats. Module-level singleton — both templates share
// the same JS bundle in the board React root.
const askedComprehensionItems = new Map<string, Set<string>>();

/** Mark pool items as asked (called after presenting a question). */
export function markComprehensionAsked(objectiveId: string, itemIds: string[]) {
  const set = askedComprehensionItems.get(objectiveId) ?? new Set<string>();
  for (const id of itemIds) set.add(id);
  askedComprehensionItems.set(objectiveId, set);
}

/** Get pool items not yet asked in this session. */
export function getUnaskedComprehension(allItems: PoolItem[]): PoolItem[] {
  return allItems.filter(i => {
    const asked = askedComprehensionItems.get(i.objective_id);
    return !asked || !asked.has(i.id);
  });
}

/** Clear the session-scoped asked-set (called by endSession on session end). */
export function resetAskedComprehensionItems(): void {
  askedComprehensionItems.clear();
}

// ── Constants ──────────────────────────────────────────────────────────
const MAX_COMPREHENSION_QUESTIONS = 4;
const FALLBACK_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#EC4899'];

// ── Component ──────────────────────────────────────────────────────────
const BoardStoryStage = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Story objective lookup (same pattern as StorySequencing B1 fix) ──
  const [storyObjectiveId, setStoryObjectiveId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setStoryObjectiveId(null); return; }
    (async () => {
      const { data: rows, error } = await supabase
        .from('objectives').select('id').eq('unit_id', unitId).eq('type', 'story').limit(1);
      if (cancelled) return;
      setStoryObjectiveId(!error && rows?.length > 0 ? String(rows[0].id) : null);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // ── Pool: STORY_COMPREHENSION items ──────────────────────────────────
  const { items: poolItems, loading: poolLoading } = useBoardPool({
    unitId, exerciseTypes: ['STORY_COMPREHENSION'], classWeak: true, roster, limit: 20,
  });

  const comprehensionItems = useMemo(() => {
    const unasked = getUnaskedComprehension(poolItems);
    const seen = new Set<string>();
    const out: PoolItem[] = [];
    for (const it of unasked) {
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

  // ── Story pages (relational first, frozen fallback) ──────────────────
  const relPages = useMemo(() => getStory(state.activeUnit?.manifest).pages || [], [state.activeUnit?.manifest]);
  const pages = (relPages.length > 0 ? relPages : data.pages) || [];
  const characters = data.characters || [];

  // ── Character portraits (live bundle first, frozen plan fallback) ────
  // getCharacters prefers the relational bundle (unit_characters rows with
  // image_url resolved by get_unit_bundle); frozen plan entries gain
  // image_url/imageUrl as plans are re-published.
  const liveChars = useMemo(() => getCharacters(state.activeUnit?.manifest) || [], [state.activeUnit?.manifest]);
  const charByName = useMemo(() => new Map(liveChars.map((c: any) => [String(c.name || '').toLowerCase(), c])), [liveChars]);
  const portraitOf = (c: any, name?: string) => {
    const live = charByName.get(String(name || c?.name || '').toLowerCase());
    return live?.image_url || c?.imageUrl || c?.image_url || null;
  };

  // ── Vocab for highlighting target words ──────────────────────────────
  const vocab = useMemo(() => getVocabulary(state.activeUnit?.manifest), [state.activeUnit?.manifest]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // ── Stage tracking ───────────────────────────────────────────────────
  // -1 = hook, 0..N-1 = pages, N = "The End" card, N+1..N+Q = comprehension, done
  const [activePanel, setActivePanel] = useState(-1);
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);
  const [slideDone, setSlideDone] = useState(false);
  // 2nd-miss comprehension reveal: correct option amber-ringed + explanation.
  const [revealedAnswer, setRevealedAnswer] = useState(false);

  // ── Lifecycle refs (the 4 must-dos) ──────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  // Consecutive-correct streak across comprehension questions (4th
  // scoreForAttempt arg; resets on a miss or a new turn).
  const streakRef = useRef(0);

  const totalContentPanels = pages.length;
  const hasComprehension = comprehensionItems.length > 0;
  const endCardPanel = totalContentPanels; // index of "The End" card

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((opts: {
    correctness: 'correct' | 'incorrect' | 'partial';
    points: number;
    objectiveId: string | null;
    exerciseType: string;
    difficulty: number;
    passed: boolean;
  }) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    if (opts.points !== 0) addPoints(picked, opts.points);
    // FIXPLAN P3.3 — unified triple-write: previously analytics + remediation
    // only; the FSRS grade was silently missing for real story objectives.
    logAttempt({
      state, picked, unitId,
      objectiveId: opts.objectiveId ?? undefined,
      exerciseType: opts.exerciseType,
      difficulty: opts.difficulty,
      correctness: opts.correctness,
      correct: opts.passed,
      modality: 'receptive',
      pushToRemediation,
    });
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── Question advancement ─────────────────────────────────────────────
  const advanceQuestion = useCallback((idx: number) => {
    // Mark the current question as asked for coordination
    const currentItem = comprehensionItems[idx];
    if (currentItem) {
      markComprehensionAsked(currentItem.objective_id, [currentItem.id]);
    }
    if (idx + 1 >= comprehensionItems.length) {
      playCue('win');
      setSlideDone(true);
      setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 2000);
    } else {
      setQIndex(idx + 1);
      setSelectedOption(null);
      setEliminatedOptions([]);
      setRevealedAnswer(false);
      mistakesRef.current = 0;
      awardedRef.current = false;
    }
  }, [comprehensionItems, triggerAction]);

  // ── Comprehension MCQ handler ────────────────────────────────────────
  const handleOptionTap = useCallback((optIndex: number) => {
    const item = comprehensionItems[qIndex];
    if (!item || selectedOption !== null) return;
    const c = item.content as any;
    const correctIndex = Number(c.correct_index);
    setSelectedOption(optIndex);
    const objectiveId = item.objective_id || storyObjectiveId;
    const correct = optIndex === correctIndex;

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
      doDualWrite({
        correctness: 'correct', points, objectiveId,
        exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: true,
      });
      // Pure celebration — ≤900ms (dead-time rule).
      setTimeout(() => advanceQuestion(qIndex), 900);
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      doDualWrite({
        correctness: 'incorrect', points: -MISTAKE_PENALTY, objectiveId,
        exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: false,
      });
      // Standard MCQ hint: eliminate one distractor on 1st miss
      setEliminatedOptions(prev => {
        const next = prev.includes(optIndex) ? prev : [...prev, optIndex];
        if (mistakesRef.current === 1) {
          const extra = Array.from({ length: c.options.length }, (_, i) => i)
            .find(i => i !== correctIndex && !next.includes(i));
          return extra !== undefined ? [...next, extra] : next;
        }
        return next;
      });
      if (mistakesRef.current >= 2) {
        // 2nd miss → teaching reveal: correct option amber-ringed + the
        // explanation when the content carries one (the correct option shown
        // prominently otherwise), ~2.2s hold, then advance.
        playCue('reveal');
        setRevealedAnswer(true);
        setTimeout(() => {
          setRevealedAnswer(false);
          advanceQuestion(qIndex);
        }, 2200);
      } else {
        // 1st miss: retry with the distractor eliminated.
        playCue('wrong');
        setTimeout(() => setSelectedOption(null), 900);
      }
    }
  }, [comprehensionItems, qIndex, selectedOption, storyObjectiveId, doDualWrite, advanceQuestion, showAlreadyScored, triggerConfetti]);

  // ── Remote/commander action listener ─────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    switch (a.type) {
      case 'NEXT_PANEL':
      case 'NEXT_CARD':
        setActivePanel(p => {
          if (p < totalContentPanels) return p + 1;
          if (p === totalContentPanels && hasComprehension) return p + 1; // → comprehension
          return p;
        });
        break;
      case 'PREV_PANEL':
      case 'PREV_CARD':
        setActivePanel(p => Math.max(p - 1, -1));
        break;
      case 'RESET_GAME':
        setActivePanel(-1);
        setQIndex(0);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealedAnswer(false);
        setSlideDone(false);
        mistakesRef.current = 0;
        awardedRef.current = false;
        streakRef.current = 0;
        break;
      case 'REVEAL_HINT':
        if (selectedOption !== null || !hasComprehension) break;
        {
          const item = comprehensionItems[qIndex];
          if (item) {
            const c = item.content as any;
            const correctIndex = Number(c.correct_index);
            setEliminatedOptions(prev => {
              const idx = Array.from({ length: c.options.length }, (_, i) => i)
                .find(i => i !== correctIndex && !prev.includes(i));
              return idx === undefined ? prev : [...prev, idx];
            });
          }
        }
        break;
      case 'MARK_CORRECT':
        if (awardedRef.current) { showAlreadyScored(); break; }
        awardedRef.current = true;
        {
          const item = comprehensionItems[qIndex];
          if (item) {
            playCue('correct');
            streakRef.current += 1;
            if (streakRef.current === 3 || streakRef.current === 5) {
              playCue('streak');
              triggerConfetti();
            }
            const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
            doDualWrite({
              correctness: 'correct', points,
              objectiveId: item.objective_id || storyObjectiveId,
              exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: true,
            });
            // Pure celebration — ≤900ms (dead-time rule).
            setTimeout(() => advanceQuestion(qIndex), 900);
          }
        }
        break;
      case 'SKIP_ROUND':
        advanceQuestion(qIndex);
        break;
      case 'NEXT_ROUND':
        advanceQuestion(qIndex);
        break;
      case 'SLIDE_COMPLETE':
        setSlideDone(true);
        break;
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  // ── Game-lifecycle: new turn → fresh refs ────────────────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // Auto-dismiss the terminal celebration after 6s. SLIDE_COMPLETE already
  // broadcast (see handleAction / advanceQuestion), so this is purely visual.
  useEffect(() => {
    if (!slideDone) return;
    const t = setTimeout(() => setSlideDone(false), 6000);
    return () => clearTimeout(t);
  }, [slideDone]);

  // Local panel nav (same rules as the NEXT_PANEL/PREV_PANEL remote cases)
  const nextPanel = () => setActivePanel(p => {
    if (p < totalContentPanels) return p + 1;
    if (p === totalContentPanels && hasComprehension) return p + 1;
    return p;
  });
  const prevPanel = () => setActivePanel(p => Math.max(p - 1, -1));

  // ── Character color lookup ───────────────────────────────────────────
  const getCharColor = (name: string) => {
    const idx = characters.findIndex((c: any) => c.name === name);
    if (idx >= 0 && characters[idx]?.color) return characters[idx].color;
    return FALLBACK_COLORS[idx >= 0 ? idx % FALLBACK_COLORS.length : 0];
  };

  // ── Render target words highlighted in dialogue ──────────────────────
  const renderText = (text: string) =>
    (text || '').split(/(\s+)/).map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return <span key={i} className="font-bold text-emerald-400 underline decoration-emerald-400/50 underline-offset-8">{tok}</span>;
      }
      return <span key={i}>{tok}</span>;
    });

  // ── Empty state ──────────────────────────────────────────────────────
  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <BookOpen size={56} className="text-amber-600/40 mb-3" />
        <p className="font-display text-3xl font-bold">Story Stage</p>
        <p className="text-lg mt-2">No story pages for this unit.</p>
      </div>
    );
  }

  const isHook = activePanel === -1;
  const isPage = activePanel >= 0 && activePanel < totalContentPanels;
  const isEndCard = activePanel === endCardPanel;
  const isComprehension = activePanel > endCardPanel && !slideDone;
  const current = isPage ? pages[activePanel] : null;
  const currentSpeaker = current ? (characters.find((c: any) => c.name === current.speaker) || characters[0]) : null;
  const speakerPortrait = currentSpeaker ? portraitOf(currentSpeaker, current.speaker || currentSpeaker.name) : null;
  const currentQuestion = isComprehension ? comprehensionItems[qIndex] : null;

  return (
    <div className="h-full relative overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ═══ STORY HOOK (title card, panel -1) ═══ */}
        {isHook && (
          <motion.div key="hook" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }}
          >
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} transition={{ delay: 0.2 }} className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <h1 className="font-display text-6xl font-black text-amber-300 mb-2" style={{ textShadow: '0 4px 20px rgba(217,119,6,.3)' }}>
                {data.title || 'Story'}
              </h1>
              {data.setting && <p className="font-cn text-xl text-amber-400/50 mb-6">{data.setting}</p>}
            </motion.div>
            {characters.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex gap-6">
                {characters.map((c: any, i: number) => {
                  const portrait = portraitOf(c);
                  return (
                    <div key={i} className="flex flex-col items-center">
                      {portrait ? (
                        <img src={portrait} alt={c.name} className="w-16 h-16 rounded-full object-cover mb-1" />
                      ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
                          style={{ border: `3px solid ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}`, background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20` }}>
                          {c.emoji || c.name?.charAt(0) || '👤'}
                        </div>
                      )}
                      <span className="font-display text-sm font-bold text-slate-300">{c.name}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6">
              <span className="text-sm text-amber-400/40">👆 Teacher: tap Next to begin · 点击下一步开始</span>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ STORY PAGE — Reading Theater per stitch/07-story-stage/1-reading-theater
              (owner-directed two-column: 38% dialogue panel / 62% uncropped art) ═══ */}
        {isPage && current && (
          <motion.div key={`page-${activePanel}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col p-2 lg:p-6 bg-[#070C18] ss-grid">
            <style>{`
              .ss-grid { background-size: 36px 36px; background-image: linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px); }
              .ss-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
              .ss-glow { text-shadow: 0 2px 14px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.12); }
            `}</style>

            {/* Header — the design's title cluster; starts clear of BoardShell's phase pill */}
            <header className="w-full flex items-center justify-between gap-3 pl-40 lg:pl-48 pr-1 h-10 lg:h-12 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-[#FF2E79] flex items-center justify-center font-bold text-white text-base lg:text-xl shadow-[0_0_16px_rgba(255,46,121,0.5)] shrink-0">S</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-bold text-lg lg:text-2xl tracking-wide text-white truncate">Story Stage</h1>
                    <span className="px-2 py-0.5 rounded bg-[#16234D] border border-white/10 ss-mono text-[10px] lg:text-[11px] font-bold text-slate-300 shrink-0">READING THEATER</span>
                  </div>
                  <p className="ss-mono text-[9px] lg:text-[10px] text-slate-400 tracking-wider truncate uppercase">{data.title || 'Story'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B132B] border border-white/10">
                  <span className="ss-mono text-[10px] lg:text-xs text-slate-300">
                    {pickedStudent ? <>{pickedStudent.name}: <strong className="text-white">read this line</strong></> : <>Chorus: <strong className="text-white">repeat together</strong></>}
                  </span>
                </div>
              </div>
            </header>

            {/* MAIN — two-column 38/62 */}
            <main className="w-full flex-1 min-h-0 flex flex-col sm:flex-row gap-2 lg:gap-6 lg:my-4">
              {/* LEFT 38%: reading theater */}
              <section className="sm:w-[38%] flex flex-col justify-between bg-[#0B132B] border border-white/10 rounded-2xl p-3 lg:p-7 shadow-2xl overflow-hidden min-h-0">
                {/* Speaker identity */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 lg:pb-5 gap-2">
                  <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 lg:w-16 lg:h-16 rounded-full p-0.5 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
                        style={{ background: `linear-gradient(to top right, ${getCharColor(current.speaker)}, #F59E0B)` }}>
                        <div className="w-full h-full rounded-full bg-[#111C3D] flex items-center justify-center overflow-hidden border-2 border-[#070C18]">
                          {speakerPortrait ? (
                            <img src={speakerPortrait} alt={currentSpeaker?.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl lg:text-3xl">{currentSpeaker?.emoji || currentSpeaker?.name?.charAt(0) || '👤'}</span>
                          )}
                        </div>
                      </div>
                      <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 lg:h-4 lg:w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 lg:h-4 lg:w-4 bg-emerald-500 border-2 border-[#070C18]" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="ss-mono text-[9px] lg:text-xs uppercase tracking-widest text-slate-400 font-semibold block leading-tight">SPEAKING NOW</span>
                      <h2 className="font-bold text-lg lg:text-2xl xl:text-3xl tracking-wide truncate leading-tight"
                        style={{ color: getCharColor(current.speaker) }}>
                        {(current.speaker || currentSpeaker?.name || 'Narrator').toUpperCase()}
                      </h2>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 bg-[#111C3D] border border-white/10 rounded-lg shrink-0">
                    <span className="ss-mono text-[9px] lg:text-xs text-slate-300 font-bold">LINE {String(activePanel + 1).padStart(2, '0')} / {String(totalContentPanels).padStart(2, '0')}</span>
                  </div>
                </div>

                {/* Dialogue — the design's extra-large chant line */}
                <div className="flex-1 min-h-0 flex flex-col justify-center py-3 lg:py-6">
                  <div className="mb-2 lg:mb-3 flex items-center gap-2">
                    <span className="ss-mono text-[9px] lg:text-xs font-bold text-[#38BDF8] uppercase tracking-wider">Say it together</span>
                  </div>
                  <blockquote className="font-bold text-[22px] sm:text-[26px] lg:text-[36px] xl:text-[44px] leading-[1.18] text-white ss-glow tracking-tight">
                    &ldquo;{renderText(current.text || '')}&rdquo;
                  </blockquote>
                </div>

                {/* Replay + book-page progress strip (the design's chunky 28px dots) */}
                <div className="border-t border-white/10 pt-3 lg:pt-5 space-y-3 lg:space-y-5 shrink-0">
                  <button onClick={() => playAudioUrl(current.audio, current.text)}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 lg:py-3.5 px-4 rounded-xl bg-[#38BDF8]/15 border-2 border-[#38BDF8] text-[#38BDF8] font-bold text-sm lg:text-lg hover:bg-[#38BDF8] hover:text-[#070C18] transition-all shadow-[0_0_20px_rgba(56,189,248,0.22)] active:scale-[0.98]">
                    <Volume2 size={20} className="animate-pulse" />
                    <span>REPLAY AUDIO LINE</span>
                  </button>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="ss-mono text-[9px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider">STORY PROGRESS</span>
                      <span className="ss-mono text-[9px] lg:text-xs text-emerald-400 font-bold">{Math.round(((activePanel + 1) / totalContentPanels) * 100)}% COMPLETED</span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 p-2 lg:p-3 bg-[#111C3D] rounded-xl border border-white/5">
                      {pages.map((_: any, i: number) => (
                        <React.Fragment key={i}>
                          <div className={`flex items-center justify-center w-6 h-6 lg:w-7 lg:h-7 rounded-full ss-mono text-[10px] font-black shrink-0
                            ${i < activePanel ? 'bg-emerald-500 text-[#070C18] shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                              : i === activePanel ? 'bg-[#FF2E79] text-white shadow-[0_0_16px_rgba(255,46,121,0.6)] ring-4 ring-[#FF2E79]/25 animate-pulse'
                              : 'bg-[#0B132B] border border-white/20 text-slate-400 font-bold'}`}>
                            {i < activePanel ? '✓' : i + 1}
                          </div>
                          {i < pages.length - 1 && (
                            <div className={`flex-1 h-1 rounded-full ${i < activePanel ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT 62%: story art — UNCROPPED object-contain (owner rule) */}
              <section className="sm:w-[62%] flex-1 flex flex-col bg-[#0B132B] border border-white/10 rounded-2xl p-2 lg:p-6 shadow-2xl overflow-hidden min-h-0">
                <div className="flex items-center justify-between mb-2 lg:mb-4 px-1 shrink-0">
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-[#111C3D] rounded-lg border border-white/10">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="ss-mono text-[9px] lg:text-xs text-slate-300 font-bold uppercase">SCENE {String(activePanel + 1).padStart(2, '0')}</span>
                  </div>
                  <span className="ss-mono text-[9px] lg:text-xs text-slate-400 bg-[#111C3D] px-2.5 py-1 rounded-lg border border-white/10 hidden sm:block">UNCROPPED</span>
                </div>
                <div className="flex-1 min-h-0 w-full bg-[#111C3D] border-2 border-white/10 rounded-xl flex items-center justify-center p-1.5 lg:p-3 relative overflow-hidden shadow-inner group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-sky-500/10 pointer-events-none" />
                  {current.imageUrl ? (
                    <img src={current.imageUrl} alt=""
                      className="w-full h-full object-contain rounded-lg drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)]"
                      onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0')} />
                  ) : (
                    <div className="w-full h-full rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }}>
                      <span className="font-bold text-2xl lg:text-4xl text-amber-300/70">{data.title || 'Story'}</span>
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 lg:bottom-6 lg:right-6 px-2.5 py-1.5 bg-[#070C18]/85 backdrop-blur border border-white/15 rounded-lg shadow-lg pointer-events-none">
                    <span className="ss-mono text-[9px] lg:text-[11px] font-bold text-slate-200 uppercase tracking-wider">{data.title || 'Story Stage'}</span>
                  </div>
                </div>
              </section>
            </main>

            {/* Footer — the design's nav cluster (real prev/next) */}
            <footer className="w-full flex items-center justify-between gap-3 h-10 lg:h-12 shrink-0 border-t border-white/10 pt-2 lg:pt-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[#0B132B] rounded-lg border border-white/10 ss-mono text-[10px] text-slate-400">
                <span>←</span><span>Previous Line</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3 ml-auto">
                {activePanel > 0 && (
                  <button onClick={prevPanel}
                    className="px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-xl bg-[#0B132B] border border-white/15 text-slate-300 font-bold text-xs lg:text-sm hover:text-white hover:border-white/30 transition-all">
                    Back to Line {activePanel}
                  </button>
                )}
                <button onClick={nextPanel}
                  className="px-4 lg:px-7 py-1.5 lg:py-2.5 rounded-xl bg-[#FF2E79] text-white font-bold text-sm lg:text-base hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,46,121,0.45)] flex items-center gap-2">
                  <span>Next Line</span>
                  <span>→</span>
                </button>
              </div>
            </footer>
          </motion.div>
        )}

        {/* ═══ THE END CARD (transitions to comprehension or complete) ═══ */}
        {isEndCard && (
          <motion.div key="end-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(160deg, #2A1F10, #1A1208)' }}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
              <div className="text-5xl mb-4">📚</div>
            </motion.div>
            <h2 className="font-display text-5xl font-black text-amber-300 mb-2">The End</h2>
            <p className="font-cn text-2xl text-amber-400/50 mb-6">故事结束</p>
            {hasComprehension ? (
              <div className="px-6 py-3 rounded-full bg-amber-500/15 border border-amber-400/30">
                <span className="font-display text-lg font-bold text-amber-200">Comprehension Check →</span>
                <span className="font-cn text-sm text-amber-400/60 ml-2">理解检查</span>
              </div>
            ) : (
              <div className="px-6 py-3 rounded-full bg-amber-500/15 border border-amber-400/30">
                <span className="font-display text-lg font-bold text-amber-200">No comprehension questions available</span>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ COMPREHENSION MCQ ═══ */}
        {isComprehension && currentQuestion && (() => {
          const c = currentQuestion.content as any;
          const correctIndex = Number(c.correct_index);
          const resolved = selectedOption === correctIndex;
          return (
            <motion.div key={`comp-${qIndex}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ background: 'linear-gradient(160deg, #2A1F10, #1A1208)' }}>
              {/* Question header */}
              <div className="mb-4 flex items-center gap-3">
                <span className="bg-amber-500/20 text-amber-300 px-4 py-1 rounded-full text-sm font-bold">
                  Question {qIndex + 1} / {comprehensionItems.length}
                </span>
                {pickedStudent && (
                  <span className="bg-sky-500/20 text-sky-300 px-3 py-1 rounded-full text-sm font-bold">
                    {pickedStudent.name}
                  </span>
                )}
              </div>
              {/* Question prompt */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl px-10 py-6 max-w-3xl w-full mb-8 border border-amber-400/20">
                <p className="font-display text-3xl font-bold text-amber-50 text-center">{c.prompt}</p>
              </div>
              {/* Options */}
              <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
                {(c.options as string[]).map((opt, i) => {
                  const isCorrect = i === correctIndex;
                  const isSelected = selectedOption === i;
                  const isEliminated = eliminatedOptions.includes(i);
                  const showResult = selectedOption !== null;
                  return (
                    <button key={i} onClick={() => handleOptionTap(i)} disabled={isEliminated || (showResult && resolved)}
                      className={`px-6 py-4 rounded-2xl text-xl font-bold border-4 transition-all text-left
                        ${showResult && isCorrect ? 'bg-green-500/30 border-green-400 text-green-100'
                          : showResult && isSelected && !isCorrect ? 'bg-red-500/30 border-red-400 text-red-100 animate-shake'
                          : isEliminated ? 'bg-white/5 border-white/10 text-white/20 opacity-40 cursor-not-allowed'
                          : 'bg-white/10 border-white/20 text-amber-50 hover:border-amber-400 hover:-translate-y-1 shadow-md'}
                        ${revealedAnswer && isCorrect ? 'ring-4 ring-amber-400' : ''}`}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {/* Correct feedback */}
              {resolved && (
                <div className="mt-6 flex items-center gap-2 text-green-400 font-bold text-2xl animate-bounce">
                  <Check size={32} /> {pickedStudent ? `${pickedStudent.name} got it!` : 'Correct!'}
                </div>
              )}
              {/* 2nd-miss reveal: the correct option prominent + the
                  explanation when the content carries one. */}
              {revealedAnswer && (
                <div className="mt-6 bg-amber-500/15 border-2 border-amber-400/50 rounded-2xl px-8 py-4 text-center max-w-2xl">
                  <div className="text-xl font-bold text-amber-300">The answer: {c.options[correctIndex]}</div>
                  {c.explanation && <p className="text-amber-100/80 mt-1">{c.explanation}</p>}
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* ═══ SLIDE COMPLETE OVERLAY — click to dismiss ═══ */}
        {slideDone && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setSlideDone(false)}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center">
              <div className="w-32 h-32 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-6">
                <BookOpen size={60} />
              </div>
              <h2 className="text-5xl font-black text-slate-800 mb-2">
                {pickedStudent ? `Great reading, ${pickedStudent.name}!` : 'Great story, everyone!'}
              </h2>
              <p className="text-2xl text-slate-500 font-medium">Ready for the next slide.</p>
              <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

export default BoardStoryStage;
