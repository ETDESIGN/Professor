import React, { useEffect, useState } from 'react';
import { X, RotateCcw, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { selectPracticeItems } from '../../services/poolService';
import { GamificationService } from '../../services/GamificationService';
import { QUEST_TYPES } from '../../constants/gamification';
import ExerciseRunner, { RunnerResult } from './exercises/ExerciseRunner';

interface SpacedRepetitionProps {
  onBack: () => void;
  onComplete: (results: { xp: number, accuracy: number, time: string }) => void;
}

// Daily Practice — now FSRS-driven via the shared ExerciseRunner (replaces the
// siloed flashcard flow: audit G6 + Bug #10). Pulls due + weak items across ALL
// units, mixed exercise types, and records every attempt to the LearnerState so
// practice feeds back into future lessons. Keeps the "Today's Menu" shell.
const SpacedRepetition: React.FC<SpacedRepetitionProps> = ({ onBack, onComplete }) => {
  const [items, setItems] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setIsLoading(false); return; }
        setStudentId(user.id);
        const pool = await selectPracticeItems(user.id, 18);
        if (!cancelled) { setItems(pool); setIsLoading(false); }
      } catch {
        if (!cancelled) { setLoadError(true); setIsLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  };

  useEffect(() => load(), []);

  if (loadError) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-slate-600 font-bold mb-6 text-center">Couldn't load your practice cards.</p>
        <div className="flex gap-3">
          <button onClick={load} className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors">
            Retry
          </button>
          <button onClick={onBack} className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-300 transition-colors">
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">You're all caught up!</h2>
        <p className="text-slate-500 text-center mb-8">No words to review right now. Great job!</p>
        <button onClick={onBack} className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors">
          Back to Map
        </button>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
        <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 p-2 -ml-2"><X size={24} /></button>
          <div className="flex items-center gap-1 text-orange-500 font-bold"><RotateCcw size={20} /><span>Daily Practice</span></div>
          <div className="w-8"></div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-xl border-2 border-slate-100 p-8 text-center"
          >
            <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <RotateCcw size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Today's Practice</h2>
            <p className="text-slate-500 mb-8">{items.length} words need your attention — a mix of your weakest and due-for-review skills.</p>

            <button
              onClick={() => setIsStarted(true)}
              className="w-full bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
            >
              Start Practice
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  const handleDone = (result: RunnerResult) => {
    const accuracy = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 100;
    // Rescaled 2026-09-04: 1 XP per correct review, capped at 5 (PERFECT_LESSON
    // ceiling) — the old 10-50 range over-fulfilled every daily quest.
    const xp = Math.min(5, Math.max(1, result.correct));
    if (result.correct > 0) {
      GamificationService.updateQuestProgress(QUEST_TYPES.REVIEW_WORDS, result.correct).catch(() => {});
    }
    onComplete({ xp, accuracy, time: '2:00' });
  };

  return (
    <div className="h-full bg-slate-50">
      <ExerciseRunner
        items={items}
        studentId={studentId}
        title="Daily Practice"
        onExit={onBack}
        onDone={handleDone}
      />
    </div>
  );
};

export default SpacedRepetition;
