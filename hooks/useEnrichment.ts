import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from '../services/logger';

const log = createClientLogger('useEnrichment');

export type EnrichCategory =
  | 'vocabulary' | 'grammar' | 'characters' | 'story' | 'songs' | 'videos' | 'dialogues';

export interface EnrichedItem {
  [key: string]: any;
  _approved?: boolean;
  _regenerating?: boolean;
}

export interface EnrichedManifest {
  title: string;
  topic: string;
  gradeLevel: string;
  description: string;
  vocabulary: EnrichedItem[];
  grammar: EnrichedItem[];
  characters: EnrichedItem[];
  story: { title: string; setting: string; pages: EnrichedItem[] };
  song_suggestions: EnrichedItem[];
  video_suggestions: EnrichedItem[];
  dialogues: EnrichedItem[];
}

/** Natural key per category — used for the durable review-status table. */
export const contentIdFor = (category: string, item: any, index: number): string => {
  switch (category) {
    case 'vocabulary': return String(item?.word || `idx_${index}`);
    case 'grammar': return String(item?.rule || `idx_${index}`);
    case 'characters': return String(item?.id || item?.name || `idx_${index}`);
    case 'songs':
    case 'videos':
    case 'dialogues': return String(item?.title || `idx_${index}`);
    case 'story': return String(index);
    default: return String(index);
  }
};

/**
 * Shared enrichment engine (C.2). Extracted from AssetWorkshop so the same
 * enrich → merge → background-media pipeline can drive both the post-upload
 * review flow (AssetWorkshop) and a future Studio "re-enrich category" action,
 * instead of being duplicated. Owns: the enriched manifest state, per-category
 * loading flags, durable-review rehydration on load, and the background AI-image
 * generator. Approval UI (toggle/approve-all/reject-all) stays with the caller.
 */
export function useEnrichment(unitId: string, options?: { autoLoad?: boolean }) {
  // autoLoad (default true) drives the AssetWorkshop post-upload flow: load
  // existing enrichment and re-enrich empty categories on mount. The Studio
  // Content tab passes autoLoad:false so opening it never regenerates content —
  // it only re-enriches on an explicit button press via handleEnrichCategories.
  const autoLoad = options?.autoLoad !== false;
  const [enriched, setEnriched] = useState<EnrichedManifest | null>(null);
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaProgress, setMediaProgress] = useState({ generating: false, total: 0, done: 0 });

  const ensureApprovalStates = (data: any): EnrichedManifest => {
    const patch = (arr: any[]) => arr.map((item: any) => ({ ...item, _approved: item._approved !== false }));
    return {
      title: data.title || '',
      topic: data.topic || '',
      gradeLevel: data.gradeLevel || 'A1',
      description: data.description || '',
      vocabulary: patch(data.vocabulary || []),
      grammar: patch(data.grammar || []),
      characters: patch(data.characters || []),
      story: {
        title: data.story?.title || '',
        setting: data.story?.setting || '',
        pages: patch(data.story?.pages || []),
      },
      song_suggestions: patch(data.song_suggestions || []),
      video_suggestions: patch(data.video_suggestions || []),
      dialogues: patch(data.dialogues || []),
    };
  };

  // Rehydrate persisted approvals (content_review_status) onto a freshly-loaded
  // manifest (C.1 durable review state).
  const applyPersistedReviews = useCallback(async (data: EnrichedManifest): Promise<EnrichedManifest> => {
    try {
      const { data: rows } = await supabase
        .from('content_review_status')
        .select('content_type, content_id, status')
        .eq('unit_id', unitId);
      if (!rows || rows.length === 0) return data;
      const statusMap = new Map<string, string>();
      for (const r of rows as any[]) statusMap.set(`${r.content_type}:${r.content_id}`, r.status);
      const apply = (category: string, arr: EnrichedItem[]) => arr.map((item, i) => {
        const st = statusMap.get(`${category}:${contentIdFor(category, item, i)}`);
        return st ? { ...item, _approved: st !== 'rejected' } : item;
      });
      return {
        ...data,
        vocabulary: apply('vocabulary', data.vocabulary),
        grammar: apply('grammar', data.grammar),
        characters: apply('characters', data.characters),
        story: { ...data.story, pages: apply('story', data.story.pages) },
        song_suggestions: apply('songs', data.song_suggestions),
        video_suggestions: apply('videos', data.video_suggestions),
        dialogues: apply('dialogues', data.dialogues),
      };
    } catch (err) {
      log.warn('load_review_failed', { error: err });
      return data;
    }
  }, [unitId]);

  const handleEnrichCategories = useCallback(async (categories: string[]) => {
    setLoadingCategories(prev => new Set([...prev, ...categories]));

    // Initialize empty manifest so the UI renders immediately.
    setEnriched(prev => prev || {
      title: 'Enriching...', topic: '', gradeLevel: 'A1', description: '',
      vocabulary: [], grammar: [], characters: [], story: { title: '', setting: '', pages: [] },
      song_suggestions: [], video_suggestions: [], dialogues: []
    } as any);

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      try {
        const { data, error } = await supabase.functions.invoke('enrich-unit', {
          body: { unitId, category },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data.error || `Enrichment failed for ${category}`);
        if (data?.enriched) {
          setEnriched(prev => {
            const patched = ensureApprovalStates(data.enriched);
            if (!prev) return patched;
            const merged = { ...prev };
            if (patched.title && patched.title !== 'Enriching...') merged.title = patched.title;
            if (patched.topic) merged.topic = patched.topic;
            if (patched.gradeLevel) merged.gradeLevel = patched.gradeLevel;
            if (patched.description) merged.description = patched.description;
            if (patched.vocabulary?.length > 0) merged.vocabulary = patched.vocabulary;
            if (patched.grammar?.length > 0) merged.grammar = patched.grammar;
            if (patched.characters?.length > 0) merged.characters = patched.characters;
            if (patched.story?.pages?.length > 0) merged.story = patched.story;
            if (patched.song_suggestions?.length > 0) merged.song_suggestions = patched.song_suggestions;
            if (patched.video_suggestions?.length > 0) merged.video_suggestions = patched.video_suggestions;
            if (patched.dialogues?.length > 0) merged.dialogues = patched.dialogues;
            return merged;
          });
        }
      } catch (err: any) {
        log.warn(`enrich_error_${category}`, { error: err?.message });
        toast.error(`Failed to load ${category}: ${err?.message || 'Unknown error'}`);
      } finally {
        setLoadingCategories(prev => {
          const next = new Set(prev);
          next.delete(category);
          return next;
        });
      }

      if (i < categories.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    toast.success('Content enrichment complete!');
  }, [unitId]);

  const handleEnrich = useCallback(async () => {
    setLoadError(null);
    const categories = ['vocabulary', 'grammar', 'characters', 'story', 'media', 'dialogues'];
    await handleEnrichCategories(categories);
  }, [handleEnrichCategories]);

  const loadExistingEnrichment = useCallback(async () => {
    try {
      const { data: unit, error } = await supabase
        .from('units')
        .select('manifest')
        .eq('id', unitId)
        .single();

      if (error) throw error;

      const existing = unit?.manifest?.enriched_content;
      if (existing) {
        setEnriched(await applyPersistedReviews(ensureApprovalStates(existing)));

        // Re-enrich only the empty categories.
        const emptyCategories: string[] = [];
        if (!existing.vocabulary?.length) emptyCategories.push('vocabulary');
        if (!existing.grammar?.length) emptyCategories.push('grammar');
        if (!existing.characters?.length) emptyCategories.push('characters');
        if (!existing.story?.pages?.length) emptyCategories.push('story');
        if (!existing.song_suggestions?.length) emptyCategories.push('media');
        if (!existing.dialogues?.length) emptyCategories.push('dialogues');

        if (emptyCategories.length > 0) {
          log.info('re_enriching_empty_categories', { metadata: { categories: emptyCategories } });
          await handleEnrichCategories(emptyCategories);
        }
        return;
      }

      await handleEnrich();
    } catch (err: any) {
      log.warn('load_enrichment_error', { error: err?.message });
      setLoadError('Failed to load unit data.');
    }
  }, [unitId, applyPersistedReviews, handleEnrichCategories, handleEnrich]);

  useEffect(() => {
    if (autoLoad) loadExistingEnrichment();
  }, [loadExistingEnrichment, autoLoad]);

  // Background Media Orchestrator — generates AI images for pending vocab/
  // characters one at a time, updating state + persisting to the manifest.
  useEffect(() => {
    if (!enriched) return;

    const pendingVocab = enriched.vocabulary.findIndex(v => v.image_status === 'pending');
    const pendingChar = enriched.characters.findIndex(c => c.image_status === 'pending');

    if (pendingVocab === -1 && pendingChar === -1) {
      if (mediaProgress.generating) setMediaProgress(prev => ({ ...prev, generating: false }));
      return;
    }

    if (!mediaProgress.generating) {
      const total = enriched.vocabulary.filter(v => v.image_status === 'pending').length +
                    enriched.characters.filter(c => c.image_status === 'pending').length;
      setMediaProgress({ generating: true, total, done: 0 });
    }

    const updatedArray = (arr: any[], idx: number, url: string) => {
      if (!arr) return arr;
      const copy = [...arr];
      if (copy[idx]) copy[idx] = { ...copy[idx], image_url: url, image_status: 'completed' };
      return copy;
    };

    const processNext = async () => {
      let category: 'vocabulary' | 'characters' = 'vocabulary';
      let index = pendingVocab;
      if (index === -1) {
        category = 'characters';
        index = pendingChar;
      }

      const item = category === 'vocabulary' ? enriched.vocabulary[index] : enriched.characters[index];
      const prompt = item.image_prompt || item.word || item.name;

      try {
        const { data, error } = await supabase.functions.invoke('generate-media', {
          body: { action: 'generate-image', unitId, prompt }
        });

        if (error) throw error;
        const newUrl = data?.url || item.image_url;

        setEnriched(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          updated[category] = [...updated[category]];
          updated[category][index] = { ...updated[category][index], image_url: newUrl, image_status: 'completed' };
          return updated;
        });

        setMediaProgress(prev => ({ ...prev, done: prev.done + 1 }));

        supabase.from('units').select('manifest').eq('id', unitId).single().then(({ data: unit }) => {
          if (unit?.manifest) {
            const newManifest = { ...unit.manifest };
            if (newManifest.enriched_content) {
              newManifest.enriched_content[category] = updatedArray(newManifest.enriched_content[category], index, newUrl);
              supabase.from('units').update({ manifest: newManifest }).eq('id', unitId).then();
            }
          }
        });
      } catch (err) {
        log.warn('media_gen_failed', { error: err });
        setEnriched(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          updated[category] = [...updated[category]];
          updated[category][index] = { ...updated[category][index], image_status: 'failed' };
          return updated;
        });
      }
    };

    const timer = setTimeout(() => processNext(), 1000);
    return () => clearTimeout(timer);
  }, [enriched?.vocabulary, enriched?.characters]);

  return {
    enriched,
    setEnriched,
    loadingCategories,
    loadError,
    mediaProgress,
    handleEnrich,
    handleEnrichCategories,
    reload: loadExistingEnrichment,
  };
}
