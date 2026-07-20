// BoardStoryStage — Story dialogue page (OUTPUT phase).
// REBUILT FROM CLAUDE'S DESIGN DOC (story-stage-screen.md).
//
// Key architecture from the doc:
//   1. Story Hook (title card) → Pages → Comprehension Check closing.
//   2. Full-bleed scene (illustration = background, no card border).
//   3. Floating dialogue panel (glass-over-artwork at bottom, speaker avatar
//      "in" the scene, character accent color).
//   4. Target vocab highlighted gold + underlined (part of reading flow).
//   5. Page-turn transition (~500ms cinematic).
//   6. Progress dots at bottom edge.
//   7. Warm storybook mood (amber-brown, unhurried).

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, ChevronRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

const CHARACTER_COLORS: Record<string, string> = {
  // Default fallback colors per character name.
};
const FALLBACK_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#EC4899'];

const BoardStoryStage = ({ data }: { data: any }) => {
  const { state } = useSession();
  const pages = data.pages || [];
  const characters = data.characters || [];
  const [activePanel, setActivePanel] = useState(-1); // -1 = story hook; 0..N = pages; N = comprehension
  const totalContentPanels = pages.length;

  // Vocab for highlighting target words.
  const vocab = useMemo(() => getVocabulary(state.activeUnit?.manifest), [state.activeUnit?.manifest]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // Character color lookup.
  const getCharColor = (name: string) => {
    const idx = characters.findIndex((c: any) => c.name === name);
    if (idx >= 0 && characters[idx]?.color) return characters[idx].color;
    return FALLBACK_COLORS[idx >= 0 ? idx % FALLBACK_COLORS.length : 0];
  };

  // ── Remote controls ──
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'NEXT_PANEL' || a.type === 'NEXT_CARD') {
      setActivePanel(p => Math.min(p + 1, totalContentPanels));
    } else if (a.type === 'PREV_PANEL' || a.type === 'PREV_CARD') {
      setActivePanel(p => Math.max(p - 1, -1));
    } else if (a.type === 'RESET_GAME') {
      setActivePanel(-1);
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  // RULES OF HOOKS.
  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <BookOpen size={56} className="text-amber-600/40 mb-3" />
        <p className="font-display text-3xl font-bold">Story Stage</p>
        <p className="text-lg mt-2">No story pages for this unit.</p>
      </div>
    );
  }

  const isHook = activePanel === -1;
  const isComprehension = activePanel >= totalContentPanels;
  const current = !isHook && !isComprehension ? pages[activePanel] : null;
  const currentSpeaker = current ? (characters.find((c: any) => c.name === current.speaker) || characters[0]) : null;

  // Render target words highlighted in dialogue.
  const renderText = (text: string) =>
    (text || '').split(/(\s+)/).map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return <span key={i} className="font-bold text-amber-300 underline decoration-amber-500/50 decoration-2 underline-offset-4">{tok}</span>;
      }
      return <span key={i}>{tok}</span>;
    });

  return (
    <div className="h-full relative overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ═══ STORY HOOK (title card, page -1) ═══ */}
        {isHook && (
          <motion.div key="hook" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }}
          >
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} transition={{ delay: 0.2 }} className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <h1 className="font-display text-6xl font-black text-amber-300 mb-2" style={{ textShadow: '0 4px 20px rgba(217,119,6,.3)' }}>
                {data.title || 'Story'}
              </h1>
              {data.setting && <p className="font-cn text-xl text-amber-400/50 mb-6">{data.setting}</p>}
            </motion.div>
            {/* Character lineup */}
            {characters.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex gap-6">
                {characters.map((c: any, i: number) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
                      style={{ border: `3px solid ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}`, background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20` }}>
                      {c.emoji || c.name?.charAt(0) || '👤'}
                    </div>
                    <span className="font-display text-sm font-bold text-slate-300">{c.name}</span>
                  </div>
                ))}
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6">
              <span className="text-sm text-amber-400/40">👆 Teacher: tap Next to begin · 点击下一步开始</span>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ STORY PAGE (full-bleed scene + floating dialogue) ═══ */}
        {!isHook && !isComprehension && current && (
          <motion.div key={`page-${activePanel}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0">
            {/* Full-bleed scene illustration */}
            <div className="absolute inset-0">
              {current.imageUrl ? (
                <img src={current.imageUrl} className="w-full h-full object-cover" alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              ) : (
                <div className="w-full h-full" style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }} />
              )}
              {/* Dark gradient at bottom for dialogue legibility */}
              <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to top, rgba(20,14,8,.92), rgba(20,14,8,.5) 60%, transparent)' }} />
            </div>

            {/* Floating dialogue panel (glass-over-artwork) */}
            <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
              <div className="max-w-3xl mx-auto flex items-end gap-4">
                {/* Speaker avatar (sits above panel, "in" the scene) */}
                {currentSpeaker && (
                  <div className="flex flex-col items-center shrink-0 -mb-2">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-xl"
                      style={{ background: `${getCharColor(current.speaker)}25`, border: `2px solid ${getCharColor(current.speaker)}` }}>
                      {currentSpeaker.emoji || currentSpeaker.name?.charAt(0) || '👤'}
                    </div>
                    <span className="font-display text-xs font-bold mt-1" style={{ color: getCharColor(current.speaker) }}>
                      {current.speaker || currentSpeaker.name}
                    </span>
                  </div>
                )}
                {/* Dialogue text + Read Page */}
                <div className="flex-1 backdrop-blur-md rounded-2xl px-6 py-4" style={{ background: 'rgba(36,26,16,.7)', borderLeft: `3px solid ${getCharColor(current.speaker)}` }}>
                  <p className="font-display text-3xl font-bold text-amber-50 leading-snug">
                    "{renderText(current.text || '')}"
                  </p>
                  <button onClick={() => playAudioUrl(current.audio, current.text)} className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-amber-300/70 active:scale-95">
                    <Volume2 size={16} /> Read Page
                  </button>
                </div>
              </div>
            </div>

            {/* Progress dots (bottom edge) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {pages.map((_: any, i: number) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === activePanel ? 'bg-amber-400 scale-150' : i < activePanel ? 'bg-amber-600' : 'bg-white/20'}`} />
              ))}
            </div>

            {/* Next page preview (top-right) */}
            {activePanel < totalContentPanels - 1 && pages[activePanel + 1] && (
              <div className="absolute top-4 right-4 max-w-[200px] opacity-40">
                <p className="text-xs text-amber-400/50 uppercase tracking-widest mb-1">Next…</p>
                <p className="text-sm text-slate-400 italic truncate">{pages[activePanel + 1].text || '...'}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ COMPREHENSION CHECK (closing beat) ═══ */}
        {isComprehension && (
          <motion.div key="comprehension" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(160deg, #2A1F10, #1A1208)' }}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
              <div className="text-5xl mb-4">📚</div>
            </motion.div>
            <h2 className="font-display text-5xl font-black text-amber-300 mb-2">The End</h2>
            <p className="font-cn text-2xl text-amber-400/50 mb-6">故事结束</p>
            <div className="px-6 py-3 rounded-full bg-amber-500/15 border border-amber-400/30">
              <span className="font-display text-lg font-bold text-amber-200">Comprehension Check →</span>
              <span className="font-cn text-sm text-amber-400/60 ml-2">理解检查</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardStoryStage;
