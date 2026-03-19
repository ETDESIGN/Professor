import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Search, CheckCircle, ArrowRight, Loader2, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const StudentOnboarding: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [joinCode, setJoinCode] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    // Mock checking code
    const handleVerifyCode = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            setStep(2);
        }, 1000);
    };

    const handleClaimIdentity = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            // Log the user in and redirect to the student map
            navigate('/student');
        }, 1500);
    };

    const mockRoster = [
        { id: 's1', name: 'Leo', avatar: '🦁' },
        { id: 's2', name: 'Sarah', avatar: '🦄' },
        { id: 's3', name: 'Mike', avatar: '🤖' },
    ];

    return (
        <div className="min-h-screen bg-indigo-50 flex flex-col font-sans">
            <header className="bg-white/80 backdrop-blur border-b border-indigo-100 p-4 shrink-0 flex items-center justify-center shadow-sm">
                <h1 className="font-display font-bold text-2xl text-indigo-900">Professor Student Portal</h1>
            </header>

            <main className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
                <div className="w-full max-w-lg">

                    {step === 1 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-indigo-200/50 border border-indigo-100 text-center animate-fade-in relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>

                            <div className="w-20 h-20 bg-indigo-100 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-inner">
                                <KeyRound className="text-indigo-600" size={40} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Join your Class</h2>
                            <p className="text-slate-500 mb-8">Ask your teacher for the 6-digit class code to enter.</p>

                            <div className="space-y-6 text-left">
                                <div>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={joinCode}
                                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. A B C 1 2 3"
                                        className="w-full text-center text-3xl font-mono tracking-widest uppercase border-2 border-slate-200 rounded-2xl px-4 py-4 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>

                                <button
                                    disabled={joinCode.length < 6 || loading}
                                    onClick={handleVerifyCode}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : 'Verify Code'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-indigo-200/50 border border-indigo-100 text-center animate-fade-in relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>

                            <div className="w-16 h-16 bg-emerald-100 rounded-2xl mx-auto flex items-center justify-center mb-6">
                                <Search className="text-emerald-600" size={32} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Who are you?</h2>
                            <p className="text-slate-500 mb-8">Tap your name to enter the class.</p>

                            <div className="grid grid-cols-2 gap-4 mb-8">
                                {mockRoster.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => setSelectedStudentId(student.id)}
                                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${selectedStudentId === student.id
                                                ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/20 scale-105'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="text-4xl filter drop-shadow-md">{student.avatar}</div>
                                        <div className="font-bold text-slate-700">{student.name}</div>
                                    </button>
                                ))}
                                <button className="p-4 rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-3">
                                    <User size={32} />
                                    <div className="font-medium text-sm">I'm new!</div>
                                </button>
                            </div>

                            <button
                                disabled={!selectedStudentId || loading}
                                onClick={handleClaimIdentity}
                                className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle size={22} /> That's Me!</>}
                            </button>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default StudentOnboarding;
