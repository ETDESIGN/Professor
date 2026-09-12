import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Plus, Trash2, Save, Play, Loader2, Wand2, Clock, BookOpen, MessageSquare,
  PenTool, Music, Image as ImageIcon, Gamepad2, RefreshCw,
  Search, Volume2, Mic, Zap, Brain, Users, Puzzle, Gauge, LayoutGrid, SpellCheck, Trophy, AlertTriangle, Layers
} from 'lucide-react';
import { Engine } from '../../services/SupabaseService';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import { toast } from 'sonner';
import { resolveWaveSize } from '../../components/games/fastVocab/contentBuilder';
import type { UnitPlan } from '../../services/planFlow';
import GroupPicker, { GroupOption } from './planComposer/GroupPicker';
import PlanSwitcher from './planComposer/PlanSwitcher';
import MediaInspector from './planComposer/MediaInspector';

// Phase 2 — the Unit Studio Plan composer (option A). CONTENT GROUPS +
// MULTI-PLAN rework (spec 2026-09-13):
//   - The library is GAME TEMPLATES; content-bound templates carry a GROUP
//     selection (vocab series multi-select, story/comic single) edited in the
//     inspector — the COMIC_PANELS per-comic pattern generalized.
//   - Multiple named plans per unit (Lesson 1 / Lesson 2 / Revision) — every
//     save/launch/regenerate targets the ACTIVE plan; the default plan is
//     mirrored to units.flow for legacy consumers.
//   - A Song/Video template + MediaInspector make media plannable (find /
//     paste), with an unresolved ⚠️ badge on the timeline.
//   - A pending-extraction banner surfaces content silently awaiting review.

interface PlanBlock {
  id: string;
  type: string;
  title: string;
  duration: number; // minutes (editor); stored as seconds in units.flow
  data: any;
}

interface LibraryItem {
  key: string;
  label: string;
  detail: string;
  type: string;
  icon: React.ReactNode;
  chip: string; // tailwind classes for the icon chip
  /** COMIC_PANELS only: the basket comic this item plays (doc 12 §4). */
  comic?: any;
  /** Story templates only: the story group this item freezes (spec 2026-09-13). */
  storyGroup?: ContentGroup;
}

/** unit_content_groups row + derived members (words / pages). */
interface ContentGroup {
  id: string;
  kind: string;
  title: string;
  structure_ids: string[];
  words?: any[];   // vocab_series: enriched vocab objects
  pages?: any[];   // story: bundle story_pages rows
}

// Visual metadata per block type (kept small + readable).
const TYPE_META: Record<string, { icon: React.ReactNode; chip: string }> = {
  INTRO_SPLASH: { icon: <Layers size={16} />, chip: 'bg-slate-100 text-slate-600' },
  FOCUS_CARDS: { icon: <ImageIcon size={16} />, chip: 'bg-emerald-100 text-emerald-600' },
  STORY_STAGE: { icon: <BookOpen size={16} />, chip: 'bg-amber-100 text-amber-600' },
  DIALOGUE_STAGE: { icon: <MessageSquare size={16} />, chip: 'bg-sky-100 text-sky-600' },
  GAME_ARENA: { icon: <Gamepad2 size={16} />, chip: 'bg-purple-100 text-purple-600' },
  TEAM_BATTLE: { icon: <Gamepad2 size={16} />, chip: 'bg-rose-100 text-rose-600' },
  SPEED_QUIZ: { icon: <Gamepad2 size={16} />, chip: 'bg-orange-100 text-orange-600' },
  MEDIA_PLAYER: { icon: <Music size={16} />, chip: 'bg-blue-100 text-blue-600' },
  // ── New-gen games (MASTER_ROADMAP.md, 2026-08-07) ──────────────────────
  GRAMMAR_LAB: { icon: <Puzzle size={16} />, chip: 'bg-indigo-100 text-indigo-600' },
  WORD_DETECTIVE: { icon: <Search size={16} />, chip: 'bg-cyan-100 text-cyan-600' },
  SOUND_LAB: { icon: <Volume2 size={16} />, chip: 'bg-pink-100 text-pink-600' },
  STORY_QUEST: { icon: <BookOpen size={16} />, chip: 'bg-orange-100 text-orange-600' },
  SENTENCE_LAB: { icon: <PenTool size={16} />, chip: 'bg-teal-100 text-teal-600' },
  PHONICS_ARENA: { icon: <Mic size={16} />, chip: 'bg-red-100 text-red-600' },
  VOCAB_BLITZ: { icon: <Zap size={16} />, chip: 'bg-yellow-100 text-yellow-600' },
  MEMORY_LAB: { icon: <Brain size={16} />, chip: 'bg-blue-100 text-blue-600' },
  CLASS_RALLY: { icon: <Users size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600' },
  FAST_VOCAB: { icon: <Gauge size={16} />, chip: 'bg-amber-100 text-amber-600' },
  WORD_SEARCH: { icon: <LayoutGrid size={16} />, chip: 'bg-teal-100 text-teal-600' },
  SPELLING_BEE: { icon: <SpellCheck size={16} />, chip: 'bg-lime-100 text-lime-600' },
  COMIC_PANELS: { icon: <BookOpen size={16} />, chip: 'bg-purple-100 text-purple-600' },
  TEAM_SPLASH: { icon: <Trophy size={16} />, chip: 'bg-red-100 text-red-600' },
  STORY_STAGE_AG: { icon: <BookOpen size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600' },
};
const typeMeta = (type: string) => TYPE_META[type] || { icon: <PenTool size={16} />, chip: 'bg-slate-100 text-slate-600' };

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'vocab')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
const realImage = (url: any, seed: string) =>
  (url && typeof url === 'string' && /^https?:/.test(url)) ? url : dicebear(seed);

/** Group tags for a block's data (the generalized COMIC_PANELS identity pattern). */
const groupTags = (groups: ContentGroup[]): Record<string, any> => {
  if (groups.length === 0) return {};
  const structureIds = [...new Set(groups.flatMap((g) => g.structure_ids || []))];
  const titles = groups.map((g) => g.title).filter(Boolean);
  return {
    ...(groups.length === 1
      ? { group_id: groups[0].id, group_kind: groups[0].kind, group_title: groups[0].title }
      : { group_ids: groups.map((g) => g.id), group_kind: groups[0].kind, group_title: titles.join(' + ').slice(0, 60) }),
    structure_ids: structureIds,
  };
};

// Build FUNCTIONAL, board-renderable `data` for a library block from the unit's
// REAL content — mirroring the shapes transformManifestToFlow produces (which
// the board templates consume). This is what makes library blocks real steps,
// not empty mockups: a FOCUS_CARDS block carries actual vocab cards, a
// DIALOGUE_STAGE block carries the unit's dialogue lines, etc.
// `comic` (COMIC_PANELS only): the basket comic to freeze into the block.
// `meta` (TEAM_SPLASH only): the unit manifest meta, for the theme word.
// `vocabGroups` / `storyGroup` (spec 2026-09-13): scope the block to content
// groups — FOCUS_CARDS freezes those groups' cards; story templates freeze
// that story's pages; pool shells just carry the scope tags.
const buildBlockData = (
  type: string,
  ec: any,
  comic?: any,
  meta?: any,
  vocabGroups: ContentGroup[] = [],
  storyGroup?: ContentGroup | null,
): any => {
  const allVocab: any[] = Array.isArray(ec.vocabulary) ? ec.vocabulary : [];
  const scopedVocab = vocabGroups.length > 0 ? vocabGroups.flatMap((g) => g.words || []) : allVocab;
  const storyPages: any[] = storyGroup
    ? (storyGroup.pages || [])
    : (Array.isArray(ec.story?.pages) ? ec.story.pages : []);
  switch (type) {
    case 'TEAM_SPLASH':
      // The Red/VS/Blue rally screen reads team scores live from the session;
      // the block only carries the big theme word so it is never blank.
      return { theme: meta?.theme || ec.topic || '' };
    case 'FOCUS_CARDS': {
      const vocab = scopedVocab;
      return {
        title: vocabGroups.length > 0 ? `${vocabGroups.map((g) => g.title).join(' + ')} — Vocabulary` : 'New Vocabulary',
        cards: vocab.map((v, i) => ({
          id: `c_${i}`,
          front: v.word,
          back: v.word,
          pronunciation: v.phonetic || `/${(v.word || '').toLowerCase()}/`,
          image: realImage(v.image_url, v.word),
        })),
        ...groupTags(vocabGroups),
      };
    }
    case 'STORY_STAGE':
    case 'STORY_STAGE_AG': {
      return {
        title: storyGroup ? storyGroup.title : (ec.story?.title || 'Story'),
        setting: ec.story?.setting,
        pages: storyPages.map((p, i) => ({ id: `p${i}`, text: p.text, speaker: p.speaker || p.speaker_override_name, imageUrl: p.image_url || p.imageUrl })),
        characters: Array.isArray(ec.characters) ? ec.characters.map((c: any) => ({ name: c.name, emoji: c.emoji })) : [],
        ...(storyGroup ? groupTags([storyGroup]) : {}),
      };
    }
    case 'STORY_QUEST': {
      // Story Quest reads the story from the manifest first (getStory), with
      // data.pages as a fallback — mirror the STORY_STAGE page shape so the
      // fallback path is board-renderable too. A story group scopes BOTH.
      return {
        title: storyGroup ? storyGroup.title : (ec.story?.title || 'Story Quest'),
        pages: storyPages.map((p, i) => ({ id: `p${i}`, text: p.text, speaker: p.speaker || p.speaker_override_name, imageUrl: p.image_url || p.imageUrl })),
        ...(storyGroup ? groupTags([storyGroup]) : {}),
      };
    }
    case 'DIALOGUE_STAGE': {
      const dialogues: any[] = Array.isArray(ec.dialogues) ? ec.dialogues : [];
      const lines = dialogues.flatMap((d) => (Array.isArray(d.lines) ? d.lines : []));
      return {
        title: dialogues[0]?.title || 'Dialogue',
        lines: lines.map((l: any) => ({ speaker: l.speaker, text: l.text, translation: l.translation })),
      };
    }
    case 'COMIC_PANELS': {
      // Slide-the-panels storytelling (doc 12 §4): freeze the selected comic's
      // panels — book crop art + narration + verbatim bubble texts, NO speaker
      // names (audit §1.2). `comic.panels` here are pre-shaped cards when the
      // library item built them; raw basket panels are shaped defensively too.
      const rawPanels: any[] = Array.isArray(comic?.panels) ? comic.panels : [];
      const cards = rawPanels.map((p: any, i: number) =>
        p && typeof p.id === 'string'
          ? p
          : {
              id: `${comic?.structure_id || 'c'}:${i}`,
              order: typeof p?.order_index === 'number' ? p.order_index : i,
              image_url: typeof p?.image_url === 'string' ? p.image_url : undefined,
              narration: p?.narration ? String(p.narration) : undefined,
              texts: (Array.isArray(p?.bubbles) ? p.bubbles : [])
                .map((b: any) => String(b?.text || '').trim())
                .filter(Boolean),
            },
      );
      return {
        title: 'Rebuild the Story',
        comic_label: comic?.comic_label,
        structure_id: comic?.structure_id,
        panels: cards,
      };
    }
    case 'TEAM_BATTLE': {
      const questions = scopedVocab.slice(0, 6).map((v, i) => ({
        id: `q_${i}`,
        text: `Which one is the “${v.word}”?`,
        image: realImage(v.image_url, v.word),
        options: [v.word, ...(Array.isArray(v.distractors) ? v.distractors : [])].slice(0, 4).sort(() => Math.random() - 0.5),
        correct: v.word,
      }));
      return { topic: ec.topic || 'Review', questions, ...groupTags(vocabGroups) };
    }
    case 'MEDIA_PLAYER': {
      // Song/Video step (spec 2026-09-13): inserted empty-but-honest — the
      // MediaInspector resolves it at plan time (find/paste). The topic-based
      // search query gives the resolver + the teacher a starting point.
      const topic = meta?.theme || ec.topic || '';
      return {
        title: 'Song / Video',
        kind: 'song',
        search_query: topic ? `${topic} kids song` : 'warm up song for kids',
        lyrics: [],
      };
    }
    case 'WORD_SEARCH': {
      // BoardWordSearch pulls words from the pool/vocabulary at runtime; the
      // frozen data only carries the game settings (mode: open | collaborative
      // | relay; preset — v3 audit: starter = 3 words, gentler direction ramp,
      // 180 s; explorer = 5 words, full 8-way ramp, 120 s).
      return {
        rounds: 3,
        wordsPerRound: Math.min(3, Math.max(3, scopedVocab.length || 3)),
        seconds: 180,
        mode: 'open',
        preset: 'starter',
        ...groupTags(vocabGroups),
      };
    }
    case 'SPELLING_BEE': {
      // BoardSpellingBee pulls words from the pool/vocabulary at runtime; the
      // frozen data only carries the game settings (per-student turn config).
      return {
        wordsPerTurn: 3,
        timerSeconds: 15,
        letterRemoval: true,
        ...groupTags(vocabGroups),
      };
    }
    default:
      // Pool-driven shells (FAST_VOCAB, WORD_DETECTIVE, SOUND_LAB, …): settings
      // live on data but the CONTENT is pulled at runtime — carry the group
      // scope so the pull stays inside the selected series.
      return { ...groupTags(vocabGroups) };
  }
};

const PlanComposer: React.FC<{ unitId: string; unit: any; onFlowSaved?: (flow: any[]) => void }> = ({ unitId, unit, onFlowSaved }) => {
  const navigate = useNavigate();
  const { setActiveUnit } = useSession();

  const [timeline, setTimeline] = useState<PlanBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [launching, setLaunching] = useState(false);

  // ── UNIT PLANS (spec 2026-09-13) ──────────────────────────────────────
  const [plans, setPlans] = useState<UnitPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const activePlan = useMemo(() => plans.find((p) => p.id === activePlanId) || null, [plans, activePlanId]);

  // ── CONTENT GROUPS + pending review (spec 2026-09-13) ─────────────────
  const [contentGroups, setContentGroups] = useState<ContentGroup[]>([]);
  const [pendingReview, setPendingReview] = useState(0);
  const vocabSeries = useMemo(() => contentGroups.filter((g) => g.kind === 'vocab_series' && (g.words?.length ?? 0) > 0), [contentGroups]);
  const storyGroups = useMemo(() => contentGroups.filter((g) => g.kind === 'story' && (g.pages?.length ?? 0) > 0), [contentGroups]);

  // Monotonic id suffix: Date.now() alone collides on fast/double clicks, and a
  // duplicate block.id corrupts the dnd list (duplicate draggableId) and makes
  // removeBlock delete BOTH twins. A counter guarantees uniqueness.
  const idSeq = useRef(0);

  // Load the unit's plans (default first run) — every save/launch targets the
  // active plan; the default plan mirrors to units.flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await Engine.listUnitPlans(unitId);
        if (cancelled) return;
        setPlans(list);
        setActivePlanId((cur) => (cur && list.some((p) => p.id === cur) ? cur : list.find((p) => p.isDefault)?.id ?? list[0]?.id ?? null));
      } catch { /* plans are additive — the composer still works with unit.flow */ }
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // Hydrate the editor from the ACTIVE plan's flow (seconds -> minutes). Falls
  // back to units.flow while plans load (it IS the default plan's mirror).
  useEffect(() => {
    const plan = plans.find((p) => p.id === activePlanId);
    const flow = plan ? plan.flow : (Array.isArray(unit?.flow) ? unit.flow : []);
    const blocks: PlanBlock[] = flow.map((step: any, i: number) => ({
      id: step.id || `step_${i}`,
      type: step.type || 'FOCUS_CARDS',
      title: step.title || step.type || 'Untitled',
      duration: step.duration ? Math.max(1, Math.round(step.duration / 60)) : 5,
      data: step.data || {},
    }));
    setTimeline(blocks);
    setActiveBlockId(blocks.length > 0 ? blocks[0].id : null);
  }, [unit?.id, activePlanId, plans]);

  // C.4 / retirement layer 1: read relational content via get_unit_bundle (the
  // read contract) for vocab AND story AND dialogue, falling back to the
  // manifest per category. This removes the last playback-side reads of
  // enriched_content (story/dialogue block building), so no playback path reads
  // the manifest once this lands.
  const [bundle, setBundle] = useState<any | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (!cancelled && data) setBundle(data);
      } catch { /* fall back to manifest */ }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // Content groups + pending-review count (spec 2026-09-13). Members resolve
  // through the bundle: vocab via vocabulary_items.source_structure_id, story
  // pages via story_pages.source_structure_id.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [{ data: groups }, { count: pending }] = await Promise.all([
          supabase.from('unit_content_groups').select('id, kind, title, structure_ids, order_index').eq('unit_id', unitId).order('order_index', { ascending: true }),
          supabase.from('page_structures').select('id', { count: 'exact', head: true }).eq('book_pages.unit_id', unitId).eq('review_status', 'pending'),
        ] as any);
        if (cancelled) return;
        setPendingReview(pending ?? 0);
        setContentGroups((Array.isArray(groups) ? groups : []) as ContentGroup[]);
      } catch { /* groups are additive — legacy path still works */ }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId, unit?.last_updated]);

  // Attach derived members (words/pages) once the bundle lands.
  const groupsWithMembers = useMemo(() => {
    const vocabRows: any[] = Array.isArray(bundle?.vocabulary_items) ? bundle.vocabulary_items : [];
    const pageRows: any[] = Array.isArray(bundle?.story_pages) ? bundle.story_pages : [];
    return contentGroups.map((g) => {
      const sids = new Set((g.structure_ids || []).map(String));
      if (g.kind === 'vocab_series') {
        return { ...g, words: vocabRows.filter((v) => v?.source_structure_id && sids.has(String(v.source_structure_id))) };
      }
      if (g.kind === 'story') {
        return { ...g, pages: pageRows.filter((p) => p?.source_structure_id && sids.has(String(p.source_structure_id))) };
      }
      return g;
    });
  }, [contentGroups, bundle]);
  const vocabSeriesFull = useMemo(() => groupsWithMembers.filter((g) => g.kind === 'vocab_series' && (g.words?.length ?? 0) > 0), [groupsWithMembers]);
  const storyGroupsFull = useMemo(() => groupsWithMembers.filter((g) => g.kind === 'story' && (g.pages?.length ?? 0) > 0), [groupsWithMembers]);

  // Comics for the COMIC_PANELS library items (doc 12 §4, owner decision
  // 2026-08-30: the teacher selects WHICH comic — each of the unit's comics is
  // its own selectable item). Baskets give the panels (verbatim + bboxes);
  // assets give the book's panel crops, matched by the same structure+bbox
  // key enrich-unit's dedupe cache uses.
  const [comicCards, setComicCards] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [{ data: baskets }, { data: assets }] = await Promise.all([
          supabase.rpc('get_unit_baskets', { p_unit_id: unitId }),
          supabase.from('assets')
            .select('id, public_url, metadata')
            .eq('unit_id', unitId)
            .eq('kind', 'book_extract')
            .eq('metadata->>pool', 'panel')
            .order('created_at', { ascending: true }),
        ]);
        if (cancelled) return;
        // Panel-crop matching (doc 12 §7): refined crops carry panel_index —
        // newest wins (ascending order = later rows overwrite); legacy crops
        // fall back to the structure+bbox key.
        const panelUrl = new Map<string, string>();
        const assetByBboxKey = new Map<string, string>();
        for (const a of (assets || []) as any[]) {
          const sid = a?.metadata?.structure_id;
          if (!sid || !a.public_url) continue;
          const pi = a.metadata.panel_index;
          if (typeof pi === 'number') {
            panelUrl.set(`${sid}:${pi}`, a.public_url);
            continue;
          }
          const bbox = Array.isArray(a?.metadata?.bbox) ? a.metadata.bbox : null;
          if (bbox) assetByBboxKey.set(`${sid}:${bbox.map((n: number) => Number(n).toFixed(4)).join(',')}`, a.public_url);
        }
        const comics: any[] = Array.isArray(baskets?.story?.comics) ? baskets.story.comics : [];
        const shaped = comics.map((c: any, ci: number) => {
          const panels: any[] = Array.isArray(c?.panels) ? c.panels : [];
          return {
            structure_id: c?.structure_id,
            comic_label: `comic ${ci + 1}`,
            panels: panels.map((p: any, pi: number) => {
              const bboxKey = Array.isArray(p?.bbox) ? p.bbox.map((n: any) => Number(n).toFixed(4)).join(',') : null;
              return {
                id: `${c?.structure_id || 'c'}:${pi}`,
                order: typeof p?.order_index === 'number' ? p.order_index : pi,
                image_url: (c?.structure_id && panelUrl.get(`${c.structure_id}:${pi}`)) ||
                  (c?.structure_id && bboxKey ? assetByBboxKey.get(`${c.structure_id}:${bboxKey}`) : undefined),
                narration: p?.narration ? String(p.narration) : undefined,
                texts: (Array.isArray(p?.bubbles) ? p.bubbles : [])
                  .map((b: any) => String(b?.text || '').trim())
                  .filter(Boolean),
              };
            }),
          };
        }).filter((c: any) => c.panels.length >= 3); // playable only (audit §1.1 husks)
        setComicCards(shaped);
      } catch { /* comics are optional library content */ }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // enriched_content with relational content swapped in (per category, when
  // available). buildBlockData consumes this, so STORY_STAGE/DIALOGUE_STAGE
  // blocks are built from story_pages/dialogue_lines, not the manifest.
  const enrichedForBlocks = () => {
    const ec = unit?.manifest?.enriched_content || {};
    const out: any = { ...ec };
    // vocab <- vocabulary_items
    const vi = bundle?.vocabulary_items;
    if (Array.isArray(vi) && vi.length > 0) out.vocabulary = vi;
    // story <- story_pages (keep title/setting from the manifest story)
    const sp = bundle?.story_pages;
    if (Array.isArray(sp) && sp.length > 0) {
      out.story = {
        ...(ec.story || {}),
        pages: sp.map((p: any) => ({ text: p.text, speaker: p.speaker || p.speaker_override_name, image_url: p.image_url })),
      };
    }
    // dialogues <- dialogue_lines (grouped by dialogue_index, speaker resolved
    // via the bundle's characters)
    const dl = bundle?.dialogue_lines;
    if (Array.isArray(dl) && dl.length > 0) {
      const chars: any[] = Array.isArray(bundle?.characters) ? bundle.characters : [];
      const charName = new Map<string, string>(chars.map((c: any) => [c.id, c.name]));
      const groups = new Map<number, any[]>();
      for (const l of dl) {
        const gi = typeof l.dialogue_index === 'number' ? l.dialogue_index : 0;
        if (!groups.has(gi)) groups.set(gi, []);
        groups.get(gi)!.push({
          speaker: (l.speaker_character_id && charName.get(l.speaker_character_id)) || l.speaker_override_name || 'Speaker',
          text: l.text,
          translation: l.translation,
        });
      }
      out.dialogues = Array.from(groups.values()).map((lines, i) => ({ title: `Dialogue ${i + 1}`, lines }));
    }
    return out;
  };

  // Library — GAME TEMPLATES (spec 2026-09-13). Vocab-family templates insert
  // with the FIRST series preselected (untagged = whole unit when the unit has
  // no groups); the inspector's GroupPicker changes the selection afterwards.
  // Story templates are PER STORY GROUP (the generalized comic pattern); a
  // legacy unit without groups gets one flat-story item.
  const library = useMemo<LibraryItem[]>(() => {
    const ec = enrichedForBlocks();
    const items: LibraryItem[] = [];
    const vocabCount = Array.isArray(ec.vocabulary) ? ec.vocabulary.length : 0;
    const grammarCount = Array.isArray(ec.grammar) ? ec.grammar.length : 0;
    const dialogueCount = Array.isArray(ec.dialogues) ? ec.dialogues.length : 0;
    const flatStoryCount = Array.isArray(ec.story?.pages) ? ec.story.pages.length : 0;
    const firstSeries = vocabSeriesFull[0];

    const vocabDetail = vocabSeriesFull.length > 0
      ? `${vocabSeriesFull.length} series available`
      : `${vocabCount} words`;

    if (vocabCount > 0) items.push({ key: 'focus', label: 'Vocabulary Cards', detail: vocabDetail, type: 'FOCUS_CARDS', icon: <ImageIcon size={16} />, chip: 'bg-emerald-100 text-emerald-600' });
    if (dialogueCount > 0) items.push({ key: 'dialogue', label: 'Dialogue', detail: `${dialogueCount} dialogue${dialogueCount === 1 ? '' : 's'}`, type: 'DIALOGUE_STAGE', icon: <MessageSquare size={16} />, chip: 'bg-sky-100 text-sky-600' });
    if (vocabCount >= 2) items.push({ key: 'quiz', label: 'Team Battle Quiz', detail: vocabDetail, type: 'TEAM_BATTLE', icon: <Gamepad2 size={16} />, chip: 'bg-rose-100 text-rose-600' });

    // Team rally screen (owner decision 2026-09-04): the old unit-intro splash,
    // kept verbatim under TEAM_SPLASH for team-game starts. Always available —
    // it is a presentation step, not unit content. Deliberately excluded from
    // addAllToPlan: inserting it is a deliberate team-mode choice, not bulk
    // content stuffing.
    items.push({ key: 'team_splash', label: 'Team Splash', detail: 'Red vs Blue rally screen', type: 'TEAM_SPLASH', icon: <Trophy size={16} />, chip: 'bg-red-100 text-red-600' });

    // Song / Video (spec 2026-09-13): always insertable; the MediaInspector
    // resolves it (find / paste) at plan time.
    items.push({ key: 'media', label: 'Song / Video', detail: 'warm-up media step', type: 'MEDIA_PLAYER', icon: <Music size={16} />, chip: 'bg-blue-100 text-blue-600' });

    // ── Stories: one item PER story group (Story Stage 2 preferred) ──────
    for (const sg of storyGroupsFull) {
      items.push({ key: `story2-${sg.id}`, label: 'Story Stage 2', detail: `${sg.title} · ${sg.pages?.length ?? 0} pages`, type: 'STORY_STAGE_AG', icon: <BookOpen size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600', storyGroup: sg });
      items.push({ key: `quest-${sg.id}`, label: 'Story Quest', detail: `${sg.title} · comprehension`, type: 'STORY_QUEST', icon: <BookOpen size={16} />, chip: 'bg-orange-100 text-orange-600', storyGroup: sg });
    }
    if (storyGroupsFull.length === 0 && flatStoryCount > 0) {
      // Legacy single-story unit: flat items from the relational story.
      items.push({ key: 'story_stage_ag', label: 'Story Stage 2', detail: `${flatStoryCount} pages`, type: 'STORY_STAGE_AG', icon: <BookOpen size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600' });
      items.push({ key: 'story', label: 'Story Stage', detail: `${flatStoryCount} pages`, type: 'STORY_STAGE', icon: <BookOpen size={16} />, chip: 'bg-amber-100 text-amber-600' });
      items.push({ key: 'story_quest', label: 'Story Quest', detail: 'predict + comprehend', type: 'STORY_QUEST', icon: <BookOpen size={16} />, chip: 'bg-orange-100 text-orange-600' });
    }

    // ── New-gen games (pool-driven; appear when the unit has the matching content).
    if (grammarCount > 0) items.push({ key: 'grammar_lab', label: 'Grammar Lab', detail: `${grammarCount} rule${grammarCount === 1 ? '' : 's'} · 3-rung practice`, type: 'GRAMMAR_LAB', icon: <Puzzle size={16} />, chip: 'bg-indigo-100 text-indigo-600' });
    if (vocabCount > 0) items.push({ key: 'word_detective', label: 'Word Detective', detail: vocabDetail, type: 'WORD_DETECTIVE', icon: <Search size={16} />, chip: 'bg-cyan-100 text-cyan-600' });
    if (vocabCount > 0) items.push({ key: 'sound_lab', label: 'Sound Lab', detail: 'listen → match → speak', type: 'SOUND_LAB', icon: <Volume2 size={16} />, chip: 'bg-pink-100 text-pink-600' });
    if (vocabCount > 0) items.push({ key: 'sentence_lab', label: 'Sentence Lab', detail: 'scaffolded sentence build', type: 'SENTENCE_LAB', icon: <PenTool size={16} />, chip: 'bg-teal-100 text-teal-600' });
    if (vocabCount > 0) items.push({ key: 'phonics_arena', label: 'Phonics Arena', detail: 'hear → say', type: 'PHONICS_ARENA', icon: <Mic size={16} />, chip: 'bg-red-100 text-red-600' });
    if (vocabCount > 0) items.push({ key: 'vocab_blitz', label: 'Vocab Blitz', detail: 'timed quiz + bet', type: 'VOCAB_BLITZ', icon: <Zap size={16} />, chip: 'bg-yellow-100 text-yellow-600' });
    if (vocabCount > 0) items.push({ key: 'memory_lab', label: 'Memory Lab', detail: 'what’s missing?', type: 'MEMORY_LAB', icon: <Brain size={16} />, chip: 'bg-blue-100 text-blue-600' });
    if (vocabCount > 0) items.push({ key: 'class_rally', label: 'Class Rally', detail: 'cooperative goal', type: 'CLASS_RALLY', icon: <Users size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600' });
    if (vocabCount > 0) items.push({ key: 'fast_vocab', label: 'Fast Vocab', detail: 'match + speed recall', type: 'FAST_VOCAB', icon: <Gauge size={16} />, chip: 'bg-amber-100 text-amber-600' });
    if (vocabCount > 0) items.push({ key: 'word_search', label: 'Word Search', detail: 'hidden-word grid hunt', type: 'WORD_SEARCH', icon: <LayoutGrid size={16} />, chip: 'bg-teal-100 text-teal-600' });
    if (vocabCount > 0) items.push({ key: 'spelling_bee', label: 'Spelling Bee', detail: 'type the word, beat the clock', type: 'SPELLING_BEE', icon: <SpellCheck size={16} />, chip: 'bg-lime-100 text-lime-600' });

    // ── Comics (doc 12 §4, owner decision 2026-08-30): one selectable item
    // PER comic — the teacher picks which of the unit's comics the class
    // rebuilds. Detail names the comic by its first bubble so multiple comics
    // are distinguishable at a glance.
    for (const comic of comicCards) {
      const firstText = (comic.panels || []).flatMap((p: any) => p.texts || [])[0] as string | undefined;
      const detail = `${comic.panels.length} panels${firstText ? ` · “${String(firstText).slice(0, 34)}…”` : ''}`;
      items.push({ key: `comic-${comic.structure_id}`, label: 'Comic — Rebuild the Story', detail, type: 'COMIC_PANELS', icon: <BookOpen size={16} />, chip: 'bg-purple-100 text-purple-600', comic });
    }

    return items;
  }, [unit?.manifest, bundle, comicCards, vocabSeriesFull, storyGroupsFull]);

  const activeBlock = timeline.find((b) => b.id === activeBlockId) || null;
  const totalMinutes = timeline.reduce((acc, b) => acc + b.duration, 0);
  // "In plan" badges: comics + stories per GROUP identity (which story is
  // already in the plan), vocab templates per type, with the series each
  // instance carries shown on the card.
  const typesInPlan = useMemo(() => new Set(timeline.map((b) => b.type)), [timeline]);
  const comicInPlan = useCallback(
    (comic: any) => timeline.some((b) => b.type === 'COMIC_PANELS' && b.data?.structure_id && b.data.structure_id === comic?.structure_id),
    [timeline],
  );
  const storyInPlan = useCallback(
    (sg: ContentGroup, types: string[]) => timeline.some((b) => types.includes(b.type) && (b.data?.group_id === sg.id || (Array.isArray(b.data?.group_ids) && b.data.group_ids.includes(sg.id)))),
    [timeline],
  );
  const itemInPlan = useCallback(
    (item: LibraryItem) => {
      if (item.type === 'COMIC_PANELS' && item.comic) return comicInPlan(item.comic);
      if (item.storyGroup) {
        if (item.type === 'STORY_STAGE_AG') return storyInPlan(item.storyGroup, ['STORY_STAGE_AG', 'STORY_STAGE']);
        if (item.type === 'STORY_QUEST') return storyInPlan(item.storyGroup, ['STORY_QUEST']);
      }
      return typesInPlan.has(item.type);
    },
    [typesInPlan, comicInPlan, storyInPlan],
  );

  // Vocab templates insert with the FIRST series preselected (spec 2026-09-13:
  // the class meets one series at a time by default; the inspector's picker
  // widens it). Untagged when the unit has no groups (legacy).
  const addFromLibrary = (item: LibraryItem) => {
    const ec = enrichedForBlocks();
    const firstSeries = vocabSeriesFull[0];
    const vocabGroups = firstSeries && ['FOCUS_CARDS', 'TEAM_BATTLE', 'WORD_DETECTIVE', 'SOUND_LAB', 'SENTENCE_LAB', 'PHONICS_ARENA', 'VOCAB_BLITZ', 'MEMORY_LAB', 'CLASS_RALLY', 'FAST_VOCAB', 'WORD_SEARCH', 'SPELLING_BEE'].includes(item.type)
      ? [firstSeries]
      : [];
    const block: PlanBlock = {
      id: `${item.key}-${Date.now()}-${idSeq.current++}`,
      type: item.type,
      title: item.storyGroup ? `${item.storyGroup.title}` : item.label,
      duration: item.type === 'TEAM_SPLASH' ? 1 : 5,
      data: buildBlockData(item.type, ec, item.comic, unit?.manifest?.meta, vocabGroups, item.storyGroup),
    };
    setTimeline((prev) => [...prev, block]);
    setActiveBlockId(block.id);
  };

  // One click adds every library block not yet present in the plan. Prevents
  // the missed-click outcome where a few library items silently never make it
  // into the live lesson. TEAM_SPLASH + MEDIA_PLAYER are excluded — deliberate
  // insertions, never bulk content.
  const addAllToPlan = () => {
    const ec = enrichedForBlocks();
    const stamp = Date.now();
    const missing = library.filter((item) => !itemInPlan(item) && item.type !== 'TEAM_SPLASH' && item.type !== 'MEDIA_PLAYER');
    if (missing.length === 0) {
      toast.info('Everything from the library is already in the plan');
      return;
    }
    const firstSeries = vocabSeriesFull[0];
    const blocks: PlanBlock[] = missing.map((item) => {
      const vocabGroups = firstSeries && ['FOCUS_CARDS', 'TEAM_BATTLE', 'WORD_DETECTIVE', 'SOUND_LAB', 'SENTENCE_LAB', 'PHONICS_ARENA', 'VOCAB_BLITZ', 'MEMORY_LAB', 'CLASS_RALLY', 'FAST_VOCAB', 'WORD_SEARCH', 'SPELLING_BEE'].includes(item.type)
        ? [firstSeries]
        : [];
      return {
        id: `${item.key}-${stamp}-${idSeq.current++}`,
        type: item.type,
        title: item.storyGroup ? `${item.storyGroup.title}` : item.label,
        duration: 5,
        data: buildBlockData(item.type, ec, item.comic, unit?.manifest?.meta, vocabGroups, item.storyGroup),
      };
    });
    setTimeline((prev) => [...prev, ...blocks]);
    setActiveBlockId(blocks[0].id);
    toast.success(`Added ${blocks.length} step${blocks.length === 1 ? '' : 's'} to the plan`);
  };

  const updateBlock = (id: string, updates: Partial<PlanBlock>) => {
    setTimeline((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const removeBlock = (id: string) => {
    setTimeline((prev) => prev.filter((b) => b.id !== id));
    setActiveBlockId((cur) => (cur === id ? null : cur));
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.droppableId !== 'plan-timeline') return;
    if (source.index === destination.index) return;
    setTimeline((prev) => {
      const items = Array.from(prev);
      const [moved] = items.splice(source.index, 1);
      items.splice(destination.index, 0, moved);
      return items;
    });
  };

  // Inspector: vocab-family group re-selection (multi) — rebuilds the block's
  // frozen cards + scope tags so the board plays exactly the picked series.
  const setBlockVocabGroups = (block: PlanBlock, groupIds: string[]) => {
    const selected = vocabSeriesFull.filter((g) => groupIds.includes(g.id));
    const ec = enrichedForBlocks();
    updateBlock(block.id, {
      data: buildBlockData(block.type, ec, undefined, unit?.manifest?.meta, selected, null),
    });
  };

  // Inspector: story block re-selection (single) — freezes that story's pages.
  const setBlockStoryGroup = (block: PlanBlock, groupId: string) => {
    const sg = storyGroupsFull.find((g) => g.id === groupId) || null;
    const ec = enrichedForBlocks();
    updateBlock(block.id, {
      title: sg ? sg.title : block.title,
      data: buildBlockData(block.type, ec, undefined, unit?.manifest?.meta, [], sg),
    });
  };

  // One-click plan built FROM THE UNIT'S CONTENT (intro -> vocab per series ->
  // story -> dialogue -> review), spec 2026-09-13.
  const autoBuild = async () => {
    setBuilding(true);
    try {
      const ec = enrichedForBlocks();
      const meta = unit?.manifest?.meta || {};
      const title = meta.unit_title || unit?.title || 'Lesson';
      const stamp = Date.now();
      const blocks: PlanBlock[] = [
        { id: `intro-${stamp}`, type: 'INTRO_SPLASH', title: `Welcome to ${title}`, duration: 1, data: { theme: meta.theme || '' } },
      ];
      const vocabCount = Array.isArray(ec.vocabulary) ? ec.vocabulary.length : 0;
      if (vocabCount > 0) {
        if (vocabSeriesFull.length > 0) {
          // One vocabulary wave per series, in book order.
          for (const series of vocabSeriesFull) {
            blocks.push({ id: `vocab-${series.id}-${stamp}`, type: 'FOCUS_CARDS', title: `${series.title} — Vocabulary`, duration: 5, data: buildBlockData('FOCUS_CARDS', ec, undefined, meta, [series]) });
            blocks.push({ id: `fast-${series.id}-${stamp}`, type: 'FAST_VOCAB', title: `${series.title} — Fast Vocab`, duration: 5, data: buildBlockData('FAST_VOCAB', ec, undefined, meta, [series]) });
          }
        } else {
          blocks.push({ id: `vocab-${stamp}`, type: 'FOCUS_CARDS', title: 'Vocabulary Cards', duration: 5, data: buildBlockData('FOCUS_CARDS', ec) });
        }
      }
      for (const sg of storyGroupsFull) {
        blocks.push({ id: `story-${sg.id}-${stamp}`, type: 'STORY_STAGE_AG', title: sg.title, duration: 8, data: buildBlockData('STORY_STAGE_AG', ec, undefined, meta, [], sg) });
      }
      if (storyGroupsFull.length === 0 && Array.isArray(ec.story?.pages) && ec.story.pages.length > 0) {
        blocks.push({ id: `story-${stamp}`, type: 'STORY_STAGE', title: ec.story.title || 'Story', duration: 8, data: buildBlockData('STORY_STAGE', ec) });
      }
      if (Array.isArray(ec.dialogues) && ec.dialogues.length > 0) blocks.push({ id: `dialogue-${stamp}`, type: 'DIALOGUE_STAGE', title: 'Dialogue', duration: 6, data: buildBlockData('DIALOGUE_STAGE', ec) });
      if (vocabCount >= 2) blocks.push({ id: `quiz-${stamp}`, type: 'TEAM_BATTLE', title: 'Team Battle Quiz', duration: 8, data: buildBlockData('TEAM_BATTLE', ec) });
      setTimeline(blocks);
      setActiveBlockId(blocks[0]?.id || null);
      toast.success(`Auto-built a ${blocks.length}-step plan`);
    } finally {
      setBuilding(false);
    }
  };

  // Server-side regenerate via orchestrate-lesson (AI-enhanced full flow + it
  // also re-runs generate-exercises). The generated flow lands on the ACTIVE
  // plan; when that plan is not the default, the default plan's flow is
  // re-mirrored to units.flow afterwards (orchestrate writes the mirror
  // directly — restore it so the default plan stays the mirror).
  const regenerateLesson = async () => {
    setRebuilding(true);
    try {
      const { error } = await supabase.functions.invoke('orchestrate-lesson', { body: { unitId, approvedAssets: {} } });
      if (error) throw error;
      const fresh = await Engine.getUnitById(unitId);
      const flow: any[] = Array.isArray(fresh?.flow) ? fresh.flow : [];
      const blocks: PlanBlock[] = flow.map((step: any, i: number) => ({
        id: step.id || `step_${i}`,
        type: step.type || 'FOCUS_CARDS',
        title: step.title || step.type || 'Untitled',
        duration: step.duration ? Math.max(1, Math.round(step.duration / 60)) : 5,
        data: step.data || {},
      }));
      setTimeline(blocks);
      setActiveBlockId(blocks[0]?.id || null);
      onFlowSaved?.(flow);
      if (activePlan) {
        await Engine.saveUnitPlanFlow(activePlan.id, flow);
        if (!activePlan.isDefault) {
          // Restore the default plan's mirror (orchestrate just overwrote it).
          const def = plans.find((p) => p.isDefault);
          if (def && def.id !== activePlan.id) await Engine.saveUnitPlanFlow(def.id, def.flow);
        }
        const list = await Engine.listUnitPlans(unitId);
        setPlans(list);
      }
      toast.success(`Lesson plan regenerated (${blocks.length} steps)`);
    } catch (err: any) {
      toast.error(`Regenerate failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRebuilding(false);
    }
  };

  // Serialize editor blocks -> flow rows (minutes -> seconds). Attach the
  // pedagogical phase so the board timeline + ClassWeakBanner treat manually
  // composed blocks the same way orchestrate-lesson tags AI-generated ones.
  const PHASE_FOR_BLOCK: Record<string, string> = {
    INTRO_SPLASH: 'WARMUP', MEDIA_PLAYER: 'WARMUP', TEAM_SPLASH: 'WARMUP',
    FOCUS_CARDS: 'INPUT', GRAMMAR_SANDBOX: 'INPUT',
    STORY_STAGE: 'OUTPUT', STORY_STAGE_AG: 'OUTPUT', DIALOGUE_STAGE: 'OUTPUT',
    TEAM_BATTLE: 'ASSESS', SPEED_QUIZ: 'ASSESS', VOCAB_BLITZ: 'ASSESS',
    GRAMMAR_LAB: 'PRACTICE', WORD_DETECTIVE: 'PRACTICE', SOUND_LAB: 'PRACTICE',
    STORY_QUEST: 'PRACTICE', SENTENCE_LAB: 'PRACTICE', PHONICS_ARENA: 'PRACTICE',
    MEMORY_LAB: 'PRACTICE', CLASS_RALLY: 'PRACTICE',
    FAST_VOCAB: 'PRACTICE',
    WORD_SEARCH: 'PRACTICE',
    SPELLING_BEE: 'PRACTICE',
    COMIC_PANELS: 'PRACTICE', // games-v3 audit 28 §3 F6: omission defaulted it to a WARM-UP badge
  };
  const buildDbFlow = () => timeline.map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    duration: b.duration * 60,
    data: b.data,
    ...(PHASE_FOR_BLOCK[b.type] ? { phase: PHASE_FOR_BLOCK[b.type] } : {}),
  }));

  // Save the ACTIVE plan (the default plan write-through mirrors units.flow —
  // Engine.saveUnitPlanFlow owns that rule).
  const savePlan = async () => {
    setSaving(true);
    try {
      const dbFlow = buildDbFlow();
      if (activePlan) {
        await Engine.saveUnitPlanFlow(activePlan.id, dbFlow);
        const list = await Engine.listUnitPlans(unitId);
        setPlans(list);
        if (activePlan.isDefault) onFlowSaved?.(dbFlow);
      } else {
        await Engine.updateUnit(unitId, { flow: dbFlow } as any);
        onFlowSaved?.(dbFlow);
      }
      toast.success('Lesson plan saved');
    } catch (err: any) {
      toast.error(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const launchLive = async () => {
    setLaunching(true);
    try {
      // Auto-save the plan FIRST so the live session loads exactly these steps
      // (otherwise an unsaved plan would silently not appear in the lesson).
      const dbFlow = buildDbFlow();
      if (activePlan) {
        await Engine.saveUnitPlanFlow(activePlan.id, dbFlow);
        const list = await Engine.listUnitPlans(unitId);
        setPlans(list);
      } else {
        await Engine.updateUnit(unitId, { flow: dbFlow } as any);
      }
      onFlowSaved?.(dbFlow);
      await setActiveUnit(unitId, undefined, activePlan?.id); // session resolves THIS plan
      navigate('/teacher/live');
    } catch (err: any) {
      toast.error(`Could not launch: ${err?.message || 'Unknown error'}`);
      setLaunching(false);
    }
  };

  // Media actions patch server-side flows — reload plans + re-hydrate the
  // timeline from the fresh data (server truth wins over in-memory edits on
  // media blocks).
  const reloadPlansAfterMedia = async () => {
    const list = await Engine.listUnitPlans(unitId);
    setPlans(list);
    const plan = list.find((p) => p.id === (activePlanId || activePlan?.id));
    if (plan) {
      setTimeline((prev) => prev.map((b) => {
        const fresh = (plan.flow || []).find((f: any) => f.type === 'MEDIA_PLAYER' && String(f.data?.search_query || '') === String(b.data?.search_query || ' ') && !!f.data?.videoUrl);
        return fresh ? { ...b, data: { ...b.data, ...fresh.data } } : b;
      }));
    }
  };

  const vocabGroupOptions: GroupOption[] = vocabSeriesFull.map((g) => ({
    id: g.id, kind: g.kind, title: g.title, structure_ids: g.structure_ids,
    detail: `${g.words?.length ?? 0} words`,
  }));
  const storyGroupOptions: GroupOption[] = storyGroupsFull.map((g) => ({
    id: g.id, kind: g.kind, title: g.title, structure_ids: g.structure_ids,
    detail: `${g.pages?.length ?? 0} pages`,
  }));
  const blockVocabSelection = (block: PlanBlock): string[] => {
    if (Array.isArray(block.data?.group_ids) && block.data.group_ids.length > 0) return block.data.group_ids.map(String);
    if (block.data?.group_id) return [String(block.data.group_id)];
    return [];
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Plan switcher (spec 2026-09-13): Lesson 1 / Lesson 2 / Revision… */}
      <div className="border-b border-slate-200 bg-white px-6 py-2.5 shrink-0">
        <PlanSwitcher
          unitId={unitId}
          plans={plans}
          activePlanId={activePlanId}
          busy={saving || rebuilding}
          onSelect={setActivePlanId}
          onPlansChanged={(list, preferId) => {
            setPlans(list);
            if (preferId) setActivePlanId(preferId);
          }}
        />
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Library — game templates derived from the unit's real content */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto shrink-0">
          <div className="p-5">
            <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-1">Add a game</h3>
            <p className="text-[11px] text-slate-400 mb-3">Pick a game — vocabulary games start on the first series; change it in the inspector.</p>
            {pendingReview > 0 && (
              <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 leading-snug">
                  <span className="font-bold">{pendingReview} extracted section{pendingReview === 1 ? '' : 's'} await your review.</span>{' '}
                  Confirm them in the Review tab — unconfirmed stories/words never reach the plan.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {library.length === 0 && (
                <p className="text-xs text-slate-400 italic">No content yet — generate some in the Content tab.</p>
              )}
              {library.map((item) => {
                const inPlan = itemInPlan(item);
                return (
                  <button
                    key={item.key}
                    onClick={() => addFromLibrary(item)}
                    className="w-full bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow transition-all flex items-center gap-3 text-left group"
                  >
                    <div className={`p-2 rounded-lg ${item.chip}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-700 truncate">{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.detail}</div>
                    </div>
                    {inPlan ? (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-pink-600 bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded shrink-0">In plan</span>
                    ) : (
                      <Plus size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={addAllToPlan}
              className="mt-5 w-full bg-pink-50 text-pink-700 border border-pink-200 font-bold py-2.5 rounded-xl text-xs hover:bg-pink-100 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={14} />
              Add all to plan
            </button>

            <button
              onClick={autoBuild}
              disabled={building}
              className="mt-5 w-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold py-2.5 rounded-xl text-xs hover:bg-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {building ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Auto-build full plan
            </button>
            <button
              onClick={regenerateLesson}
              disabled={rebuilding}
              title="Re-run the server-side lesson orchestrator (AI-enhanced flow + refreshes exercises). Also repairs a collapsed plan."
              className="mt-2 w-full bg-slate-100 text-slate-600 border border-slate-200 font-bold py-2.5 rounded-xl text-xs hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {rebuilding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Regenerate with AI
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 bg-slate-100 overflow-y-auto relative">
          <div className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur px-8 pt-4 pb-2 flex items-center justify-between max-w-3xl mx-auto">
            <p className="text-sm text-slate-500">
              {timeline.length} step{timeline.length === 1 ? '' : 's'} &bull; ~{totalMinutes} min
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={savePlan}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save plan
              </button>
              <button
                onClick={launchLive}
                disabled={launching}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {launching ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Launch live
              </button>
            </div>
          </div>

          <div className="px-8 pb-10 relative">
            <div className="absolute top-0 bottom-0 left-[3.25rem] w-0.5 bg-slate-300 z-0" />
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="plan-timeline">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-5 max-w-2xl mx-auto pt-4">
                    {timeline.map((block, i) => {
                      const meta = typeMeta(block.type);
                      const mediaUnresolved = block.type === 'MEDIA_PLAYER' && !block.data?.videoUrl && !block.data?.audioUrl;
                      return (
                        <Draggable key={block.id} draggableId={block.id} index={i}>
                          {(prov, snapshot) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => setActiveBlockId(block.id)}
                              className={`relative z-10 cursor-pointer group ${snapshot.isDragging ? 'opacity-80 scale-[1.02]' : ''}`}
                            >
                              <div className="absolute -left-9 w-7 h-7 bg-white border-4 border-indigo-500 rounded-full flex items-center justify-center font-bold text-[10px] text-indigo-700 z-20">
                                {i + 1}
                              </div>
                              <div className={`bg-white p-4 rounded-xl border-2 transition-all shadow-sm ${activeBlockId === block.id ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-transparent hover:border-slate-300'}`}>
                                <div className="flex justify-between items-start gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className={`p-2 rounded-lg ${meta.chip} shrink-0`}>{meta.icon}</div>
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1.5">
                                        {block.type.replace(/_/g, ' ')}
                                        {block.data?.group_title && (
                                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded normal-case tracking-normal truncate max-w-[9rem]" title={block.data.group_title}>
                                            {block.data.group_title}
                                          </span>
                                        )}
                                      </div>
                                      <h3 className="font-bold text-slate-800 truncate">{block.title}</h3>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {mediaUnresolved && (
                                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title="No video yet — resolve in the inspector">
                                        <AlertTriangle size={10} /> no video
                                      </span>
                                    )}
                                    <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded flex items-center gap-1">
                                      <Clock size={11} /> {block.duration}m
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                      title="Remove step"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {timeline.length === 0 && (
                      <div className="text-center text-slate-400 py-16">
                        <Layers size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No steps yet. Add from the library or use Auto-build.</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>

        {/* Inspector — title, duration, group selection, media, game settings */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          {activeBlock ? (
            <div className="p-6 space-y-5">
              <h3 className="font-bold text-slate-800 text-lg">Edit step</h3>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                <input
                  value={activeBlock.title}
                  onChange={(e) => updateBlock(activeBlock.id, { title: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={activeBlock.duration}
                  onChange={(e) => updateBlock(activeBlock.id, { duration: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Content-group selection (spec 2026-09-13) */}
              {['FOCUS_CARDS', 'TEAM_BATTLE', 'WORD_DETECTIVE', 'SOUND_LAB', 'SENTENCE_LAB', 'PHONICS_ARENA', 'VOCAB_BLITZ', 'MEMORY_LAB', 'CLASS_RALLY', 'FAST_VOCAB', 'WORD_SEARCH', 'SPELLING_BEE'].includes(activeBlock.type) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Vocabulary series</label>
                  <p className="text-[11px] text-slate-500 mb-2.5">This game plays only the selected series. No selection = the whole unit.</p>
                  <GroupPicker
                    mode="multi"
                    options={vocabGroupOptions}
                    selected={blockVocabSelection(activeBlock)}
                    onChange={(ids) => setBlockVocabGroups(activeBlock, ids)}
                    allowAllOption={vocabGroupOptions.length === 0 ? { id: '__all__', title: 'Whole unit', detail: 'all vocabulary (no series extracted)' } : undefined}
                  />
                </div>
              )}
              {['STORY_STAGE', 'STORY_STAGE_AG', 'STORY_QUEST'].includes(activeBlock.type) && storyGroupOptions.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-amber-700 uppercase mb-1">Story</label>
                  <p className="text-[11px] text-slate-500 mb-2.5">Which story this step reads.</p>
                  <GroupPicker
                    mode="single"
                    options={storyGroupOptions}
                    selected={blockVocabSelection(activeBlock)}
                    onChange={(ids) => ids[0] && setBlockStoryGroup(activeBlock, ids[0])}
                  />
                </div>
              )}
              {activeBlock.type === 'MEDIA_PLAYER' && (
                <MediaInspector unitId={unitId} block={{ title: activeBlock.title, data: activeBlock.data }} onDataPatched={reloadPlansAfterMedia} />
              )}
              {activeBlock.type === 'FAST_VOCAB' && (
                // Fast Vocab game settings — stored on the block's data and read
                // by BoardFastVocab at runtime. Default = the 3-pair lightning
                // cycle; the switch lengthens each match wave to 5 pairs.
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-amber-700 uppercase mb-3">Game settings</label>
                  {(() => {
                    const size = resolveWaveSize(activeBlock.data?.waveSize);
                    const on = size === 5;
                    return (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800">Longer cycle</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {on ? '5 images per match wave' : '3 images per match wave (default)'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() =>
                            updateBlock(activeBlock.id, {
                              data: { ...activeBlock.data, waveSize: on ? 3 : 5 },
                            })
                          }
                          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-slate-300'}`}
                          title="Toggle the match wave between 3 and 5 pairs"
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`}
                          />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
              {activeBlock.type === 'SPELLING_BEE' && (
                // Spelling Bee game settings — stored on the block's data and
                // read by BoardSpellingBee at runtime.
                <div className="bg-lime-50 border border-lime-200 rounded-xl p-4">
                  <label className="block text-xs font-bold text-lime-700 uppercase mb-3">Game settings</label>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">Words per turn</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Words each picked student spells</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={Number(activeBlock.data?.wordsPerTurn) || 3}
                      onChange={(e) =>
                        updateBlock(activeBlock.id, {
                          data: { ...activeBlock.data, wordsPerTurn: Math.max(1, Math.min(10, parseInt(e.target.value || '3', 10))) },
                        })
                      }
                      className="w-16 p-2 border border-slate-200 rounded-lg text-sm font-bold text-center"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">Seconds per word</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">0 = no countdown timer</p>
                    </div>
                    <select
                      value={String(activeBlock.data?.timerSeconds ?? 15)}
                      onChange={(e) =>
                        updateBlock(activeBlock.id, {
                          data: { ...activeBlock.data, timerSeconds: parseInt(e.target.value, 10) },
                        })
                      }
                      className="p-2 border border-slate-200 rounded-lg text-sm font-bold bg-white"
                    >
                      <option value="0">Off</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                      <option value="20">20</option>
                      <option value="25">25</option>
                      <option value="30">30</option>
                      <option value="45">45</option>
                      <option value="60">60</option>
                    </select>
                  </div>
                  {(() => {
                    const removal = activeBlock.data?.letterRemoval !== false;
                    return (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800">Remove letters</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {removal ? 'wrong keys drop off as the clock burns' : 'full keyboard all game (harder)'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={removal}
                          onClick={() =>
                            updateBlock(activeBlock.id, {
                              data: { ...activeBlock.data, letterRemoval: !removal },
                            })
                          }
                          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${removal ? 'bg-lime-500' : 'bg-slate-300'}`}
                          title="Adaptive keyboard narrowing"
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${removal ? 'translate-x-5' : ''}`}
                          />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  {activeBlock.type.replace(/_/g, ' ')}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">The board renders this step with the matching game/presentation template.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
              <PenTool size={40} className="mb-3 opacity-20" />
              <p className="text-sm">Select a step to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanComposer;
