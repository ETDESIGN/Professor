import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { Engine } from '../services/SupabaseService';
import { toast } from 'sonner';

/**
 * useUnitStudioStore — Phase 2 unification keystone (Task 08).
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this store, unit editing was fragmented across 3+ independent state
 * owners (UnitContentVault's local useState, PlanComposer's local state,
 * AssetWorkshop's useEnrichment), each with its OWN save path. The advisor's
 * Phase 2 exit criterion was "one component, one data contract, one save path."
 * This store IS that one data contract: it owns the in-memory editable unit
 * (loaded once from Engine + the relational tables), exposes per-category
 * setters that mark the store dirty, and a single `save()` that persists ALL
 * dirty categories + triggers reconciliation in one action.
 *
 * The editor sub-tabs (Vocabulary/Grammar/Story/Dialogue/Media/Settings) and
 * PlanComposer become PRESENTATIONAL — they read/write the store, they don't
 * own save. The [Save] button in the Unit Studio header calls `store.save()`.
 *
 * SHAPE
 * -----
 * `unit` is the LessonUnit row (id, title, manifest, flow, status...). The
 * content categories (vocabulary/grammar/storyPages/questions/...) are kept as
 * flat editable arrays mirroring the editor's existing interfaces so the
 * re-wire (Batch 2 tasks 09-13) is mechanical: `useState<X[]>([])` →
 * `const [x, setX] = useUnitStudioStore(s => [s.vocabulary, s.setVocabulary])`.
 *
 * SAVE
 * ----
 * `save()` replicates UnitContentVault's proven save logic EXACTLY (manifest +
 * flow bridge writes + per-category relational writes + reconciliation), so
 * behavior is preserved. Categories are written only if dirty (the `dirty` set)
 * — a single vocab edit doesn't rewrite story_pages. Reconciliation (re-run
 * generate-exercises) fires once at the end if any pool-affecting category
 * (vocab/grammar/story/dialogue) was dirty.
 *
 * NOT IN SCOPE (handled elsewhere)
 * --------------------------------
 * - Loading the relational bundle / attaching `_relational` for normalizers —
 *   that stays in SessionContext/SoloSessionContext (it's a playback concern).
 *   This store loads the EDIT-time view (relational tables directly).
 * - Live-session snapshot policy — the store is edit-time only.
 */

// ---- Editor-facing content shapes (mirror UnitContentVault's interfaces) ----
// Exported so sub-tab components share one source of truth for types.
export interface VocabItem {
  word: string;
  definition: string;
  context_sentence: string;
  distractors: string[];
  image_url?: string;
  audio_url?: string;
  /** F2: the vocabulary series this word belongs to (vocabulary_items.set_label). */
  set_label?: string | null;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correct: string;
  image?: string;
}

export interface StoryPage {
  id: string;
  text: string;
  speaker?: string;
  speakerEmoji?: string;
  imageUrl?: string;
}

export interface GrammarRule {
  rule: string;
  explanation: string;
  world_examples: string[];
}

type Category = 'vocabulary' | 'grammar' | 'story' | 'questions' | 'dialogue' | 'media' | 'settings';

interface UnitStudioState {
  // ---- identity / lifecycle ----
  unitId: string | null;
  unit: any | null;            // the LessonUnit row (manifest, flow, title, status...)
  loading: boolean;
  saving: boolean;
  error: string | null;

  // ---- editable content (the editor sub-tabs read/write these) ----
  vocabulary: VocabItem[];
  questions: QuizQuestion[];
  storyPages: StoryPage[];
  grammarRules: GrammarRule[];
  mediaStep: any | null;
  manifest: any;               // raw manifest (meta/theme_context edited in Settings)

  // ---- dirty tracking ----
  dirty: Set<Category>;

  // ---- actions ----
  load: (unitId: string) => Promise<void>;
  reset: () => void;

  // Per-category setters (each marks the category dirty).
  setVocabulary: (v: VocabItem[] | ((prev: VocabItem[]) => VocabItem[])) => void;
  setQuestions: (q: QuizQuestion[] | ((prev: QuizQuestion[]) => QuizQuestion[])) => void;
  setStoryPages: (p: StoryPage[] | ((prev: StoryPage[]) => StoryPage[])) => void;
  setGrammarRules: (g: GrammarRule[] | ((prev: GrammarRule[]) => GrammarRule[])) => void;
  setMediaStep: (m: any | null) => void;
  setManifest: (m: any | ((prev: any) => any)) => void;

  // Single save: persists all dirty categories + reconciles. Returns success.
  save: () => Promise<boolean>;
}

// ---- helpers ----
const resolveUpdater = <T,>(v: T | ((prev: T) => T), prev: T): T =>
  typeof v === 'function' ? (v as (p: T) => T)(prev) : v;

export const useUnitStudioStore = create<UnitStudioState>()((set, get) => ({
  unitId: null,
  unit: null,
  loading: false,
  saving: false,
  error: null,

  vocabulary: [],
  questions: [],
  storyPages: [],
  grammarRules: [],
  mediaStep: null,
  manifest: {},

  dirty: new Set<Category>(),

  load: async (unitId: string) => {
    if (!unitId) return;
    set({ loading: true, error: null, unitId });
    try {
      const u = await Engine.getUnitById(unitId);
      if (!u) {
        set({ loading: false, error: 'Unit not found' });
        return;
      }
      // Load relational content (mirror UnitContentVault's load). The manifest
      // is the seed; relational tables override when populated.
      const manifest: any = u.manifest || {};
      const { data: vocabRows } = await supabase.from('vocabulary_items').select('*').eq('unit_id', unitId).order('order_index', { ascending: true });
      const vocabulary: VocabItem[] = (vocabRows && vocabRows.length > 0 ? vocabRows : (manifest?.enriched_content?.vocabulary || [])).map((v: any) => ({
        word: v.word || '',
        definition: v.definition || '',
        context_sentence: v.example_sentence || v.context_sentence || '',
        distractors: v.distractors || [],
        image_url: v.image_url,
        audio_url: v.audio_url,
      }));
      const { data: grammarRows } = await supabase.from('grammar_rules').select('*').eq('unit_id', unitId).order('order_index', { ascending: true });
      const grammarRules: GrammarRule[] = (grammarRows && grammarRows.length > 0 ? grammarRows : (manifest?.enriched_content?.grammar || [])).map((g: any) => ({
        rule: g.rule || '',
        explanation: g.explanation || '',
        world_examples: g.examples || g.world_examples || [],
      }));
      const { data: pageRows } = await supabase.from('story_pages').select('*').eq('unit_id', unitId).order('page_number', { ascending: true });
      // Task 13 fix: story_pages has no image_url column — resolve generated
      // scenes via image_asset_id → assets.public_url (one batched .in() query,
      // empty-safe; same pattern as CharacterService.attachPortraitUrls).
      // Falls back to a legacy manifest image_url for manifest-seeded pages.
      const sceneAssetIds = ((pageRows || []) as any[]).map((p) => p.image_asset_id).filter((v): v is string => Boolean(v));
      let sceneUrlByAssetId = new Map<string, string>();
      if (sceneAssetIds.length > 0) {
        const { data: sceneAssets } = await supabase.from('assets').select('id, public_url').in('id', sceneAssetIds);
        sceneUrlByAssetId = new Map(((sceneAssets || []) as any[]).map((a) => [a.id, a.public_url] as [string, string]));
      }
      const storyPages: StoryPage[] = (pageRows && pageRows.length > 0 ? pageRows : (manifest?.enriched_content?.story?.pages || [])).map((p: any, i: number) => ({
        id: p.id || `p_${i}`,
        text: p.text || '',
        speaker: p.speaker || p.speaker_override_name,
        imageUrl: sceneUrlByAssetId.get(p.image_asset_id) || p.image_url,
      }));

      set({
        unit: u, manifest, vocabulary, grammarRules, storyPages,
        loading: false, error: null, dirty: new Set(),
      });
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Failed to load unit' });
    }
  },

  reset: () => set({
    unitId: null, unit: null, loading: false, saving: false, error: null,
    vocabulary: [], questions: [], storyPages: [], grammarRules: [], mediaStep: null,
    manifest: {}, dirty: new Set(),
  }),

  setVocabulary: (v) => set((s) => ({ vocabulary: resolveUpdater(v, s.vocabulary), dirty: new Set(s.dirty).add('vocabulary') })),
  setQuestions: (q) => set((s) => ({ questions: resolveUpdater(q, s.questions), dirty: new Set(s.dirty).add('questions') })),
  setStoryPages: (p) => set((s) => ({ storyPages: resolveUpdater(p, s.storyPages), dirty: new Set(s.dirty).add('story') })),
  setGrammarRules: (g) => set((s) => ({ grammarRules: resolveUpdater(g, s.grammarRules), dirty: new Set(s.dirty).add('grammar') })),
  setMediaStep: (m) => set((s) => ({ mediaStep: m, dirty: new Set(s.dirty).add('media') })),
  setManifest: (m) => set((s) => ({ manifest: resolveUpdater(m, s.manifest), dirty: new Set(s.dirty).add('settings') })),

  save: async () => {
    const { unitId, manifest, vocabulary, questions, storyPages, grammarRules, mediaStep, dirty, unit } = get();
    if (!unitId) return false;
    if (dirty.size === 0) {
      toast.success('Nothing to save');
      return true;
    }
    set({ saving: true });
    try {
      const flow = unit?.flow || [];
      const updatedManifest = { ...manifest };
      // Keep the legacy knowledge_graph projection in sync for unmigrated readers.
      if (dirty.has('vocabulary') || dirty.has('grammar')) {
        updatedManifest.knowledge_graph = {
          ...(updatedManifest.knowledge_graph || {}),
          ...(dirty.has('vocabulary') ? { vocabulary } : {}),
          ...(dirty.has('grammar') ? { grammar_rules: grammarRules } : {}),
        };
      }

      // Flow bridge writes (FOCUS_CARDS / GAME_ARENA / GRAMMAR_SANDBOX / MEDIA_PLAYER).
      // STORY_STAGE bridge intentionally omitted (C.4 — story is canonical in story_pages).
      const updatedFlow = flow.map((step: any) => {
        if (step.type === 'FOCUS_CARDS' && (dirty.has('vocabulary'))) {
          return { ...step, data: { ...step.data, cards: vocabulary.map((v, i) => ({
            id: `c_${i}`, front: v.word, back: v.word,
            pronunciation: `/${v.word.toLowerCase()}/`,
            image: v.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word)}`,
            context_sentence: v.context_sentence, definition: v.definition,
            audioUrl: v.audio_url || ''
          }))}};
        }
        if ((step.type === 'GAME_ARENA' || step.type === 'SPEED_QUIZ' || step.type === 'TEAM_BATTLE') && dirty.has('questions')) {
          return { ...step, data: { ...step.data, questions } };
        }
        if (step.type === 'GRAMMAR_SANDBOX' && dirty.has('grammar')) {
          return { ...step, data: { ...step.data, rule: grammarRules[0]?.rule || '', explanation: grammarRules[0]?.explanation || '', examples: grammarRules[0]?.world_examples || [] } };
        }
        if (step.type === 'MEDIA_PLAYER' && dirty.has('media')) {
          return { ...step, data: { ...(mediaStep || {}), title: `${manifest?.meta?.theme || 'Lesson'} Warm Up` } };
        }
        return step;
      });

      await Engine.updateUnit(unitId, { manifest: updatedManifest, flow: updatedFlow } as any);

      // ---- Per-category relational writes (only if dirty) ----
      // Each mirrors UnitContentVault's preserve-then-replace pattern so
      // generated fields the editor doesn't expose are kept.
      if (dirty.has('vocabulary')) {
        try {
          const { data: existingVocab } = await supabase.from('vocabulary_items').select('*').eq('unit_id', unitId);
          const preserveByWord = new Map<string, any>((existingVocab || []).map((v: any) => [v.word, v]));
          await supabase.from('vocabulary_items').delete().eq('unit_id', unitId);
          const rows = vocabulary.filter((v) => v.word && v.word.trim()).map((v, i) => {
            const p = preserveByWord.get(v.word) || {};
            return {
              unit_id: unitId, order_index: i, word: v.word,
              definition: v.definition || null,
              example_sentence: v.context_sentence || null,
              l1_translation: p.l1_translation ?? null, phonetic: p.phonetic ?? null,
              part_of_speech: p.part_of_speech ?? null, image_prompt: p.image_prompt ?? null,
              image_url: v.image_url || p.image_url || null, audio_url: v.audio_url || p.audio_url || null,
              example_audio_url: p.example_audio_url ?? null,
              distractors: v.distractors || [], confusables: p.confusables ?? [],
              set_label: v.set_label ?? p.set_label ?? null, // F2: series identity must survive saves
            };
          });
          if (rows.length > 0) await supabase.from('vocabulary_items').insert(rows);
        } catch (err: any) { console.warn('vocab_relational_write_failed', err?.message); }
      }

      if (dirty.has('grammar')) {
        try {
          const { data: existingRules } = await supabase.from('grammar_rules').select('rule, pattern_template, transformation_pairs, error_examples').eq('unit_id', unitId);
          const preserveMap = new Map<string, any>((existingRules || []).map((r: any) => [r.rule, r]));
          await supabase.from('grammar_rules').delete().eq('unit_id', unitId);
          const rows = grammarRules.filter((g) => g.rule && g.rule.trim()).map((g, i) => {
            const p = preserveMap.get(g.rule) || {};
            return {
              unit_id: unitId, order_index: i, rule: g.rule,
              explanation: g.explanation || null, examples: g.world_examples || [],
              pattern_template: p.pattern_template ?? null,
              transformation_pairs: p.transformation_pairs ?? [],
              error_examples: p.error_examples ?? [],
            };
          });
          if (rows.length > 0) await supabase.from('grammar_rules').insert(rows);
        } catch (err: any) { console.warn('grammar_relational_write_failed', err?.message); }
      }

      if (dirty.has('story')) {
        try {
          const { data: existingPages } = await supabase.from('story_pages').select('*').eq('unit_id', unitId);
          const preserveByNum = new Map<number, any>((existingPages || []).map((p: any) => [p.page_number, p]));
          await supabase.from('story_pages').delete().eq('unit_id', unitId);
          const rows = storyPages.map((p, i) => {
            const preserved = preserveByNum.get(i) || {};
            const speakerName = p.speaker || null;
            return {
              unit_id: unitId, page_number: i, text: p.text || '', speaker: speakerName,
              speaker_character_id: preserved.speaker_character_id ?? null,
              speaker_override_name: preserved.speaker_character_id ? (preserved.speaker_override_name ?? null) : (speakerName ?? null),
              image_prompt: preserved.image_prompt ?? null,
              image_asset_id: preserved.image_asset_id ?? null,
              audio_asset_id: preserved.audio_asset_id ?? null,
            };
          });
          if (rows.length > 0) await supabase.from('story_pages').insert(rows);
        } catch (err: any) { console.warn('story_relational_write_failed', err?.message); }
      }

      // ---- Reconciliation: re-run generate-exercises if any pool-affecting
      // category was dirty, so edits propagate to pool_items (Phase 1.7). ----
      const poolAffected = dirty.has('vocabulary') || dirty.has('grammar') || dirty.has('story') || dirty.has('dialogue');
      if (poolAffected) {
        try {
          const { error: genErr } = await supabase.functions.invoke('generate-exercises', { body: { unitId } });
          if (genErr) throw genErr;
          toast.success('Unit saved — exercises refreshed');
        } catch (genErr: any) {
          console.warn('reconcile_exercises_failed', genErr?.message);
          toast.warning('Unit saved, but the exercise refresh failed — exercises may be stale');
        }
      } else {
        toast.success('Unit saved');
      }

      // Reload the unit so the in-memory state reflects what was persisted
      // (preserves generated fields the editor doesn't show).
      await get().load(unitId);
      return true;
    } catch (err: any) {
      toast.error('Save failed: ' + err.message);
      return false;
    } finally {
      set({ saving: false });
    }
  },
}));
