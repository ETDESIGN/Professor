// BoardLiveClassWarmup v2 — WARMUP phase (Prompt 9 / focuscards-...-spec.md §3).
//
// Real warmup: retrieval practice, not new-content presentation. Pulls FSRS-due
// objectives from PRIOR units (next_review <= now) and reactivates them at
// rung 1 (receptive recognition only — no escalation in WARMUP).
//
// Choral-only (no picked mode) — deliberately departs from the choral/picked
// toggle pattern used everywhere else. WARMUP's purpose is fast, low-stakes
// reactivation; putting a specific student on the spot with graded pressure
// in the first two minutes works against that.
//
// Teacher marks each item holistically: "Class Got It" / "Class Struggled" →
// recordChoralReview (Tier 3 FSRS — a light scheduling nudge, never a grade).

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Clock, Sparkles, X } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { supabase } from '../../../services/supabaseClient';
import { recordChoralReview } from '../../../services/boardLearner';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';

interface WarmupItem {
  objectiveId: string;
  word: string;
  image?: string;
  audio?: string;
  translation?: string;
  unitTitle?: string;
}

const WARMUP_ROUND_SIZE = 6;

const BoardLiveClassWarmup: React.FC<{ data?: any }> = ({ data }) => {
  const { state, triggerAction } = useSession();
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);
  const [items, setItems] = useState<WarmupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [resolved, setResolved] = useState<Set<number>>(new Set());

  // ── Pull FSRS-due objectives from prior units ───────────────────────
  // For each roster student's claimed profile, find srs_items where
  // next_review <= now AND the objective belongs to a unit OTHER than the
  // active one (warmup reactivates PRIOR learning, not the current lesson).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (roster.length === 0) { setLoading(false); return; }
      const nowIso = new Date().toISOString();
      const activeUnitId = state.activeUnit?.id;

      // Get claimed profile ids for the roster.
      const { data: rosterRows } = await supabase
        .from('roster_students')
        .select('claimed_profile_id')
        .in('id', roster);
      const profileIds = (rosterRows || []).map((r) => r.claimed_profile_id).filter(Boolean);
      if (profileIds.length === 0 || cancelled) { setLoading(false); return; }

      // Find due srs_items across all the teacher's units (exclude the active unit).
      const { data: dueRows, error } = await supabase
        .from('srs_items')
        .select('objective_id, objectives(id, target_value, unit_id, units(id, title))')
        .in('student_id', profileIds)
        .lte('next_review', nowIso)
        .neq('objectives.unit_id', activeUnitId || '00000000-0000-0000-0000-0000000000')
        .limit(30);
      if (cancelled) return;
      if (error || !dueRows || dueRows.length === 0) { setLoading(false); return; }

      // Deduplicate by objective_id (multiple students may share the same due item).
      const seen = new Set<string>();
      const collected: WarmupItem[] = [];
      for (const row of dueRows) {
        const obj = row.objectives as any;
        if (!obj || seen.has(obj.id)) continue;
        seen.add(obj.id);
        // Look up the vocab metadata (image/audio/translation) from the unit's manifest.
        const vocab = getVocabulary(state.units.find((u: any) => u.id === obj.unit_id)?.manifest);
        const match = vocab.find((v) => v.word?.toLowerCase() === String(obj.target_value || '').toLowerCase());
        collected.push({
          objectiveId: obj.id,
          word: String(obj.target_value || ''),
          image: match?.image_url,
          audio: match?.audio_url,
          translation: match?.l1_translation,
          unitTitle: obj.units?.title,
        });
      }
      if (!cancelled) {
        setItems(collected.slice(0, WARMUP_ROUND_SIZE));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.length, state.activeUnit?.id]);

  // ── Remote/commander listener ───────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'NEXT_ITEM' || a.type === 'NEXT_ROUND' || a.type === 'NEXT') {
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (a.type === 'RESET_GAME') {
      setActiveIdx(0); setResolved(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Choral rating → recordChoralReview ──────────────────────────────
  const onClassResponse = (outcome: 'strong' | 'weak') => {
    const item = items[activeIdx];
    if (!item || resolved.has(activeIdx)) return;
    setResolved((prev) => new Set(prev).add(activeIdx));
    recordChoralReview(item.objectiveId, roster, outcome).catch(() => {});
    // Advance after a brief delay so the teacher sees the acknowledgment.
    setTimeout(() => {
      if (activeIdx < items.length - 1) setActiveIdx(activeIdx + 1);
    }, 400);
  };

  // ── Empty-state: no due items (good — nothing needs reactivation) ────
  if (!loading && items.length === 0) {
    return (
      <div className="h-full bg-gradient-to-br from-amber-50 to-orange-50 flex flex-col items-center justify-center font-display p-12 text-center">
        <Sparkles size={64} className="text-amber-400 mb-4" />
        <h2 className="text-4xl font-bold text-slate-700 mb-2">All caught up!</h2>
        <p className="text-slate-500 text-xl">No words due for review right now. Let's start the lesson.</p>
        <button
          onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
          className="mt-8 px-8 py-4 bg-amber-500 text-white font-bold text-xl rounded-2xl shadow-lg active:scale-95 flex items-center gap-2"
        >
          Start Lesson <ChevronRight size={24} />
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center text-slate-400 font-mono text-2xl">
        Loading warmup review…
      </div>
    );
  }

  const item = items[activeIdx];
  const isResolved = resolved.has(activeIdx);

  return (
    <div className="h-full bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col font-display relative overflow-hidden">
      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-white/50 backdrop-blur border-b border-white/50">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Clock size={28} className="text-white" />
          </div>
          <div>
            <div className="text-amber-500 font-bold uppercase tracking-widest text-sm">Warmup · Review</div>
            <div className="text-slate-800 font-bold text-2xl">Remember this word?</div>
          </div>
        </div>
        <div className="bg-white/70 px-4 py-2 rounded-xl text-slate-500 text-sm font-medium">
          {activeIdx + 1} / {items.length}
        </div>
      </div>

      {/* Word display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        {item.image && (
          <img src={item.image} alt={item.word} className="w-64 h-64 rounded-3xl object-cover shadow-xl border-4 border-white" />
        )}
        <h1 className="text-8xl font-black text-slate-800 text-center drop-shadow-sm">{item.word}</h1>
        {item.translation && (
          <p className="text-3xl text-slate-500 font-medium">{item.translation}</p>
        )}
        {item.audio && (
          <button
            onClick={() => playAudioUrl(item.audio, item.word)}
            className="flex items-center gap-2 text-amber-600 font-bold text-lg hover:text-amber-700"
          >
            🔊 Play word
          </button>
        )}
        {item.unitTitle && (
          <p className="text-slate-400 text-sm italic">from: {item.unitTitle}</p>
        )}
      </div>

      {/* Choral response controls — no picked mode (WARMUP is low-stakes) */}
      <div className="p-6 flex justify-center gap-4 bg-white/50 backdrop-blur border-t border-white/50">
        {isResolved ? (
          <div className="text-slate-500 font-bold text-lg flex items-center gap-2">
            <Check size={24} className="text-emerald-500" /> Noted — next word…
          </div>
        ) : (
          <>
            <span className="text-slate-500 self-center font-medium mr-2">How did the class do?</span>
            <button
              onClick={() => onClassResponse('strong')}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xl rounded-2xl shadow-lg active:scale-95 flex items-center gap-2"
            >
              <Check size={24} /> Class Got It
            </button>
            <button
              onClick={() => onClassResponse('weak')}
              className="px-8 py-4 bg-rose-400 hover:bg-rose-500 text-white font-bold text-xl rounded-2xl shadow-lg active:scale-95 flex items-center gap-2"
            >
              <X size={24} /> Class Struggled
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BoardLiveClassWarmup;
