import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useDailyQuests, useClaimQuest } from '../../hooks/useQueries';
import { Engine } from '../../services/SupabaseService';

// Quests tab — Wonder Atlas design, ported from Stitch screen_13
// (quests_streaks_tab). Sections we have data for only: the Badge Vault tab
// and Weekly Mystery Chest are Tier-2 features (see
// docs/superpowers/specs/2026-09-09-wonder-atlas-tier2-3-roadmap.md).
interface QuestsProps {
  onBack: () => void;
}

const QUEST_EMOJI: Record<string, string> = {
  earn_xp: '⚡',
  complete_lessons: '📖',
  perfect_speaking: '🎤',
  review_words: '📚',
  reach_familiar: '🎯',
  dubbing_take: '🎬',
};

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function formatReset(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const Quests: React.FC<QuestsProps> = ({ onBack }) => {
  const { data: quests = [], isLoading, isError, refetch } = useDailyQuests();
  const claimQuest = useClaimQuest();
  const { t } = useTranslation();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ xp: 0, gems: 0, streak: 0 });
  const [resetIn] = useState(formatReset(msUntilMidnight()));

  useEffect(() => {
    Engine.getStudentProgress()
      .then((p) => setStats({ xp: p.xp, gems: p.gems ?? 0, streak: p.streak }))
      .catch(() => {});
  }, []);

  const handleClaim = async (questId: string) => {
    if (claimingId) return;
    setClaimingId(questId);
    try {
      const result = await claimQuest.mutateAsync(questId);
      if (result) {
        toast.success(t('student.claimReward', { defaultValue: '+{{xp}} XP, +{{gems}} Gems!', xp: result.xp, gems: result.gems }));
      } else {
        toast.error(t('student.claimFailed', "Couldn't claim the reward — try again."));
      }
    } catch {
      toast.error(t('student.claimFailed', "Couldn't claim the reward — try again."));
    } finally {
      setClaimingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-wa-mist flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-wa-teal" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full bg-wa-mist flex flex-col items-center justify-center p-6">
        <p className="text-wa-ink font-bold mb-6 text-center">{t('student.questsLoadFailed', "Couldn't load your quests.")}</p>
        <button onClick={() => refetch()} className="btn-atlas-green text-white px-6 py-3 rounded-2xl font-wa-display font-bold">
          {t('student.retry', 'Retry')}
        </button>
      </div>
    );
  }

  const completedCount = quests.filter((q) => q.current >= q.target).length;
  const claimedCount = quests.filter((q) => q.claimed).length;
  const chestPercent = quests.length > 0 ? (claimedCount / quests.length) * 100 : 0;
  const chestGems = quests.reduce((s, q) => s + (q.reward_gems || 0), 0);
  const chestXp = quests.reduce((s, q) => s + (q.reward_xp || 0), 0);

  // Honest 7-day strip: a N-day streak means the last N days were active.
  // Fill cells ending at TODAY (flame); cells before that = min(streak-1, 6) ✓.
  const streak = stats.streak;
  const todayDone = streak > 0;
  const checkCount = Math.min(Math.max(streak - (todayDone ? 1 : 0), 0), 6);

  return (
    <div className="h-full bg-wa-mist flex flex-col font-wa-body">
      {/* Header (Stitch screen_13: ⭐ tile, resets-in, quick pills) */}
      <header className="sticky top-0 z-30 bg-wa-mist/95 backdrop-blur-md px-5 pt-5 pb-3 border-b border-[#EBDCC7]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-xl shadow-sm">
              ⭐
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-wa-display font-bold text-[22px] text-wa-ink leading-none">{t('student.dailyQuests', 'Daily Quests')}</h1>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold tracking-wide uppercase border border-amber-300">
                  New Daily
                </span>
              </div>
              <p className="text-[12px] font-semibold text-wa-ink/60 mt-0.5 flex items-center gap-1">
                <span>⏱️ Resets in</span>
                <span className="font-bold text-wa-ink">{resetIn}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-white/90 border-2 border-[#EBDCC7] rounded-full px-2.5 py-1 shadow-sm">
              <span className="text-xs">⚡</span>
              <span className="font-wa-display font-bold text-xs text-amber-600">{stats.xp}</span>
            </div>
            <div className="flex items-center gap-1 bg-white/90 border-2 border-[#EBDCC7] rounded-full px-2.5 py-1 shadow-sm">
              <span className="text-xs">💎</span>
              <span className="font-wa-display font-bold text-xs text-teal-600">{stats.gems}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-3 pb-24 space-y-4">
        {/* Streak hero (Stitch screen_13) */}
        <div className="bg-gradient-to-br from-[#FFF5EA] via-[#FFFBF6] to-[#F7EDE2] rounded-3xl p-4 border-2 border-[#F4A261]/40 shadow-wa-card relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-[#F4A261]/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center text-2xl shadow-sm border-2 border-white">
                🔥
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="font-wa-display font-bold text-[19px] text-wa-ink leading-none">
                    {streak > 0 ? `${streak} Day Streak!` : 'Start Your Streak!'}
                  </h2>
                  {streak >= 3 && (
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">On Fire</span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-wa-ink/65 mt-0.5">
                  {t('student.questKeepStreakHint', 'Study 1 lesson today to keep your flame alive!')}
                </p>
              </div>
            </div>
          </div>

          {/* 7-day strip: M–S + TODAY */}
          <div className="bg-white/80 rounded-2xl p-2.5 border border-[#EBDCC7] flex items-center justify-between">
            {WEEK_LABELS.map((label, i) => {
              const done = i >= 6 - checkCount;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-wa-ink/50">{label}</span>
                  <div className={`w-7 h-7 rounded-full text-[12px] font-extrabold flex items-center justify-center ${done ? 'bg-emerald-100 border border-emerald-400 text-emerald-700' : 'bg-[#EFE3D3] border border-[#E2D5C3] text-wa-ink/30'}`}>
                    {done ? '✓' : '·'}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-extrabold text-orange-600">TODAY</span>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] shadow-md ${todayDone ? 'bg-gradient-to-r from-orange-400 to-amber-400 border-2 border-white animate-pulse' : 'bg-[#EFE3D3] border border-[#E2D5C3] opacity-60'}`}>
                🔥
              </div>
            </div>
          </div>
        </div>

        {/* Daily Goal chest (Stitch screen_13's chest card, mapped to our daily goal) */}
        <div className="bg-white rounded-3xl p-4 border-2 border-[#EBDCC7] shadow-wa-card">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">{chestPercent >= 100 ? '🎁' : '🔒'}</span>
              <h3 className="font-wa-display font-bold text-[16px] text-wa-ink leading-none">{t('student.dailyGoal', 'Daily Goal')}</h3>
            </div>
            <span className="text-[11px] font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {claimedCount} / {quests.length} Quests
            </span>
          </div>
          <p className="text-[11px] text-wa-ink/70 mb-3">
            {chestPercent >= 100
              ? t('student.chestReady', 'Chest unlocked — every quest claimed! See you tomorrow!')
              : t('student.dailyGoalHint', 'Complete quests to open the chest!')}
          </p>
          <div className="relative pt-1 pb-2">
            <div className="w-full h-3.5 bg-[#EFE3D3] rounded-full overflow-hidden shadow-inner border border-[#E2D5C3]">
              <div className="h-full bg-gradient-to-r from-wa-teal to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${chestPercent}%` }} />
            </div>
            <div className="flex justify-between items-center mt-2 px-1 text-[11px] font-bold text-wa-ink/60">
              {quests.map((q, i) =>
                q.claimed ? (
                  <span key={q.id || i} className="flex items-center gap-1 text-emerald-600 font-extrabold">✓ Quest {i + 1}</span>
                ) : (
                  <span key={q.id || i} className="flex items-center gap-1 text-wa-ink/40">Quest {i + 1}</span>
                ),
              )}
              <span className={`flex items-center gap-1 ${chestPercent >= 100 ? 'text-amber-700 animate-pulse' : 'text-wa-ink/40'}`}>⭐ Final Chest</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-[#F2E8DC] flex items-center justify-between text-[11px]">
            <span className="font-semibold text-wa-ink/70 flex items-center gap-1">
              <span>Chest contains:</span>
              <span className="font-bold text-teal-700">+{chestGems} Gems 💎</span>
              <span>&bull;</span>
              <span className="font-bold text-amber-600">+{chestXp} XP ⚡</span>
            </span>
          </div>
        </div>

        {/* Today's Quests */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-wa-display font-bold text-[17px] text-wa-ink flex items-center gap-1.5">
              <span>🎯 Today's Quests</span>
              <span className="text-xs font-bold text-wa-ink/50">({completedCount} of {quests.length} done)</span>
            </h3>
          </div>

          {quests.length === 0 ? (
            <div className="card-paper p-8 rounded-3xl text-center">
              <div className="w-16 h-16 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎁</div>
              <h3 className="font-wa-display font-bold text-wa-ink mb-1">{t('student.noQuests', 'No quests yet')}</h3>
              <p className="text-sm text-wa-ink/60">{t('student.noQuestsHint', 'Your daily quests will appear here. Check back soon!')}</p>
            </div>
          ) : (
            quests.map((quest, index) => {
              const isComplete = quest.current >= quest.target;
              const isClaimed = quest.claimed;
              const progress = Math.min((quest.current / quest.target) * 100, 100);
              const emoji = QUEST_EMOJI[quest.quest_type] || '🎯';
              const cardClass = isComplete
                ? 'bg-gradient-to-r from-[#F0FDF4] to-[#ECFDF5] border-emerald-400'
                : 'bg-white border-[#EBDCC7]';
              const tileClass = isComplete
                ? 'bg-white border-emerald-400'
                : 'bg-amber-50 border-amber-300';

              return (
                <motion.div
                  key={quest.id || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + index * 0.08 }}
                  className={`${cardClass} rounded-3xl p-4 border-2 shadow-wa-card relative overflow-hidden`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`w-12 h-12 rounded-2xl ${tileClass} flex items-center justify-center text-2xl shadow-sm shrink-0`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-[14px] text-wa-ink leading-snug">{quest.title}</h4>
                          {isClaimed ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800 text-[9px] font-extrabold uppercase">Claimed!</span>
                          ) : isComplete ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800 text-[9px] font-extrabold uppercase">Done!</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase">In Progress</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[11px] font-bold text-wa-ink/70">{quest.current} / {quest.target}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">⚡ +{quest.reward_xp} XP</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold">💎 +{quest.reward_gems} Gems</span>
                        </div>
                        {!isComplete && (
                          <div className="mt-2.5 w-full h-2.5 bg-[#EFE3D3] rounded-full overflow-hidden shadow-inner border border-[#E2D5C3]">
                            <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isClaimed ? (
                        <div className="px-3.5 py-2 rounded-2xl bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                          Claimed ✓
                        </div>
                      ) : isComplete ? (
                        <button
                          onClick={() => handleClaim(quest.id)}
                          disabled={claimingId !== null}
                          className={`btn-atlas-green text-white text-xs font-bold px-3.5 py-2 rounded-2xl ${claimingId !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {claimingId === quest.id ? <Loader2 size={14} className="animate-spin inline" /> : 'Claim!'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Quests;
