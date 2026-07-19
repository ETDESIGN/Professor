// BoardStoryStage — Story dialogue page (OUTPUT phase).
// Redesigned from Hermes prototype 03-story-stage.html.
// Warm amber storybook panel with character speech bubbles, highlighted vocab,
// narration audio, and next-page preview.

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, ChevronRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

const BoardStoryStage = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activePanel, setActivePanel] = useState(0);
  const pages = data.pages || [];
  const characters = data.characters || [];

  // Vocab map for highlighting target words in dialogue.
  const vocab = useMemo(() => getVocabulary(state.activeUnit?.manifest), [state.activeUnit?.manifest]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // RULES OF HOOKS: effect before any return.
  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_PANEL' || state.lastAction?.type === 'NEXT_CARD') {
      setActivePanel(p => Math.min(p + 1, pages.length - 1));
    } else if (state.lastAction?.type === 'PREV_PANEL' || state.lastAction?.type === 'PREV_CARD') {
      setActivePanel(p => Math.max(p - 1, 0));
    } else if (state.lastAction?.type === 'RESET_GAME') {
      setActivePanel(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <BookOpen size={64} className="text-amber-600/40 mb-4" />
        <p className="font-display text-4xl font-bold">Story Stage</p>
        <p className="text-xl mt-2">No story pages for this unit.</p>
      </div>
    );
  }

  const current = pages[activePanel];
  const next = pages[activePanel + 1];
  const currentSpeaker = characters.find((c: any) => c.name === current?.speaker) || characters[0];

  // Render dialogue text with highlighted target vocab words.
  const renderText = (text: string) =>
    (text || '').split(/(\s+)/).map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return (
          <span key={i}>
            <span className="text-amber-300 font-bold underline decoration-amber-500/50 decoration-2 underline-offset-4">
              {tok}
            </span>
          </span>
        );
      }
      return <span key={i}>{tok}</span>;
    });

  return (
    <div className="h-full flex flex-col p-6">
      {/* Stage: warm amber storybook */}
      <div
        className="relative flex-1 rounded-3xl border-2 border-amber-600/60 overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(120,53,15,.18),rgba(69,26,3,.10) 50%,rgba(120,53,15,.06))', boxShadow: '0 0 50px rgba(217,119,6,.18)' }}
      >
        {/* Story Title */}
        <div className="relative pt-5 pb-2 text-center">
          <div className="inline-flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <h1 className="text-6xl font-display font-black text-amber-300 tracking-tight" style={{ textShadow: '0 4px 20px rgba(217,119,6,.3)' }}>
              {data.title || 'Story'}
            </h1>
            <span className="text-2xl">📖</span>
          </div>
        </div>

        {/* Storybook Panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="relative mx-auto w-[85%] max-w-[900px] mt-2"
          >
            <div
              className="relative rounded-[28px] border-2 border-amber-700/40 p-7 overflow-hidden"
              style={{ background: 'linear-gradient(160deg,rgba(254,243,199,.06),rgba(120,53,15,.12))' }}
            >
              {/* Decorative corners */}
              <div className="absolute top-3 left-3 text-amber-700/30 text-2xl">❧</div>
              <div className="absolute top-3 right-3 text-amber-700/30 text-2xl">❧</div>

              {/* Narration (if present) */}
              {current?.narration && (
                <p className="text-2xl italic text-slate-300 leading-relaxed mb-4 font-body">
                  {current.narration}
                </p>
              )}

              {/* Dialogue speech bubble with avatar */}
              {current?.text && (
                <div className="flex items-end gap-4 mb-4">
                  {/* Character avatar */}
                  {currentSpeaker && (
                    <div className="flex-shrink-0">
                      <div
                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/30 to-rose-700/10 border-2 border-amber-500/50 flex items-center justify-center text-4xl"
                      >
                        {currentSpeaker.emoji || currentSpeaker.name?.charAt(0) || '👤'}
                      </div>
                      <div className="text-center mt-1 text-xs font-bold text-amber-300">
                        {current?.speaker || currentSpeaker.name}
                      </div>
                    </div>
                  )}
                  {/* Speech bubble */}
                  <div className="relative flex-1 bg-amber-500/12 border-2 border-amber-400/40 rounded-3xl rounded-bl-lg px-7 py-4">
                    <p className="text-3xl font-bold text-amber-100 font-display leading-snug">
                      {renderText(current.text)}
                    </p>
                    {/* Audio: Read Page */}
                    <button
                      onClick={() => playAudioUrl(current?.audio, current?.text)}
                      className="mt-3 inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 px-4 py-2 rounded-full text-base font-bold text-amber-200 active:scale-95"
                    >
                      <Volume2 size={18} className="text-yellow-300" /> Read Page
                    </button>
                  </div>
                </div>
              )}

              {/* Next page preview */}
              {next && (
                <div className="mt-4 pt-3 border-t border-dashed border-amber-700/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-widest text-amber-700/50 font-bold">Next…</span>
                    <div className="flex-1 h-px bg-amber-700/20" />
                  </div>
                  <p className="text-lg text-slate-500/50 italic truncate">
                    {next.narration || next.text || '...'}
                  </p>
                </div>
              )}
            </div>

            {/* Page number */}
            <div className="text-center mt-2 text-amber-600/40 text-xs font-bold tracking-widest">
              — PAGE {activePanel + 1} —
            </div>
          </motion.div>
        </AnimatePresence>

        {/* "Tap to continue" hint */}
        {activePanel < pages.length - 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-3xl">👆</motion.div>
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-600/20 border border-amber-500/40">
              <span className="text-sm font-bold text-amber-200">Tap to continue</span>
              <span className="text-xs text-amber-400/60 font-cn">· 点击继续</span>
            </div>
          </div>
        )}

        {/* Encountered vocab chips */}
        <div className="absolute top-4 right-4">
          <div className="text-[10px] uppercase tracking-widest text-amber-600/50 font-bold mb-1">Encountered</div>
          <div className="flex gap-1.5">
            {vocab.slice(0, 5).map((v, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center text-lg ${
                  i <= activePanel ? 'bg-amber-600/20 border-amber-500/40' : 'bg-white/5 border-white/10 opacity-40'
                }`}
              >
                {v.image_url ? '' : v.word?.charAt(0)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="mt-3 flex items-center justify-center gap-2 text-slate-500">
        <span className="text-base">🎙️</span>
        <span className="text-sm font-semibold">Students read the dialogue aloud together · 全班齐读对话</span>
      </div>
    </div>
  );
};

export default BoardStoryStage;
