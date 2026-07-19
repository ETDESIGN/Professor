// BoardFocusCards — Vocabulary Presentation (INPUT phase).
// REBUILT FROM CLAUDE'S DESIGN DOC (vocabulary-presentation-screen.md).
//
// Two views: Overview Grid (5 cards) → Drill View (4-stage staged reveal).
// State machine: GRID → DRILL_STAGE_1 → 2 → 3 → 4 → (next word or GRID)
//
// Design doc key points:
//   1. Grid shows image + word ONLY (no Chinese/IPA — pure visual binding).
//   2. Drill has 4 stages (teacher controls "Reveal More" from remote):
//      Stage 1: Image + Word (quiet "look at this" moment).
//      Stage 2: + Audio speaker glyph (teacher plays from remote; "Repeat! 跟读！" cue).
//      Stage 3: + IPA + Chinese meaning + English definition.
//      Stage 4: + Example sentence + sentence audio. Card marked "studied".
//   3. Zoom-into-card transition (card scales up from grid, ~400ms).
//   4. Progress rail (✓/○ dots per word, persistent across both views).
//   5. "Start Practice →" prompt when all words studied.
//   6. Stage indicator dots (4 dots showing current reveal stage).

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ChevronRight, RotateCw, BookOpen } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

type View = 'grid' | 'drill';
type RevealStage = 0 | 1 | 2 | 3 | 4; // 0 = nothing revealed in drill; 4 = fully studied

const BoardFocusCards = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [view, setView] = useState<View>('grid');
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealStage, setRevealStage] = useState<RevealStage>(1); // Start at stage 1 (image+word)
  const [studiedWords, setStudiedWords] = useState<Set<number>>(new Set());
  const [showRepeatCue, setShowRepeatCue] = useState(false);

  // Enrich from manifest.
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

  // ── Remote controls ──
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (view === 'drill') {
      if (a.type === 'FLIP_CARD' || a.type === 'REVEAL_ANSWER') {
        // "Reveal More" — advance to next stage.
        setRevealStage(s => Math.min(4, s + 1) as RevealStage);
      } else if (a.type === 'NEXT_CARD') {
        nextWord();
      } else if (a.type === 'PREV_CARD') {
        prevWord();
      } else if (a.type === 'PLAY_AUDIO') {
        playWordAudio();
      }
    }
    if (a.type === 'RESET_GAME') { setView('grid'); setRevealStage(1); }
    // eslint-disable-next-line
  }, [state.lastAction]);

  // ── Mark studied when stage 4 reached ──
  useEffect(() => {
    if (revealStage === 4 && view === 'drill') {
      setStudiedWords(prev => new Set(prev).add(activeIndex));
    }
  }, [revealStage, view, activeIndex]);

  // RULES OF HOOKS: all hooks above.
  if (cards.length === 0) {
    return <div className="h-full flex flex-col items-center justify-center text-slate-400"><p className="font-display text-3xl font-bold">Vocabulary Grid</p><p className="text-lg mt-2">No vocabulary for this unit.</p></div>;
  }

  const active = cards[activeIndex];
  const allStudied = studiedWords.size >= cards.length;

  function enterDrill(i: number) {
    setActiveIndex(i);
    setRevealStage(1);
    setView('drill');
  }

  function nextWord() {
    setRevealStage(1);
    setActiveIndex(i => Math.min(i + 1, cards.length - 1));
  }

  function prevWord() {
    setRevealStage(1);
    setActiveIndex(i => Math.max(i - 1, 0));
  }

  function playWordAudio() {
    if (!active) return;
    playAudioUrl(active.audio, active.word);
    // Show "Repeat! 跟读！" cue synced to playback.
    setShowRepeatCue(true);
    setTimeout(() => setShowRepeatCue(false), 2500);
  }

  function playSentenceAudio() {
    if (!active?.example) return;
    playAudioUrl(active.sentenceAudio, active.example);
    setShowRepeatCue(true);
    setTimeout(() => setShowRepeatCue(false), 3000);
  }

  // ═══ GRID VIEW ═══
  if (view === 'grid') {
    // "Start Practice →" prompt when all studied.
    if (allStudied) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-center p-8">
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <Check size={64} className="text-green-400 mb-4 mx-auto" strokeWidth={3} />
          </motion.div>
          <h2 className="font-display text-4xl font-bold text-slate-100 mb-2">Great! You've learned {cards.length} new words</h2>
          <p className="font-cn text-2xl text-slate-400 mb-6">太棒了！你学会了{cards.length}个新单词</p>
          <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-500/15 border border-blue-400/30">
            <span className="font-display text-lg font-bold text-blue-300">Start Practice →</span>
            <span className="font-cn text-sm text-blue-400/60">开始练习</span>
          </div>
        </motion.div>
      );
    }

    return (
      <div className="h-full flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-50">Today's Words</h1>
            <p className="font-cn text-lg text-slate-400/60">今天的单词 · 点读跟练</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <span className="font-display text-2xl font-black text-blue-300">{cards.length}</span>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Words</span>
          </div>
        </div>

        {/* Grid: image + word ONLY (Stage 1 of dual coding — no Chinese/IPA) */}
        <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 min-h-0">
          {cards.slice(0, 5).map((card, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => enterDrill(i)}
              className={`relative rounded-2xl border-2 p-3 flex flex-col items-center justify-center transition-all hover:scale-105 ${
                studiedWords.has(i) ? 'border-green-400/40 bg-green-500/5' : 'border-white/10 bg-white/5 hover:border-blue-400/40'
              }`}
            >
              {studiedWords.has(i) && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={4} />
                </div>
              )}
              {card.image && String(card.image).startsWith('http') ? (
                <img src={card.image} alt={card.word} className="w-20 h-20 object-contain drop-shadow-2xl mb-2" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.15')} />
              ) : (
                <div className="text-6xl mb-2">{card.word.charAt(0).toUpperCase()}</div>
              )}
              <span className="font-display text-2xl font-bold text-slate-100">{card.word}</span>
            </motion.button>
          ))}

          {/* Helper card (6th slot) */}
          <div className="relative rounded-2xl border border-dashed border-blue-500/30 bg-blue-500/5 p-3 flex flex-col items-center justify-center opacity-50">
            <BookOpen size={32} className="text-blue-300 mb-2" />
            <span className="font-display text-base font-bold text-blue-200">Tap a card to learn</span>
            <span className="font-cn text-xs text-slate-400 mt-1">点击卡片学习</span>
          </div>
        </div>

        {/* Progress rail */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {cards.map((_: any, i: number) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${
              studiedWords.has(i) ? 'bg-green-400' : i === activeIndex ? 'bg-blue-400 scale-125' : 'bg-slate-600'
            }`} />
          ))}
        </div>
      </div>
    );
  }

  // ═══ DRILL VIEW (4-stage staged reveal) ═══
  return (
    <div className="h-full flex flex-col items-center justify-center p-4 relative">
      {/* Back to grid */}
      <button onClick={() => setView('grid')} className="absolute top-3 left-4 flex items-center gap-1 text-slate-400 hover:text-slate-200 text-sm z-10">
        <ChevronRight size={16} className="rotate-180" /> Grid
      </button>

      {/* Stage indicator dots (4 dots showing current reveal stage) */}
      <div className="absolute top-3 right-4 flex items-center gap-1.5 z-10">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`w-2 h-2 rounded-full transition-colors ${revealStage >= s ? 'bg-blue-400' : 'bg-slate-600'}`} />
        ))}
      </div>

      {/* The card (zoom-in from grid feel) */}
      <motion.div
        key={activeIndex}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center max-w-lg"
      >
        {/* ── Stage 1: Image + Word (always visible) ── */}
        {active.image && String(active.image).startsWith('http') ? (
          <img src={active.image} alt={active.word} className="w-40 h-40 object-contain drop-shadow-2xl mb-3" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.15')} />
        ) : (
          <div className="text-[120px] leading-none drop-shadow-2xl mb-3">{active.word.charAt(0).toUpperCase()}</div>
        )}
        <h2 className="font-display text-6xl font-black text-slate-50 leading-tight">{active.word}</h2>

        {/* ── Stage 2: Audio speaker glyph + choral cue ── */}
        {revealStage >= 2 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2">
            <button onClick={playWordAudio} className="flex items-center gap-2 bg-blue-500/15 border border-blue-400/30 px-5 py-2.5 rounded-full active:scale-95 transition-transform">
              <Volume2 size={24} className="text-blue-300" />
              <span className="font-display text-base font-bold text-blue-200">Listen</span>
            </button>
          </motion.div>
        )}

        {/* Choral-repeat cue ("Repeat! 跟读！" — synced to audio) */}
        <AnimatePresence>
          {showRepeatCue && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              className="mt-2 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/40">
              <span className="font-display text-lg font-bold text-amber-200">Repeat! </span>
              <span className="font-cn text-base text-amber-300/70">跟读！</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stage 3: IPA + Chinese + Definition ── */}
        {revealStage >= 3 && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col items-center gap-1">
            {active.phonetic && <p className="font-mono text-2xl text-slate-400">{active.phonetic}</p>}
            {active.l1 && <p className="font-cn text-4xl font-bold text-amber-200">{active.l1}</p>}
            {active.definition && <p className="text-lg text-slate-400 mt-1">{active.definition}</p>}
          </motion.div>
        )}

        {/* ── Stage 4: Example sentence + sentence audio ── */}
        {revealStage >= 4 && active.example && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-black/20 p-4 rounded-2xl border border-white/10 max-w-md">
            <p className="text-lg text-slate-300 leading-relaxed">
              {/* Highlight the target word in the sentence */}
              {active.example.split(new RegExp(`(${active.word})`, 'i')).map((part, pi) =>
                part.toLowerCase() === active.word.toLowerCase()
                  ? <span key={pi} className="font-bold text-amber-300 underline decoration-amber-500/40 underline-offset-2">{part}</span>
                  : <span key={pi}>{part}</span>
              )}
            </p>
            <button onClick={playSentenceAudio} className="mt-2 inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm font-bold active:scale-95">
              <Volume2 size={16} className="text-yellow-300" /> Hear sentence
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Progress rail (persistent across grid + drill) */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {cards.map((_: any, i: number) => (
          <button key={i} onClick={() => { setActiveIndex(i); setRevealStage(1); }} className={`w-2.5 h-2.5 rounded-full transition-all ${
            studiedWords.has(i) ? 'bg-green-400' : i === activeIndex ? 'bg-blue-400 scale-150' : 'bg-slate-600 hover:bg-slate-500'
          }`} />
        ))}
      </div>

      {/* Stage advancement hint */}
      {revealStage < 4 && (
        <p className="mt-2 text-xs text-slate-500">Teacher: tap "Flip" on remote to reveal more</p>
      )}
      {revealStage === 4 && !allStudied && (
        <button onClick={nextWord} className="mt-2 flex items-center gap-2 bg-blue-500 text-white px-5 py-2 rounded-xl font-bold text-sm active:scale-95">
          Next Word <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};

export default BoardFocusCards;
