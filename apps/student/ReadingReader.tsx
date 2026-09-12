// ReadingReader — Story reader with Read-to-Me page TTS, interactive vocabulary
// chips (Simplified Chinese definitions), friendly illustrated scene placeholders
// (zero raw prompt text), and a full comprehension quiz per Stitch designs
// 24/1.html and 24/2.html.

import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronLeft,
  BookOpen,
  Volume2,
  CheckCircle,
  HelpCircle,
  X,
  Sparkles,
  ArrowRight,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoloSession } from '../../store/SoloSessionContext';
import { getStory, getVocabulary, CanonicalVocab } from '../../services/manifest';
import { playAudioUrl } from '../../services/SpeechService';
import { playCue } from '../board/templates/playCue';

interface ReadingReaderProps {
  onBack: () => void;
  /** Session summary on exit (quiz results — Phase 4: replaced the caller's hardcoded xp/accuracy). */
  onSessionEnd?: (stats: { correct: number; total: number }) => void;
}

const ReadingReader: React.FC<ReadingReaderProps> = ({ onBack, onSessionEnd }) => {
  const { state: solo } = useSoloSession();
  const unit = solo.activeUnit;

  const story = useMemo(() => (unit ? getStory(unit.manifest) : { pages: [] }), [unit]);
  const vocab = useMemo(() => (unit ? getVocabulary(unit.manifest) : []), [unit]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, CanonicalVocab>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // Flatten comprehension questions across all story pages
  const questions = useMemo(() => {
    const out: { question: string; options: string[]; answer: number }[] = [];
    for (const p of story.pages || []) {
      for (const q of (p as any).comprehension_questions || []) {
        if (q.question && Array.isArray(q.options) && q.options.length > 0) {
          out.push({
            question: q.question,
            options: q.options,
            answer: typeof q.answer === 'number' ? q.answer : 0,
          });
        }
      }
    }
    return out;
  }, [story]);

  const totalPages = story.pages?.length || 0;
  const [pageIndex, setPageIndex] = useState(0);
  const [phase, setPhase] = useState<'read' | 'quiz'>('read');
  const [selectedWord, setSelectedWord] = useState<CanonicalVocab | null>(null);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [showStoryPeek, setShowStoryPeek] = useState(false);

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizPicked, setQuizPicked] = useState<number | null>(null);
  const [quizCorrect, setQuizCorrect] = useState(0);

  if (!unit || totalPages === 0) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-6 text-center font-nunito text-[#264653]">
        <div className="w-full max-w-sm bg-[#FDFBF7] rounded-[28px] border-[2.5px] border-[#E2D7C3] p-7 shadow-lg">
          <div className="w-16 h-16 bg-[#1CB0F6]/15 text-[#1CB0F6] rounded-2xl border-2 border-[#1CB0F6]/30 flex items-center justify-center mx-auto mb-4 text-3xl">
            📖
          </div>
          <h2 className="text-2xl font-fredoka font-bold text-[#1D3557] mb-2">Reading Reader</h2>
          <p className="text-xs text-[#264653]/70 mb-6 leading-relaxed">
            {unit
              ? `No illustrated story generated for "${unit.title}" yet.`
              : 'Select a unit from the practice menu or lesson map to read its story.'}
          </p>
          <button
            onClick={onBack}
            className="w-full py-3.5 bg-[#2A9D8F] hover:bg-[#23877b] text-white font-fredoka font-bold text-sm rounded-2xl shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 transition-all"
          >
            Return to Arena
          </button>
        </div>
      </div>
    );
  }

  const page = story.pages[pageIndex];
  const currentQ = questions[quizIndex];

  const handlePlayPageTts = async () => {
    if (!page || isPlayingTts) return;
    setIsPlayingTts(true);
    try {
      await playAudioUrl((page as any).audioUrl, page.text);
    } catch {
      /* swallow audio failures gracefully */
    } finally {
      setIsPlayingTts(false);
    }
  };

  const renderHighlightedText = (text: string) => {
    const tokens = text.split(/(\s+)/);
    return tokens.map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return (
          <span key={i}>
            <button
              type="button"
              onClick={() => setSelectedWord(v)}
              className={`font-fredoka font-bold text-[#1CB0F6] hover:bg-[#1CB0F6]/15 px-1 py-0.5 rounded-lg border-b-2 border-[#1CB0F6]/40 transition-colors ${
                selectedWord?.word?.toLowerCase() === cleaned ? 'bg-[#1CB0F6]/20 border-[#1CB0F6]' : ''
              }`}
            >
              {tok}
            </button>
          </span>
        );
      }
      return <span key={i}>{tok}</span>;
    });
  };

  const handlePickOption = (index: number) => {
    if (quizPicked !== null) return;
    setQuizPicked(index);
    const isCorrect = index === currentQ.answer;
    if (isCorrect) {
      playCue('correct');
      setQuizCorrect((c) => c + 1);
    } else {
      playCue('wrong');
    }
  };

  const handleNext = () => {
    if (phase === 'read') {
      if (pageIndex < totalPages - 1) {
        setPageIndex((p) => p + 1);
        setSelectedWord(null);
      } else if (questions.length > 0) {
        setPhase('quiz');
        setQuizIndex(0);
        setQuizPicked(null);
      } else {
        finish();
      }
    } else {
      if (quizIndex < questions.length - 1) {
        setQuizIndex((q) => q + 1);
        setQuizPicked(null);
      } else {
        finish();
      }
    }
  };

  const finish = () => {
    if (onSessionEnd && questions.length > 0) {
      onSessionEnd({ correct: quizCorrect, total: questions.length });
    } else {
      onBack();
    }
  };

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none relative overflow-hidden">
      {/* Universal 64px Header */}
      <header className="h-16 w-full bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-4 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] hover:bg-[#EAE0D0] active:translate-y-0.5 transition-all"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="text-center flex-1 px-2">
          <h1 className="font-fredoka font-bold text-[16px] leading-tight text-[#1D3557] truncate">
            {story.title || unit.title}
          </h1>
          <p className="text-[10px] font-bold text-[#264653]/65 uppercase tracking-wider -mt-0.5">
            {phase === 'read' ? `Page ${pageIndex + 1} of ${totalPages}` : `Comprehension Quiz`}
          </p>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-amber-50 border-2 border-amber-200/90 flex items-center justify-center text-[#D87A29] shadow-sm">
          <BookOpen size={20} />
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3.5">
        <AnimatePresence mode="wait">
          {phase === 'read' ? (
            <motion.div
              key={`page-${pageIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3.5"
            >
              {/* Scene Illustration or Friendly Missing-Image Placeholder */}
              <div className="aspect-[16/10] w-full rounded-[24px] overflow-hidden border-[2.5px] border-[#E2D7C3] bg-[#FDFBF7] shadow-sm relative">
                {page.image ? (
                  <img src={page.image} alt="Story illustration" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#F7F3E8] to-[#EAE0D0] p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center text-2xl mb-2 shadow-xs">
                      📖
                    </div>
                    <span className="font-fredoka font-bold text-sm text-[#1D3557]">
                      Story Scene — Page {pageIndex + 1}
                    </span>
                    <span className="text-[11px] font-semibold text-[#264653]/60 mt-0.5">
                      Illustrated storybook view
                    </span>
                  </div>
                )}

                {page.speaker && (
                  <div className="absolute bottom-3 left-3 bg-[#1D3557]/85 backdrop-blur-xs text-white font-fredoka font-bold text-xs px-3 py-1 rounded-full shadow-md">
                    🗣️ {page.speaker}
                  </div>
                )}
              </div>

              {/* Read-To-Me Audio Action Row */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePlayPageTts}
                  disabled={isPlayingTts}
                  className="px-4 py-2 bg-[#1CB0F6] hover:bg-[#1696d2] text-white font-fredoka font-bold text-xs rounded-xl shadow-[0_3px_0_#0284C7] active:translate-y-0.5 transition-all flex items-center gap-2"
                >
                  <Volume2 size={16} className={isPlayingTts ? 'animate-bounce' : ''} />
                  <span>{isPlayingTts ? 'Reading Page…' : 'Read to Me 🔊'}</span>
                </button>

                <span className="text-[11px] font-bold text-[#264653]/60 bg-[#FDFBF7] px-2.5 py-1 rounded-full border border-[#E2D7C3]">
                  Tap words for English/Chinese
                </span>
              </div>

              {/* Story Page Text Card */}
              <div className="bg-[#FDFBF7] rounded-[24px] p-5 border-[2.5px] border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3]">
                <p className="text-[17px] leading-relaxed font-nunito font-semibold text-[#1D3557]">
                  {renderHighlightedText(page.text)}
                </p>
              </div>

              {/* Selected Vocabulary Word Definition Drawer */}
              {selectedWord && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#E6F4F1] border-2 border-[#2A9D8F] rounded-[20px] p-3.5 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-fredoka font-bold text-base text-[#1E6F5C]">
                        {selectedWord.word}
                      </span>
                      {selectedWord.phonetic && (
                        <span className="text-xs font-mono text-[#264653]/60">[{selectedWord.phonetic}]</span>
                      )}
                    </div>
                    {(selectedWord.l1_translation || selectedWord.translation || selectedWord.definition) && (
                      <p className="text-xs font-bold text-[#1D3557] mt-0.5">
                        {selectedWord.l1_translation || selectedWord.translation || selectedWord.definition}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedWord(null)}
                    className="w-8 h-8 rounded-full bg-white/80 text-[#264653] flex items-center justify-center"
                    aria-label="Close word info"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          ) : (
            /* Phase: Comprehension Quiz per Stitch Screen 2 */
            <motion.div
              key={`quiz-${quizIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3.5"
            >
              {/* Quiz Utility Row */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowStoryPeek(true)}
                  className="px-3 py-1.5 bg-[#FDFBF7] border border-[#E2D7C3] rounded-xl text-xs font-fredoka font-bold text-[#1D3557] shadow-xs flex items-center gap-1.5"
                >
                  <Eye size={14} className="text-[#2A9D8F]" />
                  <span>Peek at Story 📖</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-fredoka font-bold text-[#E76F51]">
                    Question {quizIndex + 1} of {questions.length}
                  </span>
                </div>
              </div>

              {/* Question Card */}
              {currentQ && (
                <div className="bg-[#FDFBF7] rounded-[24px] border-[2.5px] border-[#E2D7C3] p-5 shadow-[0_4px_0_#E2D7C3] relative">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => playAudioUrl(undefined, currentQ.question)}
                      className="w-11 h-11 shrink-0 rounded-2xl bg-[#1CB0F6] border-2 border-[#0284C7] text-white flex items-center justify-center shadow-[0_3px_0_#0284C7] active:translate-y-0.5"
                      aria-label="Listen to question"
                    >
                      <Volume2 size={20} />
                    </button>
                    <div className="flex-1">
                      <span className="text-[10px] font-fredoka font-extrabold uppercase px-2 py-0.5 rounded bg-[#2A9D8F]/15 text-[#1E6F5C]">
                        Comprehension Check
                      </span>
                      <h2 className="font-fredoka text-[17px] font-bold text-[#1D3557] mt-1.5 leading-snug">
                        {currentQ.question}
                      </h2>
                    </div>
                  </div>
                </div>
              )}

              {/* Option Choices (A, B, C) */}
              {currentQ && (
                <div className="space-y-2.5 pt-1">
                  {currentQ.options.map((opt, i) => {
                    const isPicked = quizPicked === i;
                    const isCorrect = i === currentQ.answer;
                    const letters = ['A', 'B', 'C', 'D'];

                    let cardStyle = 'bg-[#FDFBF7] border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3]';
                    let letterStyle = 'bg-[#F7F3EB] text-[#1D3557] border-[#E2D7C3]';

                    if (quizPicked !== null) {
                      if (isCorrect) {
                        cardStyle = 'bg-[#E6F4F1] border-[#2A9D8F] shadow-[0_3px_0_#1E6F5C]';
                        letterStyle = 'bg-[#2A9D8F] text-white border-[#1E6F5C]';
                      } else if (isPicked) {
                        cardStyle = 'bg-red-50 border-red-500 shadow-[0_3px_0_#b91c1c]';
                        letterStyle = 'bg-red-500 text-white border-red-600';
                      }
                    }

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handlePickOption(i)}
                        className={`w-full p-4 rounded-[20px] border-2 text-left transition-all flex items-center gap-3.5 ${cardStyle}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-fredoka font-bold text-sm shrink-0 border ${letterStyle}`}
                        >
                          {letters[i] || i + 1}
                        </div>
                        <span className="font-nunito font-bold text-[15px] text-[#1D3557] flex-1 leading-snug">
                          {opt}
                        </span>
                        {quizPicked !== null && isCorrect && (
                          <CheckCircle size={20} className="text-[#2A9D8F] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Story Peek Drawer */}
      <AnimatePresence>
        {showStoryPeek && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="bg-[#FDFBF7] rounded-t-[32px] border-t-[3px] border-[#E2D7C3] max-h-[80vh] flex flex-col p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E2D7C3]">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📖</span>
                  <h3 className="font-fredoka font-bold text-base text-[#1D3557]">Story Peek (Reference)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStoryPeek(false)}
                  className="w-9 h-9 rounded-xl bg-[#F7F3EB] flex items-center justify-center text-[#1D3557]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4 space-y-4 text-sm font-medium leading-relaxed text-[#1D3557]">
                {story.pages.map((p, idx) => (
                  <div key={idx} className="p-3 bg-[#F7F3EB] rounded-2xl border border-[#E2D7C3]">
                    <span className="text-[10px] font-fredoka font-bold uppercase text-[#2A9D8F] block mb-1">
                      Page {idx + 1} {p.speaker ? `• ${p.speaker}` : ''}
                    </span>
                    <p>{p.text}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowStoryPeek(false)}
                className="w-full py-3 bg-[#2A9D8F] text-white font-fredoka font-bold text-sm rounded-xl shadow-[0_3px_0_#1E6F5C]"
              >
                Back to Quiz
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Anchored Bottom Navigation Footer */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 shrink-0 shadow-lg z-20">
        <button
          type="button"
          onClick={handleNext}
          disabled={phase === 'quiz' && quizPicked === null}
          className={`w-full h-14 font-fredoka font-bold text-[16px] rounded-2xl shadow-[0_4px_0_#C4553B] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all ${
            phase === 'quiz' && quizPicked === null
              ? 'bg-slate-300 text-slate-500 border-2 border-slate-400 cursor-not-allowed shadow-none'
              : 'bg-[#E76F51] hover:bg-[#d65f42] border-2 border-[#C4553B] text-white'
          }`}
        >
          <span>
            {phase === 'read'
              ? pageIndex < totalPages - 1
                ? `Next Page (${pageIndex + 2}/${totalPages}) ➔`
                : questions.length > 0
                  ? 'Start Comprehension Quiz ➔'
                  : 'Complete Reading ➔'
              : quizIndex < questions.length - 1
                ? 'Next Question ➔'
                : 'Claim Rewards & Finish ➔'}
          </span>
          <ArrowRight size={18} />
        </button>
      </footer>
    </div>
  );
};

export default ReadingReader;
