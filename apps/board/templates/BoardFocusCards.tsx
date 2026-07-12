
import React, { useState, useEffect, useMemo } from 'react';
import { Volume2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

const BoardFocusCards = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Enrich the flow-block cards with the unit manifest's rich data (audio_url,
  // l1_translation Chinese, example_audio_url, definition) so the board shows the
  // SAME multi-modal content as the student Word Lab (image + word + IPA + AUDIO
  // + Chinese). Falls back to the flow-block card fields when no manifest match.
  const cards = useMemo(() => {
    const flowCards = data.cards || [];
    const vocab = getVocabulary(state.activeUnit?.manifest);
    const byWord = new Map<string, any>();
    for (const v of vocab) if (v.word) byWord.set(v.word.toLowerCase(), v);
    return flowCards.map((c: any) => {
      const rich = byWord.get(String(c.front || c.back || '').toLowerCase()) || {};
      return {
        front: c.front || rich.word,
        back: c.back || rich.word,
        image: c.image || rich.image_url,
        phonetic: c.phonetic || rich.phonetic,
        context_sentence: c.context_sentence || rich.example_sentence,
        definition: c.definition || rich.definition,
        l1: rich.l1_translation || c.translation || '',
        audio_url: rich.audio_url || c.audio_url,
        sentence_audio: rich.example_audio_url,
      };
    });
  }, [data.cards, state.activeUnit?.manifest]);

  const activeCard = cards[activeIndex];

  // RULES OF HOOKS: all hooks (useState/useMemo/useEffect) run before any return.
  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_CARD') handleNext();
    else if (state.lastAction?.type === 'PREV_CARD') handlePrev();
    else if (state.lastAction?.type === 'FLIP_CARD') setIsFlipped(prev => !prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  if (cards.length === 0 || !activeCard) {
    return (
      <div className="h-full bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-display font-bold text-slate-400">{data.title || 'Focus Cards'}</h2>
          <p className="text-slate-300 text-xl mt-2">No cards available for this lesson.</p>
        </div>
      </div>
    );
  }

  const speak = (url?: string, text?: string) => playAudioUrl(url, text);

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => setActiveIndex((prev) => (prev + 1) % cards.length), 200);
  };
  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length), 200);
  };

  return (
    <div className="h-full bg-slate-100 flex flex-col p-12 overflow-hidden relative">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#3b82f6 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>

      {/* Header */}
      <div className="flex justify-between items-center mb-8 relative z-10">
        <h2 className="text-5xl font-display font-bold text-slate-800 flex items-center gap-4">
          <span className="bg-duo-blue text-white w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg">Aa</span>
          {data.title}
        </h2>
        <div className="text-4xl font-mono text-slate-400 font-bold tracking-widest bg-white px-6 py-2 rounded-xl shadow-sm border border-slate-200">
          {activeIndex + 1} / {cards.length}
        </div>
      </div>

      {/* 3D Stage */}
      <div className="flex-1 flex items-center justify-center perspective-[2500px]">
        <div className="absolute left-12 top-1/2 -translate-y-1/2 text-slate-300 animate-pulse"><ArrowLeft size={64} /></div>
        <div className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-300 animate-pulse"><ArrowRight size={64} /></div>

        <div className="absolute w-[600px] h-[750px] bg-white rounded-[3rem] shadow-sm border border-slate-200 transform translate-x-4 translate-y-4 -z-10 rotate-2"></div>
        <div className="absolute w-[600px] h-[750px] bg-white rounded-[3rem] shadow-sm border border-slate-200 transform -translate-x-4 translate-y-2 -z-20 -rotate-2"></div>

        <div className={`relative w-[600px] h-[750px] transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
          {/* Front Face */}
          <div className="absolute inset-0 backface-hidden bg-white rounded-[3rem] shadow-2xl border-b-[24px] border-slate-100 flex flex-col items-center justify-center p-12 overflow-hidden border-2 border-t-white border-x-white">
            <div className="flex-1 w-full flex items-center justify-center relative">
              <div className="absolute inset-0 bg-blue-50 rounded-full scale-90 opacity-50 blur-3xl"></div>
              {activeCard.image && String(activeCard.image).startsWith('http') ? (
                <img src={activeCard.image} alt={activeCard.back} className="w-full h-full object-contain relative z-10 rounded-2xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="text-[200px] leading-none drop-shadow-2xl relative z-10 select-none">{activeCard.front || activeCard.back}</div>
              )}
            </div>
            {/* Speak the WORD on the front (real audio, guaranteed sound). */}
            <button onClick={() => speak(activeCard.audio_url, activeCard.back)} className="flex items-center gap-3 bg-duo-blue text-white px-8 py-4 rounded-2xl shadow-lg active:scale-95 mb-2">
              <Volume2 size={36} className="text-yellow-300" />
              <span className="text-2xl font-bold">{activeCard.back}</span>
            </button>
            <span className="text-slate-300 font-bold uppercase tracking-[0.5em] text-sm animate-pulse">Flip for meaning</span>
          </div>

          {/* Back Face */}
          <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-[3rem] shadow-2xl border-b-[24px] border-blue-800 rotate-y-180 flex flex-col items-center justify-center p-12 text-white border-2 border-t-white/20 border-x-white/20">
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <h3 className="text-8xl font-display font-bold mb-6 tracking-tight drop-shadow-md">{activeCard.back}</h3>
              {activeCard.phonetic && (
                <button onClick={() => speak(activeCard.audio_url, activeCard.back)} className="bg-white/20 backdrop-blur-md px-10 py-5 rounded-full flex items-center gap-6 text-4xl font-mono shadow-inner border border-white/20 active:scale-95 mb-4">
                  <Volume2 size={48} className="text-yellow-300" />
                  {activeCard.phonetic}
                </button>
              )}
              {/* Chinese (L1) translation — the Chinese-market requirement. */}
              {activeCard.l1 && (
                <div className="text-5xl font-bold text-yellow-200 mb-4">{activeCard.l1}</div>
              )}
            </div>
            <div className="w-full bg-black/20 p-6 rounded-2xl text-center backdrop-blur-sm border border-white/10">
              <p className="opacity-90 text-2xl font-medium">
                {activeCard.context_sentence ? (
                  <>
                    {activeCard.context_sentence.split(activeCard.back).map((part: string, i: number, arr: string[]) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && <span className="font-bold text-yellow-300 underline decoration-4 underline-offset-4">{activeCard.back}</span>}
                      </React.Fragment>
                    ))}
                  </>
                ) : activeCard.definition ? activeCard.definition : <span className="text-white/50 italic">No context available</span>}
              </p>
              {/* Speak the EXAMPLE SENTENCE (sentence audio / speechSynthesis). */}
              {activeCard.context_sentence && (
                <button onClick={() => speak(activeCard.sentence_audio, activeCard.context_sentence)} className="mt-3 inline-flex items-center gap-2 bg-white/15 px-4 py-2 rounded-full text-lg font-bold active:scale-95">
                  <Volume2 size={20} className="text-yellow-300" /> Hear sentence
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .perspective-[2500px] { perspective: 2500px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};

export default BoardFocusCards;
