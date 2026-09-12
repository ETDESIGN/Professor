import React, { useState, useEffect } from 'react';
import { X, Heart, Check, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playCue } from '../board/templates/playCue';
import { playAudioUrl } from '../../services/SpeechService';

export interface FlashMatchPair {
  id: string;
  left: string;
  right: string;
  rightType?: 'image' | 'text';
  imageUrl?: string;
  audioUrl?: string;
  l1Translation?: string;
}

interface FlashMatchProps {
  onBack: () => void;
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    pairs: FlashMatchPair[];
  };
}

interface MatchItem {
  id: string;
  text: string;
  imageUrl?: string;
  rightType?: 'image' | 'text';
  audioUrl?: string;
  l1Translation?: string;
  state: 'idle' | 'selected' | 'matched' | 'error';
}

const EMPTY_PAIRS: FlashMatchPair[] = [];

const FlashMatch: React.FC<FlashMatchProps> = ({
  onBack,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data,
}) => {
  const pairs = data?.pairs || EMPTY_PAIRS;

  const [leftItems, setLeftItems] = useState<MatchItem[]>([]);
  const [rightItems, setRightItems] = useState<MatchItem[]>([]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);

  useEffect(() => {
    // Shuffle items
    const left: MatchItem[] = pairs.map((p) => ({
      id: p.id,
      text: p.left,
      audioUrl: p.audioUrl,
      l1Translation: p.l1Translation,
      state: 'idle' as const,
    })).sort(() => Math.random() - 0.5);

    const right: MatchItem[] = pairs.map((p) => {
      const isImg = p.rightType === 'image' || !!p.imageUrl || p.right.startsWith('http');
      return {
        id: p.id,
        text: p.right,
        imageUrl: p.imageUrl || (p.right.startsWith('http') ? p.right : undefined),
        rightType: (isImg ? 'image' : 'text') as 'image' | 'text',
        audioUrl: p.audioUrl,
        l1Translation: p.l1Translation,
        state: 'idle' as const,
      };
    }).sort(() => Math.random() - 0.5);

    setLeftItems(left);
    setRightItems(right);
  }, [pairs]);

  // Check for match when both are selected
  useEffect(() => {
    if (selectedLeft && selectedRight) {
      if (selectedLeft === selectedRight) {
        // Match! Celebratory chime & audio pronunciation
        playCue('correct');
        const matchedPair = pairs.find((p) => p.id === selectedLeft);
        if (matchedPair) {
          playAudioUrl(matchedPair.audioUrl, matchedPair.left).catch(() => {});
        }

        setLeftItems((prev) => prev.map((i) => (i.id === selectedLeft ? { ...i, state: 'matched' } : i)));
        setRightItems((prev) => prev.map((i) => (i.id === selectedRight ? { ...i, state: 'matched' } : i)));
        setSelectedLeft(null);
        setSelectedRight(null);
      } else {
        // Mismatch! Shake + acoustic correction + NO hearts ever
        playCue('wrong');
        const leftItem = leftItems.find((i) => i.id === selectedLeft);
        if (leftItem?.audioUrl) {
          playAudioUrl(leftItem.audioUrl, leftItem.text).catch(() => {});
        }

        setLeftItems((prev) => prev.map((i) => (i.id === selectedLeft ? { ...i, state: 'error' } : i)));
        setRightItems((prev) => prev.map((i) => (i.id === selectedRight ? { ...i, state: 'error' } : i)));

        // 400ms shake reset for responsive flow
        const timer = setTimeout(() => {
          setLeftItems((prev) => prev.map((i) => (i.id === selectedLeft ? { ...i, state: 'idle' } : i)));
          setRightItems((prev) => prev.map((i) => (i.id === selectedRight ? { ...i, state: 'idle' } : i)));
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 400);

        return () => clearTimeout(timer);
      }
    }
  }, [selectedLeft, selectedRight, pairs, leftItems]);

  const isComplete = leftItems.length > 0 && leftItems.every((i) => i.state === 'matched');

  useEffect(() => {
    if (onReady) {
      onReady(isComplete);
    }
  }, [isComplete, onReady]);

  useEffect(() => {
    if (validateTrigger && validateTrigger > 0) {
      if (onResult) {
        onResult(isComplete);
      }
    }
  }, [validateTrigger, isComplete, onResult]);

  if (pairs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
        <p className="text-[#8C7A68] font-bold mb-1">No matching content for this activity.</p>
        <p className="text-[#B5A490] text-sm">Tap Continue to proceed.</p>
      </div>
    );
  }

  const handleLeftClick = (item: MatchItem) => {
    if (item.state === 'matched') return;
    if (item.audioUrl) {
      playAudioUrl(item.audioUrl, item.text).catch(() => {});
    }
    setSelectedLeft(item.id);
    setLeftItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, state: 'selected' } : i.state === 'selected' ? { ...i, state: 'idle' } : i,
      ),
    );
  };

  const handleRightClick = (item: MatchItem) => {
    if (item.state === 'matched') return;
    setSelectedRight(item.id);
    setRightItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, state: 'selected' } : i.state === 'selected' ? { ...i, state: 'idle' } : i,
      ),
    );
  };

  const getItemClass = (state: string) => {
    switch (state) {
      case 'selected':
        return 'bg-[#E6F4F1] border-2 border-[#2A9D8F] shadow-[0_3px_0_#1E6F5C] ring-4 ring-[#2A9D8F]/20';
      case 'matched':
        return 'bg-[#FDFBF7] border-2 border-[#2A9D8F] shadow-[0_3px_0_#1E6F5C,0_0_12px_rgba(233,196,106,0.35)] opacity-95';
      case 'error':
        return 'bg-[#FEF2F2] border-2 border-[#FF4B4B] shadow-[0_3px_0_#DC2626] animate-shake';
      default:
        return 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] hover:border-[#2A9D8F]/60 active:translate-y-0.5 active:shadow-[0_1px_0_#D5C7B0]';
    }
  };

  return (
    <div className="h-full flex flex-col font-sans relative overflow-hidden select-none">
      {mode === 'standalone' && (
        <header className="p-4 flex items-center justify-between z-10 bg-[#FDFBF7] border-b-2 border-[#E2D7C3]">
          <button onClick={onBack} className="text-[#8C7A68] hover:text-[#264653]">
            <X size={24} />
          </button>
          <div className="flex-1 mx-4 h-3 bg-[#EAE0D0] rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-[#2A9D8F] w-1/2 rounded-full relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#FF4B4B] font-bold">
            <Heart fill="currentColor" size={20} /> 5
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col justify-between p-3 sm:p-4 w-full max-w-md mx-auto">
        {/* 2-Column Grid: Left (Words) x Right (Images / Translations) */}
        <div className="flex-1 grid grid-cols-2 gap-2.5 sm:gap-3 items-center content-center my-auto">
          {/* Left Column: Word Cards */}
          <div className="flex flex-col gap-2.5">
            <AnimatePresence>
              {leftItems.map((item) => (
                <motion.button
                  key={`l-${item.id}`}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleLeftClick(item)}
                  className={`h-20 sm:h-22 rounded-2xl p-2 flex flex-col items-center justify-center relative transition-all duration-150 cursor-pointer ${getItemClass(
                    item.state,
                  )}`}
                  disabled={item.state === 'matched'}
                >
                  {item.state === 'matched' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#2A9D8F] text-white flex items-center justify-center shadow-xs">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  <span className="font-fredoka font-bold text-base sm:text-lg text-[#1D3557] leading-tight text-center">
                    {item.text}
                  </span>
                  {item.l1Translation && (
                    <span className="text-[11px] text-[#8C7A68] font-semibold mt-0.5 truncate max-w-full">
                      {item.l1Translation}
                    </span>
                  )}
                  {item.audioUrl && (
                    <span className="absolute bottom-1 right-2 text-[#1CB0F6] opacity-60">
                      <Volume2 size={13} />
                    </span>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Right Column: Image or Meaning Cards */}
          <div className="flex flex-col gap-2.5">
            <AnimatePresence>
              {rightItems.map((item) => (
                <motion.button
                  key={`r-${item.id}`}
                  layout
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleRightClick(item)}
                  className={`h-20 sm:h-22 rounded-2xl p-2 flex flex-col items-center justify-center relative transition-all duration-150 cursor-pointer ${getItemClass(
                    item.state,
                  )}`}
                  disabled={item.state === 'matched'}
                >
                  {item.state === 'matched' && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#2A9D8F] text-white flex items-center justify-center shadow-xs">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  {item.rightType === 'image' && item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="max-h-14 max-w-full object-contain rounded-lg"
                      loading="lazy"
                    />
                  ) : (
                    <span className="font-bold text-sm sm:text-base text-[#1D3557] text-center px-1">
                      {item.text}
                    </span>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Safety reassurance footer */}
        <div className="pt-2 pb-1 text-center shrink-0">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] text-[11px] font-bold text-[#8C7A68]">
            🛡️ Free exploration: taps do not cost hearts!
          </span>
        </div>
      </div>
    </div>
  );
};

export default FlashMatch;
