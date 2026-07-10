// generate-exercises — converts an enriched manifest into an item pool.
//
// This is the engine of the redesign (brief D2 / plan Phase 1.3-1.4). It is
// DETERMINISTIC: it builds exercises from the structured, region-safe enriched
// manifest (Phase 1.1) rather than hallucinating them, so there is no LLM call
// here (no telemetry row needed). For every vocabulary objective it emits the
// receptive->productive battery of applicable Core-v1 types; for every grammar
// objective it emits ERROR_SPOT / TRANSFORM / WORD_BANK_BUILD.
//
// Distractors are SIBLING words (semantically near, same POS-ish). One real
// image is generated per word (deduped via assets.prompt_hash); IMAGE_SELECT
// uses sibling images as distractors and is OMITTED when <4 real images exist
// (the learner still gets MEANING_MATCH for that word). Chinese L1 is enforced
// by reading l1_translation (Simplified Chinese) from the manifest.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { normalizeManifest } from '../_shared/manifest.ts';
import { generateAndStoreImage } from '../_shared/imageGen.ts';
import { generateAndStoreAudio, mapWithConcurrency } from '../_shared/tts.ts';
import {
  ExerciseType,
  buildChoices,
  shuffle,
} from '../_shared/exerciseTypes.ts';

interface PoolItemRow {
  unit_id: string;
  objective_id: string;
  exercise_type: ExerciseType;
  difficulty: number;
  content: any;
}

function isRealImage(url: string | undefined): boolean {
  return !!url && !/dicebear\.com/i.test(url);
}
const meaningOf = (v: any): string => v?.l1_translation || v?.definition || '';
const blankOut = (sentence: string, word: string): string => {
  if (!sentence || !word) return sentence || '';
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return sentence.replace(re, '____') || sentence;
};
const splitWords = (s: string): string[] => (s || '').split(/\s+/).filter((w) => w.length > 0);

/** Run a list of already-started promises with a bounded concurrency window. */
async function runBounded<T>(promises: Promise<T>[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += limit) {
    results.push(...(await Promise.all(promises.slice(i, i + limit))));
  }
  return results;
}

function difficultyFor(type: ExerciseType): number {
  switch (type) {
    case 'IMAGE_SELECT':
    case 'MEANING_MATCH':
    case 'AUDIO_L1_SELECT':
    case 'LISTEN_SELECT':
      return 1; // receptive, easiest
    case 'SPELL_CLOZE':
    case 'WORD_BANK_BUILD':
      return 2; // constrained production
    default:
      return 3; // free production (TYPE_TRANSLATE/SPEAK_SENTENCE/DICTATION/etc.)
  }
}

// --- vocabulary pool builders ---------------------------------------------

function buildVocabItems(unitId: string, objectiveId: string, v: any, siblings: any[]): PoolItemRow[] {
  const items: PoolItemRow[] = [];
  const word = String(v?.word || '').trim();
  if (!word) return items;
  const meaning = meaningOf(v);
  const example = v?.example_sentence || '';
  const audio = v?.audio_url;
  const sentenceAudio = v?.example_audio_url;
  const image = v?.image_url;
  const confusables: string[] = Array.isArray(v?.confusables) ? v.confusables.filter(Boolean) : [];
  const siblingMeanings = siblings.map(meaningOf).filter(Boolean);
  const siblingWords = siblings.map((s) => String(s.word || '')).filter(Boolean);
  const siblingImages = siblings.filter((s) => isRealImage(s?.image_url));

  const push = (type: ExerciseType, content: any) => {
    items.push({ unit_id: unitId, objective_id: objectiveId, exercise_type: type, difficulty: difficultyFor(type), content: { ...content, type } });
  };

  // MEANING_MATCH — pick the correct Chinese meaning.
  if (meaning) {
    const c = buildChoices(meaning, siblingMeanings, 4);
    push('MEANING_MATCH', { prompt: word, prompt_audio: audio, prompt_translation: meaning, ...c });
  }

  // AUDIO_L1_SELECT — listen, pick the Chinese meaning (needs audio).
  if (audio && meaning) {
    const c = buildChoices(meaning, siblingMeanings, 4);
    push('AUDIO_L1_SELECT', { audio_url: audio, ...c });
  }

  // LISTEN_SELECT — listen, tap the matching word/image (needs audio).
  if (audio) {
    const correct = { text: word, image_url: image };
    const distractorObjs = siblingImages.slice(0, 3).map((s) => ({ text: String(s.word), image_url: s.image_url }));
    if (distractorObjs.length >= 1) {
      const c = buildChoices(correct, distractorObjs, Math.min(4, distractorObjs.length + 1));
      push('LISTEN_SELECT', { audio_url: audio, options: c.options, correct_index: c.correct_index });
    }
  }

  // IMAGE_SELECT — match word to image (needs word image + >=3 sibling images).
  if (isRealImage(image) && siblingImages.length >= 3) {
    const correct = { image_url: image, label: word };
    const distractorImgs = siblingImages.slice(0, 3).map((s) => ({ image_url: s.image_url, label: String(s.word) }));
    const c = buildChoices(correct, distractorImgs, 4);
    push('IMAGE_SELECT', { prompt: word, prompt_audio: audio, prompt_translation: meaning, ...c });
  }

  // SPELL_CLOZE — choose the correctly spelled word in a cloze (needs example + confusables).
  if (example && confusables.length >= 1) {
    const c = buildChoices(word, confusables, Math.min(4, confusables.length + 1));
    push('SPELL_CLOZE', { sentence_with_blank: blankOut(example, word), ...c });
  }

  // WORD_BANK_BUILD — assemble the example sentence (needs example).
  if (example) {
    const tokens = splitWords(example);
    const distractorTokens = pickFrom(siblingWords, 2);
    push('WORD_BANK_BUILD', { target_sentence: example, word_bank: shuffle([...tokens, ...distractorTokens]), translation: meaning, audio_url: audio });
  }

  // DICTATION — type what you hear. Prefer the example-sentence audio when
  // available (a sentence is a richer dictation target), else the word.
  if (sentenceAudio && example) {
    push('DICTATION', { audio_url: sentenceAudio, correct_text: example, hint: word });
  } else if (audio) {
    push('DICTATION', { audio_url: audio, correct_text: word, hint: meaning });
  }

  // MINIMAL_PAIR_SWIPE — distinguish a confusable (needs confusable + audio).
  if (confusables.length >= 1 && audio) {
    const conf = String(confusables[0]);
    push('MINIMAL_PAIR_SWIPE', { pair: [word, conf], audio_url: audio, options: [{ text: word }, { text: conf }], correct_index: 0 });
  }

  // TYPE_TRANSLATE — type the English for a Chinese prompt (needs meaning).
  if (meaning) {
    push('TYPE_TRANSLATE', { prompt_l1: meaning, accepted: [word] });
  }

  // SPEAK_SENTENCE — pronounce the sentence/word (always available). Prefer the
  // example-sentence audio so the learner hears the full target sentence.
  push('SPEAK_SENTENCE', { target_sentence: example || word, target_word: word, target_audio: sentenceAudio || audio });

  return items;
}

function pickFrom<T>(pool: T[], n: number): T[] {
  return shuffle(pool).slice(0, n);
}

// --- grammar pool builders ------------------------------------------------

function buildGrammarItems(unitId: string, objectiveId: string, g: any, siblingWords: string[]): PoolItemRow[] {
  const items: PoolItemRow[] = [];
  const examples: string[] = Array.isArray(g?.examples) ? g.examples.filter(Boolean) : [];
  const pairs: any[] = Array.isArray(g?.transformation_pairs) ? g.transformation_pairs : [];
  const errors: any[] = Array.isArray(g?.error_examples) ? g.error_examples : [];
  const rule = String(g?.rule || '');

  const push = (type: ExerciseType, content: any) => {
    items.push({ unit_id: unitId, objective_id: objectiveId, exercise_type: type, difficulty: difficultyFor(type), content: { ...content, type } });
  };

  // ERROR_SPOT — one per error example.
  for (const e of errors) {
    const wrong = String(e?.wrong || '');
    const correct = String(e?.correct || '');
    if (!wrong || !correct) continue;
    const distractors = errors.filter((x) => String(x?.correct) && String(x.correct) !== correct).map((x) => String(x.correct));
    const c = buildChoices(correct, distractors, Math.min(4, distractors.length + 1));
    push('ERROR_SPOT', { sentence: wrong, ...c, explanation: g?.explanation });
  }

  // TRANSFORM — one per transformation pair.
  for (const p of pairs) {
    const original = String(p?.original || '');
    const transformed = String(p?.transformed || '');
    if (!original || !transformed) continue;
    const distractors = pairs.filter((x) => String(x?.transformed) && String(x.transformed) !== transformed).map((x) => String(x.transformed));
    const c = buildChoices(transformed, distractors, Math.min(4, distractors.length + 1));
    push('TRANSFORM', { prompt_sentence: original, instruction: rule, ...c });
  }

  // WORD_BANK_BUILD — assemble an example sentence.
  if (examples.length > 0) {
    const ex = String(examples[0]);
    const tokens = splitWords(ex);
    const distractorTokens = pickFrom(siblingWords, 2);
    push('WORD_BANK_BUILD', { target_sentence: ex, word_bank: shuffle([...tokens, ...distractorTokens]) });
  }

  return items;
}

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-exercises',
    requireAuth: true,
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
    validationRules: [{ field: 'unitId', required: true, type: 'string' }],
  }, async (body, auth) => {
    const { unitId } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!auth?.userId) return { success: false, error: 'Authentication required' };
    if (!supabaseUrl || !supabaseKey) return { success: false, error: 'Database not configured' };

    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: unit, error: unitError } = await sb.from('units').select('teacher_id, title, manifest').eq('id', unitId).single();
    if (unitError || !unit) return { success: false, error: 'Unit not found' };
    // Authorization: the caller must OWN the unit. Legacy NULL-owner units are
    // rejected here (the old `if (unit.teacher_id && ...)` guard short-circuited
    // for NULL owners, letting any authenticated caller regenerate the pool +
    // trigger paid image/TTS generation on a unit they don't own).
    if (!unit.teacher_id || unit.teacher_id !== auth.userId) {
      return { success: false, error: 'You do not own this unit' };
    }

    const canonical = normalizeManifest(unit.manifest);
    const vocab = canonical.vocabulary;
    const grammar = canonical.grammar;
    if (vocab.length === 0 && grammar.length === 0) {
      return { success: false, error: 'No enriched content found. Enrich the unit first.' };
    }

    const errors: string[] = [];

    // ── 1. Ensure one real image per word (deduped, best-effort) ──────────
    const vocabWithImages = vocab.map((v: any) => ({ ...v }));
    const needImage = vocabWithImages.filter((v) => v.word && !isRealImage(v.image_url));
    if (needImage.length > 0) {
      const imgResults = await mapWithConcurrency(needImage, 3, (v) =>
        generateAndStoreImage(v.image_prompt || `Illustration of ${v.word} for children`, unitId).then((r) => ({ word: v.word, url: r.url })),
      );
      const imgMap = new Map(imgResults.filter((r) => r.url).map((r) => [r.word, r.url]));
      vocabWithImages.forEach((v) => {
        if (imgMap.has(v.word)) {
          v.image_url = imgMap.get(v.word);
          v.image_status = 'ready';
        }
      });
    }

    // Persist the upgraded images back onto the manifest so the board / future
    // runs see the real images (and skip re-generation via image_status).
    try {
      const ec = (unit.manifest?.enriched_content && typeof unit.manifest.enriched_content === 'object')
        ? { ...unit.manifest.enriched_content }
        : { vocabulary: [], grammar: [] };
      if (Array.isArray(ec.vocabulary)) {
        ec.vocabulary = ec.vocabulary.map((v: any) => {
          const upgraded = vocabWithImages.find((w) => w.word === v.word);
          return upgraded && upgraded.image_url !== v.image_url ? { ...v, image_url: upgraded.image_url, image_status: 'ready' } : v;
        });
      }
      await sb.from('units').update({ manifest: { ...unit.manifest, enriched_content: ec } }).eq('id', unitId);
    } catch (err: any) {
      errors.push(`manifest image update failed: ${err?.message || err}`);
    }

    // ── 2. Reconcile objectives (preserve ids -> keep srs_items links) ─────
    const { data: existingObjectives } = await sb.from('objectives').select('id, type, target_value').eq('unit_id', unitId);
    const existing = (existingObjectives || []) as { id: string; type: string; target_value: string }[];
    const findObjective = (type: string, target: string) =>
      existing.find((o) => o.type === type && o.target_value.trim().toLowerCase() === target.trim().toLowerCase());

    const objectiveIdFor = new Map<string, string>();
    const ensureObjective = async (type: 'vocabulary' | 'grammar' | 'phonics', target: string): Promise<string> => {
      const key = `${type}:${target.toLowerCase()}`;
      if (objectiveIdFor.has(key)) return objectiveIdFor.get(key)!;
      const found = findObjective(type, target);
      if (found) {
        objectiveIdFor.set(key, found.id);
        return found.id;
      }
      const { data: inserted, error } = await sb.from('objectives').insert({ unit_id: unitId, type, target_value: target }).select('id').single();
      if (error || !inserted) throw new Error(`objective insert failed: ${error?.message || 'no row'}`);
      objectiveIdFor.set(key, inserted.id);
      existing.push({ id: inserted.id, type, target_value: target });
      return inserted.id;
    };

    // ── 3. Build the pool ─────────────────────────────────────────────────
    const allRows: PoolItemRow[] = [];
    const siblingWords = vocabWithImages.map((v) => String(v.word)).filter(Boolean);

    try {
      for (const v of vocabWithImages) {
        const oid = await ensureObjective('vocabulary', String(v.word));
        allRows.push(...buildVocabItems(unitId, oid, v, vocabWithImages.filter((s) => s.word !== v.word)));
      }
      for (const g of grammar) {
        const oid = await ensureObjective('grammar', String(g.rule));
        allRows.push(...buildGrammarItems(unitId, oid, g, siblingWords));
      }
    } catch (err: any) {
      errors.push(`objective reconciliation failed: ${err?.message || err}`);
    }

    // Backfill objective_id on existing TEMPLATE srs_items (student_id IS NULL)
    // so the LearnerState links to the skill graph. Issued in parallel (bounded)
    // rather than one sequential awaited round-trip per word.
    try {
      const backfills: Promise<any>[] = [];
      for (const v of vocabWithImages) {
        const oid = objectiveIdFor.get(`vocabulary:${String(v.word).toLowerCase()}`);
        if (oid) {
          backfills.push(
            sb.from('srs_items').update({ objective_id: oid }).is('student_id', null).eq('unit_id', unitId).eq('word', String(v.word)),
          );
        }
      }
      await runBounded(backfills, 6);
    } catch (err: any) {
      errors.push(`srs objective backfill failed: ${err?.message || err}`);
    }

    // ── 4. Swap the pool for this unit atomically-SAFE ─────────────────────
    // Insert the new items FIRST (in batches, collecting ids), THEN delete the
    // old ones not in the new set. This avoids the empty-pool window that a
    // delete-all-then-insert creates for any concurrently-running lesson, and
    // leaves the prior pool intact if the insert fails. Objectives preserved.
    let persistedCount = 0;
    if (allRows.length > 0) {
      try {
        const newIds: string[] = [];
        for (let i = 0; i < allRows.length; i += 200) {
          const batch = allRows.slice(i, i + 200);
          const { data: inserted, error: insErr } = await sb.from('pool_items').insert(batch).select('id');
          if (insErr) {
            errors.push(`pool_items insert failed: ${insErr.message}`);
            break;
          }
          if (inserted) for (const r of inserted) if (r?.id) newIds.push(r.id);
        }
        persistedCount = newIds.length;
        // Only retire the old set once the new set is fully persisted.
        if (newIds.length === allRows.length && newIds.length > 0) {
          const { error: delErr } = await sb.from('pool_items').delete().eq('unit_id', unitId).not('id', 'in', `(${newIds.join(',')})`);
          if (delErr) errors.push(`pool_items retire-old failed: ${delErr.message}`);
        }
      } catch (err: any) {
        errors.push(`pool persistence failed: ${err?.message || err}`);
      }
    }

    const typeCounts: Record<string, number> = {};
    for (const r of allRows) typeCounts[r.exercise_type] = (typeCounts[r.exercise_type] || 0) + 1;
    console.log('generate-exercises DONE', JSON.stringify({
      unitId, objectives: objectiveIdFor.size, poolItems: allRows.length, typeCounts, errors: errors.length,
    }));

    return {
      success: errors.length === 0 && persistedCount > 0,
      unitId,
      objectives: objectiveIdFor.size,
      poolItems: persistedCount,
      typeCounts,
      ...(errors.length > 0 ? { errors } : {}),
    };
  });
});
