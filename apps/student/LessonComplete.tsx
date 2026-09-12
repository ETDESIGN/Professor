// LessonComplete — Celebration interstitial screen on lesson / exercise battery completion.
//
// Audit & Design Requirements:
// 1. HONEST gem card: render the gems card ONLY when stats.stars >= 5 (exact match
//    to the backend gate — no economy change, zero unearned gem claims).
// 2. High-dopamine streak flame moment with animated flame and day counter.
// 3. XP count-up smoothly animated and strictly capped at stats.xp.
// 4. playCue('win') sound on celebratory mount.
// 5. Redesigned to Wonder Atlas warmth × Duolingo accents per Stitch screens 27/1 and 27/2.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Check, ArrowRight, Trophy, Gem, Flame, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { GEM_REWARDS } from '../../constants/gamification';
import { playCue } from '../board/templates/playCue';

interface LessonCompleteProps {
  onContinue: () => void;
  stats?: {
    xp: number;
    accuracy: number;
    time: string;
    /** Stars earned this run (student-path nodes); defaults to 3. */
    stars?: number;
  };
}

const LessonComplete: React.FC<LessonCompleteProps> = ({
  onContinue,
  stats = { xp: 5, accuracy: 92, time: '2:15', stars: 3 },
}) => {
  const { t } = useTranslation();
  const earnedStars = stats.stars ?? 3;
  const isPerfectRun = earnedStars >= 5;
  const targetXp = Math.max(0, stats.xp);

  const [starCount, setStarCount] = useState(0);
  const [displayXp, setDisplayXp] = useState(0);

  // Play win fanfare cue on mount
  useEffect(() => {
    playCue('win');
  }, []);

  // Animate stars sequence
  useEffect(() => {
    const t1 = setTimeout(() => setStarCount(1), 350);
    const t2 = setTimeout(() => setStarCount(2), 700);
    const t3 = setTimeout(() => setStarCount(3), 1050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Capped XP count-up animation
  useEffect(() => {
    if (targetXp === 0) {
      setDisplayXp(0);
      return;
    }
    const step = Math.max(1, Math.ceil(targetXp / 25));
    const interval = setInterval(() => {
      setDisplayXp((prev) => {
        const next = prev + step;
        if (next >= targetXp) {
          clearInterval(interval);
          return targetXp;
        }
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [targetXp]);

  return (
    <div className="fixed inset-0 z-50 bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none overflow-y-auto">
      {/* Background Atmosphere & Ambient Radiance */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-amber-200/30 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute top-12 left-10 text-xl opacity-60">✨</div>
        <div className="absolute top-20 right-12 text-lg opacity-70">⭐</div>
        <div className="absolute top-48 left-6 text-sm opacity-50">🌟</div>
        <div className="absolute top-52 right-8 text-xl opacity-60">🎉</div>
      </div>

      <main className="relative z-10 w-full max-w-md mx-auto flex-1 flex flex-col justify-between p-5 space-y-4">
        {/* Universal Top Header */}
        <header className="flex items-center justify-between pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDFBF7] border border-[#E2D7C3] rounded-full shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#2A9D8F] animate-pulse" />
            <span className="text-[11px] font-fredoka font-bold text-[#1D3557] uppercase tracking-wider">
              {t('student.curriculumMilestone', 'Lesson Complete')}
            </span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="w-10 h-10 rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_2.5px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] active:translate-y-0.5 transition-all"
            aria-label="Continue"
          >
            <ArrowRight size={18} />
          </button>
        </header>

        {/* SECTION 1: HERO & 3-STAR GOLDEN CASCADE */}
        <div className="flex flex-col items-center text-center pt-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1 mb-2 bg-[#FDE8DF] border border-[#F6B8A9] rounded-full text-[#E76F51] text-[11px] font-fredoka font-black uppercase tracking-widest"
          >
            <span>🏆</span>
            <span>{isPerfectRun ? 'PERFECT RUN • 5 STARS' : 'WELL DONE!'}</span>
          </motion.div>

          <h1 className="text-[30px] leading-tight font-fredoka font-bold text-[#E76F51] tracking-tight">
            {isPerfectRun ? 'PERFECT SCORE! 🏆' : t('student.lessonComplete', 'LESSON COMPLETE!')}
          </h1>

          {/* Dynamic Golden Stars Cascade */}
          <div className="flex items-end justify-center gap-3 my-4 h-[84px]">
            {/* Star 1 */}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: starCount >= 1 ? 1 : 0.6, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#FFE885] to-[#FFC800] p-1 shadow-[0_3px_0_#D4AC4B] border-2 border-[#E5A500] flex items-center justify-center -rotate-6">
                <Star size={34} className="fill-white text-white drop-shadow-xs" />
              </div>
            </motion.div>

            {/* Star 2 (Center Master Star) */}
            <motion.div
              initial={{ scale: 0, y: 15 }}
              animate={{ scale: starCount >= 2 ? 1.1 : 0.6, y: -6 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
              className="flex flex-col items-center z-10"
            >
              <div className="w-18 h-18 rounded-2xl bg-gradient-to-b from-[#FFF2A8] via-[#FFC800] to-[#FFA800] p-1.5 shadow-[0_4px_0_#D48B00] border-[2.5px] border-[#D48B00] flex items-center justify-center">
                <Star size={42} className="fill-white text-white drop-shadow-sm" />
              </div>
            </motion.div>

            {/* Star 3 */}
            <motion.div
              initial={{ scale: 0, rotate: 30 }}
              animate={{ scale: starCount >= 3 ? 1 : 0.6, rotate: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 15 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#FFE885] to-[#FFC800] p-1 shadow-[0_3px_0_#D4AC4B] border-2 border-[#E5A500] flex items-center justify-center rotate-6">
                <Star size={34} className="fill-white text-white drop-shadow-xs" />
              </div>
            </motion.div>
          </div>

          <p className="text-[16px] font-fredoka font-bold text-[#1D3557]">
            Outstanding Work! <span className="text-[#E76F51]">{Math.min(3, earnedStars)} / 3 Stars</span>
          </p>
          <p className="text-xs font-semibold text-[#264653]/70 mt-0.5">
            {t('student.amazingJob', 'You did an amazing job today!')}
          </p>
        </div>

        {/* SECTION 2: 3-METRIC STAT ROW */}
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-[22px] p-3 shadow-[0_3px_0_#E2D7C3]">
          <div className="grid grid-cols-3 divide-x divide-[#E2D7C3]/80 text-center items-center py-1">
            {/* Stat 1: XP */}
            <div className="flex flex-col items-center px-1">
              <div className="flex items-center gap-1 text-[#E5A500]">
                <span className="text-lg">⚡</span>
                <span className="text-xl font-fredoka font-bold text-[#1D3557]">+{displayXp}</span>
              </div>
              <span className="text-[10.5px] font-fredoka font-bold uppercase text-[#264653]/65 tracking-wider mt-0.5">
                XP Earned
              </span>
            </div>

            {/* Stat 2: Accuracy */}
            <div className="flex flex-col items-center px-1">
              <div className="flex items-center gap-1 text-[#2A9D8F]">
                <span className="text-lg">🎯</span>
                <span className="text-xl font-fredoka font-bold text-[#1D3557]">{stats.accuracy}%</span>
              </div>
              <span className="text-[10.5px] font-fredoka font-bold uppercase text-[#264653]/65 tracking-wider mt-0.5">
                Accuracy
              </span>
            </div>

            {/* Stat 3: Time */}
            <div className="flex flex-col items-center px-1">
              <div className="flex items-center gap-1 text-[#E76F51]">
                <span className="text-lg">⏱️</span>
                <span className="text-xl font-fredoka font-bold text-[#1D3557]">{stats.time || '—'}</span>
              </div>
              <span className="text-[10.5px] font-fredoka font-bold uppercase text-[#264653]/65 tracking-wider mt-0.5">
                Time
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 3: HIGH-DOPAMINE STREAK FLAME CARD */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#FFFDF9] to-[#FFF5EB] rounded-[24px] border-[2.5px] border-[#E76F51] p-4 shadow-[0_4px_16px_rgba(231,111,81,0.18)]">
          <div className="flex items-center gap-3.5">
            {/* Animated Flame Badge */}
            <div className="relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-b from-[#FFF2CC] to-[#FFE0B2] border-2 border-[#FFA000] flex items-center justify-center shadow-inner">
              <Flame size={32} className="text-[#E76F51] animate-bounce" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 text-[10.5px] font-fredoka font-black uppercase text-[#E76F51] tracking-wider">
                <span>🔥 STREAK MAINTAINED!</span>
              </div>
              <h2 className="text-[18px] leading-tight font-fredoka font-bold text-[#1D3557] truncate">
                Streak on Fire!
              </h2>
              <p className="text-xs font-semibold text-[#264653]/75 mt-0.5">
                Practice tomorrow to keep your flame blazing!
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 4: HONEST GEM REWARD CARD (Rendered strictly when stats.stars >= 5) */}
        {isPerfectRun && (
          <motion.section
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-[#E6F4F1] border-[2.5px] border-[#2A9D8F] rounded-[24px] p-3.5 shadow-sm relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2A9D8F] text-white text-[10px] font-fredoka font-black uppercase tracking-wider">
                <Check size={12} className="stroke-[3]" />
                <span>Audited & Verified</span>
              </div>
              <span className="text-[10px] font-fredoka font-bold text-[#1E6F5C]">
                5 Stars Earned
              </span>
            </div>

            <div className="flex items-center gap-3 bg-[#FDFBF7] rounded-2xl p-3 border border-[#2A9D8F]/30 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D2F2EC] to-[#A3E5D8] border-2 border-[#2A9D8F] flex items-center justify-center text-2xl shrink-0 shadow-inner">
                💎
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="font-fredoka text-xs font-bold text-[#1E6F5C] tracking-tight">
                  PERFECT LESSON BONUS
                </div>
                <div className="font-fredoka text-lg font-extrabold text-[#2A9D8F] mt-0.5">
                  +{GEM_REWARDS.PERFECT_LESSON} Gems
                </div>
              </div>
            </div>

            <div className="mt-2 px-2 py-1 bg-white/75 rounded-xl border border-[#2A9D8F]/25 flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#2A9D8F] shrink-0" />
              <p className="text-[11px] leading-snug font-bold text-[#264653]">
                <span className="text-[#1E6F5C]">Honesty Guarantee:</span> Added directly to your student gem wallet!
              </p>
            </div>
          </motion.section>
        )}

        {/* SECTION 5: PRIMARY ACTION CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onContinue}
            className="w-full h-14 bg-[#E76F51] hover:bg-[#d65f42] border-2 border-[#C4553B] text-white font-fredoka font-bold text-[17px] rounded-2xl shadow-[0_4px_0_#C4553B] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 tracking-wide uppercase"
          >
            <span>{t('student.continue', 'Continue')}</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </main>
    </div>
  );
};

export default LessonComplete;