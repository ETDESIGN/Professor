// SpacedRepetition — Daily Practice / Spaced Repetition (FSRS-driven).
// Pulls due + weak items across ALL units, mixed exercise types, and records
// every attempt to the LearnerState so practice feeds back into future lessons.
//
// Audit & Design Requirements:
// 1. Session-length choice on the start card: Full (up to 18) vs Half (9-card mercy).
// 2. Heart Haven: Passes heartSafe={true} to ExerciseRunner so reviewing weak words
//    never deducts hearts, and completing the practice session restores +1 heart!
// 3. Redesigned to Wonder Atlas warmth × Duolingo accents per Stitch screens 23/1 and 23/2.

import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, RotateCcw, Loader2, Sparkles, Heart, Zap, Check, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { selectPracticeItems } from '../../services/poolService';
import { GamificationService } from '../../services/GamificationService';
import { QUEST_TYPES } from '../../constants/gamification';
import ExerciseRunner, { RunnerResult } from './exercises/ExerciseRunner';

interface SpacedRepetitionProps {
  onBack: () => void;
  onComplete: (results: { xp: number; accuracy: number; time: string }) => void;
}

type SessionLength = 'quick' | 'full';

const SpacedRepetition: React.FC<SpacedRepetitionProps> = ({ onBack, onComplete }) => {
  const [items, setItems] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sessionLength, setSessionLength] = useState<SessionLength>('full');

  const load = () => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }
        setStudentId(user.id);
        const pool = await selectPracticeItems(user.id, 18);
        if (!cancelled) {
          setItems(pool);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => load(), []);

  // Quick mode (half-session mercy): takes first 9 items; full mode takes all up to 18
  const activeItems = useMemo(() => {
    if (sessionLength === 'quick') {
      return items.slice(0, Math.min(9, items.length));
    }
    return items;
  }, [items, sessionLength]);

  if (loadError) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-6 font-nunito text-[#264653]">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] p-6 text-center shadow-lg">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <RotateCcw size={28} />
          </div>
          <h2 className="text-xl font-fredoka font-bold text-[#1D3557] mb-2">Practice Unavailable</h2>
          <p className="text-xs text-[#264653]/70 mb-6">
            Couldn't load your practice cards right now. Please try again.
          </p>
          <div className="space-y-2">
            <button
              onClick={load}
              className="w-full py-3.5 bg-[#2A9D8F] hover:bg-[#23877b] text-white font-fredoka font-bold text-sm rounded-2xl shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 transition-all"
            >
              Retry Loading
            </button>
            <button
              onClick={onBack}
              className="w-full py-2.5 bg-[#FDFBF7] text-[#1D3557] font-fredoka font-bold text-xs rounded-xl border border-[#E2D7C3]"
            >
              Back to Arena
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#1D3557] font-nunito p-6">
        <Loader2 className="w-9 h-9 animate-spin text-[#2A9D8F] mb-3" />
        <span className="font-fredoka font-bold text-base">Gathering your memory review cards…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-6 font-nunito text-[#264653]">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] p-7 text-center shadow-[0_6px_0_#E2D7C3]">
          <div className="w-16 h-16 bg-[#2A9D8F]/15 text-[#2A9D8F] rounded-2xl border-2 border-[#2A9D8F]/30 flex items-center justify-center mx-auto mb-4 text-3xl">
            🎉
          </div>
          <h2 className="text-2xl font-fredoka font-bold text-[#1D3557] mb-2">You're All Caught Up!</h2>
          <p className="text-xs text-[#264653]/70 mb-6 leading-relaxed">
            Zero words are due for review right now. Complete new lesson nodes on the map to unlock more vocabulary!
          </p>
          <button
            onClick={onBack}
            className="w-full py-3.5 bg-[#2A9D8F] hover:bg-[#23877b] text-white font-fredoka font-bold text-sm rounded-2xl shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 transition-all"
          >
            Return to Arena
          </button>
        </div>
      </div>
    );
  }

  // ── Start Card with Session-Length Choice & Heart Haven Reassurance ─────
  if (!isStarted) {
    const quickCount = Math.min(9, items.length);
    const fullCount = items.length;

    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none">
        {/* Universal 64px Header */}
        <header className="h-16 w-full bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
          <button
            type="button"
            onClick={onBack}
            className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] hover:bg-[#EAE0D0] active:translate-y-0.5 transition-all"
            aria-label="Back"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center flex-1 px-2">
            <h1 className="font-fredoka font-bold text-[19px] leading-tight text-[#1D3557]">
              Daily Practice
            </h1>
            <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
              Spaced Repetition Workout
            </p>
          </div>

          <div className="h-10 px-3 bg-amber-50 border-2 border-amber-200/90 rounded-2xl flex items-center gap-1.5 shadow-sm">
            <span className="text-[16px] leading-none">🧠</span>
            <span className="font-fredoka font-bold text-sm text-[#D87A29]">SRS</span>
          </div>
        </header>

        {/* Scrollable Main Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Hero Workout Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#FDFBF7] rounded-[26px] p-5 border-[2.5px] border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-center relative"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 rounded-full text-[#1E6F5C] text-[11px] font-fredoka font-black uppercase tracking-wider mb-3">
              <span>🧠</span> MEMORY WORKOUT
            </div>

            <div className="w-16 h-16 rounded-2xl bg-[#E76F51]/15 border-2 border-[#E76F51]/30 text-[#E76F51] flex items-center justify-center mx-auto mb-3 text-3xl">
              ⚡
            </div>

            <h2 className="text-2xl font-fredoka font-bold text-[#1D3557] mb-1">
              {items.length} Words Due for Review
            </h2>
            <p className="text-xs text-[#264653]/70 leading-relaxed font-semibold">
              A balanced mix of your weakest and due-for-retention vocabulary across all unlocked units.
            </p>
          </motion.div>

          {/* Heart Haven Reassurance Banner */}
          <div className="bg-[#E6F4F1] border-2 border-[#2A9D8F] rounded-[22px] p-3.5 flex items-center gap-3 shadow-xs">
            <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-200 text-red-500 flex items-center justify-center shrink-0">
              <Heart size={22} className="fill-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-fredoka font-bold text-sm text-[#1E6F5C] leading-tight">
                Heart Haven Active ❤️
              </h3>
              <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5 leading-snug">
                Reviewing weak words costs <strong>0 hearts</strong>! Finishing your practice session <strong>RESTORES +1 Heart</strong>!
              </p>
            </div>
          </div>

          {/* Session Length Selector Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/80">
                ⏱️ Choose Workout Length
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Option 1: Quick Mode (Half-Session Mercy) */}
              <button
                type="button"
                onClick={() => setSessionLength('quick')}
                className={`w-full p-4 rounded-[22px] border-2 text-left transition-all flex items-start justify-between gap-3 ${
                  sessionLength === 'quick'
                    ? 'bg-[#FDFBF7] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C]'
                    : 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-fredoka font-bold text-[15px] text-[#1D3557]">
                      ⚡ Quick Review ({quickCount} Cards • ~3 min)
                    </span>
                    <span className="text-[10px] font-fredoka font-black px-1.5 py-0.2 rounded bg-emerald-100 text-[#1E6F5C]">
                      MERCY
                    </span>
                  </div>
                  <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5">
                    Perfect for busy or tired days. Strengthens high-priority items and restores a heart!
                  </p>
                </div>
                {sessionLength === 'quick' && (
                  <span className="text-xl text-[#2A9D8F] font-black">✓</span>
                )}
              </button>

              {/* Option 2: Full Review */}
              <button
                type="button"
                onClick={() => setSessionLength('full')}
                className={`w-full p-4 rounded-[22px] border-2 text-left transition-all flex items-start justify-between gap-3 ${
                  sessionLength === 'full'
                    ? 'bg-[#FDFBF7] border-[#E76F51] shadow-[0_4px_0_#C4553B]'
                    : 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_2px_0_#E2D7C3]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-fredoka font-bold text-[15px] text-[#1D3557]">
                      🔥 Full Workout ({fullCount} Cards • ~6 min)
                    </span>
                    <span className="text-[10px] font-fredoka font-black px-1.5 py-0.2 rounded bg-amber-100 text-[#C4553B]">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-[11px] text-[#264653]/75 font-medium mt-0.5">
                    Complete memory sweep of all due retention cards. Maximum XP and retention gains!
                  </p>
                </div>
                {sessionLength === 'full' && (
                  <span className="text-xl text-[#E76F51] font-black">✓</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Anchored Primary CTA Footer */}
        <footer className="bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 shrink-0 shadow-lg">
          <button
            type="button"
            onClick={() => setIsStarted(true)}
            className="w-full h-14 bg-[#2A9D8F] hover:bg-[#23877b] border-2 border-[#1E6F5C] text-white font-fredoka font-bold text-[16px] rounded-2xl shadow-[0_4px_0_#1E6F5C] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all"
          >
            <span>START REVIEW ({activeItems.length} CARDS)</span>
            <ArrowRight size={20} />
          </button>
        </footer>
      </div>
    );
  }

  const handleDone = (result: RunnerResult) => {
    const accuracy = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 100;
    // Rescaled: 1 XP per correct review, capped at 5 (PERFECT_LESSON ceiling)
    const xp = Math.min(5, Math.max(1, result.correct));
    if (result.correct > 0) {
      GamificationService.updateQuestProgress(QUEST_TYPES.REVIEW_WORDS, result.correct).catch(() => {});
    }
    onComplete({ xp, accuracy, time: '2:00' });
  };

  return (
    <div className="h-full bg-[#EAE0D0]">
      <ExerciseRunner
        items={activeItems}
        studentId={studentId}
        title="Daily Practice"
        heartSafe={true}
        onExit={onBack}
        onDone={handleDone}
      />
    </div>
  );
};

export default SpacedRepetition;
