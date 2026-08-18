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
import { getVocabulary, getStory } from '../../../services/manifest';
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
        return <span key={i} className="font-bold text-amber-300 underline decoration-amber-500/50 decoration-2 underline-offset-4">{tok}</span>;
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
                {characters.map((c: any, i: number) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
                      style={{ border: `3px solid ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}`, background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20` }}>
                      {c.emoji || c.name?.charAt(0) || '👤'}
                    </div>
                    <span className="font-display text-sm font-bold text-slate-300">{c.name}</span>
                  </div>
                ))}
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6">
              <span className="text-sm text-amber-400/40">👆 Teacher: tap Next to begin · 点击下一步开始</span>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ STORY PAGE (full-bleed scene + floating dialogue) ═══ */}
        {isPage && current && (
          <motion.div key={`page-${activePanel}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0">
            <div className="absolute inset-0">
              {current.imageUrl ? (
                <img src={current.imageUrl} className="w-full h-full object-cover" alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              ) : (
                <div className="w-full h-full" style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }} />
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to top, rgba(20,14,8,.92), rgba(20,14,8,.5) 60%, transparent)' }} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
              <div className="max-w-3xl mx-auto flex items-end gap-4">
                {currentSpeaker && (
                  <div className="flex flex-col items-center shrink-0 -mb-2">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-xl"
                      style={{ background: `${getCharColor(current.speaker)}25`, border: `2px solid ${getCharColor(current.speaker)}` }}>
                      {currentSpeaker.emoji || currentSpeaker.name?.charAt(0) || '👤'}
                    </div>
                    <span className="font-display text-xs font-bold mt-1" style={{ color: getCharColor(current.speaker) }}>
                      {current.speaker || currentSpeaker.name}
                    </span>
                  </div>
                )}
                <div className="flex-1 backdrop-blur-md rounded-2xl px-6 py-4" style={{ background: 'rgba(36,26,16,.7)', borderLeft: `3px solid ${getCharColor(current.speaker)}` }}>
                  <p className="font-display text-3xl font-bold text-amber-50 leading-snug">
                    "{renderText(current.text || '')}"
                  </p>
                  <button onClick={() => playAudioUrl(current.audio, current.text)} className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-amber-300/70 active:scale-95">
                    <Volume2 size={16} /> Read Page
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {pages.map((_: any, i: number) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === activePanel ? 'bg-amber-400 scale-150' : i < activePanel ? 'bg-amber-600' : 'bg-white/20'}`} />
              ))}
            </div>
            {activePanel < totalContentPanels - 1 && pages[activePanel + 1] && (
              <div className="absolute top-4 right-4 max-w-[200px] opacity-40">
                <p className="text-xs text-amber-400/50 uppercase tracking-widest mb-1">Next…</p>
                <p className="text-sm text-slate-400 italic truncate">{pages[activePanel + 1].text || '...'}</p>
              </div>
            )}
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
