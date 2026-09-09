// BoardFocusCards — Vocabulary Presentation (INPUT phase), v3 redesign.
//
// Design source of truth (games-v3 loop, 2026-09-10):
//   §4 Anti-Gravity audit (validated) + §5 Stitch screens
//   (docs/audit/games-v3/stitch/05-focus-cards/ — 4 screens) + owner rules.
//
// The v3 interaction — the 3-beat classroom loop (audit 4.d):
//   1. PROMPT   the teacher gestures at a card (sky halo) — the class shouts it
//   2. CHECK    tap/FLIP flips the card IN PLACE to its back (word + audio
//               auto-plays once) and marks it studied (emerald ✓)
//   3. ADVANCE  NEXT moves the halo; "+" on a back opens the deep-dive modal
//               (phonetics, Chinese, example sentence — Chinese allowed there).
//
// Fixes shipped here (vs the pre-v3 component, see 05-focus-cards.md §3/§4):
//   F1/G-4.b  ALL unit words in batches of 6 with "Next 6 words" pagination
//             (no more slice(0,5) + wasted 6th helper slot).
//   F2/F3     image-only LANDSCAPE fronts; in-place 3D flip (no separate drill
//             view); staged reveal moved behind the "+" deep-dive modal.
//   F5        commander/remote parity: cursor PREV/NEXT, FLIP (active card),
//             FLIP_ALL (batch), AUDIO (PLAY_AUDIO — previously half-dead),
//             NEXT_BATCH.
//   F6        "Start Practice Phase →" actually emits SLIDE_COMPLETE.
//   F7        recordExposure fires on FIRST FLIP (not drill stage 4 — the
//             48-click barrier is gone).
//   F8        responsive: 3-col → 2-col grid, landscape cards, no scroll.
//   G-4.a     header clears the BoardShell phase-pill zone (pl-40/lg:pl-48);
//             FOCUS_CARDS is full-bleed (leaderboard rail retracts — edit in
//             BoardShell.tsx FULL_BLEED_TYPES).
//   Owner rule 2026-09-10: cards are LANDSCAPE ~4:3 (horizontal stage).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Volume2, Check, ChevronRight, X, RotateCw, Sparkles } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

// WS4 runtime heal: placeholder images frozen at orchestration time lose to
// the manifest's real word-library URL.
const isRealImage = (u?: string) =>
  !!u && !u.includes('dicebear') && !u.startsWith('https://pollinations.ai');

/** v3 fonts (Fredoka display + JetBrains Mono), injected once per page. */
function useV3Fonts() {
  useEffect(() => {
    if (document.getElementById('ws-v3-fonts')) return;
    const l = document.createElement('link');
    l.id = 'ws-v3-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=JetBrains+Mono:wght@700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}

const BATCH_SIZE = 6;

const BoardFocusCards = ({ data }: { data: any }) => {
  useV3Fonts();
  const { state, triggerAction, triggerConfetti } = useSession();

  // ── Content: frozen flow cards merged with the manifest vocabulary ───────
  const cards = useMemo(() => {
    const flowCards = data.cards || [];
    const vocab = getVocabulary(state.activeUnit?.manifest);
    const byWord = new Map<string, any>();
    for (const v of vocab) if (v.word) byWord.set(v.word.toLowerCase(), v);
    return flowCards.map((c: any) => {
      const rich = byWord.get(String(c.front || c.back || '').toLowerCase()) || {};
      return {
        word: c.front || rich.word || '',
        image: (isRealImage(c.image) ? c.image : '') ||
          (isRealImage(rich.image_url) ? rich.image_url : '') ||
          c.image || '',
        phonetic: c.phonetic || rich.phonetic || '',
        l1: rich.l1_translation || c.translation || '',
        definition: c.definition || rich.definition || '',
        example: c.context_sentence || rich.example_sentence || '',
        audio: rich.audio_url || c.audio_url,
        sentenceAudio: rich.example_audio_url,
      };
    }).filter((c: any) => c.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cards, state.activeUnit?.id]);

  // ── View state ────────────────────────────────────────────────────────────
  const [batchIndex, setBatchIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);       // halo cursor (global word index)
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [studied, setStudied] = useState<Set<number>>(new Set());
  const [detailIndex, setDetailIndex] = useState<number | null>(null); // "+" modal
  const [toast, setToast] = useState<string | null>(null);

  const totalBatches = Math.max(1, Math.ceil(cards.length / BATCH_SIZE));
  const batchStart = batchIndex * BATCH_SIZE;
  const batchCards = cards.slice(batchStart, batchStart + BATCH_SIZE);
  const allStudied = cards.length > 0 && studied.size >= cards.length;

  const flashToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2000);
  }, []);

  const playWord = useCallback((i: number) => {
    const c = cards[i];
    if (c) playAudioUrl(c.audio, c.word, 'en').catch(() => {});
  }, [cards]);

  // ── FSRS exposure on FIRST FLIP (audit 4.c — replaces the stage-4 gate) ───
  const exposedRef = useRef<Set<number>>(new Set());
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);
  useEffect(() => {
    if (roster.length === 0) return;
    const newlyExposed = [...flipped].filter((i) => !exposedRef.current.has(i));
    if (newlyExposed.length === 0) return;
    for (const i of newlyExposed) exposedRef.current.add(i);
    const unitId = state.activeUnit?.id;
    if (!unitId) return;
    Promise.all([
      import('../../../services/boardLearner'),
      import('../../../services/supabaseClient'),
    ]).then(([{ recordExposure }, { supabase }]) => {
      for (const i of newlyExposed) {
        const word = cards[i]?.word;
        if (!word) continue;
        supabase.from('objectives')
          .select('id').eq('unit_id', unitId).eq('type', 'vocabulary')
          .ilike('target_value', word.trim()).limit(1)
          .then(({ data }: any) => {
            const objectiveId = data?.[0]?.id;
            if (objectiveId) recordExposure(objectiveId, roster).catch(() => {});
          });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  // ── Interaction ───────────────────────────────────────────────────────────
  const flipCard = useCallback((i: number, opts: { silent?: boolean } = {}) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i); // flip back to the image — "studied" stays earned
      } else {
        next.add(i);
        setStudied((s) => (s.has(i) ? s : new Set(s).add(i)));
        if (!opts.silent) playWord(i);
      }
      return next;
    });
  }, [playWord]);

  /** Board tap: the 3-beat check — tap a card to flip it (moving the halo);
   * tap the flipped back to flip it back to the image. */
  const onCardTap = useCallback((i: number) => {
    setActiveIndex(i);
    flipCard(i);
  }, [flipCard]);

  const moveCursor = useCallback((delta: number) => {
    setActiveIndex((prev) => {
      const lo = batchStart;
      const hi = Math.min(cards.length, batchStart + BATCH_SIZE) - 1;
      return Math.max(lo, Math.min(hi, prev + delta));
    });
  }, [batchStart, cards.length]);

  const flipAllBatch = useCallback(() => {
    const newly: number[] = [];
    setFlipped((prev) => {
      const next = new Set(prev);
      for (let i = batchStart; i < Math.min(cards.length, batchStart + BATCH_SIZE); i++) {
        if (!next.has(i)) { next.add(i); newly.push(i); }
      }
      return next;
    });
    setStudied((s) => {
      const next = new Set(s);
      for (const i of newly) next.add(i);
      return next;
    });
    flashToast('Say them together!');
  }, [batchStart, cards.length, flashToast]);

  const nextBatch = useCallback(() => {
    setBatchIndex((b) => (b + 1) % totalBatches);
    setDetailIndex(null);
  }, [totalBatches]);

  // ── Remote/commander actions ──────────────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    switch (a.type) {
      case 'FLIP_CARD':
      case 'REVEAL_ANSWER':
        flipCard(activeIndex);
        break;
      case 'NEXT_CARD':
        moveCursor(1);
        break;
      case 'PREV_CARD':
        moveCursor(-1);
        break;
      case 'PLAY_AUDIO':
        playWord(activeIndex);
        break;
      case 'FLIP_ALL_CARDS':
        flipAllBatch();
        break;
      case 'NEXT_ROUND':
      case 'NEXT_BATCH':
        nextBatch();
        break;
      case 'RESET_GAME':
        setFlipped(new Set());
        setStudied(new Set());
        setBatchIndex(0);
        setActiveIndex(0);
        setDetailIndex(null);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Empty state (after all hooks) ─────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <div className="ws-root h-full bg-[#070C18] flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-bold text-slate-500 mb-2">Focus Cards</h1>
        <p className="text-slate-600 text-xl">This unit has no vocabulary words yet.</p>
        <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
          className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">Skip Slide</button>
      </div>
    );
  }

  // ── Completion (audit F6 — the transition is real now) ────────────────────
  if (allStudied) {
    return (
      <div className="ws-root h-full bg-[#070C18] flex flex-col items-center justify-center text-center px-6 gap-4 lg:gap-5 animate-fade-in overflow-y-auto py-4"
        style={{ backgroundImage: 'radial-gradient(circle at 50% -10%, rgba(30,58,138,0.35) 0%, transparent 55%), radial-gradient(circle at 80% 90%, rgba(16,185,129,0.1) 0%, transparent 40%)' }}>
        <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-400/50 text-emerald-400 flex items-center justify-center">
          <Sparkles size={30} />
        </div>
        <h2 className="text-2xl lg:text-5xl font-bold text-white">All {cards.length} words explored!</h2>
        <p className="text-sky-300/80 font-semibold -mt-1">Say them one more time</p>
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
          {cards.map((c: any, i: number) => (
            <button key={i} onClick={() => playWord(i)}
              className="ws-mono px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-bold text-sm lg:text-base flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors">
              <Volume2 size={13} /> {c.word.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={() => { triggerConfetti(); triggerAction('SLIDE_COMPLETE'); }}
          className="px-8 lg:px-10 py-3 lg:py-4 bg-[#FF2E79] hover:brightness-110 text-white text-lg lg:text-2xl font-bold rounded-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all animate-pulse-soft">
          Start Practice Phase →
        </button>
        <button onClick={() => { setFlipped(new Set()); setStudied(new Set()); setBatchIndex(0); setActiveIndex(0); }}
          className="text-slate-400 hover:text-slate-200 font-bold text-sm">Review words again</button>
      </div>
    );
  }

  const batchEnd = Math.min(cards.length, batchStart + BATCH_SIZE);
  const detail = detailIndex !== null ? cards[detailIndex] : null;

  return (
    <div className="ws-root h-full w-full bg-[#070C18] flex flex-col p-3 lg:p-5 relative overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% -10%, rgba(30,58,138,0.35) 0%, transparent 55%),' +
          'radial-gradient(circle at 10% 90%, rgba(17,28,68,0.6) 0%, transparent 45%),' +
          'radial-gradient(circle at 90% 85%, rgba(16,185,129,0.08) 0%, transparent 40%)',
      }}>

      {/* Header — starts clear of the BoardShell phase pill (pl-40/lg:pl-48) */}
      <header className="w-full flex items-center justify-between gap-3 pr-2 pl-40 lg:pl-48 h-14 lg:h-16 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-[#FF2E79] flex items-center justify-center text-white font-bold text-xl lg:text-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] shrink-0">V</div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white truncate">Focus Cards</h1>
              <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-wider bg-slate-800/90 border border-slate-700 text-sky-300 whitespace-nowrap">
                Words {batchStart + 1}–{batchEnd} of {cards.length}
              </span>
            </div>
            <span className="text-[10px] lg:text-xs text-slate-400 font-medium whitespace-nowrap">📖 Presentation — teacher paced</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => triggerAction('FLIP_ALL_CARDS')}
            className="hidden sm:flex px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs lg:text-sm active:scale-95">Flip all</button>
          <button onClick={() => triggerAction('PLAY_AUDIO')}
            className="px-3 py-2 bg-sky-500/15 border border-sky-500/40 text-sky-300 rounded-xl font-bold text-xs lg:text-sm active:scale-95 flex items-center gap-1.5">
            <Volume2 size={14} /> <span className="hidden sm:inline">Audio</span>
          </button>
          <button onClick={() => triggerAction('RESET_GAME')}
            className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white" title="Reset all cards">
            <RotateCw size={16} />
          </button>
        </div>
      </header>

      {/* The grid — LANDSCAPE cards, 3×2 (2 cols below lg) */}
      <main className="flex-1 min-h-0 w-full grid grid-cols-2 lg:grid-cols-3 grid-rows-2 gap-3 lg:gap-5 py-3">
        {batchCards.map((card: any, bi: number) => {
          const i = batchStart + bi;
          const isFlipped = flipped.has(i);
          const isStudied = studied.has(i);
          const isActive = activeIndex === i;
          return (
            <div key={i}
              className={`relative rounded-2xl transition-shadow duration-300 ${isActive ? 'ring-4 ring-sky-400/70 shadow-[0_0_28px_2px_rgba(56,189,248,0.35)]' : ''}`}>
              <button
                onClick={() => onCardTap(i)}
                className="fc-3d w-full h-full block text-left"
                aria-label={isFlipped ? `flip ${card.word} back` : 'reveal word'}
              >
                <div className={`fc-inner w-full h-full ${isFlipped ? 'fc-flipped' : ''}`}>
                  {/* FRONT — image only, warm-cream frame */}
                  <div className="fc-face fc-front w-full h-full rounded-2xl bg-[#FFF8EC] border-2 border-white/20 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.65)] overflow-hidden flex items-center justify-center">
                    {card.image && String(card.image).startsWith('http') ? (
                      <img src={card.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="font-bold text-5xl text-slate-400">{card.word.charAt(0).toUpperCase()}</span>
                    )}
                    {isStudied && !isFlipped && (
                      <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-500 border-2 border-emerald-300 flex items-center justify-center text-white shadow">
                        <Check size={14} strokeWidth={4} />
                      </span>
                    )}
                  </div>
                  {/* BACK — word + audio + plus (royal indigo) */}
                  <div className={`fc-face fc-back w-full h-full rounded-2xl bg-[#2C3E8F] border-2 ${isStudied ? 'border-emerald-400/80' : 'border-white/25'} shadow-[0_20px_40px_-10px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center gap-2 px-3`}>
                    <span className="font-bold text-white text-2xl lg:text-4xl text-center leading-tight break-words drop-shadow">{card.word}</span>
                    <div className="flex items-center gap-3">
                      <span role="button" tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); playWord(i); }}
                        className="w-10 h-10 rounded-full bg-[#38BDF8] text-[#070C18] flex items-center justify-center shadow-[0_0_18px_2px_rgba(56,189,248,0.4)] active:scale-90 transition-transform"
                        title="Play word audio">
                        <Volume2 size={18} />
                      </span>
                      <span role="button" tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); setDetailIndex(i); }}
                        className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shadow active:scale-90 transition-transform font-black text-lg leading-none"
                        title="Deep dive (phonetics, meaning, example)">+</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </main>

      {/* Bottom rail — tactile progress pills + batch primary */}
      <footer className="shrink-0 py-1 px-1 flex items-center justify-between gap-3 bg-[#0B132B]/95 border-t border-slate-800 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 overflow-x-auto min-w-0">
          <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Words</span>
          <div className="flex items-center gap-1.5">
            {cards.map((_: any, i: number) => (
              <button key={i} onClick={() => {
                setBatchIndex(Math.floor(i / BATCH_SIZE));
                setActiveIndex(i);
              }}
                className={`h-6 min-w-6 px-1 rounded-lg transition-colors flex items-center justify-center text-[10px] font-bold
                  ${studied.has(i) ? 'bg-emerald-500/80 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                {studied.has(i) ? '✓' : i + 1}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => triggerAction('PREV_CARD')}
            className="p-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm active:scale-95" title="Previous card">‹</button>
          <button onClick={() => triggerAction('NEXT_CARD')}
            className="p-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm active:scale-95" title="Next card">›</button>
          {totalBatches > 1 && (
            <button onClick={nextBatch}
              className="px-5 lg:px-7 py-2.5 bg-[#FF2E79] hover:brightness-110 text-white rounded-xl font-bold text-sm lg:text-base flex items-center gap-2 shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all">
              Next 6 words <ChevronRight size={16} />
            </button>
          )}
        </div>
      </footer>

      {/* ═══ Deep-dive modal (the "+" drill — Chinese lives HERE) ═══ */}
      {detail && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setDetailIndex(null)}>
          <div className="bg-[#0B132B] border border-slate-700 rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[92%] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDetailIndex(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center" title="Close">
              <X size={16} />
            </button>
            <div className="p-6 lg:p-7 flex flex-col items-center text-center gap-3">
              {detail.image && String(detail.image).startsWith('http') && (
                <div className="w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border-2 border-white/10 shrink-0">
                  <img src={detail.image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <h3 className="text-3xl lg:text-4xl font-bold text-white">{detail.word}</h3>
                {detail.phonetic && <span className="ws-mono text-slate-400 text-lg">{detail.phonetic}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => playWord(detailIndex!)}
                  className="px-4 py-2 rounded-full bg-[#38BDF8] text-[#070C18] font-bold text-sm flex items-center gap-2 active:scale-95">
                  <Volume2 size={15} /> Hear word
                </button>
                {detail.example && (
                  <button onClick={() => playAudioUrl(detail.sentenceAudio, detail.example, 'en').catch(() => {})}
                    className="px-4 py-2 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 font-bold text-sm flex items-center gap-2 active:scale-95">
                    <Volume2 size={15} /> Hear sentence
                  </button>
                )}
              </div>
              {detail.l1 && <p className="text-amber-200 font-semibold text-xl">{detail.l1}</p>}
              {detail.definition && <p className="text-slate-400">{detail.definition}</p>}
              {detail.example && (
                <div className="w-full bg-black/20 p-4 rounded-2xl border border-white/10">
                  <p className="text-slate-300 leading-relaxed text-base lg:text-lg">
                    {detail.example.split(new RegExp(`(${detail.word})`, 'i')).map((part: string, pi: number) =>
                      part.toLowerCase() === detail.word.toLowerCase()
                        ? <span key={pi} className="font-bold text-amber-300 underline decoration-amber-500/40 underline-offset-2">{part}</span>
                        : <span key={pi}>{part}</span>
                    )}
                  </p>
                </div>
              )}
              <button onClick={() => setDetailIndex(null)}
                className="mt-1 px-7 py-3 bg-[#FF2E79] hover:brightness-110 text-white font-bold rounded-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all">
                Back to cards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute top-16 lg:top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-emerald-500/95 text-white font-bold text-sm lg:text-base shadow-xl animate-pop-in flex items-center gap-2 whitespace-nowrap">
          🎧 {toast}
        </div>
      )}

      <style>{`
        .ws-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .ws-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }

        /* In-place 3D flip — landscape card, two faces */
        .fc-3d { perspective: 1200px; }
        .fc-inner { position: relative; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.1); }
        .fc-flipped { transform: rotateY(180deg); }
        .fc-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .fc-back { transform: rotateY(180deg); }
        /* Chrome still hit-tests rotated-away backfaces (their subtree can
           intercept clicks — caught by the games-v3 visual verify): the
           visually-hidden face must also be pointer-dead. */
        .fc-inner:not(.fc-flipped) .fc-back { pointer-events: none; }
        .fc-flipped .fc-front { pointer-events: none; }

        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.35s ease-out; }

        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes pulse-soft {
          0%, 100% { transform: scale(1); box-shadow: 0 0 24px -2px rgba(255,46,121,0.45); }
          50% { transform: scale(1.03); box-shadow: 0 0 34px 2px rgba(255,46,121,0.6); }
        }
        .animate-pulse-soft { animation: pulse-soft 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default BoardFocusCards;
