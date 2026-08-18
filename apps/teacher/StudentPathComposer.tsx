import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Plus, Trash2, Save, Loader2, Wand2, Lock, Unlock, RefreshCw,
  Image as ImageIcon, Music, Layers, GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { Engine } from '../../services/SupabaseService';
import { supabase } from '../../services/supabaseClient';
import { deriveDefaultPath } from '../../services/stageProgressService';
import { StageIcon, stageIconKeys } from '../../components/shared/stageIcons';
import type { StudentStage, StageBlock, StageLock } from '../../types/stage';

// ─────────────────────────────────────────────────────────────────────
// StudentPathComposer — the Student Path tab of the Unit Studio.
//
// The solo-learning twin of PlanComposer (the live Plan tab): the teacher
// composes the Duolingo-style node path the STUDENT app plays. One node =
// optional lead-in presentation blocks + one scored round; nodes unlock
// sequentially for students unless overridden per node (Auto / Locked /
// Open). Saved to units.student_path — the live units.flow plan is not
// touched by this surface.
// ─────────────────────────────────────────────────────────────────────

interface PathComposerProps {
  unitId: string;
  unit: any;
  onPathSaved?: (path: StudentStage[]) => void;
}

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Pool-driven round block (the solo player renders these via the FSRS
// ExerciseRunner battery — data carries identity/settings, the pool
// supplies the content).
const round = (type: string, title: string, phase: 'PRACTICE' | 'ASSESS', data: any = {}): StageBlock => ({
  id: newId(),
  type,
  title,
  duration: 300,
  data: { poolDriven: true, ...data },
  phase,
});

const leadIn = (type: string, title: string, data: any = {}): StageBlock => ({
  id: newId(),
  type,
  title,
  duration: 180,
  data,
});

interface NodeTemplate {
  key: string;
  label: string;
  detail: string;
  icon: string;
  /** Content signal required for this template to be offered. */
  requires?: 'vocab' | 'story';
  build: () => StudentStage;
}

const stageFrom = (over: Partial<StudentStage> & { title: string; icon: string; blocks: StageBlock[] }): StudentStage => ({
  id: newId(),
  kind: 'lesson',
  lock: 'auto',
  xpReward: 10,
  ...over,
});

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    key: 'study_practice',
    label: 'Vocabulary: Study + Practice',
    detail: 'word cards, then a practice round',
    icon: 'book',
    requires: 'vocab',
    build: () => stageFrom({
      title: 'Vocabulary', icon: 'book',
      blocks: [leadIn('FOCUS_CARDS', 'New Vocabulary'), round('GAME_ARENA', 'Practice', 'PRACTICE')],
    }),
  },
  {
    key: 'story',
    label: 'Story Reading',
    detail: 'read-along story node',
    icon: 'book',
    requires: 'story',
    build: () => stageFrom({
      title: 'Story', icon: 'book',
      blocks: [{ id: newId(), type: 'STORY_STAGE', title: 'Story', duration: 480, data: {} }],
    }),
  },
  {
    key: 'practice',
    label: 'Practice Round',
    detail: 'mixed exercises, weakest-first',
    icon: 'activity',
    build: () => stageFrom({
      title: 'Practice', icon: 'activity',
      blocks: [round('GAME_ARENA', 'Practice', 'PRACTICE')],
    }),
  },
  {
    key: 'listening',
    label: 'Listening Round',
    detail: 'listen-and-choose drills',
    icon: 'headphones',
    build: () => stageFrom({
      title: 'Listening', icon: 'headphones',
      blocks: [round('SOUND_LAB', 'Listening', 'PRACTICE')],
    }),
  },
  {
    key: 'speaking',
    label: 'Speaking Round',
    detail: 'say-it-out-loud drills',
    icon: 'mic',
    requires: 'vocab',
    build: () => stageFrom({
      title: 'Speaking', icon: 'mic',
      blocks: [round('SPEAKING', 'Speaking', 'PRACTICE')],
    }),
  },
  {
    key: 'grammar',
    label: 'Grammar Round',
    detail: 'grammar practice battery',
    icon: 'puzzle',
    build: () => stageFrom({
      title: 'Grammar', icon: 'puzzle',
      blocks: [round('GRAMMAR_LAB', 'Grammar', 'PRACTICE')],
    }),
  },
  {
    key: 'spelling',
    label: 'Spelling Bee',
    detail: 'type the word rounds',
    icon: 'spellcheck',
    requires: 'vocab',
    build: () => stageFrom({
      title: 'Spelling Bee', icon: 'spellcheck',
      blocks: [round('SPELLING_BEE', 'Spelling Bee', 'PRACTICE', { wordsPerTurn: 5, timerSeconds: 15, letterRemoval: true })],
    }),
  },
  {
    key: 'fastvocab',
    label: 'Fast Vocab',
    detail: 'match + speed recall',
    icon: 'gauge',
    requires: 'vocab',
    build: () => stageFrom({
      title: 'Fast Vocab', icon: 'gauge',
      blocks: [round('FAST_VOCAB', 'Fast Vocab', 'PRACTICE', { waveSize: 3 })],
    }),
  },
  {
    key: 'phonics',
    label: 'Phonics',
    detail: 'hear → say drills',
    icon: 'mic',
    requires: 'vocab',
    build: () => stageFrom({
      title: 'Phonics', icon: 'mic',
      blocks: [round('PHONICS_ARENA', 'Phonics', 'PRACTICE')],
    }),
  },
  {
    key: 'quiz',
    label: 'Speed Quiz (Assessment)',
    detail: 'graded mixed battery',
    icon: 'zap',
    build: () => stageFrom({
      title: 'Speed Quiz', icon: 'zap', xpReward: 15,
      blocks: [round('SPEED_QUIZ', 'Speed Quiz', 'ASSESS')],
    }),
  },
  {
    key: 'review',
    label: 'Unit Review',
    detail: 'mixed round over the whole unit',
    icon: 'trophy',
    build: () => stageFrom({
      title: 'Unit Review', icon: 'trophy', kind: 'review', xpReward: 15,
      blocks: [round('UNIT_REVIEW', 'Unit Review', 'ASSESS', { review: true })],
    }),
  },
];

// Lead-ins attach INSIDE the selected node (Duolingo-style: present, then drill).
const LEAD_IN_TEMPLATES = [
  { key: 'focus', label: 'Word study cards', type: 'FOCUS_CARDS', icon: <ImageIcon size={14} /> },
  { key: 'media', label: 'Song / video', type: 'MEDIA_PLAYER', icon: <Music size={14} /> },
  { key: 'intro', label: 'Intro splash', type: 'INTRO_SPLASH', icon: <Layers size={14} /> },
];

const LOCK_OPTIONS: { value: StageLock; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'auto', label: 'Auto', icon: <RefreshCw size={13} />, hint: 'Unlocks when the previous node is completed' },
  { value: 'locked', label: 'Locked', icon: <Lock size={13} />, hint: 'Stays closed for students even in sequence — also blocks the nodes after it' },
  { value: 'open', label: 'Open', icon: <Unlock size={13} />, hint: 'Playable immediately (skip ahead)' },
];

const StudentPathComposer: React.FC<PathComposerProps> = ({ unitId, unit, onPathSaved }) => {
  const [stages, setStages] = useState<StudentStage[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [bundle, setBundle] = useState<any | null>(null);

  const idSeq = useRef(0);

  // Hydrate from units.student_path.
  useEffect(() => {
    const saved = Array.isArray(unit?.student_path) ? unit.student_path : [];
    const next: StudentStage[] = saved
      .filter((s: any) => s && s.id)
      .map((s: any) => ({
        id: String(s.id),
        title: s.title || 'Lesson',
        icon: s.icon || 'star',
        kind: s.kind === 'review' ? 'review' : 'lesson',
        lock: s.lock === 'locked' || s.lock === 'open' ? s.lock : 'auto',
        xpReward: typeof s.xpReward === 'number' ? s.xpReward : 10,
        blocks: Array.isArray(s.blocks) ? s.blocks : [],
      }));
    setStages(next);
    setActiveStageId(next.length > 0 ? next[0].id : null);
  }, [unit?.id]);

  // Content signals for template gating (same read contract as PlanComposer).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (!cancelled && data) setBundle(data);
      } catch { /* fall back to manifest signals */ }
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  const hasVocab = useMemo(() => {
    const vi = bundle?.vocabulary_items;
    if (Array.isArray(vi) && vi.length > 0) return true;
    const ec = unit?.manifest?.enriched_content;
    return Array.isArray(ec?.vocabulary) && ec.vocabulary.length > 0;
  }, [bundle, unit?.manifest]);

  const hasStory = useMemo(() => {
    const sp = bundle?.story_pages;
    if (Array.isArray(sp) && sp.length > 0) return true;
    const ec = unit?.manifest?.enriched_content;
    return Array.isArray(ec?.story?.pages) && ec.story.pages.length > 0;
  }, [bundle, unit?.manifest]);

  const templateAvailable = (t: NodeTemplate) =>
    t.requires !== 'vocab' && t.requires !== 'story'
      ? true
      : t.requires === 'vocab' ? hasVocab : hasStory;

  // "In path" detection — how many path nodes match each template. Signature-
  // based (the template's characteristic block types), so it also lights up
  // for auto-built/derived paths, not just template-added nodes. Study+Practice
  // vs Practice disambiguate on the FOCUS_CARDS lead-in.
  const countInPath = (t: NodeTemplate): number =>
    stages.filter((s) => {
      const hasType = (type: string) => s.blocks.some((b) => b.type === type);
      const hasFocusCards = hasType('FOCUS_CARDS');
      switch (t.key) {
        case 'review': return s.kind === 'review' || hasType('UNIT_REVIEW');
        case 'study_practice': return hasFocusCards && s.blocks.length > 1;
        case 'story': return hasType('STORY_STAGE');
        case 'practice': return hasType('GAME_ARENA') && !hasFocusCards;
        case 'listening': return hasType('SOUND_LAB');
        case 'speaking': return hasType('SPEAKING');
        case 'grammar': return hasType('GRAMMAR_LAB');
        case 'spelling': return hasType('SPELLING_BEE');
        case 'fastvocab': return hasType('FAST_VOCAB');
        case 'phonics': return hasType('PHONICS_ARENA');
        case 'quiz': return hasType('SPEED_QUIZ');
        default: return false;
      }
    }).length;

  const activeStage = stages.find((s) => s.id === activeStageId) || null;
  const hasReview = stages.some((s) => s.kind === 'review');

  const addNode = (t: NodeTemplate) => {
    const stage = t.build();
    setStages((prev) => [...prev, stage]);
    setActiveStageId(stage.id);
  };

  const updateStage = (id: string, updates: Partial<StudentStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
    setActiveStageId((cur) => (cur === id ? null : cur));
  };

  const addLeadIn = (type: string, label: string) => {
    if (!activeStage) return;
    const block = leadIn(type, label);
    updateStage(activeStage.id, { blocks: [block, ...activeStage.blocks] });
  };

  const removeBlock = (stageId: string, blockId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    updateStage(stageId, { blocks: stage.blocks.filter((b) => b.id !== blockId) });
  };

  const updateBlockData = (stageId: string, blockId: string, data: any) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    updateStage(stageId, {
      blocks: stage.blocks.map((b) => (b.id === blockId ? { ...b, data: { ...b.data, ...data } } : b)),
    });
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.droppableId !== 'path-timeline') return;
    if (source.index === destination.index) return;
    setStages((prev) => {
      const items = Array.from(prev);
      const [moved] = items.splice(source.index, 1);
      items.splice(destination.index, 0, moved);
      return items;
    });
  };

  // Build the default path from the unit's existing lesson flow (same
  // deriver the student app uses when no path is saved — stage ids match,
  // so existing student progress carries over).
  const autoBuild = () => {
    setBuilding(true);
    try {
      const path = deriveDefaultPath(unit);
      setStages(path);
      setActiveStageId(path[0]?.id || null);
      toast.success(`Auto-built a ${path.length}-node path from the lesson plan`);
    } finally {
      setBuilding(false);
    }
  };

  const savePath = async () => {
    if (stages.some((s) => s.blocks.length === 0)) {
      toast.error('Every node needs at least one block — add a round or remove the empty node');
      return;
    }
    setSaving(true);
    try {
      await Engine.updateUnit(unitId, { studentPath: stages } as any);
      onPathSaved?.(stages);
      toast.success('Student path saved');
    } catch (err: any) {
      toast.error(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Library — node templates */}
      <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto shrink-0">
        <div className="p-5">
          <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-1">Add a node</h3>
          <p className="text-[11px] text-slate-400 mb-4">Each node is one step on the student's path: optional lead-ins + one scored round.</p>
          <div className="space-y-2">
            {NODE_TEMPLATES.map((t) => {
              const available = templateAvailable(t);
              const inPathCount = countInPath(t);
              const inPath = inPathCount > 0;
              return (
                <button
                  key={t.key}
                  onClick={() => available && addNode(t)}
                  disabled={!available}
                  title={available ? (inPath ? `${inPathCount} matching node${inPathCount === 1 ? '' : 's'} already on the path — click to add another` : undefined) : 'This unit has no matching content yet'}
                  className={`w-full bg-white p-3 rounded-xl border shadow-sm transition-all flex items-center gap-3 text-left group disabled:opacity-40 disabled:cursor-not-allowed ${
                    inPath
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-slate-200 hover:border-emerald-300 hover:shadow'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${inPath ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                    <StageIcon icon={t.icon} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-700 truncate">{t.label}</div>
                    <div className="text-[11px] text-slate-400">{t.detail}</div>
                  </div>
                  {inPath ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shrink-0">
                      {inPathCount > 1 ? `In path ×${inPathCount}` : 'In path'}
                    </span>
                  ) : (
                    <Plus size={16} className="text-slate-300 group-hover:text-emerald-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={autoBuild}
            disabled={building}
            className="mt-5 w-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold py-2.5 rounded-xl text-xs hover:bg-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {building ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Auto-build from lesson plan
          </button>
        </div>
      </div>

      {/* Timeline — the path preview */}
      <div className="flex-1 bg-slate-100 overflow-y-auto relative">
        <div className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur px-8 pt-4 pb-2 flex items-center justify-between max-w-3xl mx-auto">
          <p className="text-sm text-slate-500">
            {stages.length} node{stages.length === 1 ? '' : 's'}
            {!hasReview && stages.length > 0 && <span className="text-amber-600 font-medium"> · no unit review</span>}
          </p>
          <button
            onClick={savePath}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save path
          </button>
        </div>

        <div className="px-8 pb-10 relative">
          <div className="absolute top-0 bottom-0 left-[3.25rem] w-0.5 bg-slate-300 z-0" />
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="path-timeline">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4 max-w-2xl mx-auto pt-4">
                  {stages.map((stage, i) => (
                    <Draggable key={stage.id} draggableId={stage.id} index={i}>
                      {(prov, snapshot) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          onClick={() => setActiveStageId(stage.id)}
                          className={`relative z-10 cursor-pointer group ${snapshot.isDragging ? 'opacity-80 scale-[1.02]' : ''}`}
                        >
                          <div className="absolute -left-9 top-4 w-7 h-7 bg-white border-4 border-emerald-500 rounded-full flex items-center justify-center font-bold text-[10px] text-emerald-700 z-20">
                            {i + 1}
                          </div>
                          <div {...prov.dragHandleProps} className="absolute right-2 top-2 text-slate-300 opacity-0 group-hover:opacity-100">
                            <GripVertical size={14} />
                          </div>
                          <div className={`bg-white p-4 rounded-2xl border-2 transition-all shadow-sm ${activeStageId === stage.id ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-transparent hover:border-slate-300'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 rounded-xl shrink-0 ${stage.lock === 'locked' ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-600'}`}>
                                <StageIcon icon={stage.icon} size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-slate-800 truncate">{stage.title}</h3>
                                  {stage.kind === 'review' && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Review</span>
                                  )}
                                  {stage.lock === 'locked' && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Lock size={9} /> Locked</span>
                                  )}
                                  {stage.lock === 'open' && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Unlock size={9} /> Open</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {stage.blocks.map((b) => (
                                    <span key={b.id} className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                                      {b.type.replace(/_/g, ' ').toLowerCase()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeStage(stage.id); }}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                title="Remove node"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {stages.length === 0 && (
                    <div className="text-center text-slate-400 py-16">
                      <Layers size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No path yet. Add nodes from the library, or Auto-build from the lesson plan.</p>
                      <p className="text-xs mt-2 text-slate-400">Until you save a path, students play an automatically derived one.</p>
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {/* Inspector — node settings */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        {activeStage ? (
          <div className="p-6 space-y-5">
            <h3 className="font-bold text-slate-800 text-lg">Edit node</h3>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
              <input
                value={activeStage.title}
                onChange={(e) => updateStage(activeStage.id, { title: e.target.value })}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Icon</label>
              <div className="grid grid-cols-5 gap-2">
                {stageIconKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => updateStage(activeStage.id, { icon: key })}
                    title={key}
                    className={`p-2.5 rounded-xl border-2 flex items-center justify-center transition-colors ${
                      activeStage.icon === key
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <StageIcon icon={key} size={18} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Unlock rule</label>
              <div className="space-y-2">
                {LOCK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateStage(activeStage.id, { lock: opt.value })}
                    title={opt.hint}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                      activeStage.lock === opt.value
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={activeStage.lock === opt.value ? 'text-emerald-600' : 'text-slate-400'}>{opt.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-slate-700">{opt.label}</span>
                      <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">XP bonus on completion</label>
              <input
                type="number"
                min={0}
                max={50}
                value={activeStage.xpReward ?? 10}
                onChange={(e) => updateStage(activeStage.id, { xpReward: Math.max(0, Math.min(50, parseInt(e.target.value || '0', 10))) })}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Blocks in this node</label>
              <div className="space-y-2">
                {activeStage.blocks.map((b) => (
                  <div key={b.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{b.type.replace(/_/g, ' ')}</div>
                        <div className="text-sm font-bold text-slate-700 truncate">{b.title}</div>
                      </div>
                      <button
                        onClick={() => removeBlock(activeStage.id, b.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 rounded"
                        title="Remove block"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {b.type === 'FAST_VOCAB' && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Wave size:
                        <select
                          value={String(b.data?.waveSize ?? 3)}
                          onChange={(e) => updateBlockData(activeStage.id, b.id, { waveSize: parseInt(e.target.value, 10) })}
                          className="ml-2 p-1 border border-slate-200 rounded bg-white font-bold"
                        >
                          <option value="3">3 pairs</option>
                          <option value="5">5 pairs</option>
                        </select>
                      </div>
                    )}
                    {b.type === 'SPELLING_BEE' && (
                      <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-2">
                        Words:
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={Number(b.data?.wordsPerTurn) || 5}
                          onChange={(e) => updateBlockData(activeStage.id, b.id, { wordsPerTurn: Math.max(1, Math.min(20, parseInt(e.target.value || '5', 10))) })}
                          className="w-14 p-1 border border-slate-200 rounded bg-white font-bold text-center"
                        />
                        sec/word:
                        <select
                          value={String(b.data?.timerSeconds ?? 15)}
                          onChange={(e) => updateBlockData(activeStage.id, b.id, { timerSeconds: parseInt(e.target.value, 10) })}
                          className="p-1 border border-slate-200 rounded bg-white font-bold"
                        >
                          <option value="0">off</option>
                          <option value="10">10</option>
                          <option value="15">15</option>
                          <option value="20">20</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {LEAD_IN_TEMPLATES.map((li) => (
                  <button
                    key={li.key}
                    onClick={() => addLeadIn(li.type, li.label)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                  >
                    {li.icon} add {li.label.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
            <Layers size={40} className="mb-3 opacity-20" />
            <p className="text-sm">Select a node to edit</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentPathComposer;
