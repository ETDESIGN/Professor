import React, { useState, useEffect, useCallback } from 'react';
import { X, Heart, ArrowRight, ArrowLeft, Check, Volume2, ChevronRight, Star, BookOpen, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../store/SessionContext';
import { MediaService } from '../../services/MediaService';

interface SoloLessonPlayerProps {
  onComplete: (results: { xp: number; accuracy: number; time: string }) => void;
  onExit: () => void;
}

const SoloLessonPlayer: React.FC<SoloLessonPlayerProps> = ({ onComplete, onExit }) => {
  const { state, nextSlide, prevSlide, goToSlide, addPoints, triggerAction } = useSession();

  const flow = state.activeUnit?.flow || [];
  const currentStep = state.activeSlideData;
  const currentIndex = state.currentStepIndex;
  const totalSteps = flow.length;

  const [lives, setLives] = useState(5);
  const [isRevealed, setIsRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [activeExampleIndex, setActiveExampleIndex] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;
  const startTime = React.useRef(Date.now());

  useEffect(() => {
    startTime.current = Date.now();
  }, []);

  useEffect(() => {
    if (state.activeUnit?.id && state.activeUnit?.manifest?.knowledge_graph?.vocabulary) {
      MediaService.preloadUnitAssets(
        state.activeUnit.id,
        state.activeUnit.manifest.knowledge_graph.vocabulary
      );
    }
  }, [state.activeUnit?.id]);

  useEffect(() => {
    setIsRevealed(false);
    setSelectedOption(null);
    setIsFlipped(false);
    setActiveCardIndex(0);
    setActiveExampleIndex(0);
    setActivePageIndex(0);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalSteps - 1) {
      nextSlide();
    } else {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const accuracy = state.totalAttempts > 0
        ? Math.round((state.totalCorrect / state.totalAttempts) * 100)
        : 100;
      const xp = Math.max(10, state.score + 30);
      onComplete({ xp, accuracy, time: `${minutes}:${seconds.toString().padStart(2, '0')}` });
    }
  }, [currentIndex, totalSteps, nextSlide, onComplete, state.score, state.totalCorrect, state.totalAttempts]);

  const handlePrev = () => {
    if (currentIndex > 0) prevSlide();
  };

  if (!currentStep) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <BookOpen size={64} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-500 mb-2">No Lesson Loaded</h2>
        <p className="text-slate-400 text-center mb-6">Select a unit from the map to start a lesson.</p>
        <button onClick={onExit} className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold">Go Back</button>
      </div>
    );
  }

  const renderFocusCards = () => {
    const cards = currentStep.data?.cards || [];
    if (cards.length === 0) return <EmptyStep title="Vocabulary Cards" />;
    const card = cards[activeCardIndex];
    if (!card) return <EmptyStep title="Vocabulary Cards" />;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentIndex}-${activeCardIndex}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-sm"
          >
            <div
              className="w-full cursor-pointer"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              {!isFlipped ? (
                <div className="bg-white rounded-3xl shadow-xl border-2 border-slate-100 p-8 text-center">
                  <div className="text-6xl mb-4">{card.front}</div>
                  <h2 className="text-3xl font-bold text-slate-800">{card.back}</h2>
                  <p className="text-slate-400 font-bold mt-6 animate-pulse">Tap to flip</p>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl shadow-xl p-8 text-white text-center">
                  <h2 className="text-4xl font-black mb-4">{card.back}</h2>
                  {card.pronunciation && (
                    <div className="flex items-center justify-center gap-2 text-xl mb-4 bg-white/20 rounded-full px-4 py-2">
                      <Volume2 size={20} className="text-yellow-300" />
                      {card.pronunciation}
                    </div>
                  )}
                  <p className="text-white/90 text-lg mt-4">
                    {card.context_sentence || card.definition || 'No context available'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 mt-4">
              {cards.map((_: any, i: number) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === activeCardIndex ? 'bg-indigo-500' : 'bg-slate-200'}`} />
              ))}
            </div>

            <div className="flex justify-between mt-4">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveCardIndex(Math.max(0, activeCardIndex - 1)); setIsFlipped(false); }}
                disabled={activeCardIndex === 0}
                className="p-2 rounded-xl bg-white shadow-sm border border-slate-100 disabled:opacity-30"
              >
                <ArrowLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveCardIndex(Math.min(cards.length - 1, activeCardIndex + 1)); setIsFlipped(false); }}
                disabled={activeCardIndex >= cards.length - 1}
                className="p-2 rounded-xl bg-white shadow-sm border border-slate-100 disabled:opacity-30"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  const renderSpeedQuiz = () => {
    const questions = currentStep.data?.questions || [];
    if (questions.length === 0) return <EmptyStep title="Quiz" />;
    const question = questions[0];
    if (!question) return <EmptyStep title="Quiz" />;

    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-sm font-bold text-blue-500 uppercase">Question</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{question.text}</h2>
        </div>

        <div className="space-y-3 flex-1">
          {question.options?.map((option: string, i: number) => {
            let style = 'bg-white border-2 border-slate-100 text-slate-800';
            if (isRevealed) {
              if (option === question.correct) style = 'bg-green-100 border-2 border-green-300 text-green-800';
              else if (option === selectedOption && option !== question.correct) style = 'bg-red-100 border-2 border-red-300 text-red-800';
              else style = 'bg-slate-50 border-2 border-slate-100 text-slate-400';
            } else if (option === selectedOption) {
              style = 'bg-blue-100 border-2 border-blue-300 text-blue-800';
            }

            return (
              <button
                key={i}
                onClick={() => {
                  if (!isRevealed) {
                    setSelectedOption(option);
                    const correct = option === question.correct;
                    setIsRevealed(true);
                    if (correct) {
                      setQuizScore(s => s + 1);
                      addPoints('solo', 10);
                      toast.success('+10 XP!', { icon: '⭐' });
                    } else {
                      setLives(l => Math.max(0, l - 1));
                    }
                  }
                }}
                className={`w-full p-4 rounded-xl font-bold text-left transition-all ${style}`}
              >
                <span className="text-sm font-mono opacity-60 mr-2">{String.fromCharCode(65 + i)}</span>
                {option}
              </button>
            );
          })}
        </div>

        {isRevealed && (
          <button
            onClick={handleNext}
            className="w-full mt-4 bg-duo-green text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
          >
            Continue <ArrowRight size={20} />
          </button>
        )}
      </div>
    );
  };

  const renderStoryStage = () => {
    const pages = currentStep.data?.pages || [];
    const characters = currentStep.data?.characters || [];
    if (pages.length === 0) return <EmptyStep title="Story" />;
    const page = pages[activePageIndex];
    if (!page) return <EmptyStep title="Story" />;

    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 flex-1 border border-amber-100">
          {page.speaker && (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-amber-200 rounded-full flex items-center justify-center text-sm font-bold">
                {page.speaker.charAt(0)}
              </div>
              <span className="font-bold text-amber-700">{page.speaker}</span>
            </div>
          )}
          <p className="text-lg text-slate-800 leading-relaxed">{page.text}</p>
        </div>

        <div className="flex items-center justify-center gap-2 mt-4">
          {pages.map((_: any, i: number) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === activePageIndex ? 'bg-amber-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        <div className="flex justify-between mt-4">
          <button
            onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
            disabled={activePageIndex === 0}
            className="p-2 rounded-xl bg-white shadow-sm border border-slate-100 disabled:opacity-30"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => setActivePageIndex(Math.min(pages.length - 1, activePageIndex + 1))}
            disabled={activePageIndex >= pages.length - 1}
            className="p-2 rounded-xl bg-white shadow-sm border border-slate-100 disabled:opacity-30"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  };

  const renderGrammarSandbox = () => {
    const rule = currentStep.data?.rule;
    const explanation = currentStep.data?.explanation;
    const examples = currentStep.data?.examples || [];
    if (!rule && examples.length === 0) return <EmptyStep title="Grammar" />;

    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 mb-4">
          <div className="text-indigo-500 font-bold uppercase tracking-widest text-xs mb-1">Grammar Rule</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{rule || 'Grammar'}</h2>
          {explanation && <p className="text-slate-600">{explanation}</p>}
        </div>

        {examples.length > 0 && (
          <div className="space-y-3 flex-1">
            <h3 className="text-sm font-bold text-slate-400 uppercase">Examples</h3>
            {examples.map((ex: string, i: number) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <p className="text-slate-700">{ex}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderIntroSplash = () => {
    const title = currentStep.data?.title || state.activeUnit?.title || 'Lesson';
    const subtitle = currentStep.data?.subtitle || state.activeUnit?.topic || '';

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-24 h-24 bg-duo-green rounded-3xl flex items-center justify-center mb-6 shadow-lg"
        >
          <Star size={48} className="text-white" />
        </motion.div>
        <h1 className="text-3xl font-black text-slate-800 mb-2">{title}</h1>
        {subtitle && <p className="text-slate-500 text-lg">{subtitle}</p>}
        <button
          onClick={handleNext}
          className="mt-8 bg-duo-green text-white font-bold px-8 py-4 rounded-2xl text-lg flex items-center gap-2 shadow-lg"
        >
          Let's Go! <ArrowRight size={24} />
        </button>
      </div>
    );
  };

  const renderMediaPlayer = () => {
    const title = currentStep.data?.title || 'Media';
    const lyrics = currentStep.data?.lyrics || '';

    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 size={20} className="text-blue-500" />
            <span className="font-bold text-slate-800">{title}</span>
          </div>
          {lyrics && (
            <p className="text-slate-600 whitespace-pre-wrap">{lyrics}</p>
          )}
          {!lyrics && (
            <p className="text-slate-400 italic">No media content for this step.</p>
          )}
        </div>
      </div>
    );
  };

  const renderGenericStep = () => {
    const title = currentStep.data?.title || currentStep.type || 'Activity';

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center w-full max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={32} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">{title}</h2>
          <p className="text-slate-400 text-sm mb-6">This activity will be available in a future update.</p>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep.type) {
      case 'INTRO_SPLASH': return renderIntroSplash();
      case 'FOCUS_CARDS': return renderFocusCards();
      case 'GAME_ARENA':
      case 'SPEED_QUIZ': return renderSpeedQuiz();
      case 'STORY_STAGE': return renderStoryStage();
      case 'GRAMMAR_SANDBOX': return renderGrammarSandbox();
      case 'MEDIA_PLAYER': return renderMediaPlayer();
      default: return renderGenericStep();
    }
  };

  const showNavigation = currentStep.type !== 'INTRO_SPLASH';

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      <header className="px-4 py-3 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
        <button onClick={onExit} className="text-slate-400 hover:text-slate-600 p-1">
          <X size={24} />
        </button>

        <div className="flex-1 mx-4 h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-duo-green rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-1 text-red-500 font-bold">
          <Heart fill="currentColor" size={20} />
          <span className="text-sm">{lives}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep.type}-${currentIndex}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            {renderCurrentStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {showNavigation && (
        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
          <div className="flex gap-3">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold disabled:opacity-30 flex items-center gap-1"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={handleNext}
              className="flex-1 bg-duo-green text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
            >
              {currentIndex >= totalSteps - 1 ? 'Finish Lesson' : 'Continue'}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyStep: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-6">
    <div className="text-slate-300 mb-2">
      <BookOpen size={48} />
    </div>
    <p className="text-slate-400 font-bold">No content for {title}</p>
    <p className="text-slate-300 text-sm">Tap Continue to proceed.</p>
  </div>
);

export default SoloLessonPlayer;
