import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Search, Copy, Users, CheckCircle, School, Link2, Bell,
    Send, Archive, ChevronRight, GraduationCap, Building2, Clock, Play, CalendarCheck,
} from 'lucide-react';
import AttendanceHistoryModal from './AttendanceHistoryModal';
import { createClass, ClassData } from '../../services/DataService';
import { buildClaimUrl, RosterStudent } from '../../services/ManagementService';
import { Modal, Field } from './SharedUI';
import {
    useTeacherClasses, useMyMemberships, useSchoolDirectory, useRequestAffiliation,
    useWithdrawAffiliation, useRosterForClass, useCreateRosterStudent,
    useArchiveRosterStudent, usePendingParentLinks, useDecideParentRosterLink,
    useClassAnnouncements, useCreateClassAnnouncement,
} from '../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '../../store/useAppStore';

const ClassManagement: React.FC = () => {
    const { userProfile } = useAppStore();
    const queryClient = useQueryClient();
    const teacherId = userProfile?.id;

    const { data: classes = [], isLoading: loadingClasses } = useTeacherClasses(teacherId);
    const { data: memberships = [] } = useMyMemberships(teacherId);
    const { data: pendingLinks = [] } = usePendingParentLinks(!!teacherId);

    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const selectedClass = classes.find(c => c.id === selectedClassId) || null;

    // modals
    const [showCreateClass, setShowCreateClass] = useState(false);
    const [showAffiliation, setShowAffiliation] = useState(false);
    const [showApprovals, setShowApprovals] = useState(false);
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [createdClaim, setCreatedClaim] = useState<{ name: string; url: string } | null>(null);

    // create-class form
    const [newClassName, setNewClassName] = useState('');
    const [newClassSubject, setNewClassSubject] = useState('');
    // School to scope the new class to. '' = independent (school_id NULL).
    // Only active memberships are eligible; the teacher picks per class.
    const activeMemberships = memberships.filter(m => m.status === 'active');
    const [newClassSchoolId, setNewClassSchoolId] = useState<string>('');

    const activeMembership = memberships.find(m => m.status === 'active');
    const pendingMembership = memberships.find(m => m.status === 'pending');

    const handleCreateClass = async () => {
        if (!newClassName.trim() || !teacherId) return;
        try {
            await createClass(teacherId, {
                name: newClassName,
                subject: newClassSubject,
                is_active: true,
                school_id: newClassSchoolId || null,
            });
            queryClient.invalidateQueries({ queryKey: ['teacherClasses', teacherId] });
            setNewClassName('');
            setNewClassSubject('');
            setNewClassSchoolId('');
            setShowCreateClass(false);
            toast.success('Class created');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not create class');
        }
    };

    return (
        <div className="flex-1 flex overflow-hidden bg-slate-50">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <div className="p-8 pb-4">
                    <div className="flex justify-between items-start mb-6 gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Classes &amp; Roster</h1>
                            <p className="text-slate-500">Your classes, students, and school affiliation</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setShowAffiliation(true)}
                                className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 font-medium shadow-sm text-sm"
                            >
                                <Building2 size={16} />
                                {activeMembership ? activeMembership.school?.name || 'School'
                                    : pendingMembership ? `Pending: ${pendingMembership.school?.name || ''}`
                                    : 'Independent'}
                            </button>
                            <button
                                onClick={() => setShowApprovals(true)}
                                className="relative flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 font-medium shadow-sm text-sm"
                            >
                                <Bell size={16} /> Approvals
                                {pendingLinks.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                        {pendingLinks.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setShowCreateClass(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-duo-blue text-white rounded-lg hover:bg-blue-600 font-bold shadow-md shadow-blue-200 text-sm"
                            >
                                <Plus size={18} /> Create Class
                            </button>
                        </div>
                    </div>
                </div>

                {/* Body: class list OR class detail */}
                <div className="flex-1 overflow-auto px-8 pb-8">
                    {selectedClass ? (
                        <ClassDetail
                            cls={selectedClass}
                            teacherId={teacherId!}
                            onBack={() => setSelectedClassId(null)}
                            onAnnounce={() => setShowAnnouncement(true)}
                        />
                    ) : (
                        <ClassList
                            classes={classes}
                            loading={loadingClasses}
                            onSelect={(id) => setSelectedClassId(id)}
                            onCreate={() => setShowCreateClass(true)}
                        />
                    )}
                </div>
            </div>

            {/* Create Class modal */}
            <Modal open={showCreateClass} onClose={() => setShowCreateClass(false)} title="Create New Class">
                <div className="space-y-4">
                    <Field label="Class Name">
                        <input
                            value={newClassName}
                            onChange={e => setNewClassName(e.target.value)}
                            placeholder="e.g., Grade 3 English"
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-duo-blue"
                        />
                    </Field>
                    <Field label="Subject (optional)">
                        <input
                            value={newClassSubject}
                            onChange={e => setNewClassSubject(e.target.value)}
                            placeholder="e.g., English, Math"
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-duo-blue"
                        />
                    </Field>
                    {activeMemberships.length > 0 && (
                        <Field label="School (optional)">
                            <select
                                value={newClassSchoolId}
                                onChange={e => setNewClassSchoolId(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-duo-blue"
                            >
                                <option value="">Independent (no school)</option>
                                {activeMemberships.map(m => (
                                    <option key={m.school_id} value={m.school_id}>
                                        {m.school?.name || 'School'}{m.role === 'manager' ? ' (Manager)' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-400 mt-1">
                                School-scoped classes are visible to that school's managers.
                            </p>
                        </Field>
                    )}
                    <button
                        onClick={handleCreateClass}
                        disabled={!newClassName.trim()}
                        className="w-full py-3 bg-duo-blue text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Create Class
                    </button>
                </div>
            </Modal>

            {/* Claim link success modal */}
            <Modal open={!!createdClaim} onClose={() => setCreatedClaim(null)} title="Student added">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-green-600" />
                    </div>
                    <p className="text-slate-600 mb-1">
                        <span className="font-bold text-slate-800">{createdClaim?.name}</span> was added to the roster.
                    </p>
                    <p className="text-sm text-slate-500 mb-4">
                        Share this one-time link so the student (or parent) can claim their home account:
                    </p>
                    <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-3 mb-4 break-all text-xs font-mono text-slate-700">
                        {createdClaim?.url}
                    </div>
                    <button
                        onClick={() => {
                            if (createdClaim) navigator.clipboard.writeText(createdClaim.url);
                            toast.success('Claim link copied');
                            setCreatedClaim(null);
                        }}
                        className="w-full py-3 bg-teacher-primary text-white rounded-lg font-bold hover:bg-emerald-500 flex items-center justify-center gap-2"
                    >
                        <Copy size={18} /> Copy link &amp; close
                    </button>
                </div>
            </Modal>

            {/* Affiliation modal */}
            {showAffiliation && teacherId && (
                <AffiliationModal
                    userId={teacherId}
                    memberships={memberships}
                    onClose={() => setShowAffiliation(false)}
                />
            )}

            {/* Approvals modal */}
            <Modal open={showApprovals} onClose={() => setShowApprovals(false)} title={`Pending approvals (${pendingLinks.length})`}>
                {pendingLinks.length === 0 ? (
                    <EmptyMini icon={<Bell size={28} />} text="No pending approvals" />
                ) : (
                    <ul className="space-y-2 max-h-96 overflow-auto">
                        {pendingLinks.map(link => (
                            <li key={link.id} className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg">
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate">
                                        {link.parent?.full_name || link.parent?.email || 'Parent'}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate">
                                        wants to link with <span className="font-medium">{link.roster?.display_name || 'a student'}</span>
                                    </div>
                                </div>
                                <ApproveButtons linkId={link.id} />
                            </li>
                        ))}
                    </ul>
                )}
            </Modal>

            {/* Announcement modal */}
            {showAnnouncement && selectedClass && teacherId && (
                <AnnouncementModal
                    classId={selectedClass.id}
                    authorId={teacherId}
                    onClose={() => setShowAnnouncement(false)}
                />
            )}
        </div>
    );
};

// ---- Class list (first-class) ----
const ClassList: React.FC<{ classes: ClassData[]; loading: boolean; onSelect: (id: string) => void; onCreate: () => void }> = ({ classes, loading, onSelect, onCreate }) => {
    const [query, setQuery] = useState('');
    const filtered = classes.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    return (
        <div>
            <div className="flex items-center gap-3 mb-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                <Search size={18} className="text-slate-400 ml-2" />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search classes..."
                    className="flex-1 text-sm outline-none bg-transparent"
                />
            </div>
            {loading ? (
                <div className="text-slate-400 text-sm">Loading classes…</div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">No classes yet</h3>
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">Create a class, then add students to its roster.</p>
                    <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-duo-blue text-white rounded-lg hover:bg-blue-600 font-bold shadow-md shadow-blue-200">
                        <Plus size={18} /> Create Class
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(c => (
                        <button
                            key={c.id}
                            onClick={() => onSelect(c.id)}
                            className="text-left bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-10 h-10 bg-blue-50 text-duo-blue rounded-lg flex items-center justify-center">
                                    <GraduationCap size={20} />
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500" />
                            </div>
                            <div className="font-bold text-slate-800">{c.name}</div>
                            {c.subject && <div className="text-xs text-slate-500">{c.subject}</div>}
                            <div className="mt-3 flex items-center gap-2 text-xs">
                                <span className="font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">{c.code || '—'}</span>
                                <span className="text-slate-400">code</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ---- Class detail (roster) ----
const ClassDetail: React.FC<{ cls: ClassData; teacherId: string; onBack: () => void; onAnnounce: () => void }> = ({ cls, teacherId, onBack, onAnnounce }) => {
    const navigate = useNavigate();
    const { data: roster = [], isLoading } = useRosterForClass(cls.id);
    const createStudent = useCreateRosterStudent();
    const archiveStudent = useArchiveRosterStudent();
    const [showAdd, setShowAdd] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [name, setName] = useState('');

    const claimedCount = roster.filter(r => !!r.claimed_profile_id).length;

    const handleAdd = async () => {
        if (!name.trim()) return;
        try {
            const created = await createStudent.mutateAsync({ classId: cls.id, teacherId, displayName: name });
            setName('');
            setShowAdd(false);
            // surface the claim link
            toast(
                <div>
                    <div className="font-bold">{created.display_name} added</div>
                    <button
                        className="text-duo-blue underline"
                        onClick={() => { navigator.clipboard.writeText(buildClaimUrl(created.claim_token)); toast.success('Claim link copied'); }}
                    >Copy claim link</button>
                </div>,
                { duration: 8000 }
            );
        } catch { /* toast handled in service */ }
    };

    const copyCode = () => { if (cls.code) { navigator.clipboard.writeText(cls.code); toast.success('Class code copied'); } };
    const copyClaim = (r: RosterStudent) => { navigator.clipboard.writeText(buildClaimUrl(r.claim_token)); toast.success('Claim link copied'); };

    return (
        <div>
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1">
                ← All classes
            </button>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{cls.name}</h2>
                        {cls.subject && <div className="text-sm text-slate-500">{cls.subject}</div>}
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                            <button onClick={copyCode} className="flex items-center gap-1 hover:text-slate-700">
                                <span className="font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">{cls.code || '—'}</span>
                                <Copy size={12} /> code
                            </button>
                            <span>{roster.length} roster · {claimedCount} claimed</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => navigate(`/teacher/live?class=${cls.id}`)}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1.5"
                        >
                            <Play size={15} /> Teach
                        </button>
                        <button onClick={() => setShowHistory(true)}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                          <CalendarCheck size={15} /> Attendance
                        </button>
                        <button onClick={onAnnounce} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                            <Send size={15} /> Announce
                        </button>
                        <button onClick={() => setShowAdd(true)} className="px-3 py-2 bg-teacher-primary text-white rounded-lg text-sm font-bold hover:bg-emerald-500 flex items-center gap-1.5">
                            <Plus size={15} /> Add student
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th className="p-4">Student</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                            <tr><td colSpan={3} className="p-6 text-sm text-slate-400">Loading roster…</td></tr>
                        ) : roster.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="p-10 text-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Users size={28} className="text-slate-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-800 mb-1">No students yet</h3>
                                    <p className="text-sm text-slate-500 mb-4">Add a student to generate a claim link they use at home.</p>
                                    <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-teacher-primary text-white rounded-lg hover:bg-emerald-500 font-bold text-sm">
                                        <Plus size={16} /> Add student
                                    </button>
                                </td>
                            </tr>
                        ) : roster.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">
                                            {r.display_name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="font-bold text-slate-800">{r.display_name}</div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    {r.claimed_profile_id ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                            <CheckCircle size={12} /> Claimed
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                            <Clock size={12} /> Unclaimed
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="inline-flex items-center gap-2">
                                        {!r.claimed_profile_id && (
                                            <button onClick={() => copyClaim(r)} className="text-xs font-medium text-duo-blue hover:underline flex items-center gap-1">
                                                <Link2 size={13} /> Claim link
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { if (confirm(`Remove ${r.display_name} from roster?`)) archiveStudent.mutate({ id: r.id, classId: cls.id }); }}
                                            className="text-xs font-medium text-red-500 hover:underline flex items-center gap-1"
                                        >
                                            <Archive size={13} /> Remove
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Attendance history modal */}
            {showHistory && <AttendanceHistoryModal classId={cls.id} onClose={() => setShowHistory(false)} />}

            {/* Add student modal */}
            <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add student to roster">
                <p className="text-sm text-slate-500 mb-4">
                    Creates a roster entry (no login yet). You'll get a one-time claim link for the student to bind their home account.
                </p>
                <Field label="Student name">
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        placeholder="e.g., Leo Mendes"
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                    />
                </Field>
                <button
                    onClick={handleAdd}
                    disabled={!name.trim() || createStudent.isPending}
                    className="w-full mt-4 py-3 bg-teacher-primary text-white rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50"
                >
                    {createStudent.isPending ? 'Adding…' : 'Add & generate claim link'}
                </button>
            </Modal>
        </div>
    );
};

// ---- Affiliation modal ----
const AffiliationModal: React.FC<{ userId: string; memberships: any[]; onClose: () => void }> = ({ userId, memberships, onClose }) => {
    const { data: directory = [] } = useSchoolDirectory();
    const requestMut = useRequestAffiliation();
    const withdrawMut = useWithdrawAffiliation();
    const requestedSchoolIds = new Set(memberships.map((m: any) => m.school_id));

    return (
        <Modal open={true} onClose={onClose} title="School affiliation">
            <div className="space-y-4">
                <div>
                    <div className="text-xs font-bold uppercase text-slate-500 mb-2">Your status</div>
                    {memberships.length === 0 ? (
                        <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                            You are <span className="font-bold">independent</span> — not affiliated to any school.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {memberships.map((m: any) => (
                                <li key={m.id} className="flex items-center justify-between gap-2 p-3 border border-slate-200 rounded-lg">
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-800 truncate">{m.school?.name || 'School'}</div>
                                        <div className="text-xs text-slate-500 capitalize">
                                            <StatusBadge status={m.status} /> · {m.role}
                                        </div>
                                    </div>
                                    {m.status === 'pending' && (
                                        <button onClick={() => withdrawMut.mutate(m.id)} className="text-xs text-red-500 hover:underline">Withdraw</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <div className="text-xs font-bold uppercase text-slate-500 mb-2">Link to a school</div>
                    {directory.length === 0 ? (
                        <div className="text-sm text-slate-500">No schools are listed yet.</div>
                    ) : (
                        <ul className="space-y-1 max-h-64 overflow-auto">
                            {directory.map(s => {
                                const already = requestedSchoolIds.has(s.id);
                                return (
                                    <li key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <School size={16} className="text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="font-medium text-slate-800 truncate">{s.name}</div>
                                                {(s.city || s.country) && <div className="text-xs text-slate-400 truncate">{[s.city, s.country].filter(Boolean).join(', ')}</div>}
                                            </div>
                                        </div>
                                        <button
                                            disabled={already || requestMut.isPending}
                                            onClick={() => requestMut.mutate({ schoolId: s.id, userId })}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                                        >
                                            {already ? 'Requested' : 'Request'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </Modal>
    );
};

// ---- Announcement modal ----
const AnnouncementModal: React.FC<{ classId: string; authorId: string; onClose: () => void }> = ({ classId, authorId, onClose }) => {
    const { data: announcements = [] } = useClassAnnouncements(classId);
    const createMut = useCreateClassAnnouncement();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');

    const send = async () => {
        if (!body.trim()) return;
        try {
            await createMut.mutateAsync({ classId, authorId, title, body });
            setTitle(''); setBody('');
        } catch { /* handled */ }
    };

    return (
        <Modal open={true} onClose={onClose} title="Class announcement">
            <div className="space-y-3">
                {announcements.length > 0 && (
                    <ul className="space-y-2 max-h-40 overflow-auto">
                        {announcements.map(a => (
                            <li key={a.id} className="p-2 border border-slate-200 rounded-lg">
                                {a.title && <div className="font-bold text-sm text-slate-800">{a.title}</div>}
                                <div className="text-sm text-slate-600">{a.body}</div>
                            </li>
                        ))}
                    </ul>
                )}
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-duo-blue text-sm"
                />
                <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="Message to the class…"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-duo-blue text-sm"
                />
                <button
                    onClick={send}
                    disabled={!body.trim() || createMut.isPending}
                    className="w-full py-2.5 bg-duo-blue text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <Send size={16} /> Post announcement
                </button>
            </div>
        </Modal>
    );
};

// ---- Approve buttons ----
const ApproveButtons: React.FC<{ linkId: string }> = ({ linkId }) => {
    const decide = useDecideParentRosterLink();
    return (
        <div className="flex gap-1.5 shrink-0">
            <button
                disabled={decide.isPending}
                onClick={() => decide.mutate({ linkId, approve: true })}
                className="px-2.5 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold hover:bg-green-200"
            >Approve</button>
            <button
                disabled={decide.isPending}
                onClick={() => decide.mutate({ linkId, approve: false })}
                className="px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200"
            >Reject</button>
        </div>
    );
};

// ---- Small shared UI ----
const EmptyMini: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <div className="mb-2">{icon}</div>
        <div className="text-sm">{text}</div>
    </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const map: Record<string, string> = {
        active: 'text-green-700',
        pending: 'text-amber-700',
        rejected: 'text-red-600',
        revoked: 'text-slate-500',
    };
    return <span className={map[status] || 'text-slate-600'}>{status}</span>;
};

export default ClassManagement;
