import React, { useState, useEffect } from 'react';
import { X, Volume2, Check, ArrowRight, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';

interface SpacedRepetitionProps {
  onBack: () => void;
  onComplete: (results: { xp: number, accuracy: number, time: string }) => void;
}

const SpacedRepetition: React.FC<SpacedRepetitionProps> = ({ onBack, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [initialQueueLength, setInitialQueueLength] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true);
      const items = await Engine.fetchSRSItems();
      // Only review items that are due
      const dueItems = items.filter((item: any) => new Date(item.next_review) <= new Date());

      if (dueItems.length === 0) {
        // If no items due, just load some for demo purposes
        setReviewQueue(items.slice(0, 5));
        setInitialQueueLength(Math.min(items.length, 5));
      } else {
        setReviewQueue(dueItems);
        setInitialQueueLength(dueItems.length);
      }
      setIsLoading(false);
    };
    loadItems();
  }, []);

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (reviewQueue.length === 0) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">You're all caught up!</h2>
        <p className="text-slate-500 text-center mb-8">No words to review right now. Great job!</p>
        <button
          onClick={onBack}
          className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors"
        >
          Back to Map
        </button>
      </div>
    );
  }

  if (!isStarted) {
    const weakCount = reviewQueue.filter(i => i.status === 'weak').length;
    const reviewCount = reviewQueue.filter(i => i.status === 'review').length;
    const newCount = reviewQueue.filter(i => i.status === 'new').length;

    return (
      <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
        <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 p-2 -ml-2">
            <X size={24} />
          </button>
          <div className="flex items-center gap-1 text-orange-500 font-bold">
            <RotateCcw size={20} />
            <span>Daily Practice</span>
          </div>
          <div className="w-8"></div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-xl border-2 border-slate-100 p-8 text-center"
          >
            <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <RotateCcw size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Today's Menu</h2>
            <p className="text-slate-500 mb-8">We've injected some weak words into your practice queue to help you improve!</p>

            <div className="space-y-4 mb-8 text-left">
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="font-bold text-slate-700">Weak Words</span>
                </div>
                <span className="font-bold text-red-600">{weakCount}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="font-bold text-slate-700">To Review</span>
                </div>
                <span className="font-bold text-yellow-600">{reviewCount}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="font-bold text-slate-700">New Words</span>
                </div>
                <span className="font-bold text-blue-600">{newCount}</span>
              </div>
            </div>

            <button
              onClick={() => setIsStarted(true)}
              className="w-full bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
            >
              Start Practice
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  const currentItem = reviewQueue[currentIndex];
  const progress = ((initialQueueLength - (reviewQueue.length - currentIndex)) / initialQueueLength) * 100;

  const handleFlip = () => {
    setIsFlipped(true);
  };

  const handleRecall = (level: 'hard' | 'good' | 'easy') => {
    let quality = 0;
    if (level === 'hard') {
      quality = 2; // Less than 3 means repeat
      // Re-add to end of queue
      setReviewQueue(prev => [...prev, currentItem]);
    } else if (level === 'good') {
      quality = 4;
      setCorrectCount(prev => prev + 1);
    } else {
      quality = 5;
      setCorrectCount(prev => prev + 1);
    }

    // Update backend asynchronously
    Engine.updateSRSItem(currentItem.id, quality);

    if (currentIndex < reviewQueue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      // Finish
      const accuracy = (correctCount / (correctCount + (reviewQueue.length - initialQueueLength))) * 100 || 100;
      onComplete({ xp: 40, accuracy, time: '2:00' });
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 p-2 -ml-2">
          <X size={24} />
        </button>

        {/* Progress Bar */}
        <div className="flex-1 mx-4 h-4 bg-slate-200 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-duo-green rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-orange-500 font-bold">
          <RotateCcw size={20} />
          <span>SRS</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full max-w-sm perspective-1000"
          >
            <div
              className={`relative w-full h-96 transition-transform duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
              onClick={!isFlipped ? handleFlip : undefined}
            >
              {/* Front */}
              <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border-2 border-slate-100 flex flex-col items-center justify-center p-6">
                <div className="w-40 h-40 rounded-2xl overflow-hidden mb-6 shadow-md border-4 border-slate-50">
                  <img src={`https://api.dicebear.com/7.x/shapes/svg?seed=${currentItem.word}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`} alt="Vocab" className="w-full h-full object-cover" />
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2 text-center">{currentItem.word}</h2>
                <button
                  className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors mt-4"
                  onClick={(e) => { e.stopPropagation(); toast('Playing audio...', { icon: '🔊' }); }}
                >
                  <Volume2 size={24} />
                </button>
                <p className="text-slate-400 font-bold mt-8 animate-pulse">Tap to reveal</p>
              </div>

              {/* Back */}
              <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border-2 border-indigo-100 flex flex-col items-center justify-center p-6 rotate-y-180">
                <h2 className="text-4xl font-black text-indigo-600 mb-4 text-center">{currentItem.translation}</h2>
                <div className="w-full h-px bg-slate-100 my-6"></div>
                <p className="text-slate-500 text-center mb-8">How well did you remember this?</p>

                <div className="flex w-full gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRecall('hard'); }}
                    className="flex-1 bg-red-100 text-red-600 font-bold py-3 rounded-xl hover:bg-red-200 transition-colors border-b-4 border-red-200 active:border-b-0 active:translate-y-1"
                  >
                    Hard
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRecall('good'); }}
                    className="flex-1 bg-yellow-100 text-yellow-600 font-bold py-3 rounded-xl hover:bg-yellow-200 transition-colors border-b-4 border-yellow-200 active:border-b-0 active:translate-y-1"
                  >
                    Good
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRecall('easy'); }}
                    className="flex-1 bg-green-100 text-green-600 font-bold py-3 rounded-xl hover:bg-green-200 transition-colors border-b-4 border-green-200 active:border-b-0 active:translate-y-1"
                  >
                    Easy
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SpacedRepetition;
