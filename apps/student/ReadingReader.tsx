import React, { useMemo, useState } from 'react';
import { ChevronLeft, X, BookOpen, CheckCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoloSession } from '../../store/SoloSessionContext';
import { getStory, getVocabulary, CanonicalVocab } from '../../services/manifest';

interface ReadingReaderProps {
  onBack: () => void;
}

// Story reader — now MANIFEST-DRIVEN: reads the active unit's story + its
// generated comprehension questions, with tappable vocab definitions (Simplified
// Chinese L1). Replaces the hardcoded "Lost Hat" / Spanish demo (audit Bug #3).
// Clean empty state when the unit has no story.
const ReadingReader: React.FC<ReadingReaderProps> = ({ onBack }) => {
  const { state } = useSoloSession();
  const unit = state.activeUnit;

  const story = useMemo(() => (unit ? getStory(unit.manifest) : { pages: [] }), [unit]);
  const vocab = useMemo(() => (unit ? getVocabulary(unit.manifest) : []), [unit]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, CanonicalVocab>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // Flatten comprehension questions across pages.
  const questions = useMemo(() => {
    const out: { question: string; options: string[]; answer: number }[] = [];
    for (const p of story.pages) {
      for (const q of p.comprehension_questions || []) {
        if (q.question && Array.isArray(q.options) && q.options.length > 0) {
          out.push({ question: q.question, options: q.options, answer: typeof q.answer === 'number' ? q.answer : 0 });
        }
      }
    }
    return out;
  }, [story]);

  const totalPages = story.pages.length;
  // phase: page index 0..n-1, then 'quiz'.
  const [pageIndex, setPageIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizPicked, setQuizPicked] = useState<number | null>(null);
  const [selectedWord, setSelectedWord] = useState<CanonicalVocab | null>(null);
  const [phase, setPhase] = useState<'read' | 'quiz'>('read');

  if (!unit || totalPages === 0) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-duo-blue/10 rounded-3xl flex items-center justify-center mb-5">
          <BookOpen size={40} className="text-duo-blue" />
        </div>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Reading</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          {unit ? `No story for "${unit.title}" yet. Stories are generated during enrichment.` : 'Open a unit from the map to read its story.'}
        </p>
        <button onClick={onBack} className="bg-duo-blue text-white font-bold px-6 py-3 rounded-xl">Back</button>
      </div>
    );
  }

  const renderText = (text: string) => {
    // Wrap known vocab words as tappable spans (case-insensitive, whole word).
    const tokens = text.split(/(\s+)/);
    return tokens.map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return (
          <span key={i}>
            <span
              onClick={() => setSelectedWord(v)}
              className={`text-duo-blue font-bold cursor-pointer border-b-2 border-duo-blue/30 hover:bg-blue-50 rounded px-1 transition-colors ${selectedWord === v ? 'bg-blue-100 border-duo-blue' : ''}`}
            >
              {tok}
            </span>
          </span>
        );
      }
      return <span key={i}>{tok}</span>;
    });
  };

  const next = () => {
    if (phase === 'read') {
      if (pageIndex < totalPages - 1) setPageIndex(pageIndex + 1);
      else setPhase('quiz');
    } else {
      setQuizPicked(null);
      if (quizIndex < questions.length - 1) setQuizIndex(quizIndex + 1);
      else onBack();
    }
  };

  const page = story.pages[pageIndex];
  const currentQ = questions[quizIndex];

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative">
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full"><ChevronLeft size={24} /></button>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-800 text-sm">{story.title || unit.title}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reading</span>
        </div>
        <BookOpen size={24} className="text-slate-300" />
      </header>

      <div className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          {phase === 'read' ? (
            <motion.div key={`page-${pageIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full">
              <div className="aspect-video w-full bg-slate-200 relative overflow-hidden shadow-sm">
                {page.image ? (
                  <img src={page.image} alt="Story scene" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-lg p-6 text-center">{page.image_prompt || 'No image'}</div>
                )}
                {page.speaker && <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs font-bold px-3 py-1 rounded-full">{page.speaker}</div>}
              </div>
              <div className="flex-1 p-8 flex items-center justify-center">
                <p className="text-2xl font-medium text-slate-800 leading-relaxed text-center">{renderText(page.text || '')}</p>
              </div>
            </motion.div>
          ) : questions.length === 0 ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 flex flex-col h-full items-center justify-center text-center">
              <div className="w-20 h-20 bg-green-100 text-duo-green rounded-full flex items-center justify-center mb-6"><CheckCircle size={40} /></div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Story complete!</h2>
              <button onClick={onBack} className="mt-4 bg-duo-green text-white font-bold px-6 py-3 rounded-xl shadow-lg">Finish</button>
            </motion.div>
          ) : (
            <motion.div key={`quiz-${quizIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 flex flex-col h-full items-center justify-center">
              <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-6"><HelpCircle size={40} /></div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Quick Check</h2>
              <p className="text-slate-500 mb-8 text-center text-lg">{currentQ.question}</p>
              <div className="w-full max-w-md space-y-3">
                {currentQ.options.map((opt, i) => {
                  const picked = quizPicked === i;
                  const reveal = quizPicked !== null;
                  const isCorrect = i === currentQ.answer;
                  return (
                    <button
                      key={i}
                      onClick={() => { if (quizPicked === null) setQuizPicked(i); }}
                      className={`w-full p-4 rounded-xl font-bold text-left border-2 transition-all ${
                        !reveal ? 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                          : isCorrect ? 'bg-green-50 border-green-500 text-green-700'
                            : picked ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {opt}{reveal && isCorrect && <CheckCircle size={20} className="float-right" />}
                      {reveal && picked && !isCorrect && <X size={20} className="float-right" />}
                    </button>
                  );
                })}
              </div>
              {quizPicked !== null && (
                <button onClick={next} className="mt-8 w-full max-w-md bg-duo-green text-white font-bold py-4 rounded-xl shadow-lg animate-bounce-subtle">
                  {quizIndex < questions.length - 1 ? 'Next question' : 'Complete story'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Vocab popover */}
      {selectedWord && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-72" onClick={() => setSelectedWord(null)}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-duo-blue">{selectedWord.word}</h3>
            {selectedWord.phonetic && <span className="text-slate-400 font-mono text-sm">{selectedWord.phonetic}</span>}
          </div>
          {selectedWord.definition && <p className="text-slate-700 mb-1">{selectedWord.definition}</p>}
          {selectedWord.l1_translation && <p className="text-slate-500 text-sm">{selectedWord.l1_translation}</p>}
        </div>
      )}

      {/* Footer */}
      {phase === 'read' && (
        <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 z-10 flex items-center justify-between">
          <div className="flex gap-1 items-center">
            {story.pages.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === pageIndex ? 'w-8 bg-duo-blue' : 'w-2 bg-slate-200'}`}></div>
            ))}
            {questions.length > 0 && <div className="w-2 h-2 rounded-full bg-slate-200" />}
          </div>
          <button onClick={next} className="bg-duo-blue text-white px-6 py-3 rounded-xl font-bold shadow-md active:scale-95 transition-all">
            {pageIndex < totalPages - 1 ? 'Next' : questions.length > 0 ? 'Quiz' : 'Finish'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ReadingReader;
