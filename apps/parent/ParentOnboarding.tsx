import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, ShieldCheck, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../services/supabaseClient';
import { previewRosterToken, connectParentByToken } from '../../services/ManagementService';
import { toast } from 'sonner';

/** Accepts a claim token OR a full claim link (/claim?t=...) from the teacher. */
function parseToken(input: string): string {
    const trimmed = input.trim();
    try {
        if (/^https?:\/\//i.test(trimmed) && trimmed.includes('t=')) {
            return new URL(trimmed).searchParams.get('t') || trimmed;
        }
    } catch { /* not a URL */ }
    const m = trimmed.match(/t=([^&\s]+)/);
    return m ? m[1] : trimmed;
}

const ParentOnboarding: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [claimInput, setClaimInput] = useState('');
    const [token, setToken] = useState('');
    const [parentName, setParentName] = useState('');
    const [childName, setChildName] = useState('your child');
    const { setUserProfile } = useAppStore();

    const handleVerifyCode = async () => {
        const t = parseToken(claimInput);
        if (!t) { setError('Paste the link or code your teacher shared.'); return; }
        setLoading(true);
        setError('');
        try {
            const preview = await previewRosterToken(t);
            if (!preview) {
                setError('This link is invalid, expired, or already used. Ask the teacher for a fresh one.');
                setLoading(false);
                return;
            }
            setToken(t);
            setChildName(preview.display_name || 'your child');
            setStep(2);
        } catch (e: any) {
            setError(e?.message || 'Could not verify this link.');
        }
        setLoading(false);
    };

    const handleCompleteSignUp = async () => {
        setLoading(true);
        setError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setError('No signed-in account found.'); setLoading(false); return; }

            if (parentName.trim()) {
                await supabase.from('profiles').update({ full_name: parentName.trim() }).eq('id', user.id);
                setUserProfile({ ...(useAppStore.getState().userProfile as any), full_name: parentName.trim() });
            }

            const status = await connectParentByToken(token);
            if (status === 'already_active') toast.message("You're already linked to this student.");
            else if (status === 'already_pending') toast.message('A link request is already pending teacher approval.');
            else toast.success('Request sent — pending teacher approval.');

            navigate('/parent');
        } catch (err: any) {
            setError(err?.message || 'Setup failed. Please try again.');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-rose-50 flex flex-col font-sans">
            <header className="bg-white/80 backdrop-blur border-b border-rose-100 p-4 shrink-0 flex items-center justify-between shadow-sm">
                <h1 className="font-display font-bold text-xl text-rose-900">Professor Parent Portal</h1>
            </header>

            <main className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
                <div className="w-full max-w-lg">

                    {step === 1 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-rose-200/50 border border-rose-100 text-center animate-fade-in relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-400 to-pink-500"></div>

                            <div className="w-16 h-16 bg-rose-100 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-inner">
                                <Link2 className="text-rose-600" size={32} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Link Your Child</h2>
                            <p className="text-slate-500 mb-8">Paste the claim link your child&apos;s teacher shared (or the code on their passport).</p>

                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Claim link or code</label>
                                    <input
                                        type="text"
                                        value={claimInput}
                                        onChange={e => { setClaimInput(e.target.value); setError(''); }}
                                        placeholder="Paste link, or enter code"
                                        className="w-full text-center text-lg font-mono tracking-wide border-2 border-slate-200 rounded-2xl px-4 py-4 focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
                                    />
                                </div>

                                <button
                                    disabled={!claimInput.trim() || loading}
                                    onClick={handleVerifyCode}
                                    className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold text-lg hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <><ArrowRight size={20} /> Verify Link</>}
                                </button>
                                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-rose-200/50 border border-rose-100 text-center animate-fade-in relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>

                            <div className="w-16 h-16 bg-emerald-100 rounded-full mx-auto flex items-center justify-center mb-6 shadow-md border-4 border-white transform -mt-4">
                                <CheckCircle className="text-emerald-600" size={28} />
                            </div>

                            <h2 className="text-2xl font-bold font-display text-slate-800 mb-2">Found {childName}!</h2>
                            <p className="text-slate-500 mb-8">Set up your parent name, then we&apos;ll send the link request to the teacher for approval.</p>

                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Your Full Name</label>
                                    <input
                                        type="text"
                                        value={parentName}
                                        onChange={(e) => setParentName(e.target.value)}
                                        placeholder="e.g. Jane Doe"
                                        className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>

                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                                    <p className="text-sm text-emerald-800">
                                        Your account acts as a secure observer. You can see assignments, approve shop purchases, and track {childName}&apos;s learning journey.
                                    </p>
                                </div>

                                <button
                                    disabled={loading}
                                    onClick={handleCompleteSignUp}
                                    className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle size={22} /> Send Link Request</>}
                                </button>
                                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default ParentOnboarding;
