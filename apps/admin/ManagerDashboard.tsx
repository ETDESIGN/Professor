import React, { useState } from 'react';
import {
    Building2, Users, UserPlus, CheckCircle, X, Copy, Mail, Clock, ShieldOff, Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { toast } from 'sonner';
import {
    useMyMemberships, useSchoolMembers, useSetMembershipStatus,
    useInviteTeacher, useRevokeMember, usePendingParentLinks, useDecideParentRosterLink,
} from '../../hooks/useQueries';
import { Modal, Field } from '../teacher/SharedUI';

const ManagerDashboard: React.FC = () => {
    const { userProfile } = useAppStore();
    const { data: memberships = [] } = useMyMemberships(userProfile?.id);

    const activeManager = memberships.find(m => m.role === 'manager' && m.status === 'active');
    const schoolId = activeManager?.school_id || null;
    const schoolName = activeManager?.school?.name || 'your school';

    const { data: members = [] } = useSchoolMembers(schoolId || undefined);
    const { data: pendingLinks = [] } = usePendingParentLinks(!!schoolId);

    const teachers = members.filter(m => m.role === 'teacher' && m.status === 'active');
    const pendingMembers = members.filter(m => m.status === 'pending');

    const [showInvite, setShowInvite] = useState(false);
    const [inviteResult, setInviteResult] = useState<{ email: string; url: string | null } | null>(null);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');

    const inviteMut = useInviteTeacher();
    const setMemberMut = useSetMembershipStatus();
    const revokeMut = useRevokeMember();
    const decideLink = useDecideParentRosterLink();

    const handleInvite = async () => {
        if (!schoolId || !email.trim()) return;
        try {
            const res = await inviteMut.mutateAsync({ schoolId, email: email.trim(), fullName: fullName.trim() || undefined });
            setInviteResult({ email: res.email, url: res.invite_url });
            setShowInvite(false);
            setEmail(''); setFullName('');
        } catch { /* toast handled */ }
    };

    if (!schoolId) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
                <div className="max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
                    <Building2 size={32} className="text-slate-400 mx-auto mb-3" />
                    <h1 className="text-xl font-bold text-slate-800 mb-2">No school assigned</h1>
                    <p className="text-sm text-slate-500">
                        Your account is not a manager of any school. Contact a platform administrator to be assigned.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-5xl mx-auto p-6 md:p-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-medium uppercase mb-1">
                            <Building2 size={14} /> School
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">{schoolName}</h1>
                    </div>
                    <button
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teacher-primary text-white rounded-lg hover:bg-emerald-500 font-bold shadow-md shadow-emerald-200 text-sm"
                    >
                        <UserPlus size={18} /> Invite Teacher
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <StatCard icon={<Users size={18} />} label="Teachers" value={teachers.length} />
                    <StatCard icon={<Clock size={18} />} label="Pending requests" value={pendingMembers.length} accent="amber" />
                    <StatCard icon={<Mail size={18} />} label="Parent approvals" value={pendingLinks.length} accent="amber" />
                </div>

                {/* Pending affiliation requests */}
                <Section title="Affiliation requests" empty={pendingMembers.length === 0 ? 'No pending affiliation requests.' : null}>
                    <ul className="divide-y divide-slate-100">
                        {pendingMembers.map(m => (
                            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate">{m.user?.full_name || m.user?.email || 'Teacher'}</div>
                                    <div className="text-xs text-slate-500 truncate">{m.user?.email}</div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        disabled={setMemberMut.isPending}
                                        onClick={() => setMemberMut.mutate({ membershipId: m.id, status: 'active' })}
                                        className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-bold hover:bg-green-200"
                                    >Approve</button>
                                    <button
                                        disabled={setMemberMut.isPending}
                                        onClick={() => setMemberMut.mutate({ membershipId: m.id, status: 'rejected' })}
                                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200"
                                    >Reject</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>

                {/* Pending parent links */}
                <Section title="Parent approvals" empty={pendingLinks.length === 0 ? 'No parent links pending.' : null}>
                    <ul className="divide-y divide-slate-100">
                        {pendingLinks.map(link => (
                            <li key={link.id} className="flex items-center justify-between gap-3 py-3">
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate">{link.parent?.full_name || link.parent?.email || 'Parent'}</div>
                                    <div className="text-xs text-slate-500 truncate">
                                        wants to link with <span className="font-medium">{link.roster?.display_name || 'a student'}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        disabled={decideLink.isPending}
                                        onClick={() => decideLink.mutate({ linkId: link.id, approve: true })}
                                        className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-bold hover:bg-green-200"
                                    >Approve</button>
                                    <button
                                        disabled={decideLink.isPending}
                                        onClick={() => decideLink.mutate({ linkId: link.id, approve: false })}
                                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200"
                                    >Reject</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>

                {/* Teachers */}
                <Section title="Teachers" empty={teachers.length === 0 ? 'No teachers yet. Invite one.' : null}>
                    <ul className="divide-y divide-slate-100">
                        {teachers.map(m => (
                            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">
                                        {(m.user?.full_name || m.user?.email || '?')[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-800 truncate">{m.user?.full_name || 'Teacher'}</div>
                                        <div className="text-xs text-slate-500 truncate">{m.user?.email}{m.title ? ` · ${m.title}` : ''}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { if (confirm('Remove this teacher from the school?')) revokeMut.mutate({ membershipId: m.id, schoolId: schoolId }); }}
                                    className="text-xs font-medium text-red-500 hover:underline flex items-center gap-1 shrink-0"
                                >
                                    <ShieldOff size={13} /> Revoke
                                </button>
                            </li>
                        ))}
                    </ul>
                </Section>
            </div>

            {/* Invite teacher modal */}
            <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite teacher">
                <p className="text-sm text-slate-500 mb-4">
                    Creates a teacher account for this school and returns a one-time setup link to share.
                </p>
                <div className="space-y-3">
                    <Field label="Email">
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="teacher@school.edu"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teacher-primary text-sm" />
                    </Field>
                    <Field label="Full name (optional)">
                        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teacher-primary text-sm" />
                    </Field>
                    <button
                        onClick={handleInvite}
                        disabled={!email.trim() || inviteMut.isPending}
                        className="w-full py-2.5 bg-teacher-primary text-white rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {inviteMut.isPending ? 'Inviting…' : <><UserPlus size={16} /> Create & invite</>}
                    </button>
                </div>
            </Modal>

            {/* Invite result modal */}
            <Modal open={!!inviteResult} onClose={() => setInviteResult(null)} title="Teacher invited">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-green-600" />
                    </div>
                    <p className="text-slate-600 mb-1"><span className="font-bold text-slate-800">{inviteResult?.email}</span> was added.</p>
                    <p className="text-sm text-slate-500 mb-4">Share this one-time setup link so they can set a password and sign in:</p>
                    {inviteResult?.url ? (
                        <>
                            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-3 mb-4 break-all text-xs font-mono text-slate-700">{inviteResult.url}</div>
                            <button
                                onClick={() => { if (inviteResult?.url) navigator.clipboard.writeText(inviteResult.url); toast.success('Setup link copied'); setInviteResult(null); }}
                                className="w-full py-3 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 flex items-center justify-center gap-2"
                            >
                                <Copy size={18} /> Copy link &amp; close
                            </button>
                        </>
                    ) : (
                        <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">The account was created but no setup link could be generated. Ask the teacher to use “Forgot password”.</p>
                    )}
                </div>
            </Modal>
        </div>
    );
};

// ---- small local UI helpers ----
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; accent?: 'amber' }> = ({ icon, label, value, accent }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className={`flex items-center gap-2 text-xs font-bold uppercase mb-1 ${accent === 'amber' ? 'text-amber-600' : 'text-slate-400'}`}>
            {icon} {label}
        </div>
        <div className="text-3xl font-bold text-slate-800">{value}</div>
    </div>
);

const Section: React.FC<{ title: string; empty: string | null; children: React.ReactNode }> = ({ title, empty, children }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-700">{title}</div>
        <div className="px-5 py-2">
            {empty ? <div className="py-6 text-center text-sm text-slate-400">{empty}</div> : children}
        </div>
    </div>
);

export default ManagerDashboard;
