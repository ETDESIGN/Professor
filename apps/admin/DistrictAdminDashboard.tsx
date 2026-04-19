import React, { useState, useEffect } from 'react';
import { LogOut, Building2, Users, BookOpen, GraduationCap, Shield, AlertTriangle, ChevronRight, Search, Eye, Lock, Unlock, Trash2, UserCog } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AdminService, DistrictMetrics, TeacherSummary, StudentSummary, SchoolGroup, ContentModerationItem } from '../../services/AdminService';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

type AdminTab = 'overview' | 'schools' | 'teachers' | 'students' | 'content';

const DistrictAdminDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [metrics, setMetrics] = useState<DistrictMetrics | null>(null);
    const [schools, setSchools] = useState<SchoolGroup[]>([]);
    const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
    const [students, setStudents] = useState<StudentSummary[]>([]);
    const [content, setContent] = useState<ContentModerationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [metricsData, schoolsData, teachersData, studentsResult, contentData] = await Promise.all([
                AdminService.getDistrictMetrics(),
                AdminService.getSchoolGroups(),
                AdminService.getTeacherSummaries(),
                AdminService.getStudentSummaries(100),
                AdminService.getContentForModeration(),
            ]);
            setMetrics(metricsData);
            setSchools(schoolsData);
            setTeachers(teachersData);
            setStudents(studentsResult.data);
            setContent(contentData);
        } catch (err: any) {
            toast.error('Failed to load admin data: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleUnitStatus = async (unitId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'Active' ? 'Locked' : 'Active';
        try {
            await AdminService.updateUnitStatus(unitId, newStatus);
            toast.success(`Unit ${newStatus === 'Active' ? 'activated' : 'locked'}`);
            setContent(prev => prev.map(c => c.id === unitId ? { ...c, status: newStatus } : c));
        } catch (err: any) {
            toast.error('Failed to update unit status');
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            await AdminService.updateUserRole(userId, newRole as any);
            toast.success('User role updated');
            loadAllData();
        } catch (err: any) {
            toast.error('Failed to update user role');
        }
    };

    const filteredStudents = students.filter(s =>
        !searchQuery ||
        (s.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredTeachers = teachers.filter(t =>
        !searchQuery ||
        (t.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
        { key: 'overview', label: 'Overview', icon: <Building2 size={18} /> },
        { key: 'schools', label: 'Schools', icon: <Building2 size={18} /> },
        { key: 'teachers', label: 'Teachers', icon: <GraduationCap size={18} /> },
        { key: 'students', label: 'Students', icon: <Users size={18} /> },
        { key: 'content', label: 'Content', icon: <BookOpen size={18} /> },
    ];

    const StatCard = ({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) => (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="text-slate-500 text-sm font-medium">{label}</div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                    {icon}
                </div>
            </div>
            <div className="text-3xl font-bold text-slate-800">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-6">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-indigo-600" />
                        Admin Portal
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">District Administration</p>
                </div>

                <nav className="flex-1 px-4 space-y-1 mt-4">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === tab.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-200">
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            useAppStore.getState().clearUserProfile();
                            window.location.assign(window.location.origin);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="font-medium text-sm">Sign Out</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="bg-white border-b border-slate-200 p-6 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-slate-800">
                        {tabs.find(t => t.key === activeTab)?.label || 'Dashboard'}
                    </h1>
                    <div className="flex items-center gap-3">
                        {(activeTab === 'students' || activeTab === 'teachers') && (
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        )}
                        <button
                            onClick={loadAllData}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 text-sm"
                        >
                            Refresh
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-8 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                {activeTab === 'overview' && metrics && (
                                    <div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                            <StatCard label="Classes" value={metrics.totalSchools} icon={<Building2 size={16} className="text-indigo-600" />} color="bg-indigo-50" />
                                            <StatCard label="Teachers" value={metrics.totalTeachers} icon={<GraduationCap size={16} className="text-emerald-600" />} color="bg-emerald-50" />
                                            <StatCard label="Students" value={metrics.totalStudents} icon={<Users size={16} className="text-blue-600" />} color="bg-blue-50" />
                                            <StatCard label="Parents" value={metrics.totalParents} icon={<Users size={16} className="text-amber-600" />} color="bg-amber-50" />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                            <StatCard label="Active Units" value={metrics.activeUnits} icon={<BookOpen size={16} className="text-green-600" />} color="bg-green-50" />
                                            <StatCard label="Draft Units" value={metrics.draftUnits} icon={<BookOpen size={16} className="text-yellow-600" />} color="bg-yellow-50" />
                                            <StatCard label="Avg XP / Student" value={metrics.avgXpPerStudent} icon={<Users size={16} className="text-purple-600" />} color="bg-purple-50" />
                                            <StatCard label="Completion Rate" value={`${metrics.completionRate}%`} icon={<Users size={16} className="text-teal-600" />} color="bg-teal-50" />
                                        </div>

                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                                            <h3 className="text-lg font-bold text-slate-800 mb-4">Quick Stats</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                                    <div className="text-2xl">📊</div>
                                                    <div>
                                                        <div className="text-sm text-slate-500">Total Content Units</div>
                                                        <div className="font-bold text-slate-800">{metrics.totalUnits}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                                    <div className="text-2xl">🔥</div>
                                                    <div>
                                                        <div className="text-sm text-slate-500">Avg Streak</div>
                                                        <div className="font-bold text-slate-800">{metrics.avgStreak} days</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'schools' && (
                                    <div>
                                        {schools.length === 0 ? (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center text-slate-500">
                                                <Building2 size={48} className="text-slate-300 mb-4" />
                                                <p>No active classes yet.</p>
                                                <p className="text-sm mt-1">Classes will appear here once teachers create them.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {schools.map(school => (
                                                    <div key={school.classId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-indigo-200 transition-colors">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                                                                    <Building2 size={24} className="text-indigo-600" />
                                                                </div>
                                                                <div>
                                                                    <h3 className="font-bold text-slate-800">{school.className}</h3>
                                                                    <p className="text-sm text-slate-500">Teacher: {school.teacherName} {school.subject && `• ${school.subject}`} {school.gradeLevel && `• Grade ${school.gradeLevel}`}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-6">
                                                                <div className="text-center">
                                                                    <div className="text-lg font-bold text-slate-800">{school.studentCount}</div>
                                                                    <div className="text-xs text-slate-500">Students</div>
                                                                </div>
                                                                {school.code && (
                                                                    <div className="px-3 py-1 bg-slate-100 rounded-lg text-sm font-mono text-slate-600">
                                                                        {school.code}
                                                                    </div>
                                                                )}
                                                                <ChevronRight size={20} className="text-slate-400" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'teachers' && (
                                    <div>
                                        {filteredTeachers.length === 0 ? (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center text-slate-500">
                                                <GraduationCap size={48} className="text-slate-300 mb-4" />
                                                <p>No teachers found.</p>
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                                <table className="w-full">
                                                    <thead className="bg-slate-50 border-b border-slate-200">
                                                        <tr>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Teacher</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Classes</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Students</th>
                                                            <th className="text-right px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {filteredTeachers.map(teacher => (
                                                            <tr key={teacher.id} className="hover:bg-slate-50">
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                                            {(teacher.fullName || 'T')[0].toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-medium text-slate-800">{teacher.fullName || 'Unknown'}</div>
                                                                            <div className="text-xs text-slate-500">{teacher.email}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="font-medium text-slate-700">{teacher.classCount}</span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="font-medium text-slate-700">{teacher.studentCount}</span>
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <select
                                                                        value="teacher"
                                                                        onChange={e => handleRoleChange(teacher.id, e.target.value)}
                                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    >
                                                                        <option value="admin">Admin</option>
                                                                        <option value="teacher">Teacher</option>
                                                                        <option value="student">Student</option>
                                                                        <option value="parent">Parent</option>
                                                                    </select>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'students' && (
                                    <div>
                                        {filteredStudents.length === 0 ? (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center text-slate-500">
                                                <Users size={48} className="text-slate-300 mb-4" />
                                                <p>No students found.</p>
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                                <table className="w-full">
                                                    <thead className="bg-slate-50 border-b border-slate-200">
                                                        <tr>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Class</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">XP</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Streak</th>
                                                            <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Units Done</th>
                                                            <th className="text-right px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {filteredStudents.map(student => (
                                                            <tr key={student.id} className="hover:bg-slate-50">
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                                                                            {(student.fullName || 'S')[0].toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-medium text-slate-800">{student.fullName || 'Unknown'}</div>
                                                                            <div className="text-xs text-slate-500">{student.email}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-slate-600">
                                                                    {student.enrolledClassName || '—'}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="font-medium text-indigo-600">{student.xp.toLocaleString()}</span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="font-medium text-slate-700">{student.streak}d</span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="font-medium text-slate-700">{student.completedUnits}</span>
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <select
                                                                        value="student"
                                                                        onChange={e => handleRoleChange(student.id, e.target.value)}
                                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    >
                                                                        <option value="admin">Admin</option>
                                                                        <option value="teacher">Teacher</option>
                                                                        <option value="student">Student</option>
                                                                        <option value="parent">Parent</option>
                                                                    </select>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'content' && (
                                    <div>
                                        {content.length === 0 ? (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center text-slate-500">
                                                <BookOpen size={48} className="text-slate-300 mb-4" />
                                                <p>No content units found.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {content.map(item => (
                                                    <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                                    item.status === 'Active' ? 'bg-green-50' :
                                                                    item.status === 'Draft' ? 'bg-yellow-50' :
                                                                    item.status === 'Locked' ? 'bg-red-50' : 'bg-slate-50'
                                                                }`}>
                                                                    {item.status === 'Active' ? <Unlock size={20} className="text-green-600" /> :
                                                                     item.status === 'Locked' ? <Lock size={20} className="text-red-600" /> :
                                                                     <BookOpen size={20} className="text-yellow-600" />}
                                                                </div>
                                                                <div>
                                                                    <h3 className="font-bold text-slate-800">{item.title}</h3>
                                                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                                                                            item.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                                            item.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                                                                            item.status === 'Locked' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                                                                        }`}>{item.status}</span>
                                                                        <span>Level: {item.level}</span>
                                                                        {item.topic && <span>Topic: {item.topic}</span>}
                                                                        <span>Lessons: {item.lessonCount}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex gap-2 text-xs">
                                                                    {item.hasFlow ? (
                                                                        <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full">Has Flow</span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full">No Flow</span>
                                                                    )}
                                                                    {item.hasManifest ? (
                                                                        <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full">Has Manifest</span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full">No Manifest</span>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={() => handleToggleUnitStatus(item.id, item.status)}
                                                                    className={`p-2 rounded-lg transition-colors ${
                                                                        item.status === 'Active'
                                                                            ? 'text-red-500 hover:bg-red-50'
                                                                            : 'text-green-500 hover:bg-green-50'
                                                                    }`}
                                                                    title={item.status === 'Active' ? 'Lock unit' : 'Activate unit'}
                                                                >
                                                                    {item.status === 'Active' ? <Lock size={18} /> : <Unlock size={18} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>
            </div>
        </div>
    );
};

export default DistrictAdminDashboard;
