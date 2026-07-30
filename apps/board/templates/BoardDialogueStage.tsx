// BoardDialogueStage — Dialogue role-play / read-aloud stage (INPUT/PRACTICE).
// Phase 1.3/2: presents the unit's dialogue lines one beat at a time so the
// teacher can read aloud, assign roles, and have students act it out. Speaker
// names are attributed (from dialogue_lines.speaker_character_id resolved to a
// name, or speaker_override_name). Remote-navigable like BoardStoryStage
// (NEXT_PANEL / PREV_PANEL / RESET_GAME).
//
// data shape: { title?, lines: [{ speaker, text, translation? }] }

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { playAudioUrl } from '../../../services/SpeechService';

const SPEAKER_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#14B8A6'];

const BoardDialogueStage = ({ data }: { data: any }) => {
  const { state } = useSession();
  // Prefer data.lines; fall back to the unit's manifest dialogues so that
  // server-generated DIALOGUE_STAGE steps (which currently ship empty data)
  // still render the unit's real dialogue. Flatten dialogues[].lines[].
  const lines: any[] = React.useMemo(() => {
    if (Array.isArray(data?.lines) && data.lines.length > 0) return data.lines;
    const dialogues = state.activeUnit?.manifest?.enriched_content?.dialogues;
    if (Array.isArray(dialogues)) {
      return dialogues.flatMap((d: any) => (Array.isArray(d?.lines) ? d.lines : []));
    }
    return [];
  }, [data?.lines, state.activeUnit?.manifest]);
  // activeLine: -1 = title card; 0..N-1 = lines; N = "your turn" role-play card.
  const [activeLine, setActiveLine] = useState(-1);
  const totalLines = lines.length;

  // Stable per-speaker accent color.
  const speakerIndex = React.useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const l of lines) {
      const s = l?.speaker || 'Speaker';
      if (!m.has(s)) m.set(s, n++);
    }
    return m;
  }, [lines]);
  const colorFor = (speaker: string) => SPEAKER_COLORS[(speakerIndex.get(speaker) ?? 0) % SPEAKER_COLORS.length];

  // ── Remote controls (mirror BoardStoryStage) ──
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'NEXT_PANEL' || a.type === 'NEXT_CARD') {
      setActiveLine(p => Math.min(p + 1, totalLines));
    } else if (a.type === 'PREV_PANEL' || a.type === 'PREV_CARD') {
      setActiveLine(p => Math.max(p - 1, -1));
    } else if (a.type === 'RESET_GAME') {
      setActiveLine(-1);
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  if (totalLines === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <MessageSquare size={56} className="text-sky-600/40 mb-3" />
        <p className="font-display text-3xl font-bold">Dialogue</p>
        <p className="text-lg mt-2">No dialogue lines for this unit.</p>
      </div>
    );
  }

  const isTitle = activeLine === -1;
  const isRolePlay = activeLine >= totalLines;
  const current = !isTitle && !isRolePlay ? lines[activeLine] : null;

  return (
    <div className="h-full relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0F1B2E, #0A1422)' }}>
      <AnimatePresence mode="wait">
        {/* ═══ TITLE CARD ═══ */}
        {isTitle && (
          <motion.div key="dlg-title" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5 }} className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl mb-4">💬</div>
            <h1 className="font-display text-6xl font-black text-sky-300 mb-2" style={{ textShadow: '0 4px 20px rgba(56,189,248,.3)' }}>
              {data?.title || 'Dialogue'}
            </h1>
            <p className="text-lg text-sky-400/50">{totalLines} lines · {speakerIndex.size} speakers</p>
            <p className="mt-6 text-sm text-sky-400/40">👆 Teacher: tap Next to read each line · 点击下一步</p>
          </motion.div>
        )}

        {/* ═══ DIALOGUE LINE ═══ */}
        {current && (
          <motion.div key={`line-${activeLine}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0 flex flex-col items-center justify-center px-16">
            <div className="max-w-4xl w-full">
              {/* Speaker chip */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-xl"
                  style={{ background: `${colorFor(current.speaker || 'Speaker')}25`, border: `3px solid ${colorFor(current.speaker || 'Speaker')}`, color: colorFor(current.speaker || 'Speaker') }}>
                  {(current.speaker || 'S').charAt(0).toUpperCase()}
                </div>
                <span className="font-display text-3xl font-bold" style={{ color: colorFor(current.speaker || 'Speaker') }}>
                  {current.speaker || 'Speaker'}
                </span>
              </div>
              {/* Line text */}
              <div className="backdrop-blur-md rounded-3xl px-10 py-8" style={{ background: 'rgba(30,41,59,.6)', borderLeft: `6px solid ${colorFor(current.speaker || 'Speaker')}` }}>
                <p className="font-display text-5xl font-bold text-slate-50 leading-tight">
                  "{current.text || ''}"
                </p>
                {current.translation && (
                  <p className="font-cn text-2xl text-slate-400 mt-4">{current.translation}</p>
                )}
                <button onClick={() => playAudioUrl(current.audio, current.text)} className="mt-5 inline-flex items-center gap-2 text-base font-bold text-sky-300/80 active:scale-95">
                  <Volume2 size={20} /> Read aloud
                </button>
              </div>
            </div>
            {/* Progress dots */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
              {lines.map((_: any, i: number) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${i === activeLine ? 'bg-sky-400 scale-150' : i < activeLine ? 'bg-sky-600' : 'bg-white/20'}`} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ ROLE-PLAY CARD (closing beat) ═══ */}
        {isRolePlay && (
          <motion.div key="dlg-roleplay" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl mb-4">🎭</div>
            <h2 className="font-display text-5xl font-black text-sky-300 mb-3">Your Turn!</h2>
            <p className="font-cn text-2xl text-sky-400/50 mb-6">角色扮演</p>
            <div className="px-8 py-4 rounded-full bg-sky-500/15 border border-sky-400/30">
              <span className="font-display text-xl font-bold text-sky-200">Act out the dialogue in pairs</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardDialogueStage;
