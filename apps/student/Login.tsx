
import React, { useState } from 'react';
import { ArrowRight, HelpCircle, AlertCircle, Camera, Mic, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleNext = () => {
    if (step === 1) {
       if (code.length >= 6) {
          setStep(2);
       } else {
          setError(true);
          setTimeout(() => setError(false), 2000);
       }
    } else if (step === 2) {
       setStep(3);
    } else {
       onLogin();
    }
  };

  return (
    <div className="h-full bg-slate-50 font-sans flex flex-col relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-64 bg-duo-blue rounded-b-[4rem] z-0 shrink-0 transition-all duration-500" style={{ height: step === 3 ? '100%' : '16rem' }}></div>
      
      {/* Content Container */}
      <div className="relative z-10 flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
        
        {/* Header / Progress */}
        <div className="flex justify-between items-center mb-8 pt-4">
           <button onClick={() => setStep(Math.max(1, step - 1))} className={`text-white/80 font-bold text-sm ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}>Back</button>
           <div className="w-24 h-2 bg-black/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${(step / 3) * 100}%` }}
              ></div>
           </div>
           <div className="text-white/80 font-bold text-sm">Step {step} of 3</div>
        </div>

        {/* Step 1: Code */}
        <AnimatePresence mode="wait">
        {step === 1 && (
           <motion.div 
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col items-center"
           >
              <div className="w-40 h-40 bg-white rounded-full border-8 border-white/20 shadow-2xl flex items-center justify-center mb-6 animate-bounce-subtle">
                 <img src="https://api.dicebear.com/7.x/bottts/svg?seed=LoginBot" alt="Mascot" className="w-28 h-28" />
              </div>
              <h1 className="text-3xl font-display font-bold text-slate-800 text-center mb-2">Let's learn English!</h1>
              <p className="text-slate-500 text-center max-w-xs mb-8">Enter the 6-character code from your teacher.</p>

              <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 mb-8 w-full">
                 <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Class Code</label>
                 <div className="relative">
                    <input 
                      type="text" 
                      value={code}
                      onChange={(e) => {
                         setCode(e.target.value.toUpperCase());
                         setError(false);
                      }}
                      maxLength={6}
                      placeholder="ABC-123"
                      className={`w-full h-16 text-3xl font-mono font-bold text-center tracking-[0.5em] uppercase border-2 rounded-2xl focus:outline-none transition-all
                        ${error ? 'border-red-400 bg-red-50 text-red-500' : 'border-slate-200 focus:border-duo-blue focus:shadow-lg text-slate-800'}
                      `}
                    />
                    {error && (
                       <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 animate-shake">
                          <AlertCircle size={24} />
                       </div>
                    )}
                 </div>
              </div>
           </motion.div>
        )}

        {/* Step 2: Permissions */}
        {step === 2 && (
           <motion.div 
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col items-center w-full mt-12"
           >
              <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-4 border-slate-100 text-center mb-8 w-full">
                 <div className="flex justify-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-2xl flex items-center justify-center">
                       <Camera size={32} />
                    </div>
                    <div className="w-16 h-16 bg-purple-100 text-purple-500 rounded-2xl flex items-center justify-center">
                       <Mic size={32} />
                    </div>
                 </div>
                 <h2 className="text-2xl font-bold text-slate-800 mb-2">Enable Powers</h2>
                 <p className="text-slate-500 text-sm">We need your camera and microphone for speaking games and dubbing.</p>
              </div>
              <button className="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-4 rounded-2xl mb-4 hover:bg-slate-50">
                 Maybe Later
              </button>
           </motion.div>
        )}

        {/* Step 3: Profile Confirmation */}
        {step === 3 && (
           <motion.div 
              key="step3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center text-white mt-20"
           >
              <div className="w-32 h-32 bg-white rounded-full border-4 border-white/30 shadow-2xl flex items-center justify-center text-6xl mb-6">
                 🦁
              </div>
              <h1 className="text-4xl font-display font-bold mb-2">Welcome, Leo!</h1>
              <p className="text-blue-100 text-lg mb-8">You are in Class 3B</p>
              
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4 w-full flex items-center justify-between mb-8">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center font-bold">Lvl 5</div>
                    <div className="text-left">
                       <div className="font-bold text-sm">Intermediate</div>
                       <div className="text-xs opacity-70">Current Level</div>
                    </div>
                 </div>
                 <Check size={24} />
              </div>
           </motion.div>
        )}
        </AnimatePresence>

        {/* Action Button */}
        <div className="mt-auto w-full">
           <button 
              onClick={handleNext}
              className={`w-full font-bold text-xl py-5 rounded-2xl shadow-[0_6px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-2 transition-all flex items-center justify-center gap-3
                 ${step === 3 ? 'bg-white text-duo-blue' : 'bg-duo-green hover:bg-duo-green-dark text-white shadow-[#46a302]'}
              `}
           >
              {step === 2 ? 'Allow Access' : step === 3 ? "Let's Go!" : 'Next'} <ArrowRight size={24} strokeWidth={3} />
           </button>
        </div>

      </div>
    </div>
  );
};

export default Login;
