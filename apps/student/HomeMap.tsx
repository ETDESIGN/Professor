
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Lock, Headphones, Mic, LayoutGrid, Check, Flame, Target, BookOpen, Crown, AlertTriangle } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { Engine } from '../../services/SupabaseService';
import {
  getAllStageProgress,
  computeNodeStates,
  isPathComplete,
  resolveUnitPath,
} from '../../services/stageProgressService';
import type { StageProgressMap } from '../../services/stageProgressService';
import { StageIcon } from '../../components/shared/stageIcons';
import { motion } from 'framer-motion';
import { themeForUnit, pickFocusUnit } from './atlas/territory';
import TerritoryIntro from './atlas/TerritoryIntro';
import { waColors } from './atlas/tokens';

// Feature flag: dubbing is a mock (audit P1-5). Default OFF.
const dubbingEnabled = import.meta.env.VITE_ENABLE_DUBBING === 'true';

interface HomeMapProps {
  onNavigate: (view: string, unitId?: string, stageId?: string) => void;
  onJoinClass?: () => void;
}

const HomeMap: React.FC<HomeMapProps> = ({ onNavigate, onJoinClass }) => {
  const { state, loadUnits } = useSoloSession();
  const { t } = useTranslation();
  const soloState = state as any;

  const units = state.units;
  const unitsLoading = Boolean(soloState.unitsLoading);
  const unitsError: string | null = soloState.unitsError ?? null;
  const completedUnitIds: string[] = soloState.studentProgress?.completedUnitIds || [];
  const studentXp: number = soloState.studentProgress?.xp || 0;
  const studentStreak: number = soloState.studentProgress?.streak || 0;

  const now = new Date();
  const hoursLeft = 24 - now.getHours();
  const xpGoal = 50;
  const xpProgress = Math.min(studentXp / xpGoal, 1);

  // Mastery loop (Phase 4): per-unit crowns + cracked-node state from the
  // LearnerState. Crowns (familiar/mastered) are the real "did they learn it?"
  // signal; a mastered objective whose R fell below 0.85 cracks and prompts a
  // review lesson. compute-on-read, no cron.
  const [studentId, setStudentId] = useState('');
  const [masteryByUnit, setMasteryByUnit] = useState<Record<string, { crowns: number; total: number; crackedCount: number; isComplete: boolean }>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setStudentId(user.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!studentId || units.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, { crowns: number; total: number; crackedCount: number; isComplete: boolean }> = {};
      for (const u of units) {
        const s = await Engine.getUnitMasterySummary(studentId, u.id);
        next[u.id] = { crowns: s.crowns, total: s.total, crackedCount: s.crackedCount, isComplete: s.isComplete };
      }
      if (!cancelled) setMasteryByUnit(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, units]);

  // Student Path: one progress query for all units — the real node states
  // (locked / active / completed + stars) come from computeNodeStates over
  // each unit's path (teacher-saved student_path, or the derived default).
  const [stageProgress, setStageProgress] = useState<StageProgressMap>({});
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    getAllStageProgress(studentId).then((map) => { if (!cancelled) setStageProgress(map); }).catch(() => {});
    return () => { cancelled = true; };
  }, [studentId, units]);

  // Helper to generate the path string (works for any node count)
  const generatePath = (nodeCount: number) => {
    const nodeHeight = 130;
    let d = `M 50 40`;

    for (let i = 0; i < nodeCount; i++) {
      const yStart = i * nodeHeight + 40;
      const yEnd = (i + 1) * nodeHeight + 40;

      const xStart = i % 2 === 0 ? 50 : (i % 4 === 1 ? 75 : 25);
      const xEnd = (i + 1) % 2 === 0 ? 50 : ((i + 1) % 4 === 1 ? 75 : 25);

      const cp1y = yStart + (nodeHeight / 2);
      const cp2y = yEnd - (nodeHeight / 2);

      d += ` C ${xStart} ${cp1y}, ${xEnd} ${cp2y}, ${xEnd} ${yEnd}`;
    }
    return d;
  };

  return (
    <div className="flex-1 relative overflow-y-auto bg-wa-cream no-scrollbar pb-32">
      {/* Daily Quests Header */}
      <div className="bg-wa-paper mx-4 mt-6 mb-8 rounded-wa-card p-4 shadow-wa-card border border-wa-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-wa-display font-bold text-wa-ink flex items-center gap-2">
            <Target size={20} className="text-wa-terra" /> {t('student.dailyQuests', 'Daily Quests')}
          </h2>
          <span className="text-sm font-bold text-wa-muted">{t('student.timeLeft', { defaultValue: '{{hours}}h left', hours: hoursLeft })}</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-wa-terra/15 rounded-xl flex items-center justify-center shrink-0">
              <Flame size={24} className="text-wa-terra" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-wa-ink">{t('student.questEarnXp', { defaultValue: 'Earn {{xp}} XP', xp: xpGoal })}</span>
                <span className="text-sm font-bold text-wa-muted">{Math.min(studentXp, xpGoal)}/{xpGoal}</span>
              </div>
              <div className="h-2 bg-wa-border/60 rounded-full overflow-hidden">
                <div className="h-full bg-wa-terra rounded-full" style={{ width: `${xpProgress * 100}%` }}></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-wa-teal/15 rounded-xl flex items-center justify-center shrink-0">
              <Headphones size={24} className="text-wa-teal" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-wa-ink">{t('student.questLessons', 'Complete 2 Lessons')}</span>
                <span className="text-sm font-bold text-wa-muted">{Math.min(completedUnitIds.length, 2)}/2</span>
              </div>
              <div className="h-2 bg-wa-border/60 rounded-full overflow-hidden">
                <div className="h-full bg-wa-teal rounded-full" style={{ width: `${Math.min(completedUnitIds.length / 2, 1) * 100}%` }}></div>
              </div>
            </div>
          </div>
          {studentStreak > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-wa-sand/25 rounded-xl flex items-center justify-center shrink-0">
                <Star size={24} className="text-wa-inkDeep" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-bold text-wa-ink">{t('student.questKeepStreak', 'Keep your streak!')}</span>
                  <span className="text-sm font-bold text-wa-teal">{t('student.streakDays', { defaultValue: '{{n}} days', n: studentStreak })}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {unitsLoading ? (
        <div className="mx-4 space-y-4" aria-live="polite">
          <div className="bg-wa-paper rounded-wa-card p-6 shadow-wa-card border border-wa-border animate-pulse space-y-3">
            <div className="h-6 w-2/3 bg-wa-border rounded" />
            <div className="h-3 w-full bg-wa-mist rounded" />
            <div className="h-3 w-3/4 bg-wa-mist rounded" />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-wa-border animate-pulse" style={{ opacity: 1 - i * 0.25 }} />
            </div>
          ))}
          <p className="text-center text-sm text-wa-muted">{t('student.loadingLessons', 'Loading your lessons…')}</p>
        </div>
      ) : unitsError ? (
        <div className="mx-4 bg-wa-paper rounded-wa-card p-8 shadow-wa-card border border-wa-terra/30 text-center">
          <div className="w-16 h-16 bg-wa-terra/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-wa-terra" />
          </div>
          <h3 className="font-bold text-wa-ink mb-1">{t('student.loadLessonsFailed', 'Couldn\'t load your lessons')}</h3>
          <p className="text-sm text-wa-muted mb-5">{unitsError}</p>
          <button
            onClick={() => loadUnits()}
            className="px-6 py-3 bg-wa-teal text-white font-wa-display font-bold rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all uppercase tracking-wide text-sm"
          >
            {t('common.retry', 'Try again')}
          </button>
        </div>
      ) : units.length === 0 ? (
        <div className="mx-4 bg-wa-paper rounded-wa-card p-8 shadow-wa-card border border-wa-border text-center">
          <div className="w-16 h-16 bg-wa-teal/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen size={32} className="text-wa-teal" />
          </div>
          <h3 className="font-bold text-wa-ink mb-1">{t('student.noLessonsYet', 'No lessons yet')}</h3>
          <p className="text-sm text-wa-muted mb-5">{t('student.noLessonsHint', 'Join a class with the code from your teacher to see your lessons here.')}</p>
          <div className="flex flex-col items-center gap-3">
            {onJoinClass && (
              <button
                onClick={onJoinClass}
                className="px-6 py-3 bg-wa-teal text-white font-wa-display font-bold rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all uppercase tracking-wide text-sm"
              >
                {t('student.joinClass', 'Join a class')}
              </button>
            )}
            <button
              onClick={() => { window.location.href = '/onboarding/student'; }}
              className="text-wa-teal font-bold text-sm underline underline-offset-4 hover:text-wa-tealDeep transition-colors"
            >
              {t('student.takeTour', 'New here? Take the app tour')}
            </button>
          </div>
        </div>
      ) : (
      units.map((unit, unitIndex) => {
        const summary = masteryByUnit[unit.id];
        // The Student Path: real nodes from the teacher's plan (or the
        // derived default), gated by real per-stage progress. Sequential
        // unlock with per-node teacher overrides — computeNodeStates is the
        // single evaluator (same one the player trusts).
        const path = resolveUnitPath(unit as any);
        const nodes = computeNodeStates(path, stageProgress);
        const unitLocked = unit.status === 'Locked';
        const pathDone = !unitLocked && isPathComplete(nodes);
        const nodeCount = nodes.length;
        const svgHeight = Math.max(600, nodeCount * 130 + 130);
        return (
          <div key={unit.id} className="relative z-10 pb-8">
            {(() => {
              const focus = pickFocusUnit(units, masteryByUnit);
              if (focus?.id !== unit.id) return null;
              const focusSummary = masteryByUnit[unit.id];
              const activeNode = nodes.find((n) => n.state === 'active') ?? nodes[0];
              return (
                <TerritoryIntro
                  unit={{ title: unit.title, topic: unit.topic }}
                  theme={themeForUnit(unit)}
                  lessonsCount={nodes.length}
                  crowns={focusSummary ? { current: focusSummary.crowns, total: focusSummary.total } : undefined}
                  isLocked={unitLocked}
                  onStart={() => (activeNode ? onNavigate('lesson', unit.id, activeNode.stage.id) : onNavigate('lesson', unit.id))}
                />
              );
            })()}
            {/* Unit Header — Wonder Atlas territory card */}
            <div className={`mx-4 mt-4 rounded-wa-card p-5 bg-wa-paper border-b-4 border-wa-border shadow-wa-card transform transition-transform ${unit.status === 'Locked' ? 'grayscale opacity-70' : ''}`}>
              {unit.coverImage && !unit.coverImage.includes('dicebear') && (
                <img src={unit.coverImage} alt={unit.title} className="w-full h-36 object-cover rounded-2xl shadow-md mb-4" />
              )}
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <span className="inline-flex items-center gap-1.5 bg-wa-teal/10 text-wa-teal px-2.5 py-1 rounded-full text-xs font-wa-display font-bold mb-2">
                    {themeForUnit(unit).emoji} {themeForUnit(unit).label}
                  </span>
                  <h3 className="font-wa-display font-bold text-2xl text-wa-ink tracking-wide">{unit.title}</h3>
                  <p className="text-wa-muted text-sm font-medium mt-1">{unit.topic} • {unit.level}</p>
                  {summary && summary.total > 0 && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 bg-wa-sand/25 text-wa-inkDeep px-2 py-0.5 rounded-full text-xs font-bold">
                        <Crown size={13} className="text-wa-sandDeep" />
                        {summary.crowns}/{summary.total}
                      </span>
                      {summary.crackedCount > 0 && (
                        <button
                          onClick={() => onNavigate('practice', unit.id)}
                          className="flex items-center gap-1 bg-wa-terra/15 text-wa-terra px-2 py-0.5 rounded-full text-xs font-bold animate-pulse"
                          title={`${summary.crackedCount} skill(s) need review`}
                        >
                          <AlertTriangle size={13} />
                          {summary.crackedCount} cracked
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-wa-mist p-3 rounded-2xl text-wa-teal">
                  {unit.status === 'Locked' ? <Lock size={24} /> : summary?.isComplete ? <Crown size={24} className="text-wa-sandDeep" /> : <BookOpen size={24} />}
                </div>
              </div>
            </div>

            {/* Path Visualization Layer */}
            <div className="absolute top-28 left-0 w-full pointer-events-none -z-10" style={{ height: svgHeight }}>
              <svg width="100%" height="100%" viewBox={`0 0 100 ${svgHeight}`} preserveAspectRatio="none">
                <path
                  d={generatePath(nodeCount)}
                  fill="none"
                  stroke={unitLocked ? waColors.border : waColors.sand}
                  strokeWidth="3"
                  strokeDasharray="2 7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            {/* Nodes Container — the real Student Path */}
            <div className="flex flex-col items-center gap-6 mt-10 pb-4">
              {nodes.map(({ stage, state: nodeState, stars }, i) => {
                const isCompleted = nodeState === 'completed' && !unitLocked;
                const isActive = nodeState === 'active' && !unitLocked;
                const isLocked = !isCompleted && !isActive;

                let offsetClass = '';
                if (i % 4 === 1) offsetClass = 'translate-x-16';
                if (i % 4 === 3) offsetClass = '-translate-x-16';

                const action = () => onNavigate('lesson', unit.id, stage.id);

                return (
                  <motion.div
                    key={stage.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.1, 0.6) }}
                    className={`relative flex flex-col items-center ${offsetClass}`}
                  >
                    <button
                      onClick={() => {
                        if (isActive || isCompleted) action();
                      }}
                      disabled={isLocked}
                      title={stage.title}
                      className={`
                          w-20 h-20 rounded-full flex items-center justify-center relative transition-all duration-300 z-10
                          ${isCompleted
                          ? 'bg-wa-sand border-b-8 border-wa-sandDeep shadow-xl'
                          : isActive
                            ? 'bg-wa-terra border-b-8 border-wa-terraDeep scale-110 shadow-2xl animate-bounce-subtle ring-4 ring-wa-terra/25'
                            : 'bg-wa-mist border-b-8 border-wa-border'
                        }
                        `}
                    >
                      {/* Icon */}
                      {isCompleted && <Check size={30} className="text-wa-inkDeep" strokeWidth={4} />}
                      {isActive && (
                        <span className="text-white flex items-center justify-center">
                          <StageIcon icon={stage.icon === 'trophy' ? 'star' : stage.icon} size={30} />
                        </span>
                      )}
                      {isLocked && <Lock className="text-wa-muted w-8 h-8" />}

                      {/* Stars earned for completed nodes (real values) */}
                      {isCompleted && (
                        <div className="absolute -top-2 flex gap-1 bg-wa-paper/90 backdrop-blur rounded-full px-2 py-0.5 border border-wa-border">
                          {[1, 2, 3].map((s) => (
                            <Star
                              key={s}
                              size={10}
                              className={s <= stars ? 'text-wa-sandDeep fill-wa-sandDeep' : 'text-wa-border fill-transparent'}
                            />
                          ))}
                        </div>
                      )}

                      {/* Active Popover */}
                      {isActive && (
                        <div className="absolute -top-12 bg-wa-paper px-4 py-2 rounded-2xl shadow-wa-card border border-wa-border text-wa-terra font-wa-display font-bold text-sm whitespace-nowrap animate-bounce">
                          START
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-wa-paper rotate-45 border-b border-r border-wa-border"></div>
                        </div>
                      )}
                    </button>

                    {/* Node label */}
                    <span className={`mt-2 text-[11px] font-bold max-w-[7rem] text-center leading-tight ${isLocked ? 'text-wa-border' : 'text-wa-muted'}`}>
                      {stage.title}
                    </span>
                  </motion.div>
                );
              })}

              {/* Final Chest Node — opens when every stage is completed */}
              <div className="relative mt-6">
                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center border-b-8 transition-colors ${unitLocked || !pathDone ? 'bg-wa-mist border-wa-border' : 'bg-wa-sand border-wa-sandDeep shadow-2xl ring-4 ring-wa-sand/30'}`}>
                  <img
                    src="https://api.dicebear.com/7.x/icons/svg?seed=chest"
                    className={`w-16 h-16 ${unitLocked || !pathDone ? 'opacity-30 grayscale' : 'drop-shadow-lg animate-bounce-subtle'}`}
                    alt="Chest"
                  />
                </div>
                {pathDone && (
                  <div className="absolute -top-3 -right-2 bg-wa-sand text-wa-inkDeep text-[10px] font-black px-2 py-1 rounded-full shadow border border-wa-sandDeep/40 animate-bounce-subtle">
                    UNIT DONE!
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }))}

      {/* Floating Practice CTA */}
      <div className="fixed bottom-24 right-4 z-40 space-y-3">
        <button
          onClick={() => onNavigate('practice')}
          className={`w-14 h-14 bg-wa-paper rounded-2xl shadow-xl border-2 border-wa-border flex items-center justify-center text-wa-teal hover:text-wa-tealDeep hover:scale-110 transition-transform active:scale-95 ${units.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <LayoutGrid size={28} />
        </button>
        {dubbingEnabled && (
        <button
          onClick={() => onNavigate('dubbing')}
          className="w-16 h-16 bg-purple-500 rounded-2xl shadow-xl border-b-4 border-purple-700 flex items-center justify-center animate-bounce-subtle hover:scale-110 transition-transform active:scale-95 active:border-b-0 active:translate-y-1"
        >
          <Mic className="text-white w-8 h-8" />
          <span className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">NEW</span>
        </button>
        )}
      </div>
    </div>
  );
};

const BookOpenIcon = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
);

export default HomeMap;
