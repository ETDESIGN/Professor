// BoardFocusCards — Vocabulary Presentation (INPUT phase).
// Redesigned from Hermes prototype 02-vocab-grid.html.
// Shows a 5-card grid overview; tapping a card enters drill mode (enlarged
// with staged reveal + audio). Teacher controls via remote (NEXT/PREV/FLIP).

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ChevronRight, RotateCw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

const BoardFocusCards = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [view, setView] = useState<'grid' | 'drill'>('grid');

  // Enrich from the unit manifest (image + IPA + Chinese L1 + audio).
  const cards = useMemo(() => {
    const flowCards = data.cards || [];
    const vocab = getVocabulary(state.activeUnit?.manifest);
    const byWord = new Map<string, any>();
    for (const v of vocab) if (v.word) byWord.set(v.word.toLowerCase(), v);
    return flowCards.map((c: any) => {
      const rich = byWord.get(String(c.front || c.back || '').toLowerCase()) || {};
      return {
        word: c.front || rich.word || '',
        image: c.image || rich.image_url || '',
        phonetic: c.phonetic || rich.phonetic || '',
        l1: rich.l1_translation || c.translation || '',
        definition: c.definition || rich.definition || '',
        example: c.context_sentence || rich.example_sentence || '',
        audio: rich.audio_url || c.audio_url,
        sentenceAudio: rich.example_audio_url,
      };
    }).filter((c: any) => c.word);
  }, [data.cards, state.activeUnit?.manifest]);

  // RULES OF HOOKS: all hooks before any return.
  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_CARD') {
      setIsFlipped(false);
      setTimeout(() => setActiveIndex(p => Math.min(p + 1, cards.length - 1)), 200);
    } else if (state.lastAction?.type === 'PREV_CARD') {
      setIsFlipped(false);
      setTimeout(() => setActiveIndex(p => Math.max(p - 1, 0)), 200);
    } else if (state.lastAction?.type === 'FLIP_CARD') {
      setIsFlipped(p => !p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  if (cards.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <p className="font-display text-4xl font-bold">Vocabulary Grid</p>
        <p className="text-xl mt-2">No vocabulary for this unit.</p>
      </div>
    );
  }

  const active = cards[activeIndex];

  // ═══ GRID VIEW ═══
  if (view === 'grid') {
    return (
      <div className="h-full flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-5xl font-display font-bold text-slate-50">Vocabulary Grid</h1>
            <p className="text-xl text-slate-400 font-cn mt-1">生词卡片 · 点读跟练</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <span className="text-3xl font-black text-blue-300">{cards.length}</span>
            <span className="text-sm text-slate-400 font-bold uppercase tracking-wider">Words</span>
          </div>
        </div>

        {/* Cards grid */}
        <div className="relative flex-1 rounded-3xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-950/30 via-slate-900/40 to-slate-950/50 overflow-hidden">
          <div className="h-full grid grid-cols-3 grid-rows-2 gap-4 p-6">
            {cards.slice(0, 5).map((card, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => { setActiveIndex(i); setView('drill'); setIsFlipped(false); }}
                className={`relative rounded-2xl border-2 p-5 flex flex-col items-center justify-center transition-all hover:scale-105 ${
                  i === activeIndex
                    ? 'border-blue-400 bg-gradient-to-b from-blue-500/15 to-blue-900/20 shadow-[0_0_30px_rgba(59,130,246,.3)]'
                    : 'border-white/10 bg-white/5 hover:border-blue-400/40'
                }`}
              >
                {i === activeIndex && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-black text-white uppercase tracking-wider">Now</div>
                )}
                {card.image && String(card.image).startsWith('http') ? (
                  <img src={card.image} alt={card.word} className="w-24 h-24 object-contain drop-shadow-2xl" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                ) : (
                  <div className="text-7xl leading-none drop-shadow-2xl">{card.word.charAt(0).toUpperCase()}</div>
                )}
                <div className="mt-3 text-4xl font-display font-bold text-slate-100">{card.word}</div>
                {card.phonetic && <div className="mt-1 text-xl text-slate-400 font-mono">{card.phonetic}</div>}
                {card.l1 && <div className="mt-2 text-3xl font-cn font-bold text-amber-200">{card.l1}</div>}
                {/* Audio pulse */}
                <div
                  onClick={(e) => { e.stopPropagation(); playAudioUrl(card.audio, card.word); }}
                  className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-blue-500/30 border border-blue-400/50 flex items-center justify-center active:scale-90"
                >
                  <Volume2 size={16} className="text-blue-200" />
                </div>
              </motion.button>
            ))}

            {/* Helper card */}
            <div className="relative rounded-2xl border border-dashed border-blue-500/30 bg-blue-500/5 p-5 flex flex-col items-center justify-center opacity-60">
              <div className="text-5xl">📢</div>
              <div className="mt-3 text-xl font-bold text-blue-200">Listen &amp; Repeat</div>
              <div className="mt-1 text-base text-slate-400 font-cn">听一听，读一读</div>
              <div className="mt-2 text-xs text-slate-500">Tap a card to hear it</div>
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {cards.map((_: any, i: number) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === activeIndex ? 'bg-blue-400' : 'bg-slate-600'}`} />
          ))}
        </div>
      </div>
    );
  }

  // ═══ DRILL VIEW (enlarged single card) ═══
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 relative">
      <button
        onClick={() => setView('grid')}
        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors z-10"
      >
        <ChevronRight size={20} className="rotate-180" /> Grid
      </button>

      <AnimatePresence mode="wait">
        {!isFlipped ? (
          /* FRONT: image + word + Listen */
          <motion.div
            key={`front-${activeIndex}`}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center"
          >
            {active.image && String(active.image).startsWith('http') ? (
              <img src={active.image} alt={active.word} className="w-64 h-64 object-contain drop-shadow-2xl mb-4" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
            ) : (
              <div className="text-[180px] leading-none drop-shadow-2xl mb-4">{active.word.charAt(0).toUpperCase()}</div>
            )}
            <h2 className="text-7xl font-display font-black text-slate-50">{active.word}</h2>
            <button
              onClick={() => playAudioUrl(active.audio, active.word)}
              className="mt-6 flex items-center gap-3 bg-blue-500 text-white px-8 py-4 rounded-2xl font-bold text-2xl active:scale-95 shadow-lg"
            >
              <Volume2 size={32} className="text-yellow-300" /> Listen
            </button>
            <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm mt-4 animate-pulse">Flip for meaning</p>
          </motion.div>
        ) : (
          /* BACK: IPA + Chinese + example + sentence audio */
          <motion.div
            key={`back-${activeIndex}`}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center max-w-2xl"
          >
            <h2 className="text-7xl font-display font-black text-slate-50 mb-4">{active.word}</h2>
            {active.phonetic && (
              <button onClick={() => playAudioUrl(active.audio, active.word)} className="bg-white/10 px-8 py-3 rounded-full flex items-center gap-4 text-3xl font-mono mb-4 active:scale-95">
                <Volume2 size={28} className="text-yellow-300" /> {active.phonetic}
              </button>
            )}
            {active.l1 && <div className="text-6xl font-cn font-bold text-amber-200 mb-4">{active.l1}</div>}
            {active.definition && <p className="text-2xl text-slate-300 mb-4">{active.definition}</p>}
            {active.example && (
              <div className="bg-black/20 p-5 rounded-2xl border border-white/10 max-w-xl">
                <p className="text-xl text-slate-300 leading-relaxed">{active.example}</p>
                <button
                  onClick={() => playAudioUrl(active.sentenceAudio, active.example)}
                  className="mt-3 inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-base font-bold active:scale-95"
                >
                  <Volume2 size={18} className="text-yellow-300" /> Hear sentence
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {cards.map((_: any, i: number) => (
          <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === activeIndex ? 'bg-blue-400' : 'bg-slate-600'}`} />
        ))}
      </div>
    </div>
  );
};

export default BoardFocusCards;
