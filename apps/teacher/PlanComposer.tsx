import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Plus, Trash2, Save, Play, Loader2, Wand2, Clock, BookOpen, MessageSquare,
  PenTool, Music, Image as ImageIcon, Gamepad2, Layers, RefreshCw,
  Search, Volume2, Mic, Zap, Brain, Users, Puzzle
} from 'lucide-react';
import { Engine } from '../../services/SupabaseService';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import { toast } from 'sonner';

// Phase 2 — the Unit Studio Plan composer (option A). A timeline/session
// composer that is concretely better than the legacy LessonStudio one:
//   - The block library is DERIVED FROM THE UNIT'S REAL CONTENT (vocab/story/
//     dialogue/grammar/song), not the 2 hardcoded fake items the old composer
//     shipped with.
//   - The inspector edits title AND duration (the old one edited title only).
//   - "Auto-build" reuses the proven transformManifestToFlow to produce a
//     board-compatible default flow in one click.
// It still WRITES units.flow (the shape the live session reads) — retiring that
// shape would require reworking the live session and is intentionally deferred.

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
};
const typeMeta = (type: string) => TYPE_META[type] || { icon: <PenTool size={16} />, chip: 'bg-slate-100 text-slate-600' };

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'vocab')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
const realImage = (url: any, seed: string) =>
  (url && typeof url === 'string' && /^https?:/.test(url)) ? url : dicebear(seed);

// Build FUNCTIONAL, board-renderable `data` for a library block from the unit's
// REAL content — mirroring the shapes transformManifestToFlow produces (which
// the board templates consume). This is what makes library blocks real steps,
// not empty mockups: a FOCUS_CARDS block carries actual vocab cards, a
// DIALOGUE_STAGE block carries the unit's dialogue lines, etc.
const buildBlockData = (type: string, ec: any): any => {
  const vocab: any[] = Array.isArray(ec.vocabulary) ? ec.vocabulary : [];
  switch (type) {
    case 'FOCUS_CARDS':
      return {
        title: 'New Vocabulary',
        cards: vocab.map((v, i) => ({
          id: `c_${i}`,
          front: v.word,
          back: v.word,
          pronunciation: v.phonetic || `/${(v.word || '').toLowerCase()}/`,
          image: realImage(v.image_url, v.word),
        })),
      };
    case 'STORY_STAGE': {
      const story = ec.story || {};
      const pages: any[] = Array.isArray(story.pages) ? story.pages : [];
      return {
        title: story.title || 'Story',
        setting: story.setting,
        pages: pages.map((p, i) => ({ id: `p${i}`, text: p.text, speaker: p.speaker, imageUrl: p.image_url })),
        characters: Array.isArray(ec.characters) ? ec.characters.map((c: any) => ({ name: c.name, emoji: c.emoji })) : [],
      };
    }
    case 'STORY_QUEST': {
      // Story Quest reads the story from the manifest first (getStory), with
      // data.pages as a fallback — mirror the STORY_STAGE page shape so the
      // fallback path is board-renderable too.
      const story = ec.story || {};
      const pages: any[] = Array.isArray(story.pages) ? story.pages : [];
      return {
        title: story.title || 'Story Quest',
        pages: pages.map((p, i) => ({ id: `p${i}`, text: p.text, speaker: p.speaker, imageUrl: p.image_url })),
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
    case 'TEAM_BATTLE': {
      const questions = vocab.slice(0, 6).map((v, i) => ({
        id: `q_${i}`,
        text: `Which one is the “${v.word}”?`,
        image: realImage(v.image_url, v.word),
        options: [v.word, ...(Array.isArray(v.distractors) ? v.distractors : [])].slice(0, 4).sort(() => Math.random() - 0.5),
        correct: v.word,
      }));
      return { topic: ec.topic || 'Review', questions };
    }
    default:
      return {};
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

  // Monotonic id suffix: Date.now() alone collides on fast/double clicks, and a
  // duplicate block.id corrupts the dnd list (duplicate draggableId) and makes
  // removeBlock delete BOTH twins. A counter guarantees uniqueness.
  const idSeq = useRef(0);

  // Hydrate the editor from units.flow (seconds -> minutes).
  useEffect(() => {
    const flow = Array.isArray(unit?.flow) ? unit.flow : [];
    const blocks: PlanBlock[] = flow.map((step: any, i: number) => ({
      id: step.id || `step_${i}`,
      type: step.type || 'FOCUS_CARDS',
      title: step.title || step.type || 'Untitled',
      duration: step.duration ? Math.max(1, Math.round(step.duration / 60)) : 5,
      data: step.data || {},
    }));
    setTimeline(blocks);
    setActiveBlockId(blocks.length > 0 ? blocks[0].id : null);
  }, [unit?.id]);

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

  // Library DERIVED FROM THE UNIT'S REAL CONTENT (the key improvement over the
  // legacy composer's 2 hardcoded fake items).
  const library = useMemo<LibraryItem[]>(() => {
    const ec = enrichedForBlocks();
    const items: LibraryItem[] = [];
    const vocabCount = Array.isArray(ec.vocabulary) ? ec.vocabulary.length : 0;
    const grammarCount = Array.isArray(ec.grammar) ? ec.grammar.length : 0;
    const storyCount = Array.isArray(ec.story?.pages) ? ec.story.pages.length : 0;
    const dialogueCount = Array.isArray(ec.dialogues) ? ec.dialogues.length : 0;

    if (vocabCount > 0) items.push({ key: 'vocab', label: 'Vocabulary Cards', detail: `${vocabCount} words`, type: 'FOCUS_CARDS', icon: <ImageIcon size={16} />, chip: 'bg-emerald-100 text-emerald-600' });
    if (storyCount > 0) items.push({ key: 'story', label: 'Story Stage', detail: `${storyCount} pages`, type: 'STORY_STAGE', icon: <BookOpen size={16} />, chip: 'bg-amber-100 text-amber-600' });
    if (dialogueCount > 0) items.push({ key: 'dialogue', label: 'Dialogue', detail: `${dialogueCount} dialogue${dialogueCount === 1 ? '' : 's'}`, type: 'DIALOGUE_STAGE', icon: <MessageSquare size={16} />, chip: 'bg-sky-100 text-sky-600' });
    if (vocabCount >= 2) items.push({ key: 'quiz', label: 'Team Battle Quiz', detail: `up to ${Math.min(vocabCount, 6)} questions`, type: 'TEAM_BATTLE', icon: <Gamepad2 size={16} />, chip: 'bg-rose-100 text-rose-600' });

    // ── New-gen games (pool-driven; appear when the unit has the matching content).
    if (grammarCount > 0) items.push({ key: 'grammar_lab', label: 'Grammar Lab', detail: `${grammarCount} rule${grammarCount === 1 ? '' : 's'} · 3-rung practice`, type: 'GRAMMAR_LAB', icon: <Puzzle size={16} />, chip: 'bg-indigo-100 text-indigo-600' });
    if (vocabCount > 0) items.push({ key: 'word_detective', label: 'Word Detective', detail: 'vocab in context', type: 'WORD_DETECTIVE', icon: <Search size={16} />, chip: 'bg-cyan-100 text-cyan-600' });
    if (vocabCount > 0) items.push({ key: 'sound_lab', label: 'Sound Lab', detail: 'listen → match → speak', type: 'SOUND_LAB', icon: <Volume2 size={16} />, chip: 'bg-pink-100 text-pink-600' });
    if (storyCount > 0) items.push({ key: 'story_quest', label: 'Story Quest', detail: 'predict + comprehend', type: 'STORY_QUEST', icon: <BookOpen size={16} />, chip: 'bg-orange-100 text-orange-600' });
    if (vocabCount > 0) items.push({ key: 'sentence_lab', label: 'Sentence Lab', detail: 'scaffolded sentence build', type: 'SENTENCE_LAB', icon: <PenTool size={16} />, chip: 'bg-teal-100 text-teal-600' });
    if (vocabCount > 0) items.push({ key: 'phonics_arena', label: 'Phonics Arena', detail: 'hear → say', type: 'PHONICS_ARENA', icon: <Mic size={16} />, chip: 'bg-red-100 text-red-600' });
    if (vocabCount > 0) items.push({ key: 'vocab_blitz', label: 'Vocab Blitz', detail: 'timed quiz + bet', type: 'VOCAB_BLITZ', icon: <Zap size={16} />, chip: 'bg-yellow-100 text-yellow-600' });
    if (vocabCount > 0) items.push({ key: 'memory_lab', label: 'Memory Lab', detail: 'what\u2019s missing?', type: 'MEMORY_LAB', icon: <Brain size={16} />, chip: 'bg-blue-100 text-blue-600' });
    if (vocabCount > 0) items.push({ key: 'class_rally', label: 'Class Rally', detail: 'cooperative goal', type: 'CLASS_RALLY', icon: <Users size={16} />, chip: 'bg-fuchsia-100 text-fuchsia-600' });

    return items;
  }, [unit?.manifest, bundle]);

  const activeBlock = timeline.find((b) => b.id === activeBlockId) || null;
  const totalMinutes = timeline.reduce((acc, b) => acc + b.duration, 0);
  // Which library items already have a block of their type in the plan — drives
  // the "In plan" badge so the teacher can SEE at a glance what is missing
  // (the "I added everything but the live lesson shows fewer steps" trap).
  const typesInPlan = useMemo(() => new Set(timeline.map((b) => b.type)), [timeline]);

  const addFromLibrary = (item: LibraryItem) => {
    const ec = enrichedForBlocks();
    const block: PlanBlock = {
      id: `${item.key}-${Date.now()}-${idSeq.current++}`,
      type: item.type,
      title: item.label,
      duration: 5,
      data: buildBlockData(item.type, ec), // real content, board-renderable
    };
    setTimeline((prev) => [...prev, block]);
    setActiveBlockId(block.id);
  };

  // One click adds every library block not yet present in the plan. Prevents
  // the missed-click outcome where a few library items silently never make it
  // into the live lesson.
  const addAllToPlan = () => {
    const ec = enrichedForBlocks();
    const stamp = Date.now();
    const missing = library.filter((item) => !typesInPlan.has(item.type));
    if (missing.length === 0) {
      toast.info('Everything from the library is already in the plan');
      return;
    }
    const blocks: PlanBlock[] = missing.map((item) => ({
      id: `${item.key}-${stamp}-${idSeq.current++}`,
      type: item.type,
      title: item.label,
      duration: 5,
      data: buildBlockData(item.type, ec),
    }));
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

  // One-click plan built FROM THE UNIT'S CONTENT (intro -> vocab -> story ->
  // dialogue -> review). NOTE: we do NOT reuse transformManifestToFlow here —
  // that reads manifest.timeline (empty for these units) and would collapse the
  // plan to a single intro slide, wiping the server-generated flow. Building
  // from content with buildBlockData produces real, board-renderable steps.
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
      if (vocabCount > 0) blocks.push({ id: `vocab-${stamp}`, type: 'FOCUS_CARDS', title: 'Vocabulary Cards', duration: 5, data: buildBlockData('FOCUS_CARDS', ec) });
      if (Array.isArray(ec.story?.pages) && ec.story.pages.length > 0) blocks.push({ id: `story-${stamp}`, type: 'STORY_STAGE', title: ec.story.title || 'Story', duration: 8, data: buildBlockData('STORY_STAGE', ec) });
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
  // also re-runs generate-exercises). Passing empty approvedAssets makes it fall
  // back to the unit's stored manifest, so this is also the REPAIR path for units
  // whose flow was collapsed by the Phase 1.7 bug. Reloads the fresh flow after.
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
      toast.success(`Lesson plan regenerated (${blocks.length} steps)`);
    } catch (err: any) {
      toast.error(`Regenerate failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRebuilding(false);
    }
  };

  // Serialize editor blocks -> units.flow rows (minutes -> seconds). Attach the
  // pedagogical phase so the board timeline + ClassWeakBanner treat manually
  // composed blocks the same way orchestrate-lesson tags AI-generated ones.
  const PHASE_FOR_BLOCK: Record<string, string> = {
    INTRO_SPLASH: 'WARMUP', MEDIA_PLAYER: 'WARMUP',
    FOCUS_CARDS: 'INPUT', GRAMMAR_SANDBOX: 'INPUT',
    STORY_STAGE: 'OUTPUT', DIALOGUE_STAGE: 'OUTPUT',
    TEAM_BATTLE: 'ASSESS', SPEED_QUIZ: 'ASSESS', VOCAB_BLITZ: 'ASSESS',
    GRAMMAR_LAB: 'PRACTICE', WORD_DETECTIVE: 'PRACTICE', SOUND_LAB: 'PRACTICE',
    STORY_QUEST: 'PRACTICE', SENTENCE_LAB: 'PRACTICE', PHONICS_ARENA: 'PRACTICE',
    MEMORY_LAB: 'PRACTICE', CLASS_RALLY: 'PRACTICE',
  };
  const buildDbFlow = () => timeline.map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    duration: b.duration * 60,
    data: b.data,
    ...(PHASE_FOR_BLOCK[b.type] ? { phase: PHASE_FOR_BLOCK[b.type] } : {}),
  }));

  // Save back to units.flow — the shape the live session reads.
  const savePlan = async () => {
    setSaving(true);
    try {
      const dbFlow = buildDbFlow();
      await Engine.updateUnit(unitId, { flow: dbFlow } as any);
      onFlowSaved?.(dbFlow);
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
      await Engine.updateUnit(unitId, { flow: dbFlow } as any);
      onFlowSaved?.(dbFlow);
      await setActiveUnit(unitId); // SessionContext now fetches the fresh unit
      navigate('/teacher/live');
    } catch (err: any) {
      toast.error(`Could not launch: ${err?.message || 'Unknown error'}`);
      setLaunching(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Library — derived from the unit's real content */}
      <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto shrink-0">
        <div className="p-5">
          <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-1">Add from content</h3>
          <p className="text-[11px] text-slate-400 mb-4">Blocks derived from this unit's generated content.</p>
          <div className="space-y-2">
            {library.length === 0 && (
              <p className="text-xs text-slate-400 italic">No content yet — generate some in the Content tab.</p>
            )}
            {library.map((item) => {
              const inPlan = typesInPlan.has(item.type);
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
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">In plan</span>
                  ) : (
                    <Plus size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={addAllToPlan}
            className="mt-5 w-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold py-2.5 rounded-xl text-xs hover:bg-emerald-100 flex items-center justify-center gap-2 transition-colors"
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
                                    <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{block.type.replace(/_/g, ' ')}</div>
                                    <h3 className="font-bold text-slate-800 truncate">{block.title}</h3>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
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

      {/* Inspector — edit title AND duration */}
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
  );
};

export default PlanComposer;
