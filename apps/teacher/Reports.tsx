
import React, { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, AlertCircle, CheckCircle, Download, Calendar, Users, ArrowUp, ArrowDown, ChevronDown, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { getTeacherStudents, getClassAnalytics, StudentWithProgress, ClassAnalytics } from '../../services/DataService';

const Reports: React.FC = () => {
   const [timeframe, setTimeframe] = useState('This Week');
   const [students, setStudents] = useState<StudentWithProgress[]>([]);
   const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null);
   const [loading, setLoading] = useState(true);

   // Fetch students and analytics on mount
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
            }
         } catch (error) {
            console.error('Error fetching data:', error);
         } finally {
            setLoading(false);
         }
      };
      fetchData();
   }, []);

   // Use analytics data or fallback to empty state
   const stats = analytics || {
      mastery: 0,
      engagement: 0,
      completion: 0,
      totalXp: 0,
      timeSpent: 0
   };

   const skills = analytics?.skills || [];
   const atRiskStudents = students.filter(s => (s.xp || 0) < 100);

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
         <header className="flex justify-between items-center mb-8">
            <div>
               <h1 className="text-2xl font-bold text-slate-800">Class Performance</h1>
               <p className="text-slate-500">Analytics for Class 3B • English</p>
            </div>
            <div className="flex gap-3">
               <div className="relative">
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 text-sm">
                     <Calendar size={16} /> {timeframe} <ChevronDown size={14} />
                  </button>
               </div>
               <button className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-sm hover:bg-indigo-100 border border-indigo-100">
                  <Download size={16} /> Export Report
               </button>
            </div>
         </header>

         {/* Overview Cards */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
               <StatCard
                  title="Class Mastery"
                  value={`${stats.mastery}%`}
                  trend="+4%"
                  trendUp={true}
                  icon={<CheckCircle size={20} />}
                  color="text-green-600"
                  bg="bg-green-100"
               />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
               <StatCard
                  title="Avg. Engagement"
                  value={`${stats.engagement}%`}
                  trend="-2%"
                  trendUp={false}
                  icon={<Users size={20} />}
                  color="text-blue-600"
                  bg="bg-blue-100"
               />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
               <StatCard
                  title="Homework Done"
                  value={`${stats.completion}%`}
                  trend="+12%"
                  trendUp={true}
                  icon={<BarChart2 size={20} />}
                  color="text-purple-600"
                  bg="bg-purple-100"
               />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
               <StatCard
                  title="Total XP Earned"
                  value={stats.totalXp.toLocaleString()}
                  trend="+1.2k"
                  trendUp={true}
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
                  {skills.map((skill, index) => (
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
                  ))}
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
               <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {atRiskStudents.length > 0 ? atRiskStudents.map((student, index) => (
                     <motion.div
                        key={student.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 + (index * 0.1) }}
                        className="flex items-center gap-3 p-3 bg-red-50/50 rounded-xl border border-red-100"
                     >
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-xl border border-red-100 shadow-sm">
                           {student.avatar_url ? <img src={student.avatar_url} alt="" className="w-10 h-10 rounded-full" /> : (student.full_name?.[0] || '?')}
                        </div>
                        <div className="flex-1">
                           <div className="font-bold text-slate-800 text-sm">{student.full_name || student.email}</div>
                           <div className="text-xs text-red-500 font-bold">Low Participation</div>
                        </div>
                        <button className="text-xs bg-white border border-slate-200 px-2 py-1 rounded font-bold text-slate-600 hover:text-slate-800">
                           Details
                        </button>
                     </motion.div>
                  )) : (
                     <div className="text-center text-slate-400 py-8 text-sm">
                        🎉 No students at risk!
                     </div>
                  )}
               </div>
               <button className="w-full mt-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">
                  View Full Insights
               </button>
            </motion.div>
         </div>

         {/* Detailed Table */}
         <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
         >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="font-bold text-slate-800">Student Leaderboard</h3>
               <button className="text-indigo-600 font-bold text-sm hover:underline">View All Students</button>
            </div>
            <table className="w-full text-left border-collapse">
               <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                  <tr>
                     <th className="p-4 pl-6">Rank</th>
                     <th className="p-4">Student</th>
                     <th className="p-4">Accuracy</th>
                     <th className="p-4">Time Spent</th>
                     <th className="p-4">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 text-sm">
                  {students.sort((a, b) => (b.xp || 0) - (a.xp || 0)).map((s, i) => (
                     <motion.tr
                        key={s.id}
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
                        <td className="p-4 font-mono font-bold text-slate-600">
                           {Math.min(100, Math.round((s.xp || 0) / 10))}%
                        </td>
                        <td className="p-4 text-slate-500">
                           {Math.round((s.xp || 0) / 15)}m
                        </td>
                        <td className="p-4">
                           <span className={`px-2 py-1 rounded-full text-xs font-bold ${(s.xp || 0) > 100 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {(s.xp || 0) > 100 ? 'On Track' : 'Improving'}
                           </span>
                        </td>
                     </motion.tr>
                  ))}
               </tbody>
            </table>
         </motion.div>
      </div>
   );
};

const StatCard = ({ title, value, trend, trendUp, icon, color, bg }: any) => (
   <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
         <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
            {icon}
         </div>
         <div className={`flex items-center gap-1 text-xs font-bold ${trendUp ? 'text-green-600' : 'text-red-500'} bg-slate-50 px-2 py-1 rounded-full`}>
            {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trend}
         </div>
      </div>
      <div>
         <div className="text-3xl font-bold text-slate-800">{value}</div>
         <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{title}</div>
      </div>
   </div>
);

export default Reports;
