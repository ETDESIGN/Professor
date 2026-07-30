import React, { useState, useEffect, useMemo } from 'react';
import { Users, BookOpen, MessageSquare, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

// Phase 3.3 — Cast / Story map (the lightweight "Knowledge Graph" panel, advisor
// §5.1). A read-mostly view answering "does my cast show up consistently across
// this unit?" — for each book character, where they appear in the story pages
// and dialogue lines. Reads the get_unit_bundle RPC (Phase 1.6 read contract),
// so it's derived on read, never a second hand-written copy.

interface BundleCharacter { id: string; name: string; role?: string | null; }
interface StoryPage { id: string; page_number: number; speaker?: string | null; speaker_character_id?: string | null; text?: string; }
interface DialogueLine { id: string; order_index: number; speaker_character_id?: string | null; speaker_override_name?: string | null; text?: string; }

const AVATAR_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#14B8A6', '#F97316'];

const CastStoryMap: React.FC<{ unitId: string }> = ({ unitId }) => {
  const [characters, setCharacters] = useState<BundleCharacter[]>([]);
  const [storyPages, setStoryPages] = useState<StoryPage[]>([]);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (cancelled) return;
        if (rpcErr) throw rpcErr;
        const bundle = data || {};
        setCharacters(Array.isArray(bundle.characters) ? bundle.characters : []);
        setStoryPages(Array.isArray(bundle.story_pages) ? bundle.story_pages : []);
        setDialogueLines(Array.isArray(bundle.dialogue_lines) ? bundle.dialogue_lines : []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load the cast map');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // Appearances per character (by id match, falling back to name match).
  const rows = useMemo(() => {
    const norm = (s?: string | null) => (s || '').trim().toLowerCase();
    return characters.map((c, idx) => {
      const storyHits = storyPages.filter(
        (p) => (p.speaker_character_id && p.speaker_character_id === c.id) || norm(p.speaker) === norm(c.name),
      );
      const dialogueHits = dialogueLines.filter(
        (l) => (l.speaker_character_id && l.speaker_character_id === c.id) || norm(l.speaker_override_name) === norm(c.name),
      );
      return {
        character: c,
        color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        storyCount: storyHits.length,
        dialogueCount: dialogueHits.length,
        total: storyHits.length + dialogueHits.length,
        storyPages: storyHits.map((p) => p.page_number + 1),
      };
    }).sort((a, b) => b.total - a.total);
  }, [characters, storyPages, dialogueLines]);

  // Characters referenced by story/dialogue but not in the cast (consistency gaps).
  const unlinked = useMemo(() => {
    const castIds = new Set(characters.map((c) => c.id));
    const castNames = new Set(characters.map((c) => (c.name || '').trim().toLowerCase()));
    const names = new Set<string>();
    for (const p of storyPages) {
      if (p.speaker_character_id && castIds.has(p.speaker_character_id)) continue;
      const nm = (p.speaker || '').trim();
      if (nm && !castNames.has(nm.toLowerCase())) names.add(nm);
    }
    for (const l of dialogueLines) {
      if (l.speaker_character_id && castIds.has(l.speaker_character_id)) continue;
      const nm = (l.speaker_override_name || '').trim();
      if (nm && !castNames.has(nm.toLowerCase())) names.add(nm);
    }
    return [...names];
  }, [characters, storyPages, dialogueLines]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>;
  }
  if (error) {
    return <div className="text-center py-20 text-slate-400 text-sm">{error}</div>;
  }
  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Users size={44} className="mb-3 opacity-40" />
        <p className="font-medium text-slate-500">No characters linked to this unit yet</p>
        <p className="text-sm mt-1">Link characters in Settings to see where they appear.</p>
      </div>
    );
  }

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Users size={18} /> Cast appearances</h2>
        <p className="text-sm text-slate-500">Where each book character shows up in this unit's story and dialogue.</p>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.character.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black shrink-0"
              style={{ background: `${r.color}20`, border: `2px solid ${r.color}`, color: r.color }}
            >
              {(r.character.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 truncate">{r.character.name}</span>
                {r.character.role && <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{r.character.role}</span>}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                <span className="flex items-center gap-1"><BookOpen size={12} /> {r.storyCount} story page{r.storyCount === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1"><MessageSquare size={12} /> {r.dialogueCount} dialogue line{r.dialogueCount === 1 ? '' : 's'}</span>
                {r.storyPages.length > 0 && <span className="text-slate-400">pp. {r.storyPages.join(', ')}</span>}
              </div>
            </div>
            {/* Appearance bar */}
            <div className="w-32 shrink-0">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.total / maxTotal) * 100}%`, background: r.color }} />
              </div>
              <p className="text-[10px] text-slate-400 text-right mt-1">{r.total} appearance{r.total === 1 ? '' : 's'}</p>
            </div>
          </div>
        ))}
      </div>

      {unlinked.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 flex items-center gap-2"><Sparkles size={14} /> Speakers not in the cast</p>
          <p className="text-xs text-amber-600 mt-1">
            These names speak in the story/dialogue but aren't linked book characters — consider adding them to the cast for consistency:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {unlinked.map((n) => (
              <span key={n} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-lg font-medium">{n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CastStoryMap;
