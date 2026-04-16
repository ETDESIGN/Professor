import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, Lightbulb, RefreshCcw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardGrammarSandbox = ({ data }: { data: any }) => {
  const { state } = useSession();
  const examples: string[] = data.examples || [];
  const [activeExample, setActiveExample] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_PANEL' || state.lastAction?.type === 'NEXT_CARD') {
      setActiveExample(prev => Math.min(prev + 1, examples.length - 1));
      setIsRevealed(false);
    } else if (state.lastAction?.type === 'PREV_PANEL' || state.lastAction?.type === 'PREV_CARD') {
      setActiveExample(prev => Math.max(prev - 1, 0));
      setIsRevealed(false);
    } else if (state.lastAction?.type === 'FLIP_CARD') {
      setIsRevealed(prev => !prev);
    } else if (state.lastAction?.type === 'RESET_GAME') {
      setActiveExample(0);
      setIsRevealed(false);
    }
  }, [state.lastAction]);

  if (!data.rule && examples.length === 0) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <BookOpen size={64} className="text-blue-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-4xl font-bold mb-2">Grammar Lesson</h2>
          <p className="text-slate-400 text-xl">No grammar rules available for this step.</p>
        </div>
      </div>
    );
  }

  const currentExample = examples[activeExample];

  return (
    <div className="h-full bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 flex flex-col relative overflow-hidden font-display select-none">

      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#3b82f6 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>

      {/* Header */}
      <div className="relative z-10 p-8 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen size={32} className="text-white" />
          </div>
          <div>
            <div className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-1">Grammar Rule</div>
            <h1 className="text-4xl font-bold text-slate-800">{data.rule || "Grammar"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data.setting && (
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl text-slate-600 text-sm font-medium border border-white/50">
              {data.setting}
            </div>
          )}
          {examples.length > 0 && (
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl border border-white/50">
              <span className="text-slate-400 text-sm font-medium">{activeExample + 1} / {examples.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Rule Explanation */}
      {data.explanation && (
        <div className="relative z-10 mx-8 mb-6">
          <div className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-indigo-100">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                <Lightbulb size={20} />
              </div>
              <div>
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-2">How it works</div>
                <p className="text-slate-700 text-xl leading-relaxed">{data.explanation}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Examples Area */}
      {examples.length > 0 ? (
        <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-12 pb-8">
          {/* Current Example Card */}
          <div
            className={`w-full max-w-4xl bg-white rounded-3xl shadow-2xl p-10 border-4 transition-all duration-500 cursor-pointer ${isRevealed ? 'border-indigo-400' : 'border-white hover:border-indigo-200'}`}
            onClick={() => setIsRevealed(prev => !prev)}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-indigo-300 font-bold text-sm uppercase tracking-widest">Example {activeExample + 1}</span>
              <span className="text-slate-300 text-sm font-medium">Click to {isRevealed ? 'collapse' : 'reveal'}</span>
            </div>

            <p className={`text-4xl font-medium leading-relaxed transition-all duration-500 ${isRevealed ? 'text-slate-800' : 'text-slate-400'}`}>
              {currentExample || "No example available."}
            </p>
          </div>

          {/* Navigation Dots */}
          {examples.length > 1 && (
            <div className="flex items-center gap-3 mt-8">
              {examples.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveExample(i); setIsRevealed(false); }}
                  className={`w-3 h-3 rounded-full transition-all ${i === activeExample ? 'bg-indigo-500 scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 relative z-10 flex items-center justify-center">
          <div className="bg-white/60 backdrop-blur rounded-2xl p-8 text-center">
            <BookOpen size={48} className="text-indigo-300 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">No examples available for this grammar rule.</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 p-4 flex justify-between items-center bg-white/50 backdrop-blur border-t border-white/50">
        <button
          onClick={() => { setActiveExample(Math.max(0, activeExample - 1)); setIsRevealed(false); }}
          disabled={activeExample === 0}
          className="px-4 py-2 rounded-xl bg-white text-slate-600 font-bold text-sm disabled:opacity-30 hover:bg-slate-50 transition-colors border border-slate-200"
        >
          Previous
        </button>
        <button
          onClick={() => { setActiveExample(0); setIsRevealed(false); }}
          className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCcw size={18} />
        </button>
        <button
          onClick={() => { setActiveExample(Math.min(examples.length - 1, activeExample + 1)); setIsRevealed(false); }}
          disabled={activeExample >= examples.length - 1}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-30 hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default BoardGrammarSandbox;
