// BoardDialogueStage v2 — read-along + role assignment + role-read +
// WHO_SAID_IT comprehension (OUTPUT phase).
//
// Rewritten per storystage-dialoguestage-v2-spec §2:
//   Three stages within one slide:
//     1. Read-along (existing, unscored, bilingual — surfaces lines[].translation)
//     2. Role assignment + role-read (new, scored via teacher 3-way rating)
//     3. WHO_SAID_IT comprehension (new, scored MCQ, binary)
//
//   Corrected content shapes (verified against types/exercise.ts):
//     DialogueRoleplayContent = { lines: { speaker, text, translation? }[], dialogue_index }
//       — NO top-level characters array. Derive via [...new Set(lines.map(l => l.speaker))].
//     WhoSaidItContent = { line_text, options: string[], correct_index, context_before?, context_after? }
//       — index-based comparison. Optionally surface context_before/after.
//
//   Choral/picked toggle: choral mode skips role assignment + rating entirely,
//     goes straight from read-along to comprehension.
//   No pronunciation, no STT anywhere. Both scoring paths are teacher-judged.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Volume2, Check, Users } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getDialogues } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { useBoardPool } from '../useBoardPool';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { supabase } from '../../../services/supabaseClient';
import type { PoolItem } from '../../../types/exercise';

// ── Constants ──────────────────────────────────────────────────────────
const SPEAKER_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#14B8A6'];
const MAX_WHO_SAID_IT = 4;

type Stage = 'title' | 'read_along' | 'role_assign' | 'role_read' | 'who_said_it' | 'complete';

// ── Helpers ────────────────────────────────────────────────────────────
function deriveCharacters(lines: { speaker: string }[]): string[] {
  return [...new Set(lines.map(l => l.speaker))];
}

// ── Component ──────────────────────────────────────────────────────────
const BoardDialogueStage = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Pool: DIALOGUE_ROLEPLAY + WHO_SAID_IT ────────────────────────────
  const { items: poolItems, loading: poolLoading } = useBoardPool({
    unitId, exerciseTypes: ['DIALOGUE_ROLEPLAY', 'WHO_SAID_IT'], classWeak: true, roster, limit: 20,
  });

  // Dialogue roleplay content (single item with all lines for a dialogue)
  const dialogueItem = useMemo(() => {
    return poolItems.find(it => it.exercise_type === 'DIALOGUE_ROLEPLAY') || null;
  }, [poolItems]);

  // WHO_SAID_IT comprehension items
  const whoSaidItItems = useMemo(() => {
    const seen = new Set<string>();
    const out: PoolItem[] = [];
    for (const it of poolItems) {
      if (it.exercise_type !== 'WHO_SAID_IT' || seen.has(it.id)) continue;
      const c = it.content as any;
      if (!c?.line_text || !Array.isArray(c.options) || c.options.length < 2) continue;
      if (typeof c.correct_index !== 'number') continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= MAX_WHO_SAID_IT) break;
    }
    return out;
  }, [poolItems]);

  // ── Lines: prefer pool DIALOGUE_ROLEPLAY, fall back to manifest ──────
  const lines: { speaker: string; text: string; translation?: string }[] = useMemo(() => {
    if (dialogueItem) {
      const c = dialogueItem.content as any;
      if (Array.isArray(c?.lines) && c.lines.length > 0) return c.lines;
    }
    if (Array.isArray(data?.lines) && data.lines.length > 0) return data.lines;
    return getDialogues(state.activeUnit?.manifest);
  }, [dialogueItem, data?.lines, state.activeUnit?.manifest]);

  // ── Characters derived from lines (NOT a separate field) ─────────────
  const characters = useMemo(() => deriveCharacters(lines), [lines]);

  // ── Dialogue objective lookup ────────────────────────────────────────
  const [dialogueObjectiveId, setDialogueObjectiveId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setDialogueObjectiveId(null); return; }
    (async () => {
      const { data: rows } = await supabase
        .from('objectives').select('id').eq('unit_id', unitId).eq('type', 'dialogue').limit(1);
      if (cancelled) return;
      setDialogueObjectiveId(rows?.length > 0 ? String(rows[0].id) : null);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // ── Stable per-speaker accent color ──────────────────────────────────
  const speakerIndex = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const l of lines) {
      const s = l?.speaker || 'Speaker';
      if (!m.has(s)) m.set(s, n++);
    }
    return m;
  }, [lines]);
  const colorFor = (speaker: string) => SPEAKER_COLORS[(speakerIndex.get(speaker) ?? 0) % SPEAKER_COLORS.length];

  // ── Stage state ──────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('title');
  const [activeLine, setActiveLine] = useState(-1); // for read-along navigation
  const [roleAssignments, setRoleAssignments] = useState<Record<string, { id: string; name: string }>>({});
  const [ratedCharacters, setRatedCharacters] = useState<Set<string>>(new Set());
  const [scoringMode, setScoringMode] = useState<'choral' | 'picked'>('picked');
  // Consecutive successful role-read ratings (correct/partial extend it,
  // incorrect resets) → streak multiplier + confetti at 3/5.
  const [roleStreak, setRoleStreak] = useState(0);
  // Terminal-overlay dismissal (click or 6s auto — FlashMatch pattern).
  const [completeDismissed, setCompleteDismissed] = useState(false);

  // WHO_SAID_IT state
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);
  // 2nd-miss teaching reveal: amber-ring the correct speaker + context.
  const [revealed, setRevealed] = useState(false);

  // ── Lifecycle refs ───────────────────────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const awardedByCharacterRef = useRef<Set<string>>(new Set());

  const totalLines = lines.length;
  const hasWhoSaidIt = whoSaidItItems.length >= 2;
  const hasRoleplay = !!dialogueItem && characters.length > 0;

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((opts: {
    correctness: 'correct' | 'incorrect' | 'partial';
    points: number;
    objectiveId: string | null;
    exerciseType: string;
    difficulty: number;
    passed: boolean;
    modality: 'receptive' | 'productive';
    studentId: string;
  }) => {
    const student = (state.students || []).find((s: any) => s.id === opts.studentId);
    if (opts.points !== 0) addPoints(opts.studentId, opts.points);
    recordAttempt({
      rosterId: opts.studentId,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness: opts.correctness,
      objectiveId: opts.objectiveId ?? undefined,
      exerciseType: opts.exerciseType,
      difficulty: opts.difficulty,
    }).catch(() => {});
    if (opts.correctness === 'incorrect' && opts.objectiveId) {
      pushToRemediation(opts.objectiveId, opts.studentId);
    }
  }, [state.students, state.activeClassId, addPoints, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── Role assignment (auto-assign from roster, same-dialogue exclusion) ─
  const doAssignRoles = useCallback(() => {
    const students = state.students || [];
    const assignments: Record<string, { id: string; name: string }> = {};
    const used = new Set<string>();
    for (const char of characters) {
      const available = students.find((s: any) => !used.has(s.id));
      if (available) {
        assignments[char] = { id: available.id, name: available.name || available.full_name || 'Student' };
        used.add(available.id);
      }
    }
    setRoleAssignments(assignments);
  }, [characters, state.students]);

  // ── Role-read rating handler (3-way: correct/partial/incorrect) ──────
  const handleRateRole = useCallback((character: string, rating: 'correct' | 'partial' | 'incorrect') => {
    if (awardedByCharacterRef.current.has(character)) { showAlreadyScored(); return; }
    awardedByCharacterRef.current.add(character);
    setRatedCharacters(prev => new Set(prev).add(character));

    const student = roleAssignments[character];
    if (!student || !dialogueItem) return;

    // Role-read streak: successful ratings (correct/partial) extend it,
    // incorrect resets. Milestones 3/5 get the streak cue + confetti;
    // every other rating acknowledges with the correct cue.
    const nextStreak = rating === 'incorrect' ? 0 : roleStreak + 1;
    if (nextStreak === 3 || nextStreak === 5) {
      playCue('streak');
      triggerConfetti();
    } else {
      playCue('correct');
    }
    setRoleStreak(nextStreak);

    const ratio = rating === 'correct' ? 1.0 : rating === 'partial' ? 0.6 : 0;
    const points = scoreForAttempt(0, dialogueItem.difficulty, ratio, nextStreak);
    const objectiveId = dialogueItem.objective_id || dialogueObjectiveId;

    doDualWrite({
      correctness: ratio >= 1 ? 'correct' : ratio > 0 ? 'partial' : 'incorrect',
      points, objectiveId,
      exerciseType: 'DIALOGUE_ROLEPLAY',
      difficulty: dialogueItem.difficulty,
      passed: ratio >= 0.6,
      modality: 'productive',
      studentId: student.id,
    });

    // Grade objective for productive modality
    if (unitId && objectiveId) {
      gradeObjective(student.id, unitId, objectiveId, ratio >= 0.6, 'productive').catch(() => {});
    }
  }, [roleAssignments, dialogueItem, dialogueObjectiveId, doDualWrite, unitId, showAlreadyScored, roleStreak]);

  // ── WHO_SAID_IT answer handler ───────────────────────────────────────
  const handleWhoSaidItAnswer = useCallback((optIndex: number) => {
    const item = whoSaidItItems[qIndex];
    if (!item || selectedOption !== null || revealed) return;
    const c = item.content as any;
    const correctIndex = Number(c.correct_index);
    setSelectedOption(optIndex);
    const objectiveId = item.objective_id || dialogueObjectiveId;
    const correct = optIndex === correctIndex;

    if (correct) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      const picked = state.quickWheelWinner;
      const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0);
      if (picked) {
        doDualWrite({
          correctness: 'correct', points, objectiveId,
          exerciseType: 'WHO_SAID_IT', difficulty: item.difficulty,
          passed: true, modality: 'receptive', studentId: picked,
        });
      }
      setTimeout(() => advanceWhoSaidIt(qIndex), 1800);
    } else {
      playCue('wrong');
      mistakesRef.current += 1;
      const picked = state.quickWheelWinner;
      if (picked) {
        doDualWrite({
          correctness: 'incorrect', points: -MISTAKE_PENALTY, objectiveId,
          exerciseType: 'WHO_SAID_IT', difficulty: item.difficulty,
          passed: false, modality: 'receptive', studentId: picked,
        });
      }
      // 2nd miss → teaching reveal: amber-ring the correct speaker, surface
      // the context, hold ~2.2s, then advance (no further attempts on this
      // item). 1st miss keeps the eliminate-a-distractor retry beat. The
      // awardedRef latch makes the item resolve-once — blocks a MARK_CORRECT
      // during the hold from scheduling a second advance.
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        awardedRef.current = true;
        setRevealed(true);
        setTimeout(() => advanceWhoSaidIt(qIndex), 2200);
        return;
      }
      // MCQ hint: eliminate one distractor on 1st miss
      setEliminatedOptions(prev => {
        const next = prev.includes(optIndex) ? prev : [...prev, optIndex];
        if (mistakesRef.current === 1) {
          const extra = Array.from({ length: c.options.length }, (_, i) => i)
            .find(i => i !== correctIndex && !next.includes(i));
          return extra !== undefined ? [...next, extra] : next;
        }
        return next;
      });
      setTimeout(() => setSelectedOption(null), 900);
    }
  }, [whoSaidItItems, qIndex, selectedOption, revealed, dialogueObjectiveId, state.quickWheelWinner, doDualWrite, showAlreadyScored]);

  // ── WHO_SAID_IT advancement ──────────────────────────────────────────
  const advanceWhoSaidIt = useCallback((idx: number) => {
    if (idx + 1 >= whoSaidItItems.length) {
      setStage('complete');
      setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 2000);
    } else {
      setQIndex(idx + 1);
      setSelectedOption(null);
      setEliminatedOptions([]);
      setRevealed(false);
      mistakesRef.current = 0;
      awardedRef.current = false;
    }
  }, [whoSaidItItems.length, triggerAction]);

  // ── Stage flow control ───────────────────────────────────────────────
  const advanceStage = useCallback(() => {
    switch (stage) {
      case 'title':
        setStage('read_along');
        setActiveLine(0);
        break;
      case 'read_along':
        if (hasRoleplay && scoringMode === 'picked') {
          doAssignRoles();
          setStage('role_assign');
        } else if (hasWhoSaidIt) {
          setStage('who_said_it');
          setQIndex(0);
          setSelectedOption(null);
          setEliminatedOptions([]);
          setRevealed(false);
          mistakesRef.current = 0;
          awardedRef.current = false;
        } else {
          setStage('complete');
          setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 1500);
        }
        break;
      case 'role_assign':
        setStage('role_read');
        awardedByCharacterRef.current = new Set();
        setRatedCharacters(new Set());
        setRoleStreak(0);
        break;
      case 'role_read':
        if (hasWhoSaidIt) {
          setStage('who_said_it');
          setQIndex(0);
          setSelectedOption(null);
          setEliminatedOptions([]);
          setRevealed(false);
          mistakesRef.current = 0;
          awardedRef.current = false;
        } else {
          setStage('complete');
          setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 1500);
        }
        break;
      case 'who_said_it':
        setStage('complete');
        setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 1500);
        break;
      default:
        break;
    }
  }, [stage, hasRoleplay, hasWhoSaidIt, scoringMode, doAssignRoles, triggerAction]);

  // ── Remote/commander action listener ─────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    switch (a.type) {
      case 'NEXT_PANEL':
      case 'NEXT_CARD':
      case 'NEXT_ROUND':
        if (stage === 'read_along' && activeLine < totalLines - 1) {
          setActiveLine(l => l + 1);
        } else {
          advanceStage();
        }
        break;
      case 'PREV_PANEL':
      case 'PREV_CARD':
        if (stage === 'read_along' && activeLine > 0) {
          setActiveLine(l => l - 1);
        }
        break;
      case 'RESET_GAME':
        setStage('title');
        setActiveLine(-1);
        setQIndex(0);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealed(false);
        setRatedCharacters(new Set());
        setRoleAssignments({});
        setRoleStreak(0);
        setCompleteDismissed(false);
        mistakesRef.current = 0;
        awardedRef.current = false;
        awardedByCharacterRef.current = new Set();
        break;
      case 'REVEAL_HINT':
        if (stage === 'who_said_it') {
          const item = whoSaidItItems[qIndex];
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
        if (stage === 'who_said_it') {
          if (awardedRef.current) { showAlreadyScored(); break; }
          awardedRef.current = true;
          playCue('correct');
          const item = whoSaidItItems[qIndex];
          if (item) {
            const picked = state.quickWheelWinner;
            const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0);
            if (picked) {
              doDualWrite({
                correctness: 'correct', points,
                objectiveId: item.objective_id || dialogueObjectiveId,
                exerciseType: 'WHO_SAID_IT', difficulty: item.difficulty,
                passed: true, modality: 'receptive', studentId: picked,
              });
            }
            setTimeout(() => advanceWhoSaidIt(qIndex), 1200);
          }
        }
        break;
      case 'SKIP_ROUND':
        advanceStage();
        break;
      case 'SLIDE_COMPLETE':
        setStage('complete');
        break;
      case 'TOGGLE_SCORING_MODE':
        setScoringMode(m => m === 'choral' ? 'picked' : 'choral');
        break;
      case 'RATE_ROLE':
        if (stage === 'role_read' && a.payload) {
          handleRateRole(a.payload.character, a.payload.rating);
        }
        break;
      case 'REASSIGN_ROLES':
        if (stage === 'role_assign' || stage === 'role_read') {
          doAssignRoles();
        }
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
    awardedByCharacterRef.current = new Set();
    setRoleStreak(0);
    setRevealed(false);
    setCompleteDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Completion: win cue + dismissible terminal overlay ───────────────
  useEffect(() => {
    if (stage === 'complete') playCue('win');
  }, [stage]);

  // Auto-dismiss the terminal celebration after 6s so a forgotten tab never
  // stays stuck behind the "Great acting!" overlay (scoring already fired
  // before this stage — the dismissal is purely cosmetic). Matches the
  // BoardFlashMatch pattern: click-to-dismiss + 6s auto-dismiss.
  useEffect(() => {
    if (stage !== 'complete' || completeDismissed) return;
    const t = setTimeout(() => setCompleteDismissed(true), 6000);
    return () => clearTimeout(t);
  }, [stage, completeDismissed]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (totalLines === 0 && !poolLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <MessageSquare size={56} className="text-sky-600/40 mb-3" />
        <p className="font-display text-3xl font-bold">Dialogue</p>
        <p className="text-lg mt-2">No dialogue lines for this unit.</p>
      </div>
    );
  }

  // ── Current line for read-along ──────────────────────────────────────
  const currentLine = stage === 'read_along' && activeLine >= 0 && activeLine < totalLines ? lines[activeLine] : null;

  // ── Current WHO_SAID_IT question ─────────────────────────────────────
  const currentQuestion = stage === 'who_said_it' ? whoSaidItItems[qIndex] : null;

  return (
    <div className="h-full relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0F1B2E, #0A1422)' }}>
      <AnimatePresence mode="wait">
        {/* ═══ TITLE CARD ═══ */}
        {stage === 'title' && (
          <motion.div key="dlg-title" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5 }} className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl mb-4">💬</div>
            <h1 className="font-display text-6xl font-black text-sky-300 mb-2" style={{ textShadow: '0 4px 20px rgba(56,189,248,.3)' }}>
              {data?.title || 'Dialogue'}
            </h1>
            <p className="text-lg text-sky-400/50">{totalLines} lines · {characters.length} speakers</p>
            <div className="mt-4 flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoringMode === 'picked' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'}`}>
                {scoringMode === 'picked' ? '🎯 Picked mode' : '📣 Choral mode'}
              </span>
            </div>
            <p className="mt-6 text-sm text-sky-400/40">👆 Teacher: tap Next to read each line · 点击下一步</p>
          </motion.div>
        )}

        {/* ═══ READ-ALONG (bilingual, unscored) ═══ */}
        {stage === 'read_along' && currentLine && (
          <motion.div key={`line-${activeLine}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0 flex flex-col items-center justify-center px-16">
            <div className="max-w-4xl w-full">
              {/* Speaker chip */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-xl"
                  style={{ background: `${colorFor(currentLine.speaker || 'Speaker')}25`, border: `3px solid ${colorFor(currentLine.speaker || 'Speaker')}`, color: colorFor(currentLine.speaker || 'Speaker') }}>
                  {(currentLine.speaker || 'S').charAt(0).toUpperCase()}
                </div>
                <span className="font-display text-3xl font-bold" style={{ color: colorFor(currentLine.speaker || 'Speaker') }}>
                  {currentLine.speaker || 'Speaker'}
                </span>
              </div>
              {/* Line text + translation */}
              <div className="backdrop-blur-md rounded-3xl px-10 py-8" style={{ background: 'rgba(30,41,59,.6)', borderLeft: `6px solid ${colorFor(currentLine.speaker || 'Speaker')}` }}>
                <p className="font-display text-5xl font-bold text-slate-50 leading-tight">
                  "{currentLine.text || ''}"
                </p>
                {currentLine.translation && (
                  <p className="font-cn text-2xl text-slate-400 mt-4">{currentLine.translation}</p>
                )}
                <button onClick={() => playAudioUrl((currentLine as any).audio, currentLine.text)} className="mt-5 inline-flex items-center gap-2 text-base font-bold text-sky-300/80 active:scale-95">
                  <Volume2 size={20} /> Read aloud
                </button>
              </div>
            </div>
            {/* Progress dots */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
              {lines.map((_: any, i: number) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${i === activeLine ? 'bg-sky-400 scale-150' : i < activeLine ? 'bg-sky-600' : 'bg-white/20'}`} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ ROLE ASSIGNMENT ═══ */}
        {stage === 'role_assign' && (
          <motion.div key="role-assign" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl mb-4">🎭</div>
            <h2 className="font-display text-4xl font-black text-sky-300 mb-6">Roles Assigned!</h2>
            <div className="flex flex-wrap gap-6 justify-center max-w-3xl">
              {characters.map(char => (
                <div key={char} className="flex flex-col items-center bg-white/10 backdrop-blur rounded-2xl px-6 py-4 border border-sky-400/20">
                  <span className="text-sm text-sky-400/60 font-bold mb-1">{char}</span>
                  <span className="text-2xl font-black text-white">
                    {roleAssignments[char]?.name || '—'}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sky-400/50 text-sm">Teacher: use Baton to rate each role after reading · 用遥控器评分</p>
          </motion.div>
        )}

        {/* ═══ ROLE-READ (dialogue with assigned students) ═══ */}
        {stage === 'role_read' && (
          <motion.div key="role-read" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center px-8">
            <h2 className="font-display text-3xl font-black text-sky-300 mb-4">🎭 Role Read</h2>
            {/* Show all lines with assigned student names */}
            <div className="max-w-3xl w-full space-y-3 max-h-[60vh] overflow-y-auto">
              {lines.map((line, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0"
                    style={{ background: `${colorFor(line.speaker)}25`, border: `2px solid ${colorFor(line.speaker)}`, color: colorFor(line.speaker) }}>
                    {(line.speaker || 'S').charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold" style={{ color: colorFor(line.speaker) }}>{line.speaker}</span>
                      {roleAssignments[line.speaker] && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                          {roleAssignments[line.speaker].name}
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-bold text-slate-100">"{line.text}"</p>
                    {line.translation && <p className="font-cn text-sm text-slate-400">{line.translation}</p>}
                  </div>
                  {/* Rating status */}
                  {roleAssignments[line.speaker] && ratedCharacters.has(line.speaker) && (
                    <Check size={20} className="text-emerald-400 shrink-0 mt-2" />
                  )}
                </div>
              ))}
            </div>
            {/* Rating status summary */}
            <div className="mt-4 flex gap-3">
              {characters.map(char => (
                <div key={char} className={`px-3 py-1 rounded-full text-sm font-bold ${ratedCharacters.has(char) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                  {char}: {ratedCharacters.has(char) ? '✓ Rated' : 'Pending'}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ WHO_SAID_IT COMPREHENSION ═══ */}
        {stage === 'who_said_it' && currentQuestion && (() => {
          const c = currentQuestion.content as any;
          const correctIndex = Number(c.correct_index);
          const resolved = selectedOption === correctIndex;
          return (
            <motion.div key={`wsi-${qIndex}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8">
              {/* Context before (if available) */}
              {c.context_before && (
                <div className="bg-white/5 rounded-xl px-6 py-2 mb-3 max-w-3xl w-full border border-white/10">
                  <p className="text-sm text-slate-400 italic">"{c.context_before}"</p>
                </div>
              )}
              {/* Question header */}
              <div className="mb-3 flex items-center gap-3">
                <span className="bg-sky-500/20 text-sky-300 px-4 py-1 rounded-full text-sm font-bold">
                  Who said it? {qIndex + 1} / {whoSaidItItems.length}
                </span>
                {pickedStudent && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-bold">
                    {pickedStudent.name}
                  </span>
                )}
              </div>
              {/* The line text */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl px-10 py-6 max-w-3xl w-full mb-6 border border-sky-400/20">
                <p className="font-display text-3xl font-bold text-slate-50 text-center">"{c.line_text}"</p>
              </div>
              {/* Speaker options */}
              <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
                {(c.options as string[]).map((opt, i) => {
                  const isCorrect = i === correctIndex;
                  const isSelected = selectedOption === i;
                  const isEliminated = eliminatedOptions.includes(i);
                  const showResult = selectedOption !== null;
                  return (
                    <button key={i} onClick={() => handleWhoSaidItAnswer(i)} disabled={isEliminated || revealed || (showResult && resolved)}
                      className={`px-6 py-4 rounded-2xl text-xl font-bold border-4 transition-all text-center
                        ${revealed && isCorrect ? 'bg-amber-500/20 border-amber-400 text-amber-100 ring-4 ring-amber-400'
                          : showResult && isCorrect ? 'bg-green-500/30 border-green-400 text-green-100'
                          : showResult && isSelected && !isCorrect ? 'bg-red-500/30 border-red-400 text-red-100 animate-shake'
                          : isEliminated ? 'bg-white/5 border-white/10 text-white/20 opacity-40 cursor-not-allowed'
                          : 'bg-white/10 border-white/20 text-sky-50 hover:border-sky-400 hover:-translate-y-1 shadow-md'}`}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {/* Context after (if available) */}
              {c.context_after && (
                <div className="bg-white/5 rounded-xl px-6 py-2 mt-4 max-w-3xl w-full border border-white/10">
                  <p className="text-sm text-slate-400 italic">"{c.context_after}"</p>
                </div>
              )}
              {resolved && (
                <div className="mt-4 flex items-center gap-2 text-green-400 font-bold text-2xl animate-bounce">
                  <Check size={32} /> {pickedStudent ? `${pickedStudent.name} got it!` : 'Correct!'}
                </div>
              )}
              {/* 2nd-miss teaching reveal: the answer + its context */}
              {revealed && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-4 max-w-3xl w-full bg-amber-500/10 border-2 border-amber-400/60 rounded-2xl px-8 py-4 text-center">
                  <p className="text-xl font-bold text-amber-300">It was {c.options[correctIndex]}!</p>
                  {(c.context_before || c.context_after) && (
                    <p className="text-sm text-slate-400 italic mt-2">"{c.context_after || c.context_before}"</p>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })()}

        {/* ═══ COMPLETE — click to dismiss or auto-dismiss after 6s ═══ */}
        {stage === 'complete' && !completeDismissed && (
          <motion.div key="dlg-done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            onClick={() => setCompleteDismissed(true)}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm cursor-pointer">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center">
              <div className="w-32 h-32 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center mb-6">
                <Users size={60} />
              </div>
              <h2 className="text-5xl font-black text-slate-800 mb-2">
                {pickedStudent ? `Great acting, ${pickedStudent.name}!` : 'Great dialogue, everyone!'}
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

export default BoardDialogueStage;
