// WordLab — the vocabulary STUDY phase (pedagogical redesign §5). Replaces the
// one-card-at-a-time FOCUS_CARDS with a 5-card grid the learner explores:
//   front = image + word + speak
//   back  = IPA + Chinese (L1) translation + definition + example sentence + speak
// Each card flips independently (comparison/contrast aids discrimination), every
// speaker is GUARANTEED to make sound (audio_url, else browser speechSynthesis),
// and the phase only advances on "I'm ready" — a deliberate, longer teach moment.
// Dual-coding (image+word+sound bound at once) + learner control + 5±2 chunking.

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ChevronRight, RotateCw } from 'lucide-react';
import { CanonicalVocab } from '../../services/manifest';
import { playAudioUrl } from '../../services/SpeechService';

interface WordLabProps {
  /** Rich vocab (image/audio/phonetic/l1 translation). Limited to ~5 inside. */
  cards: CanonicalVocab[];
  onReady: () => void;
}

const WordLab: React.FC<WordLabProps> = ({ cards, onReady }) => {
  const set = useMemo(() => cards.slice(0, 5), [cards]);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [played, setPlayed] = useState<Set<number>>(new Set());

  // A card counts as "studied" once it has been flipped AND its audio heard.
  const studiedCount = useMemo(
    () => set.filter((_, i) => flipped.has(i) && played.has(i)).length,
    [set, flipped, played],
  );
  const allStudied = studiedCount >= set.length;

  const toggleFlip = (i: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const speak = async (e: React.MouseEvent, i: number, url: string | undefined, fallback: string) => {
    e.stopPropagation();
    // GUARANTEE sound: generated audio if present, else browser speechSynthesis.
    await playAudioUrl(url, fallback);
    setPlayed((prev) => new Set(prev).add(i));
  };

  if (set.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
        <p className="font-bold">No vocabulary to study for this unit.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-6xl mx-auto w-full">
      <header className="text-center mb-4 shrink-0">
        <h2 className="text-2xl font-black text-slate-800">Word Lab</h2>
        <p className="text-slate-400 font-bold text-sm">
          Flip each card, listen, then continue — <span className="text-duo-blue">{studiedCount}/{set.length} studied</span>
        </p>
      </header>

      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 content-center">
        {set.map((v, i) => {
          const isFlipped = flipped.has(i);
          const isStudied = flipped.has(i) && played.has(i);
          return (
            <div key={i} className="relative">
              {isStudied && (
                <div className="absolute -top-2 -right-2 z-20 w-7 h-7 bg-duo-green rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                  <Check size={16} className="text-white" strokeWidth={4} />
                </div>
              )}
              <AnimatePresence mode="wait">
                {!isFlipped ? (
                  <motion.button
                    key="front"
                    initial={{ rotateY: -90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ rotateY: 90, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => toggleFlip(i)}
                    className="w-full h-full min-h-[220px] bg-white rounded-3xl shadow-lg border-2 border-slate-100 flex flex-col items-center justify-between p-4 hover:border-duo-blue/40 transition-colors"
                  >
                    <div className="w-full h-28 sm:h-32 flex items-center justify-center">
                      {v.image_url ? (
                        <img
                          src={v.image_url}
                          alt={v.word}
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.15')}
                        />
                      ) : (
                        <span className="text-5xl">🖼️</span>
                      )}
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 text-center mt-2">{v.word}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        onClick={(e) => speak(e, i, v.audio_url, v.word)}
                        className="flex items-center gap-1 bg-duo-blue text-white text-sm font-bold px-3 py-1.5 rounded-full active:scale-95"
                      >
                        <Volume2 size={16} /> Listen
                      </span>
                      <span className="flex items-center gap-1 text-slate-300 text-xs font-bold">
                        <RotateCw size={12} /> flip
                      </span>
                    </div>
                  </motion.button>
                ) : (
                  <motion.button
                    key="back"
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ rotateY: -90, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => toggleFlip(i)}
                    className="w-full h-full min-h-[220px] bg-gradient-to-br from-duo-blue to-indigo-600 rounded-3xl shadow-lg text-white flex flex-col justify-between p-4 text-left"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black">{v.word}</h3>
                        <span
                          onClick={(e) => speak(e, i, v.audio_url, v.word)}
                          className="bg-white/20 rounded-full p-1.5 active:scale-90"
                        >
                          <Volume2 size={16} />
                        </span>
                      </div>
                      {v.phonetic && <p className="font-mono text-sm text-white/80 mt-0.5">{v.phonetic}</p>}
                      {v.l1_translation && (
                        <p className="text-lg font-bold text-yellow-200 mt-2">{v.l1_translation}</p>
                      )}
                      {v.definition && <p className="text-sm text-white/90 mt-1">{v.definition}</p>}
                    </div>
                    {v.example_sentence && (
                      <div className="mt-2 border-t border-white/20 pt-2">
                        <p className="text-xs text-white/70 mb-1 font-bold uppercase tracking-wide">Example</p>
                        <p className="text-sm text-white leading-snug">{v.example_sentence}</p>
                        <span
                          onClick={(e) => speak(e, i, v.example_audio_url, v.example_sentence!)}
                          className="inline-flex items-center gap-1 mt-1.5 text-xs bg-white/20 rounded-full px-2 py-1 active:scale-95"
                        >
                          <Volume2 size={12} /> hear sentence
                        </span>
                      </div>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <footer className="mt-4 shrink-0">
        <button
          onClick={onReady}
          className={`w-full font-black py-4 rounded-2xl shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-lg ${
            allStudied ? 'bg-duo-green text-white' : 'bg-white text-slate-500 border-2 border-slate-200'
          }`}
        >
          {allStudied ? "I'm ready — let's practice" : 'Continue'}
          <ChevronRight size={22} />
        </button>
        {!allStudied && (
          <p className="text-center text-slate-400 text-xs mt-2 font-bold">
            Tip: flip & listen to every card for the best start ({studiedCount}/{set.length}).
          </p>
        )}
      </footer>
    </div>
  );
};

export default WordLab;
