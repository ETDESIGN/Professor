import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    CheckCircle, AlertCircle, Loader2, LogIn, GraduationCap, UserCheck, Link2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { previewRosterToken, RosterTokenPreview } from '../services/ManagementService';
import { useClaimRosterStudent, useConnectParentByToken } from '../hooks/useQueries';
import { toast } from 'sonner';

type Phase = 'loading' | 'missing' | 'gate' | 'ready' | 'done' | 'error';

const ClaimStudent: React.FC = () => {
    const [params] = useSearchParams();
    const token = params.get('t');
    const navigate = useNavigate();
    const { userProfile } = useAppStore();

    const [phase, setPhase] = useState<Phase>('loading');
    const [preview, setPreview] = useState<RosterTokenPreview | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const claimMut = useClaimRosterStudent();
    const connectMut = useConnectParentByToken();

    const role = userProfile?.role;

    useEffect(() => {
        if (!token) { setPhase('missing'); return; }
        if (!userProfile) { setPhase('gate'); return; }
        let alive = true;
        setPhase('loading');
        previewRosterToken(token)
            .then((p) => {
                if (!alive) return;
                if (!p) { setErrorMsg('This claim link is invalid, expired, or already used.'); setPhase('error'); return; }
                setPreview(p);
                setPhase('ready');
            })
            .catch((e) => { if (!alive) return; setErrorMsg(e?.message || 'Could not load this claim link.'); setPhase('error'); });
        return () => { alive = false; };
    }, [token, userProfile]);

    const goToLogin = () => {
        if (token) sessionStorage.setItem('pendingRedirect', `/claim?t=${token}`);
        navigate('/login');
    };

    const handleClaim = async () => {
        if (!token) return;
        try {
            await claimMut.mutateAsync(token);
            toast.success('Claimed — you are enrolled in the class.');
            setPhase('done');
        } catch (e: any) {
            setErrorMsg(e?.message || 'Claim failed.');
            setPhase('error');
        }
    };

    const handleConnect = async () => {
        if (!token) return;
        try {
            const status = await connectMut.mutateAsync(token);
            if (status === 'already_active') toast.message('You are already linked to this student.');
            else if (status === 'already_pending') toast.message('A link request is already pending teacher approval.');
            else toast.success('Request sent — pending teacher approval.');
            setPhase('done');
        } catch (e: any) {
            setErrorMsg(e?.message || 'Could not request link.');
            setPhase('error');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
            <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center"
            >
                <div className="w-14 h-14 bg-blue-50 text-duo-blue rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <GraduationCap size={28} />
                </div>

                {phase === 'missing' && (
                    <>
                        <h1 className="text-xl font-bold text-slate-800 mb-2">No claim token</h1>
                        <p className="text-sm text-slate-500">This link is incomplete. Ask your teacher for a fresh claim link.</p>
                    </>
                )}

                {phase === 'loading' && (
                    <>
                        <h1 className="text-xl font-bold text-slate-800 mb-3">Checking link…</h1>
                        <Loader2 className="animate-spin text-slate-400 mx-auto" size={28} />
                    </>
                )}

                {phase === 'gate' && (
                    <>
                        <h1 className="text-xl font-bold text-slate-800 mb-2">Sign in to continue</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            {token
                                ? `You need a student or parent account to claim this link.`
                                : ''}
                        </p>
                        <button onClick={goToLogin} className="w-full py-3 bg-duo-blue text-white rounded-lg font-bold hover:bg-blue-600 flex items-center justify-center gap-2">
                            <LogIn size={18} /> Log in / Sign up
                        </button>
                    </>
                )}

                {phase === 'ready' && preview && (
                    <>
                        <h1 className="text-xl font-bold text-slate-800 mb-1">Join your class</h1>
                        <p className="text-sm text-slate-500 mb-5">
                            <span className="font-bold text-slate-700">{preview.display_name}</span>
                            {preview.class_name ? ` · ${preview.class_name}` : ''}
                        </p>

                        {preview.is_claimed && role === 'student' && (
                            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg text-sm mb-4">
                                <AlertCircle size={16} /> This spot has already been claimed by another account.
                            </div>
                        )}

                        {role === 'student' && (
                            <button
                                onClick={handleClaim}
                                disabled={preview.is_claimed || claimMut.isPending}
                                className="w-full py-3 bg-teacher-primary text-white rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {claimMut.isPending ? <Loader2 className="animate-spin" size={18} /> : <UserCheck size={18} />}
                                Claim as my account
                            </button>
                        )}

                        {role === 'parent' && (
                            <button
                                onClick={handleConnect}
                                disabled={connectMut.isPending}
                                className="w-full py-3 bg-duo-blue text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {connectMut.isPending ? <Loader2 className="animate-spin" size={18} /> : <Link2 size={18} />}
                                Connect as parent
                            </button>
                        )}

                        {(role === 'teacher' || role === 'manager' || role === 'admin') && (
                            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-3 rounded-lg text-sm">
                                <AlertCircle size={16} /> This link is for students or parents. Open it from a student/parent account.
                            </div>
                        )}

                        {role === 'student' && (
                            <p className="text-xs text-slate-400 mt-3">Claiming binds this roster spot to your home account and enrolls you in the class.</p>
                        )}
                        {role === 'parent' && (
                            <p className="text-xs text-slate-400 mt-3">Your request is sent to the teacher for approval.</p>
                        )}
                    </>
                )}

                {phase === 'done' && (
                    <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} className="text-green-600" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-800 mb-2">All set!</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            {role === 'student'
                                ? 'You are enrolled. Open the student app to start learning.'
                                : 'Your request was sent. You will see the student once the teacher approves.'}
                        </p>
                        <button
                            onClick={() => navigate(role === 'student' ? '/student' : '/parent')}
                            className="w-full py-3 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700"
                        >
                            Continue
                        </button>
                    </>
                )}

                {phase === 'error' && (
                    <>
                        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={28} className="text-red-500" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-800 mb-2">Could not continue</h1>
                        <p className="text-sm text-slate-500 mb-5">{errorMsg}</p>
                        <button onClick={() => navigate('/')} className="text-sm text-duo-blue hover:underline">Back to home</button>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default ClaimStudent;
