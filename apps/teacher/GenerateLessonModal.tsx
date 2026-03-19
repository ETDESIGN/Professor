import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { generateLessonManifest } from '../../services/geminiService';
import { Engine } from '../../services/SupabaseService';
import { useSession } from '../../store/SessionContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface GenerateLessonModalProps {
  onClose: () => void;
  onSuccess: (unitId: string) => void;
}

const LOADING_STEPS = [
  "Analyzing topic...",
  "Curating vocabulary...",
  "Designing interactive mini-games...",
  "Structuring lesson timeline...",
  "Finalizing lesson plan..."
];

const GenerateLessonModal: React.FC<GenerateLessonModalProps> = ({ onClose, onSuccess }) => {
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { loadUnits } = useSession();

  useEffect(() => {
    let interval: number;
    if (isGenerating) {
      interval = window.setInterval(() => {
        setLoadingStep((prev) => Math.min(prev + 1, LOADING_STEPS.length - 1));
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    setLoadingStep(0);

    try {
      const manifest = await generateLessonManifest(topic);
      if (manifest) {
        const newUnit = await Engine.createUnit(topic, manifest);
        await loadUnits();
        toast.success('Lesson generated successfully!');
        onSuccess(newUnit.id);
      } else {
        setError("Failed to generate lesson. Please try again.");
        toast.error('Failed to generate lesson.');
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during generation.");
      toast.error('An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2">
              <Sparkles className="text-purple-500" size={24} />
              <h2 className="text-xl font-bold text-slate-800">Generate Lesson</h2>
            </div>
            <button onClick={onClose} disabled={isGenerating} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            {!isGenerating ? (
              <>
                <p className="text-slate-600 mb-6">
                  Enter a topic and our AI will generate a complete lesson plan, including vocabulary, grammar, and interactive mini-games.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Lesson Topic</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Space Exploration for 3rd Graders"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                      disabled={isGenerating}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                      {error}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-200 rounded-full blur-xl animate-pulse"></div>
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center relative z-10 border-4 border-white shadow-lg">
                    <Sparkles className="text-purple-600 animate-pulse" size={32} />
                  </div>
                </div>

                <div className="space-y-3 w-full max-w-xs">
                  {LOADING_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className={`flex items-center gap-3 text-sm font-medium transition-all duration-500 ${index === loadingStep ? 'text-purple-700 scale-105' :
                          index < loadingStep ? 'text-slate-400' : 'text-slate-300 opacity-50'
                        }`}
                    >
                      {index < loadingStep ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : index === loadingStep ? (
                        <Loader2 size={16} className="animate-spin text-purple-500" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200"></div>
                      )}
                      <span className="text-left">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className="px-6 py-2.5 rounded-xl font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GenerateLessonModal;
