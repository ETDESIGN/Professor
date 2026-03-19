
import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Loader2, X } from 'lucide-react';

interface AIAnalysisProps {
  onCancel: () => void;
  onComplete: () => void;
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ onCancel, onComplete }) => {
  const [step, setStep] = useState(0);
  const steps = [
    "Uploading High-Res Images...",
    "Extracting Text Layout (OCR)...",
    "Identifying Vocabulary & Grammar...",
    "Generating Interactive Assets..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 1000);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-2xl w-full flex flex-col items-center relative overflow-hidden">
         {/* Cancel Button */}
         <button onClick={onCancel} className="absolute top-8 right-8 text-slate-300 hover:text-slate-500">
            <X size={24} />
         </button>

         {/* Visual Indicator */}
         <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
            {/* Pulsing Rings */}
            <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping opacity-20"></div>
            <div className="absolute inset-4 border-4 border-emerald-200 rounded-full animate-pulse opacity-40"></div>
            <div className="absolute inset-8 border-4 border-emerald-300 rounded-full"></div>
            
            {/* Center Icon */}
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200 z-10">
               <Sparkles className="text-white w-12 h-12 animate-spin-slow" />
            </div>
         </div>

         <h2 className="text-3xl font-display font-bold text-slate-800 mb-2 text-center">AI Analysis in Progress</h2>
         <p className="text-slate-500 mb-8 text-center max-w-sm">We are digitizing your textbook into an interactive lesson.</p>

         {/* Steps List */}
         <div className="w-full max-w-md space-y-4">
            {steps.map((label, index) => (
               <div key={index} className="flex items-center gap-4 transition-all duration-500">
                  <div className={`
                     w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-300
                     ${index < step ? 'bg-emerald-500 border-emerald-500 text-white' : 
                       index === step ? 'border-emerald-500 text-emerald-500' : 'border-slate-200 text-slate-300'}
                  `}>
                     {index < step ? <Check size={16} strokeWidth={3} /> : 
                      index === step ? <Loader2 size={16} className="animate-spin" /> : 
                      <span className="text-xs font-bold">{index + 1}</span>}
                  </div>
                  <span className={`font-medium ${index <= step ? 'text-slate-700' : 'text-slate-300'}`}>
                     {label}
                  </span>
               </div>
            ))}
         </div>

         {/* Progress Bar */}
         <div className="w-full h-2 bg-slate-100 rounded-full mt-10 overflow-hidden">
            <div 
               className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out"
               style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            ></div>
         </div>
         <div className="mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
            {Math.round(((step + 1) / steps.length) * 100)}% Complete
         </div>
      </div>
      
      <style>{`
        .animate-spin-slow { animation: spin 4s linear infinite; }
      `}</style>
    </div>
  );
};

export default AIAnalysis;
    