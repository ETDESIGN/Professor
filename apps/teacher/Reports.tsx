
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart2, TrendingUp, AlertCircle, CheckCircle, Calendar, Users, ChevronDown, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { getTeacherStudents, getClassAnalytics, StudentWithProgress, ClassAnalytics } from '../../services/DataService';
import { useAppStore } from '../../store/useAppStore';
import { Engine } from '../../services/SupabaseService';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('Reports');

type Timeframe = 'This Week' | 'This Month' | 'All Time';
const TIMEFRAMES: Timeframe[] = ['This Week', 'This Month', 'All Time'];

/** Window start (ms epoch) for a timeframe; All Time → 0 (no lower bound). */
function windowStart(timeframe: Timeframe): number {
   const now = new Date();
   if (timeframe === 'This Week') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - d.getDay()); // start of current week (Sun)
      return d.getTime();
   }
   if (timeframe === 'This Month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
   }
   return 0;
}

/** Raw per-student review timestamps (srs_items.last_review) — the only
 * timestamped activity source behind this page. Same table the existing
 * Engine.getClassMasteryCounts call reads; fetched once, filtered client-side. */
interface ReviewRow {
   student_id: string;
   last_review: string | null;
}

const Reports: React.FC = () => {
   const [timeframe, setTimeframe] = useState<Timeframe>('This Week');
   const [students, setStudents] = useState<StudentWithProgress[]>([]);
   const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null);
   const [masteryByStudent, setMasteryByStudent] = useState<Map<string, { mastered: number; cracked: number }>>(new Map());
   const [reviews, setReviews] = useState<ReviewRow[]>([]);
   const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
   const [loading, setLoading] = useState(true);
   const { userProfile } = useAppStore();

   const toggleExpanded = (id: string) => {
      setExpandedIds((prev) => {
         const next = new Set(prev);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return next;
      });
   };

   // Fetch students, analytics, REAL mastery (plan 4.5) and review timestamps on mount.
   useEffect(() => {
      const fetchData = async () => {
         try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
               const [teacherStudents, classAnalytics] = await Promise.all([
                  getTeacherStudents(user.id),
                  getClassAnalytics(user.id)
               ]);
               setStudents(teacherStudents);
               setAnalytics(classAnalytics);
               // Real per-student mastery from the LearnerState (replaces XP-only views).
               const ids = teacherStudents.map((s) => s.id).filter(Boolean);
               if (ids.length > 0) {
                  const counts = await Engine.getClassMasteryCounts(ids);
                  const m = new Map<string, { mastered: number; cracked: number }>();
                  counts.forEach((c, sid) => m.set(sid, { mastered: c.mastered, cracked: c.cracked }));
                  setMasteryByStudent(m);
                  // Review timestamps for the timeframe filter (client-side filtering).
                  const { data: reviewRows, error: reviewError } = await supabase
                     .from('srs_items')
                     .select('student_id, last_review')
                     .in('student_id', ids)
                     .not('last_review', 'is', null);
                  if (reviewError) {
                     log.warn('error_fetching_reviews', { error: reviewError.message });
                  } else {
                     setReviews((reviewRows || []) as ReviewRow[]);
                  }
               }
            }
         } catch (error) {
            log.warn('error_fetching_data', { error: error instanceof Error ? error.message : String(error) });
         } finally {
            setLoading(false);
         }
      };
      fetchData();
   }, []);

   // Per-student activity derived from review timestamps, filtered by timeframe.
   const activityByStudent = useMemo(() => {
      const start = windowStart(timeframe);
      const m = new Map<string, { inWindow: number; total: number; lastMs: number }>();
      for (const r of reviews) {
         const ms = r.last_review ? new Date(r.last_review).getTime() : 0;
         const a = m.get(r.student_id) || { inWindow: 0, total: 0, lastMs: 0 };
         a.total += 1;
         if (ms > a.lastMs) a.lastMs = ms;
         if (ms >= start) a.inWindow += 1;
         m.set(r.student_id, a);
      }
      return m;
   }, [reviews, timeframe]);

   const startMs = useMemo(() => windowStart(timeframe), [timeframe]);

   // Students with at least one review inside the selected window.
   // All Time shows everyone (regardless of review history).
   const activeStudents = useMemo(
      () =>
         timeframe === 'All Time'
            ? students
            : students.filter((s) => (activityByStudent.get(s.id)?.inWindow ?? 0) > 0),
      [students, activityByStudent, timeframe]
   );

   // Leaderboard: fixed in-render sort mutation → memoized copy.
   const sortedStudents = useMemo(
      () =>
         [...activeStudents].sort((a, b) => {
            const ma = masteryByStudent.get(a.id)?.mastered || 0;
            const mb = masteryByStudent.get(b.id)?.mastered || 0;
            return mb - ma || (b.xp || 0) - (a.xp || 0);
         }),
      [activeStudents, masteryByStudent]
   );

   // Use analytics data or fallback to empty state
   const stats = analytics || {
      mastery: 0,
      engagement: 0,
      completion: 0,
      totalXp: 0,
      timeSpent: 0
   };

   const skills = analytics?.skills || [];
   // "Needs attention" = students who haven't acquired ANY skill yet (real mastery,
   // not XP) — surfaces genuine non-starters rather than just low-XP students.
   // Timeframe-aware when a window is selected: within a window, a student who
   // reviewed nothing this period is the one who needs attention.
   const atRiskStudents = useMemo(
      () =>
         startMs > 0
            ? students.filter((s) => (activityByStudent.get(s.id)?.inWindow ?? 0) === 0)
            : students.filter((s) => (masteryByStudent.get(s.id)?.mastered ?? -1) === 0),
      [students, activityByStudent, masteryByStudent, startMs]
   );

   // Show loading state
   if (loading) {
      return (
         <div className="flex-1 p-8 overflow-auto bg-slate-50 font-sans flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-slate-500">
               <Loader2 className="w-8 h-8 animate-spin" />
               <span className="font-medium">Loading analytics...</span>
            </div>
         </div>
      );
   }

   return (
      <div className="flex-1 p-8 overflow-auto bg-slate-50 font-sans">
         {/* Header */}
         <header className="flex flex-wrap gap-3 justify-between items-center mb-8">
            <div>
               <h1 className="text-2xl font-bold text-slate-800">Class Performance</h1>
               <p className="text-slate-500">Analytics for {userProfile?.full_name || 'Teacher'}'s Classes</p>
            </div>
            <div className="relative">
               <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
               <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                  aria-label="Timeframe"
                  className="appearance-none flex items-center gap-2 pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200"
               >
                  {TIMEFRAMES.map((t) => (
                     <option key={t} value={t}>{t}</option>
                  ))}
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
         </header>

         {/* Overview Cards — aggregate class stats from class_analytics_view.
             These have no timestamps, so they always cover all time; the
             timeframe filter applies to the per-student lists below. */}
         <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-3">
            Overview cards are all-time aggregates — the timeframe filter applies to the student lists below
         </p>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <StatCard
                   title="Class Mastery"
                   value={`${stats.mastery}%`}
                   icon={<CheckCircle size={20} />}
                   color="text-green-600"
                   bg="bg-green-100"
                />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <StatCard
                   title="Avg. Engagement"
                   value={`${stats.engagement}%`}
                   icon={<Users size={20} />}
                   color="text-blue-600"
                   bg="bg-blue-100"
                />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <StatCard
                   title="Homework Done"
                   value={`${stats.completion}%`}
                   icon={<BarChart2 size={20} />}
                   color="text-purple-600"
                   bg="bg-purple-100"
                />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <StatCard
                   title="Total XP Earned"
                   value={stats.totalXp.toLocaleString()}
                   icon={<TrendingUp size={20} />}
                   color="text-orange-600"
                   bg="bg-orange-100"
                />
            </motion.div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Skills Breakdown */}
            <motion.div
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.5 }}
               className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2"
            >
               <h3 className="font-bold text-slate-800 mb-6">Skills Breakdown</h3>
               <div className="space-y-6">
                  {skills.length > 0 ? skills.map((skill, index) => (
                     <div key={skill.name}>
                        <div className="flex justify-between text-sm font-bold mb-2">
                           <span className="text-slate-600">{skill.name}</span>
                           <span className="text-slate-800">{skill.score}%</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                           <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${skill.score}%` }}
                              transition={{ duration: 1, delay: 0.6 + (index * 0.1) }}
                              className={`h-full rounded-full ${skill.color}`}
                           ></motion.div>
                        </div>
                     </div>
                  )) : (
                     <div className="text-center text-slate-400 py-8 text-sm">
                        No skill data yet — skills appear once students start earning XP.
                     </div>
                  )}
               </div>
            </motion.div>

            {/* Students at Risk */}
            <motion.div
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.6 }}
               className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col"
            >
               <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertCircle size={20} className="text-red-500" /> Needs Attention
               </h3>
               <p className="text-xs text-slate-400 mb-3">
                  {startMs > 0
                     ? `No reviews recorded ${timeframe === 'This Week' ? 'this week' : 'this month'}`
                     : 'Students who have not mastered any skill yet'}
               </p>
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {atRiskStudents.length > 0 ? atRiskStudents.map((student, index) => (
                     <motion.div
                        key={student.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 + (index * 0.1) }}
                        className="p-3 bg-red-50/50 rounded-xl border border-red-100"
                     >
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-xl border border-red-100 shadow-sm shrink-0">
                              {student.avatar_url ? <img src={student.avatar_url} alt="" className="w-10 h-10 rounded-full" /> : (student.full_name?.[0] || '?')}
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{student.full_name || student.email}</div>
                              <div className="text-xs text-red-500 font-bold">
                                 {startMs > 0 ? 'Inactive this period' : 'Low Participation'}
                              </div>
                           </div>
                           <button
                              onClick={() => toggleExpanded(student.id)}
                              className="text-xs bg-white border border-slate-200 px-2 py-1 rounded font-bold text-slate-600 hover:text-slate-800 shrink-0"
                           >
                              {expandedIds.has(student.id) ? 'Hide' : 'Details'}
                           </button>
                        </div>
                        {expandedIds.has(student.id) && (
                           <StudentDetailPanel student={student} mastery={masteryByStudent.get(student.id)} activity={activityByStudent.get(student.id)} />
                        )}
                     </motion.div>
                  )) : (
                     <div className="text-center text-slate-400 py-8 text-sm">
                        🎉 No students at risk!
                     </div>
                  )}
               </div>
               {atRiskStudents.length > 0 && (
                  <button
                     onClick={() => {
                        const ids = new Set(atRiskStudents.map((s) => s.id));
                        const allOpen = atRiskStudents.every((s) => expandedIds.has(s.id));
                        setExpandedIds(allOpen ? new Set() : ids);
                     }}
                     className="w-full mt-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                     {atRiskStudents.every((s) => expandedIds.has(s.id)) ? 'Hide Full Insights' : 'View Full Insights'}
                  </button>
               )}
            </motion.div>
         </div>

         {/* Detailed Table */}
         <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
         >
            <div className="p-6 border-b border-slate-100 flex flex-wrap gap-2 justify-between items-center">
               <h3 className="font-bold text-slate-800">
                  Student Leaderboard
                  <span className="ml-2 text-sm font-normal text-slate-400">
                     {activeStudents.length} of {students.length} active · {timeframe}
                  </span>
               </h3>
            </div>
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                   <tr>
                      <th className="p-4 pl-6">Rank</th>
                      <th className="p-4">Student</th>
                      <th className="p-4">Skills Mastered</th>
                      <th className="p-4">XP</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 pr-6 text-right">Details</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                   {sortedStudents.length > 0 ? sortedStudents.map((s, i) => {
                      const m = masteryByStudent.get(s.id);
                      const a = activityByStudent.get(s.id);
                      return (
                         <React.Fragment key={s.id}>
                         <motion.tr
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.9 + (i * 0.05) }}
                            className="hover:bg-slate-50 transition-colors"
                         >
                            <td className="p-4 pl-6 font-bold text-slate-400">#{i + 1}</td>
                            <td className="p-4">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                                     {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full" /> : (s.full_name?.[0] || '?')}
                                  </div>
                                  <span className="font-bold text-slate-700">{s.full_name || s.email}</span>
                               </div>
                            </td>
                            <td className="p-4">
                               <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-green-700">{m?.mastered ?? 0}</span>
                                  {!!m?.cracked && (
                                     <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full" title="Skills that have decayed and need review">
                                        {m.cracked} cracked
                                     </span>
                                  )}
                               </div>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-600">{(s.xp || 0).toLocaleString()}</td>
                            <td className="p-4">
                               <span className={`px-2 py-1 rounded-full text-xs font-bold ${(m?.mastered ?? 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {(m?.mastered ?? 0) > 0 ? 'On Track' : 'Getting Started'}
                               </span>
                            </td>
                            <td className="p-4 pr-6 text-right">
                               <button
                                  onClick={() => toggleExpanded(s.id)}
                                  className="text-xs bg-white border border-slate-200 px-2 py-1 rounded font-bold text-slate-600 hover:text-slate-800"
                               >
                                  {expandedIds.has(s.id) ? 'Hide' : 'Details'}
                               </button>
                            </td>
                         </motion.tr>
                         {expandedIds.has(s.id) && (
                            <tr>
                               <td colSpan={6} className="p-4 bg-slate-50/70">
                                  <StudentDetailPanel student={s} mastery={m} activity={a} />
                               </td>
                            </tr>
                         )}
                         </React.Fragment>
                      );
                   }) : (
                      <tr>
                         <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                            No student activity recorded for {timeframe.toLowerCase()}. Switch to All Time to see everyone.
                         </td>
                      </tr>
                   )}
                </tbody>
            </table>
         </motion.div>
      </div>
   );
};

/** Inline per-student detail panel — built ONLY from data already on the page
 * (StudentWithProgress + mastery counts + review timestamps). No backend calls. */
const StudentDetailPanel: React.FC<{
   student: StudentWithProgress;
   mastery?: { mastered: number; cracked: number };
   activity?: { inWindow: number; total: number; lastMs: number };
}> = ({ student, mastery, activity }) => (
   <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4 text-sm">
      <div className="flex items-center gap-3 mb-3">
         <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
            {student.avatar_url ? <img src={student.avatar_url} alt="" className="w-10 h-10 rounded-full" /> : (student.full_name?.[0] || '?')}
         </div>
         <div>
            <div className="font-bold text-slate-800">{student.full_name || 'Unnamed student'}</div>
            <div className="text-xs text-slate-400">{student.email}</div>
         </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         <DetailStat label="Skills Mastered" value={String(mastery?.mastered ?? 0)} />
         <DetailStat label="Cracked Skills" value={String(mastery?.cracked ?? 0)} />
         <DetailStat label="Total XP" value={(student.xp || 0).toLocaleString()} />
         <DetailStat label="Streak (days)" value={String(student.streak || 0)} />
         <DetailStat label="Reviews (all time)" value={String(activity?.total ?? 0)} />
         <DetailStat
            label="Last Activity"
            value={activity?.lastMs ? new Date(activity.lastMs).toLocaleDateString() : 'Never'}
         />
         <DetailStat label="Units Completed" value={String(student.completed_unit_ids?.length ?? 0)} />
         <DetailStat label="Current Unit" value={student.current_unit_id ? 'Assigned' : 'None'} />
      </div>
   </div>
);

const DetailStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
   <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="font-bold text-slate-700">{value}</div>
   </div>
);

const StatCard = ({ title, value, icon, color, bg }: any) => (
   <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
         <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
            {icon}
         </div>
      </div>
      <div>
         <div className="text-3xl font-bold text-slate-800">{value}</div>
         <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{title}</div>
      </div>
   </div>
);

export default Reports;
