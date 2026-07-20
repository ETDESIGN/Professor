import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ArrowRight, Loader2, User } from 'lucide-react';

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

const StudentOnboarding: React.FC = () => {
    const navigate = useNavigate();
    const [claimInput, setClaimInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleContinue = () => {
        const token = parseToken(claimInput);
        if (!token) {
            setError('Paste the link or code your teacher shared.');
            return;
        }
        setLoading(true);
        // The /claim screen handles the claim itself (and asks you to sign in if needed).
        navigate(`/claim?t=${encodeURIComponent(token)}`);
    };

    return (
        <div className="min-h-screen bg-indigo-50 flex flex-col font-sans">
            <header className="bg-white/80 backdrop-blur border-b border-indigo-100 p-4 shrink-0 flex items-center justify-center shadow-sm">
                <h1 className="font-display font-bold text-2xl text-indigo-900">Professor Student Portal</h1>
            </header>

            <main className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
                <div className="w-full max-w-lg">
                    <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-indigo-200/50 border border-indigo-100 text-center animate-fade-in relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>

                        <div className="w-20 h-20 bg-indigo-100 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-inner">
                            <KeyRound className="text-indigo-600" size={40} />
                        </div>
                        <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Claim your spot</h2>
                        <p className="text-slate-500 mb-8">
                            Paste the claim link your teacher gave you (or the code on your passport) to join your class.
                        </p>

                        <div className="space-y-6 text-left">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Claim link or code</label>
                                <input
                                    type="text"
                                    value={claimInput}
                                    onChange={e => { setClaimInput(e.target.value); setError(''); }}
                                    placeholder="Paste link, or enter code"
                                    className="w-full text-center text-lg font-mono tracking-wide border-2 border-slate-200 rounded-2xl px-4 py-4 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>

                            <button
                                disabled={!claimInput.trim() || loading}
                                onClick={handleContinue}
                                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight size={20} /></>}
                            </button>
                            {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}

                            <button
                                onClick={() => navigate('/student')}
                                className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700"
                            >
                                <User size={16} /> I already have an account
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StudentOnboarding;
