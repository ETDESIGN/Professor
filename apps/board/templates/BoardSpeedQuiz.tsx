import React, { useState, useEffect } from 'react';
import { Zap, Volume2, ArrowRight, Trophy } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface QuizQuestion {
  id: string;
  text: string;
  image?: string;
  options: string[];
  correct: string;
}

const BoardSpeedQuiz = ({ data }: { data: any }) => {
  const { state } = useSession();
  const questions: QuizQuestion[] = data.questions || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const timePerQuestion = data.timer || 10;
  const [timeLeft, setTimeLeft] = useState(timePerQuestion);

  useEffect(() => {
    if (state.lastAction?.type === 'REVEAL_ANSWER') {
      setIsRevealed(true);
    } else if (state.lastAction?.type === 'NEXT_QUESTION') {
      goToNext();
    } else if (state.lastAction?.type === 'RESET_TIMER') {
      setIsRevealed(false);
      setSelectedOption(null);
      setTimeLeft(timePerQuestion);
    }
  }, [state.lastAction]);

  useEffect(() => {
    if (isComplete || isRevealed || !currentQuestion) return;
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setIsRevealed(true);
    }
  }, [timeLeft, isRevealed, isComplete, currentQuestion]);

  const goToNext = () => {
    if (currentIndex + 1 >= totalQuestions) {
      setIsComplete(true);
    } else {
      setCurrentIndex(prev => prev + 1);
      setIsRevealed(false);
      setSelectedOption(null);
      setTimeLeft(timePerQuestion);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (isRevealed) return;
    setSelectedOption(option);
    const isCorrect = option === currentQuestion.correct;
    if (isCorrect) setScore(prev => prev + 1);
    setIsRevealed(true);
  };

  if (totalQuestions === 0) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <Zap size={64} className="text-duo-blue mx-auto mb-4 opacity-50" />
          <h2 className="text-4xl font-bold mb-2">No Questions Available</h2>
          <p className="text-slate-400 text-xl">Questions will appear here when a lesson is active.</p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="h-full bg-gradient-to-br from-duo-green to-emerald-600 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <Trophy size={80} className="text-yellow-300 mx-auto mb-6 drop-shadow-lg" />
          <h2 className="text-6xl font-bold mb-4">Quiz Complete!</h2>
          <div className="bg-white/20 backdrop-blur-md rounded-3xl px-12 py-8 inline-block border border-white/20">
            <div className="text-8xl font-black mb-2">{score}/{totalQuestions}</div>
            <div className="text-2xl text-white/80">Correct Answers</div>
          </div>
        </div>
      </div>
    );
  }

  const getOptionStyle = (option: string) => {
    if (!isRevealed) {
      return selectedOption === option
        ? 'bg-duo-blue text-white border-duo-blue scale-105'
        : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40';
    }
    if (option === currentQuestion.correct) {
      return 'bg-duo-green text-white border-duo-green scale-105';
    }
    if (option === selectedOption && option !== currentQuestion.correct) {
      return 'bg-duo-red text-white border-duo-red scale-95 opacity-80';
    }
    return 'bg-white/5 text-white/40 border-white/10';
  };

  return (
    <div className="h-full bg-slate-900 flex flex-col font-display text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-black"></div>

      {/* Header */}
      <div className="relative z-10 p-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-duo-blue rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={32} className="text-white" />
          </div>
          <div>
            <div className="text-blue-400 font-bold uppercase tracking-widest text-sm mb-1">{data.topic || 'Speed Quiz'}</div>
            <h1 className="text-3xl font-bold">Question {currentIndex + 1} of {totalQuestions}</h1>
          </div>
        </div>

        {/* Score */}
        <div className="flex items-center gap-6">
          <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-full text-white/80 font-mono text-xl border border-white/10">
            Score: {score}
          </div>
          {/* Circular Timer */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
              <circle
                cx="48" cy="48" r="40"
                stroke={timeLeft < 4 ? '#ef4444' : '#3b82f6'}
                strokeWidth="8"
                fill="none"
                strokeDasharray={251}
                strokeDashoffset={251 - (251 * timeLeft) / timePerQuestion}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className={`absolute text-3xl font-black font-mono ${timeLeft < 4 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {timeLeft}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-12 pb-8">
        {/* Question Text */}
        <h2 className="text-5xl font-bold text-center mb-10 drop-shadow-lg leading-tight max-w-4xl">
          {currentQuestion.text}
        </h2>

        {/* Question Image */}
        {currentQuestion.image && (
          <div className="mb-8 w-48 h-48 rounded-2xl overflow-hidden border-4 border-white/10 shadow-lg">
            <img src={currentQuestion.image} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
          {currentQuestion.options.map((option, i) => (
            <button
              key={i}
              onClick={() => handleOptionSelect(option)}
              disabled={isRevealed}
              className={`p-6 rounded-2xl border-2 font-bold text-xl text-left transition-all duration-300 ${getOptionStyle(option)} ${isRevealed ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
            >
              <span className="text-sm font-mono opacity-60 mr-3">{String.fromCharCode(65 + i)}</span>
              {option}
            </button>
          ))}
        </div>

        {/* Reveal Next Button */}
        {isRevealed && (
          <button
            onClick={goToNext}
            className="mt-8 px-8 py-4 bg-duo-green text-white font-bold text-xl rounded-2xl flex items-center gap-3 hover:scale-105 transition-transform shadow-lg shadow-green-500/30"
          >
            {currentIndex + 1 >= totalQuestions ? 'See Results' : 'Next Question'}
            <ArrowRight size={24} />
          </button>
        )}
      </div>

      {/* Footer Progress */}
      <div className="h-2 bg-white/10 w-full relative z-10">
        <div
          className="h-full bg-duo-blue transition-all duration-500 ease-out"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>
    </div>
  );
};

export default BoardSpeedQuiz;
