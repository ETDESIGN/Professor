import React from 'react';
import { ChevronLeft, Sparkles, ArrowRight } from 'lucide-react';

interface LessonEditorProps {
  onBack?: () => void;
}

// Phase 6 (P2-4): this screen was a static mock (hardcoded "Unit 1: The Zoo"
// timeline with non-functional buttons). Lesson authoring/editing lives in
// Lesson Studio; show an honest empty state instead of fabricated content.
const LessonEditor: React.FC<LessonEditorProps> = ({ onBack }) => {
  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans max-w-md mx-auto shadow-xl border-x border-slate-200">
      <header className="bg-white/90 backdrop-blur px-4 py-3 sticky top-0 z-20 border-b border-slate-200 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-bold text-slate-800 text-sm">Mobile Lesson Editor</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-5">
          <Sparkles className="text-indigo-500" size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Editor is being rebuilt</h2>
        <p className="text-sm text-slate-500 mb-6 max-w-xs">
          Build and edit lessons with the full toolkit in Lesson Studio.
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors"
        >
          Go to Lesson Studio <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default LessonEditor;
