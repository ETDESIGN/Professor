import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { School, Users, CheckCircle, ArrowRight, Upload, Loader2, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const TeacherOnboarding: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [schoolName, setSchoolName] = useState('');
    const [className, setClassName] = useState('');
    const [gradeLevel, setGradeLevel] = useState('3rd Grade');
    const [students, setStudents] = useState<string[]>(['', '', '']);

    const handleStudentNameChange = (index: number, value: string) => {
        const newStudents = [...students];
        newStudents[index] = value;
        if (index === students.length - 1 && value.trim() !== '') {
            newStudents.push('');
        }
        setStudents(newStudents);
    };

    const completeOnboarding = () => {
        setLoading(true);
        // Simulate API save
        setTimeout(() => {
            setLoading(false);
            navigate('/teacher');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white border-b border-slate-200 p-4 shrink-0 flex items-center justify-between">
                <h1 className="font-display font-bold text-xl text-slate-800">Welcome to Professor</h1>
                <div className="flex items-center gap-2">
                    <span className={`h-2 w-8 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                    <span className={`h-2 w-8 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                    <span className={`h-2 w-8 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
                <div className="w-full max-w-2xl">

                    {step === 1 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-200 text-center animate-fade-in">
                            <div className="w-16 h-16 bg-indigo-100 rounded-2xl mx-auto flex items-center justify-center mb-6">
                                <School className="text-indigo-600" size={32} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Create your School</h2>
                            <p className="text-slate-500 mb-8">Even independent teachers operate as a "School". This is your home base.</p>

                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">School or Practice Name</label>
                                    <input
                                        type="text"
                                        value={schoolName}
                                        onChange={e => setSchoolName(e.target.value)}
                                        placeholder="e.g. Springfield Elementary"
                                        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">School Logo (Optional)</label>
                                    <button className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                                        <Upload className="mb-2" />
                                        <span>Upload Logo</span>
                                    </button>
                                </div>

                                <button
                                    disabled={!schoolName.trim()}
                                    onClick={() => setStep(2)}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    Next Step <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-200 text-center animate-fade-in">
                            <div className="w-16 h-16 bg-emerald-100 rounded-2xl mx-auto flex items-center justify-center mb-6">
                                <Sparkles className="text-emerald-600" size={32} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Your First Class</h2>
                            <p className="text-slate-500 mb-8">Create a space for your students to learn together.</p>

                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Class Name</label>
                                    <input
                                        type="text"
                                        value={className}
                                        onChange={e => setClassName(e.target.value)}
                                        placeholder="e.g. Morning Tigers"
                                        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:emerald-500 focus:border-emerald-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Grade / Level</label>
                                    <select
                                        value={gradeLevel}
                                        onChange={e => setGradeLevel(e.target.value)}
                                        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:emerald-500 focus:border-emerald-500 outline-none bg-white"
                                    >
                                        <option>Pre-K</option>
                                        <option>Kindergarten</option>
                                        <option>1st Grade</option>
                                        <option>2nd Grade</option>
                                        <option>3rd Grade</option>
                                        <option>4th Grade</option>
                                        <option>ESL Beginner</option>
                                    </select>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep(1)}
                                        className="py-4 px-6 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        disabled={!className.trim()}
                                        onClick={() => setStep(3)}
                                        className="flex-1 py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        Next Step <ArrowRight size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/50 border border-slate-200 text-center animate-fade-in">
                            <div className="w-16 h-16 bg-amber-100 rounded-2xl mx-auto flex items-center justify-center mb-6">
                                <Users className="text-amber-600" size={32} />
                            </div>
                            <h2 className="text-3xl font-bold font-display text-slate-800 mb-2">Add Students</h2>
                            <p className="text-slate-500 mb-8">Add a few names to your roster. You can add more later.</p>

                            <div className="space-y-4 text-left max-h-[40vh] overflow-y-auto p-1">
                                {students.map((student, index) => (
                                    <div key={index} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm">
                                            {index + 1}
                                        </div>
                                        <input
                                            type="text"
                                            value={student}
                                            onChange={e => handleStudentNameChange(index, e.target.value)}
                                            placeholder="Student Name"
                                            className="flex-1 border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:amber-500 focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setStep(2)}
                                    className="py-4 px-6 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={completeOnboarding}
                                    disabled={loading || !students.some(s => s.trim())}
                                    className="flex-1 py-4 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle size={20} /> Complete Setup</>}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default TeacherOnboarding;
