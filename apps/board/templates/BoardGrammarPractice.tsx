// BoardGrammarPractice — the grammar PRACTICE strand (audit G2): pulls
// ERROR_SPOT / TRANSFORM pool items generated for the unit and presents them
// large-screen for teacher-led controlled practice (error correction + sentence
// transformation). Gives grammar a productive drilling stage, not just the
// passive GRAMMAR_SANDBOX presentation. Items come from the same pool as the
// student app (one content model, two tracks).

import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../../../store/SessionContext';
import { supabase } from '../../../services/supabaseClient';
import { toPoolItem } from '../../../types/exercise';
import { gradeObjective } from '../../../services/boardLearner';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { Check, ArrowRight, BookOpen, UserCheck } from 'lucide-react';

interface Props {
  data?: any;
}

const BoardGrammarPractice: React.FC<Props> = () => {
  const { state, addPoints } = useSession();
  const unitId = state.activeUnit?.id || '';
  const selectedStudentId = state.quickWheelWinner;
  // Game-lifecycle: mistakes during the current responder's turn (this item).
  // Reset on NEW_TURN. Used to compute the success award on a correct credit.
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const selectedStudentName = (state.students || []).find((s: any) => s.id === selectedStudentId)?.name;
  const [items, setItems] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [credited, setCredited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!unitId) { setLoading(false); return; }
      // Grammar-controlled types only.
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', unitId)
        .in('exercise_type', ['ERROR_SPOT', 'TRANSFORM']);
      if (cancelled) return;
      if (error || !data) { setLoading(false); return; }
      const pool = data.map(toPoolItem).filter((p) => p !== null);
      setItems(pool);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  useEffect(() => { setRevealed(false); setCredited(false); setIndex(0); }, [unitId]);

  // Game-lifecycle: a fresh responder is up (NEW_TURN). Reset to the first item
  // and zero the mistake tally for a clean scored attempt.
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = practice mode
    mistakesRef.current = 0;
    awardedRef.current = false;
    setRevealed(false);
    setCredited(false);
    setIndex(0);
  }, [turnId]);

  // B3.3: remote/commander handlers. Previously this template had NO lastAction
  // effect at all, so the remote's "Reveal Answer" and "Next" buttons
  // (TeacherRemote.tsx:264,267) were dead. Now they drive the board.
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'REVEAL_ANSWER') {
      setRevealed(true);
    } else if (a.type === 'RESET_GAME') {
      setRevealed(false);
      setCredited(false);
      setIndex(0);
    } else if (a.type === 'NEXT' || a.type === 'NEXT_ROUND') {
      // Remote "Next" advances the item, clearing reveal state.
      if (!revealed) setRevealed(true); else next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white text-slate-400 font-mono text-3xl">
        Loading grammar practice…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-white p-12 text-center">
        <BookOpen size={64} className="text-slate-300 mb-4" />
        <h2 className="text-4xl font-bold text-slate-400 mb-2">No grammar practice yet</h2>
        <p className="text-slate-400 text-xl">Generate the exercise pool for this unit to unlock error-spotting &amp; transformation drills.</p>
      </div>
    );
  }

  const item = items[index];
  const c: any = item.content;
  const isTransform = item.exercise_type === 'TRANSFORM';
  const prompt = isTransform ? c?.prompt_sentence : c?.sentence;
  const instruction = isTransform ? c?.instruction : 'Choose the correct version';
  const options: string[] = c?.options || [];
  const correctIdx: number = typeof c?.correct_index === 'number' ? c.correct_index : 0;

  // Per-student grammar capture: credit the currently-selected student on this
  // grammar objective (productive). No-op in choral rounds (no student picked).
  const creditSelected = async (correct: boolean) => {
    if (!selectedStudentId || !item.objective_id || credited) return;
    setCredited(true);
    try {
      await gradeObjective(selectedStudentId, unitId, item.objective_id, correct, 'productive');
      // Game-lifecycle scoring. A correct credit = SUCCESS for this responder's
      // turn → award the clean score (mistakes ref stays 0 here because the
      // board's Credit button only marks correct; wrong grading goes through
      // the Baton, which has its own scoring). Guard so a re-tap can't double-pay.
      if (correct && !awardedRef.current) {
        awardedRef.current = true;
        addPoints(selectedStudentId, scoreForAttempt(mistakesRef.current));
      } else if (!correct) {
        // A wrong credit (if ever wired) counts as a mistake.
        mistakesRef.current += 1;
        addPoints(selectedStudentId, -MISTAKE_PENALTY);
      }
    } catch { /* non-fatal */ }
  };

  const next = () => {
    if (index < items.length - 1) {
      setIndex(index + 1);
      setRevealed(false);
      setCredited(false);
      // Manual Next within the same turn: keep the mistake tally (the responder
      // is still the same student). NEW_TURN is what resets it.
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col p-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center">
            <BookOpen size={28} className="text-white" />
          </div>
          <div>
            <div className="text-indigo-500 font-bold uppercase tracking-widest text-sm">Grammar Practice</div>
            <div className="text-slate-800 font-bold text-2xl">{isTransform ? 'Transform the sentence' : 'Spot the error'}</div>
          </div>
        </div>
        <div className="text-slate-400 font-mono text-xl">{index + 1} / {items.length}</div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 mb-6">
        {instruction && <div className="text-indigo-500 font-bold text-lg mb-2">{instruction}</div>}
        <p className="text-slate-800 text-4xl font-bold leading-snug">{prompt}</p>
      </div>

      <div className="grid grid-cols-2 gap-5 flex-1 content-start">
        {options.map((opt, i) => {
          const isCorrect = i === correctIdx;
          const state_ = revealed ? (isCorrect ? 'correct' : 'wrong') : 'idle';
          return (
            <div
              key={i}
              className={`rounded-3xl p-6 border-4 text-3xl font-bold flex items-center justify-between transition-all ${
                state_ === 'correct'
                  ? 'bg-green-100 border-green-400 text-green-800'
                  : state_ === 'wrong'
                    ? 'bg-slate-50 border-slate-200 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <span>{opt}</span>
              {state_ === 'correct' && <Check size={32} className="text-green-600" strokeWidth={4} />}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-4 mt-6">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="bg-indigo-500 text-white font-bold text-2xl px-10 py-5 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center gap-2"
          >
            Reveal Answer
          </button>
        ) : (
          <>
            {selectedStudentId && (
              <button
                onClick={() => creditSelected(true)}
                disabled={credited}
                className="bg-duo-green text-white font-bold text-xl px-8 py-5 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center gap-2 disabled:opacity-50"
              >
                <UserCheck size={26} /> {credited ? 'Credited' : `Credit ${selectedStudentName || 'student'}`}
              </button>
            )}
            <button
              onClick={next}
              disabled={index >= items.length - 1}
              className="bg-indigo-500 text-white font-bold text-2xl px-10 py-5 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center gap-2 disabled:opacity-40"
            >
              {index >= items.length - 1 ? 'Done' : 'Next'} <ArrowRight size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BoardGrammarPractice;
