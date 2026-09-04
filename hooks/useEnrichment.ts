import { useState, useEffect, useCallback, useRef } from 'react';
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
        if (data?.success === false) {
          // FIXPLAN_F audit fix: the awaiting-confirmation gate is guidance,
          // not an error — point the teacher at the confirm step.
          if (data?.awaiting_confirmation) {
            toast.info('Scanned pages are waiting for your review. Confirm the extracted content first (green "Review extraction" button), then enrich.');
            continue;
          }
          throw new Error(data.error || `Enrichment failed for ${category}`);
        }
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

        // WS-C: surface content-presence honestly — a missing category becomes an
        // explicit notice instead of a silently empty card (never invent, never hide).
        if (data?.presence && typeof data.presence === 'object') {
          const label: Record<string, string> = {
            vocabulary: 'vocabulary', grammar: 'grammar', story: 'story',
            dialogues: 'dialogue', characters: 'characters',
          };
          for (const [cat, raw] of Object.entries(data.presence as Record<string, any>)) {
            const p = raw || {};
            const name = label[cat] || cat;
            if (p.status === 'no_source') {
              toast.info(`No ${name} detected in the uploaded pages — nothing to enrich.`);
            } else if (p.status === 'failed') {
              toast.warning(`${name[0].toUpperCase()}${name.slice(1)} enrichment returned nothing. Try re-enriching.`);
            } else if (p.status === 'partial' && (p.deferred ?? 0) > 0) {
              toast.info(`${name[0].toUpperCase()}${name.slice(1)}: enriched ${p.enriched_count}/${p.source_count}. Run again to pick up the rest.`);
            } else if (p.status === 'empty') {
              toast.info(`No ${name} detected or generated for this unit.`);
            }
          }
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
    }

    toast.success('Content enrichment complete!');
  }, [unitId]);

  const handleEnrich = useCallback(async () => {
    setLoadError(null);
    // FIXPLAN_F P2.3: basket-driven categories (doc 10 §4 stage 6): enrich
    // ONLY non-empty baskets — absence = absence, nothing is invented. Media
    // is always offered (the 1 song + 1 video suggestion is an explicit
    // product slot, doc 10 §5, teacher-removable). Legacy units (no
    // baskets) keep the full six-category set.
    let categories: string[] | null = null;
    try {
      const { data: baskets } = await supabase.rpc('get_unit_baskets', { p_unit_id: unitId });
      if (baskets && typeof baskets === 'object') {
        categories = [];
        if ((baskets.vocabulary || []).length > 0) categories.push('vocabulary');
        if ((baskets.grammar || []).length > 0) categories.push('grammar');
        if ((baskets.story?.passages || []).length > 0 || (baskets.story?.comics || []).length > 0) categories.push('story');
        if ((baskets.dialogues || []).length > 0) categories.push('dialogues');
        if ((baskets.character_appearances || []).length > 0) categories.push('characters');
        categories.push('media');
        // Preserve the canonical execution order.
        categories = ['vocabulary', 'grammar', 'characters', 'story', 'media', 'dialogues']
          .filter(c => categories!.includes(c));
      }
    } catch {
      /* baskets unavailable (pre-P2 schema) — fall through to the legacy set */
    }
    if (!categories) categories = ['vocabulary', 'grammar', 'characters', 'story', 'media', 'dialogues'];
    if (categories.length === 1 && categories[0] === 'media') {
      // Nothing in any basket except the media suggestion slot.
      toast.info('No vocabulary, grammar, story or dialogues were confirmed on these pages — only media suggestions will be added.');
    }
    await handleEnrichCategories(categories);
  }, [handleEnrichCategories, unitId]);

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
  // An item needs generation when its status is 'pending' OR its image is
  // still a placeholder (dicebear/empty). The second condition heals items
  // that a failed generation era marked 'ready'/'completed' with a fallback
  // URL — status alone would hide them from regeneration forever. 'failed'
  // items are excluded so the loop cannot spin on a persistently failing edge.
  const isPlaceholderImage = (url?: string) => !url || /dicebear\.com/i.test(url);
  const needsImage = (item: any) =>
    item?.image_status === 'pending' || (isPlaceholderImage(item?.image_url) && item?.image_status !== 'failed');
  useEffect(() => {
    if (!enriched) return;

    const pendingVocab = enriched.vocabulary.findIndex(needsImage);
    const pendingChar = enriched.characters.findIndex(needsImage);

    if (pendingVocab === -1 && pendingChar === -1) {
      if (mediaProgress.generating) setMediaProgress(prev => ({ ...prev, generating: false }));
      return;
    }

    if (!mediaProgress.generating) {
      const total = enriched.vocabulary.filter(needsImage).length +
                    enriched.characters.filter(needsImage).length;
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
          body: {
            action: 'generate-image', unitId, prompt,
            // Word library (spec 2026-09-05): vocabulary dedups per (owner,
            // word) across units; characters stay unit-scoped via prompt.
            ...(category === 'vocabulary' && item.word ? { word: item.word } : {}),
          }
        });

        if (error) throw error;
        // The edge returns {url: <dicebear>, error} when generation fails —
        // a fallback URL must NOT be persisted as a completed image (that is
        // how placeholder URLs got frozen into manifests as 'completed').
        if (data?.error || !data?.url || isPlaceholderImage(data.url)) {
          throw new Error(String(data?.error || 'no real image returned'));
        }
        const newUrl = data.url;

        setEnriched(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          updated[category] = [...updated[category]];
          updated[category][index] = { ...updated[category][index], image_url: newUrl, image_status: 'completed' };
          return updated;
        });

        setMediaProgress(prev => ({ ...prev, done: prev.done + 1 }));

        // FIXPLAN H3: .maybeSingle() — the manifest merge is a background
        // persist; 0 rows or a read error must skip silently-by-design but
        // the error is now logged (it must not look like a completed merge).
        supabase.from('units').select('manifest').eq('id', unitId).maybeSingle().then(({ data: unit, error: readError }) => {
          if (readError) {
            log.error('media_manifest_read_error', { error: readError.message });
            return;
          }
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

  // Illustration v2 pass — runs AFTER vocab/character images settle. Drives
  // cover → portraits → story scenes via bounded per-surface edge calls.
  // Server-side each step is idempotent (already-has-image checks), so re-runs
  // are safe; this state just prevents an infinite client loop.
  const illusStarted = useRef(false); // double-entry guard: the latch blocks a
  // second entry within one effect-run lifecycle (e.g. StrictMode remount
  // overlap) — React runs the cleanup (which resets the latch) before every
  // effect re-run, so each run starts from a clean slate.
  const [illusPass, setIllusPass] = useState<{ done: boolean; step?: string }>({ done: false });
  useEffect(() => {
    if (!enriched || !unitId || illusPass.done || loadingCategories.size > 0) return;
    const vocabPending = enriched.vocabulary?.some(needsImage) ?? false;
    const charPending = enriched.characters?.some(needsImage) ?? false;
    if (vocabPending || charPending) return; // wait for the image loop above
    if (illusStarted.current) return; // already running this pass
    illusStarted.current = true;

    let cancelled = false;
    (async () => {
      const invoke = (body: any) => supabase.functions.invoke('generate-media', { body });
      try {
        setIllusPass({ done: false, step: 'cover' });
        await invoke({ action: 'generate-illustrations', surface: 'cover', unitId });

        if (cancelled) return;
        setIllusPass({ done: false, step: 'portraits' });
        const { data: chars } = await supabase
          .from('unit_characters').select('characters(id)').eq('unit_id', unitId);
        for (const row of chars || []) {
          const ch = (row as any).characters;
          if (ch?.id && !cancelled) await invoke({ action: 'generate-illustrations', surface: 'portrait', unitId, characterId: ch.id });
        }

        if (cancelled) return;
        setIllusPass({ done: false, step: 'story' });
        const { data: pages } = await supabase
          .from('story_pages').select('id').eq('unit_id', unitId).order('page_number');
        for (const pg of pages || []) {
          if (!cancelled) await invoke({ action: 'generate-illustrations', surface: 'story_page', unitId, pageId: (pg as any).id });
        }
      } catch (err: any) {
        log.warn('illustration_pass_error', { error: err?.message });
      } finally {
        if (!cancelled) setIllusPass({ done: true });
      }
    })();
    return () => { cancelled = true; illusStarted.current = false; };
  }, [enriched, unitId, illusPass.done, loadingCategories.size]);

  return {
    enriched,
    setEnriched,
    loadingCategories,
    loadError,
    mediaProgress,
    illusPass,
    handleEnrich,
    handleEnrichCategories,
    reload: loadExistingEnrichment,
  };
}
