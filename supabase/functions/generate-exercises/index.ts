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
import {
  generateAndStoreAudio,
  primarySpeechSignature,
  canonicalSpeechHash,
  detectLang,
  mapWithConcurrency,
} from '../_shared/tts.ts';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
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
    case 'GRAMMAR_FILL':
      return 2; // constrained production / rule-recognition MCQ
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
    // F2 (doc 11 §3): every vocab pool item carries its SERIES label so
    // consumers can filter/release by series (class plans gate what's NEW).
    items.push({ unit_id: unitId, objective_id: objectiveId, exercise_type: type, difficulty: difficultyFor(type), content: { ...content, type, ...(v.set_label ? { set_label: v.set_label } : {}) } });
  };

  // MEANING_MATCH — pick the correct Chinese meaning.
  if (meaning) {
    const c = buildChoices(meaning, siblingMeanings, 4);
    push('MEANING_MATCH', { prompt: word, prompt_audio: audio, prompt_translation: meaning, ...c });
  }

  // AUDIO_L1_SELECT — listen, pick the Chinese meaning. Reference-based
  // (2026-08-08): no stored audio required — the play-time resolver speaks
  // prompt_text via the cached TTS chain. A stored audio_url (legacy units)
  // still wins when present.
  if (meaning) {
    const c = buildChoices(meaning, siblingMeanings, 4);
    push('AUDIO_L1_SELECT', { prompt_text: word, ...(audio ? { audio_url: audio } : {}), ...c });
  }

  // LISTEN_SELECT — listen, tap the matching word/image. Reference-based:
  // emitted whenever distractors exist (no audio precondition anymore).
  {
    const correct = { text: word, image_url: image };
    const distractorObjs = siblingImages.slice(0, 3).map((s) => ({ text: String(s.word), image_url: s.image_url }));
    if (distractorObjs.length >= 1) {
      const c = buildChoices(correct, distractorObjs, Math.min(4, distractorObjs.length + 1));
      push('LISTEN_SELECT', { prompt_text: word, ...(audio ? { audio_url: audio } : {}), options: c.options, correct_index: c.correct_index });
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

  // DICTATION — type what you hear. Reference-based: prompt_text carries the
  // full target sentence (richer dictation target); a stored sentence/word
  // audio_url still wins when present (legacy units).
  if (example) {
    push('DICTATION', { prompt_text: example, ...(sentenceAudio ? { audio_url: sentenceAudio } : audio ? { audio_url: audio } : {}), correct_text: example, hint: word });
  } else {
    push('DICTATION', { prompt_text: word, ...(audio ? { audio_url: audio } : {}), correct_text: word, hint: meaning });
  }

  // MINIMAL_PAIR_SWIPE — distinguish a confusable. Reference-based:
  // prompt_text = the pair member that gets PLAYED (correct_index 0).
  if (confusables.length >= 1) {
    const conf = String(confusables[0]);
    push('MINIMAL_PAIR_SWIPE', { pair: [word, conf], prompt_text: word, ...(audio ? { audio_url: audio } : {}), options: [{ text: word }, { text: conf }], correct_index: 0 });
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
    // Grammar items carry no series label — the F2 set_label stamp is a
    // vocabulary-pool concept (the `v` here crashed generation: "v is not
    // defined", story/dialogue items never built; fixed 2026-08-31).
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

  // TRANSFORM — one per buildable pair.
  //
  // Option A (grammar-strand Phase 4, 2026-08-06): reserve the last-indexed
  // transformation pair for rung 4 (free production, BoardGrammarForge). The
  // reserved pair is deliberately NEVER built into a pool item — neither as a
  // TRANSFORM item nor as a distractor for other items — so the rung-4 prompt
  // stays unseen until the student produces it. The client-side rung-4 loader
  // (BoardGrammarForge) applies the SAME "last index reserved" convention
  // independently (no new stored flag needed). If there are too few pairs to
  // both reserve one AND leave ≥2 for rung 3 (the minimum for valid MCQ
  // distractors), don't reserve — that objective skips rung 4 this session.
  const MIN_PAIRS_TO_RESERVE = 3; // reserve only if ≥3 pairs (1 held-out + ≥2 for rung 3)
  const canReserve = pairs.length >= MIN_PAIRS_TO_RESERVE;
  const buildablePairs = canReserve ? pairs.slice(0, pairs.length - 1) : pairs;

  for (const p of buildablePairs) {
    const original = String(p?.original || '');
    const transformed = String(p?.transformed || '');
    if (!original || !transformed) continue;
    // Distractors drawn ONLY from buildablePairs — the reserved pair's
    // `transformed` text never appears, so rung 4's answer can't leak early.
    const distractors = buildablePairs.filter((x) => String(x?.transformed) && String(x.transformed) !== transformed).map((x) => String(x.transformed));
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

  // GRAMMAR_FILL (new-gen GRAMMAR_LAB rung, 2026-08-07) — MCQ: "which sentence
  // uses the rule correctly?". Correct option = a valid transformed/example
  // sentence; distractors = the WRONG sentences from error_examples. Fully
  // deterministic from existing grammar_rules fields.
  const correctSentence = pairs.length > 0 ? String(pairs[0]?.transformed || '') : (examples.length > 0 ? String(examples[0]) : '');
  const wrongSentences = errors
    .map((e) => String(e?.wrong || ''))
    .filter((w) => w && w !== correctSentence);
  if (correctSentence && wrongSentences.length >= 1) {
    const c = buildChoices(correctSentence, Array.from(new Set(wrongSentences)), 3);
    push('GRAMMAR_FILL', {
      rule_name: rule,
      sentence_with_blank: g?.pattern_template || '',
      ...c,
      explanation: g?.explanation,
    });
  }

  return items;
}

// Phase 1.2 — Story comprehension MCQs. The questions already carry options +
// a 0-based correct answer index (generated by enrich-unit, stored in
// story_comprehension_questions). This converts dead JSONB data into playable
// STORY_COMPREHENSION pool items with ZERO new generation. One objective per
// story (so the story is a single trackable skill node); one pool item per
// question. Difficulty 1 (receptive reading comprehension).
function buildStoryItems(unitId: string, objectiveId: string, questions: any[]): PoolItemRow[] {
  const items: PoolItemRow[] = [];
  for (const q of questions) {
    const opts = Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [];
    const answerIdx = Number.isInteger(q.answer_index) ? q.answer_index : 0;
    if (opts.length < 2 || answerIdx >= opts.length) continue; // skip malformed
    // Book art alongside the question (story fidelity): the page's own
    // illustration — by default a crop of the BOOK page the scan captured.
    // Additive fields; board templates read content as a loose record, so
    // absent art changes nothing for them.
    const art = (q.image_asset_id || q.image_url)
      ? { image_asset_id: q.image_asset_id || null, image_url: q.image_url || null }
      : {};
    items.push({
      unit_id: unitId,
      objective_id: objectiveId,
      exercise_type: 'STORY_COMPREHENSION',
      difficulty: 1,
      content: {
        type: 'STORY_COMPREHENSION',
        prompt: String(q.question || ''),
        options: opts,
        correct_index: answerIdx,
        story_page_id: q.story_page_id || null,
        ...art,
      },
    });
  }
  return items;
}

// Phase 1.3 — Dialogue exercises (advisor §4, §7.5). Reads dialogue_lines rows
// (written by enrich-unit Phase 1.3-5) and emits:
//   - DIALOGUE_ROLEPLAY: one per dialogue (grouped by dialogue_index), productive
//     (difficulty 3). Lines ordered for classroom role-play.
//   - WHO_SAID_IT: one per line that has a resolved speaker, receptive MCQ
//     (difficulty 1). Distractors are other speakers in the same unit.
function buildDialogueItems(unitId: string, objectiveId: string, lines: any[], allSpeakers: string[]): PoolItemRow[] {
  const items: PoolItemRow[] = [];
  if (lines.length === 0) return items;

  // Group lines by dialogue_index for DIALOGUE_ROLEPLAY.
  const byDialogue = new Map<number, any[]>();
  for (const l of lines) {
    const di = Number.isInteger(l.dialogue_index) ? l.dialogue_index : 0;
    if (!byDialogue.has(di)) byDialogue.set(di, []);
    byDialogue.get(di)!.push(l);
  }

  // DIALOGUE_ROLEPLAY — one per dialogue group.
  for (const [di, group] of byDialogue) {
    const roleplayLines = group.map((l) => ({
      speaker: l.speaker_name || 'Unknown',
      text: String(l.text || ''),
      ...(l.translation ? { translation: l.translation } : {}),
    }));
    if (roleplayLines.length < 2) continue; // a roleplay needs at least 2 lines
    items.push({
      unit_id: unitId,
      objective_id: objectiveId,
      exercise_type: 'DIALOGUE_ROLEPLAY',
      difficulty: 3, // productive
      content: { type: 'DIALOGUE_ROLEPLAY', lines: roleplayLines, dialogue_index: di },
    });
  }

  // WHO_SAID_IT — one per line with a known speaker (needs >=2 speakers for distractors).
  if (allSpeakers.length >= 2) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const speaker = l.speaker_name;
      if (!speaker) continue; // no resolved speaker — can't make a "who said it?"
      const distractors = allSpeakers.filter((s) => s !== speaker);
      if (distractors.length === 0) continue;
      const c = buildChoices(speaker, distractors, Math.min(4, distractors.length + 1));
      items.push({
        unit_id: unitId,
        objective_id: objectiveId,
        exercise_type: 'WHO_SAID_IT',
        difficulty: 1, // receptive MCQ
        content: {
          type: 'WHO_SAID_IT',
          line_text: String(l.text || ''),
          options: c.options,
          correct_index: c.correct_index,
          context_before: i > 0 ? String(lines[i - 1].text || '') : undefined,
          context_after: i < lines.length - 1 ? String(lines[i + 1].text || '') : undefined,
        },
      });
    }
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
    // Authorization: the caller must OWN the unit. Strict policy (rejects NULL
    // owner) is now centralized in assertOwnership — this was the function whose
    // strictness exposed Bug B1 (its tolerant siblings let textbook units enrich
    // + orchestrate but this one rejected them, silently starving the pool).
    // All three content functions now share this one check.
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth.userId, callerRole: auth.role });
    if (!ownership.ok) {
      return { success: false, error: ownership.reason };
    }

    const canonical = normalizeManifest(unit.manifest);
    // C.3 vocab: read vocab from the relational vocabulary_items (the canonical
    // content row), falling back to the manifest for unmigrated units. This is
    // what makes Content-tab vocab edits reach the regenerated pool_items (the
    // Phase 1.7 reconciliation re-runs us, and we now read the edited table).
    let vocab: any[] = [];
    try {
      const { data: viRows } = await sb.from('vocabulary_items')
        .select('word, definition, example_sentence, l1_translation, phonetic, part_of_speech, image_prompt, image_url, audio_url, example_audio_url, distractors, confusables, source_structure_id')
        .eq('unit_id', unitId)
        .order('order_index', { ascending: true });
      if (viRows && viRows.length > 0) {
        vocab = viRows.map((v: any) => ({
          word: v.word, definition: v.definition, example_sentence: v.example_sentence,
          l1_translation: v.l1_translation, translation: v.l1_translation, phonetic: v.phonetic,
          part_of_speech: v.part_of_speech, image_prompt: v.image_prompt, image_url: v.image_url,
          audio_url: v.audio_url, example_audio_url: v.example_audio_url,
          distractors: Array.isArray(v.distractors) ? v.distractors : [],
          confusables: Array.isArray(v.confusables) ? v.confusables : [],
          source_structure_id: v.source_structure_id ?? null,
        }));
      }
    } catch { /* fall back to manifest below */ }
    if (vocab.length === 0) vocab = canonical.vocabulary;
    const grammar = canonical.grammar;

    // WS-D: don't hard-reject story/dialogue-only units. Even with no vocab or
    // grammar, a unit can still drive STORY_COMPREHENSION / WHO_SAID_IT /
    // DIALOGUE_ROLEPLAY. Check relational story-questions + dialogue-lines (with
    // a manifest fallback) before giving up.
    let hasStoryOrDialogue = false;
    try {
      const [sqRes, dlRes] = await Promise.all([
        sb.from('story_comprehension_questions').select('id', { count: 'exact', head: true }).eq('unit_id', unitId),
        sb.from('dialogue_lines').select('id', { count: 'exact', head: true }).eq('unit_id', unitId),
      ]);
      hasStoryOrDialogue = (sqRes.count || 0) > 0 || (dlRes.count || 0) > 0;
    } catch { /* fall through to the manifest check below */ }
    if (!hasStoryOrDialogue) {
      const manifestStoryQs = ((canonical.story as any)?.pages || [])
        .some((p: any) => Array.isArray(p?.comprehension_questions) && p.comprehension_questions.length > 0);
      const manifestDlg = Array.isArray((canonical as any).dialogues)
        && ((canonical as any).dialogues as any[]).some((d: any) => Array.isArray(d?.lines) && d.lines.length > 0);
      hasStoryOrDialogue = manifestStoryQs || manifestDlg;
    }

    if (vocab.length === 0 && grammar.length === 0 && !hasStoryOrDialogue) {
      return { success: false, error: 'No enriched content found. Enrich the unit first.' };
    }

    // B1b fix: record this run on the generation_jobs row (orchestrate-lesson
    // inserts a 'pending' row before triggering us). Marking 'running' here +
    // 'succeeded'/'failed' at the end makes a silent drop visible & retryable
    // instead of leaving the unit in "looks done, no exercises" limbo. Best-
    // effort: the job table is observability, not a functional dependency.
    const STAGE = 'generate-exercises';
    const markJob = async (status: 'running' | 'succeeded' | 'failed', extra?: { error?: string }) => {
      try {
        // UPSERT (not UPDATE): direct UI invocations don't have a 'pending'
        // row pre-created by orchestrate-lesson — a plain update would match
        // 0 rows and record nothing (audit 2026-08-17, landmine 3).
        await sb.from('generation_jobs').upsert({
          unit_id: unitId,
          stage: STAGE,
          status,
          attempt: 1,
          ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
          ...((status === 'succeeded' || status === 'failed') ? { completed_at: new Date().toISOString() } : {}),
          ...(extra?.error ? { error: extra.error } : { ...(status === 'running' ? { error: null } : {}) }),
        }, { onConflict: 'unit_id,stage' });
      } catch { /* observability only */ }
    };
    await markJob('running');

    const errors: string[] = [];

    // ── 1. Ensure one real image per word (deduped, best-effort) ──────────
    const vocabWithImages = vocab.map((v: any) => ({ ...v }));
    const needImage = vocabWithImages.filter((v) => v.word && !isRealImage(v.image_url));
    if (needImage.length > 0) {
      const imgResults = await mapWithConcurrency(needImage, 3, (v) =>
        generateAndStoreImage(v.image_prompt || `Illustration of ${v.word} for children`, unitId).then((r) => ({ word: v.word, url: r.url })),
      );
      const imgMap = new Map(imgResults.filter((r) => r.url && isRealImage(r.url)).map((r) => [r.word, r.url]));
      vocabWithImages.forEach((v) => {
        if (imgMap.has(v.word)) {
          v.image_url = imgMap.get(v.word);
          v.image_status = 'ready';
        }
      });
    }

    // ── 1.5 Ensure one spoken-word audio per word (cache-first, ONE generation) ──
    // Owner decision 2026-08-18: pronunciation audio is generated at publish
    // time, alongside the images — classes never burn TTS credits. Cache-first
    // by the SAME canonical prompt_hash the play-time resolver computes, so
    // anything already generated (previous publish, or on-demand during an old
    // class) is REUSED with zero synthesis; only true misses are generated,
    // exactly once. The on-demand resolver stays as the runtime safety net for
    // words whose generation failed here (empty url on failure — never stored).
    const needAudio = vocabWithImages.filter((v) => v.word && !v.audio_url);
    const audioMap = new Map<string, string>();
    if (needAudio.length > 0) {
      const AUDIO_LANG = 'en'; // the spoken words are the L2 target (English)
      const sig = primarySpeechSignature(AUDIO_LANG, null);
      const hashByWord = new Map<string, string>();
      for (const v of needAudio) {
        const word = String(v.word);
        hashByWord.set(word, await canonicalSpeechHash(word, AUDIO_LANG, sig.voice, sig.model));
      }
      // Batch assets lookup — reuse stored MP3s instead of re-synthesizing.
      try {
        const hashes = [...new Set(hashByWord.values())];
        const { data: cached } = await sb.from('assets')
          .select('prompt_hash, public_url')
          .eq('type', 'audio')
          .in('prompt_hash', hashes);
        for (const a of (cached || []) as any[]) {
          if (a?.prompt_hash && a?.public_url) {
            for (const [word, hash] of hashByWord) {
              if (hash === a.prompt_hash) audioMap.set(word, a.public_url);
            }
          }
        }
      } catch { /* cache lookup is best-effort — misses just generate */ }
      const toGenerate = needAudio.filter((v) => !audioMap.has(String(v.word)));
      if (toGenerate.length > 0) {
        const audioResults = await mapWithConcurrency(toGenerate, 3, (v) =>
          generateAndStoreAudio(String(v.word), unitId, {
            lang: AUDIO_LANG,
            promptHash: hashByWord.get(String(v.word)) ?? null,
          }).then((r) => ({ word: String(v.word), url: r.url, error: r.error })),
        );
        let audioFailures = 0;
        for (const r of audioResults) {
          if (r.url && !r.error) audioMap.set(r.word, r.url);
          else audioFailures++;
        }
        if (audioFailures > 0) {
          errors.push(`word audio generation failed for ${audioFailures} word(s) — the play-time resolver covers them`);
        }
      }
      vocabWithImages.forEach((v) => {
        const url = audioMap.get(String(v.word));
        if (url) v.audio_url = url;
      });
      // Persist back onto vocabulary_items (the canonical content row) so
      // future runs and the Content-tab reconciliation see the audio. Best-
      // effort per word; manifest-only units are covered by the manifest
      // persist below.
      for (const [word, url] of audioMap) {
        try {
          await sb.from('vocabulary_items').update({ audio_url: url }).eq('unit_id', unitId).eq('word', word);
        } catch { /* best-effort per word */ }
      }
    }

    // Persist the upgraded images + audio back onto the manifest so the board /
    // future runs see the real media (and skip re-generation via image_status).
    try {
      const ec = (unit.manifest?.enriched_content && typeof unit.manifest.enriched_content === 'object')
        ? { ...unit.manifest.enriched_content }
        : { vocabulary: [], grammar: [] };
      if (Array.isArray(ec.vocabulary)) {
        ec.vocabulary = ec.vocabulary.map((v: any) => {
          const upgraded = vocabWithImages.find((w) => w.word === v.word);
          const changed = upgraded && (upgraded.image_url !== v.image_url || upgraded.audio_url !== v.audio_url);
          return changed
            ? { ...v, image_url: upgraded.image_url, image_status: 'ready', audio_url: upgraded.audio_url }
            : v;
        });
      }
      await sb.from('units').update({ manifest: { ...unit.manifest, enriched_content: ec } }).eq('id', unitId);
    } catch (err: any) {
      errors.push(`manifest media update failed: ${err?.message || err}`);
    }

    // ── 2. Reconcile objectives (preserve ids -> keep srs_items links) ─────
    const { data: existingObjectives } = await sb.from('objectives').select('id, type, target_value, source_structure_id').eq('unit_id', unitId);
    const existing = (existingObjectives || []) as { id: string; type: string; target_value: string; source_structure_id?: string | null }[];
    const findObjective = (type: string, target: string) =>
      existing.find((o) => o.type === type && o.target_value.trim().toLowerCase() === target.trim().toLowerCase());

    const objectiveIdFor = new Map<string, string>();
    // FIXPLAN I: provenance-stamped objectives — class plans link content to
    // classes via objectives.source_structure_id. Optional param; found
    // objectives keep their existing stamp.
    const ensureObjective = async (type: 'vocabulary' | 'grammar' | 'phonics' | 'story' | 'dialogue', target: string, sourceStructureId?: string | null): Promise<string> => {
      const key = `${type}:${target.toLowerCase()}`;
      if (objectiveIdFor.has(key)) return objectiveIdFor.get(key)!;
      const found = findObjective(type, target);
      if (found) {
        objectiveIdFor.set(key, found.id);
        // Backfill the stamp if this run finally knows the provenance.
        if (sourceStructureId && !found.source_structure_id) {
          try {
            await sb.from('objectives').update({ source_structure_id: sourceStructureId }).eq('id', found.id);
          } catch { /* best-effort stamp */ }
        }
        return found.id;
      }
      const { data: inserted, error } = await sb.from('objectives').insert({ unit_id: unitId, type, target_value: target, ...(sourceStructureId ? { source_structure_id: sourceStructureId } : {}) }).select('id').single();
      if (error || !inserted) throw new Error(`objective insert failed: ${error?.message || 'no row'}`);
      objectiveIdFor.set(key, inserted.id);
      existing.push({ id: inserted.id, type, target_value: target });
      return inserted.id;
    };

    // ── 3. Build the pool ─────────────────────────────────────────────────
    const allRows: PoolItemRow[] = [];
    const siblingWords = vocabWithImages.map((v) => String(v.word)).filter(Boolean);

    // Phase 1.6: registry-GATED emission (advisor §2.5). activity_type_registry
    // declares which exercise types each learning-object type may produce. The
    // gate below filters each builder's output to its registered types.
    //
    // DESIGN DECISION (Task 18, ZCode 2026-08-03): the registry is an operational
    // FILTER, NOT a driver. The builders (buildVocabItems/buildGrammarItems/...)
    // are still hardcoded + called unconditionally; the registry can only NARROW
    // their output. This is deliberate:
    //  - The value today is operational gating: disable a type WITHOUT a code
    //    deploy (e.g. delete the MINIMAL_PAIR_SWIPE row → it stops being emitted
    //    for vocabulary, pool rebuilds on next reconciliation). Useful.
    //  - Making it a true DRIVER (dispatch on generator_key) would require a
    //    normalized builder signature (today they differ: vocab takes siblings,
    //    dialogue takes allSpeakers, story takes questions). That's a real
    //    refactor with regression risk and ~no near-term benefit — we're not
    //    adding new activity types yet. Premature.
    //  - `generator_key` is therefore DOCUMENTATION-ONLY (descriptive, not read).
    //    It records which builder produces the type, for humans reading the table.
    // When new activity types become a real workflow, revisit: extract a
    // `Builder<LearningObject>` interface and dispatch from the registry. Until
    // then, treat this as a permissive filter.
    //
    // PERMISSIVE FALLBACK: if the registry is empty/unreadable for a type, the
    // builder's full output is kept — so a registry problem can never silently
    // empty the pool.
    const registry = new Map<string, Set<string>>();
    try {
      const { data: regRows } = await sb.from('activity_type_registry').select('learning_object_type, activity_type');
      for (const r of (regRows || [])) {
        if (!registry.has(r.learning_object_type)) registry.set(r.learning_object_type, new Set());
        registry.get(r.learning_object_type)!.add(r.activity_type);
      }
    } catch { /* registry unavailable — gate() falls back to emitting everything */ }
    const gate = (learningObjectType: string, items: PoolItemRow[]): PoolItemRow[] => {
      const allowed = registry.get(learningObjectType);
      if (!allowed || allowed.size === 0) return items; // permissive fallback
      return items.filter((it) => allowed.has(it.exercise_type));
    };

    try {
      for (const v of vocabWithImages) {
        const oid = await ensureObjective('vocabulary', String(v.word), (v as any).source_structure_id ?? undefined);
        allRows.push(...gate('vocabulary', buildVocabItems(unitId, oid, v, vocabWithImages.filter((s) => s.word !== v.word))));
      }
      // Phase 1.4: grammar from the relational table (grammar_rules is the
      // canonical source once enrich-unit has written it there). Falls back to
      // the manifest's grammar array for legacy units not yet backfilled.
      let grammarRules: any[] = [];
      try {
        const { data: grRows } = await sb.from('grammar_rules')
          .select('rule, explanation, examples, pattern_template, transformation_pairs, error_examples, source_structure_id')
          .eq('unit_id', unitId)
          .order('order_index', { ascending: true });
        grammarRules = Array.isArray(grRows) ? grRows : [];
      } catch { /* table read failed — fall back to manifest */ }
      if (grammarRules.length === 0) {
        grammarRules = grammar; // legacy manifest fallback
      }
      for (const g of grammarRules) {
        const oid = await ensureObjective('grammar', String(g.rule), (g as any).source_structure_id ?? undefined);
        allRows.push(...gate('grammar', buildGrammarItems(unitId, oid, g, siblingWords)));
      }

      // Phase 1.2: story comprehension MCQs from the relational table (NOT the
      // manifest — story_comprehension_questions is the canonical source once
      // enrich-unit has written it there, Phase 1.2-5). Falls back to the
      // manifest's story.pages[].comprehension_questions if the table is empty
      // (e.g. a unit enriched before Phase 1.2 / not yet backfilled) so story
      // exercises generate even for legacy units.
      let storyQuestions: any[] = [];
      try {
        const { data: sqRows } = await sb.from('story_comprehension_questions')
          .select('question, options, answer_index, story_page_id, story_pages(image_asset_id)')
          .eq('unit_id', unitId)
          .order('order_index', { ascending: true });
        storyQuestions = (Array.isArray(sqRows) ? sqRows : []).map((row: any) => ({
          ...row,
          image_asset_id: row.story_pages?.image_asset_id || null,
          story_pages: undefined,
        }));
      } catch { /* table read failed — fall back to manifest */ }
      if (storyQuestions.length === 0) {
        // Fallback: mine the manifest (legacy units not yet backfilled).
        const story = canonical.story as any;
        const pages = story?.pages || [];
        for (const p of pages) {
          for (const q of (p.comprehension_questions || [])) {
            storyQuestions.push({
              question: q.question, options: q.options, answer_index: q.answer,
              image_asset_id: p.image_asset_id || null,
              image_url: p.image_url_book_crop || null, // manifest carries the crop URL directly
            });
          }
        }
      }
      // Resolve the pages' illustration assets to public URLs (book crops or
      // AI-generated) so pool items embed a ready-to-render image_url.
      const storyAssetIds = [...new Set(storyQuestions.map((q: any) => q.image_asset_id).filter(Boolean))] as string[];
      if (storyAssetIds.length > 0) {
        try {
          const { data: saRows } = await sb.from('assets').select('id, public_url').in('id', storyAssetIds);
          const urlById = new Map((saRows || []).filter((a: any) => a.public_url).map((a: any) => [a.id, a.public_url]));
          for (const q of storyQuestions) {
            if (q.image_asset_id && !q.image_url) q.image_url = urlById.get(q.image_asset_id) || null;
          }
        } catch { /* art is optional — the questions still generate */ }
      }
      if (storyQuestions.length > 0) {
        const oid = await ensureObjective('story', 'Story comprehension');
        allRows.push(...gate('story', buildStoryItems(unitId, oid, storyQuestions)));
      }

      // Phase 1.3: dialogue exercises from the relational table (NOT the
      // manifest — dialogue_lines is the canonical source once enrich-unit has
      // written it there, Phase 1.3-5). Falls back to the manifest's
      // dialogues[].lines[] if the table is empty (legacy units not yet
      // backfilled).
      let dialogueLines: any[] = [];
      try {
        const { data: dlRows } = await sb.from('dialogue_lines')
          .select('order_index, dialogue_index, speaker_character_id, speaker_override_name, text, translation')
          .eq('unit_id', unitId)
          .order('order_index', { ascending: true });
        if (Array.isArray(dlRows) && dlRows.length > 0) {
          // Resolve speaker names: prefer the character's real name (via FK),
          // fall back to speaker_override_name.
          const charIds = [...new Set(dlRows.map((r: any) => r.speaker_character_id).filter(Boolean))];
          const charNameMap = new Map<string, string>();
          if (charIds.length > 0) {
            const { data: charRows } = await sb.from('characters')
              .select('id, name')
              .in('id', charIds);
            if (Array.isArray(charRows)) {
              for (const c of charRows) charNameMap.set(c.id, c.name);
            }
          }
          dialogueLines = dlRows.map((r: any) => ({
            ...r,
            speaker_name: r.speaker_character_id
              ? (charNameMap.get(r.speaker_character_id) || r.speaker_override_name || null)
              : (r.speaker_override_name || null),
          }));
        }
      } catch { /* table read failed — fall back to manifest */ }
      if (dialogueLines.length === 0) {
        // Fallback: mine the manifest (legacy units not yet backfilled).
        const dialogues = canonical.dialogues as any[];
        if (Array.isArray(dialogues)) {
          let order = 0;
          for (let d = 0; d < dialogues.length; d++) {
            const lines = Array.isArray(dialogues[d]?.lines) ? dialogues[d].lines : [];
            for (const line of lines) {
              dialogueLines.push({
                order_index: order++,
                dialogue_index: d,
                speaker_character_id: null,
                speaker_override_name: null,
                speaker_name: line?.speaker ? String(line.speaker).trim() : null,
                text: String(line?.text || ''),
                translation: line?.translation || null,
              });
            }
          }
        }
      }
      if (dialogueLines.length > 0) {
        const oid = await ensureObjective('dialogue', 'Dialogue practice');
        const allSpeakers = [...new Set(dialogueLines.map((l: any) => l.speaker_name).filter(Boolean))] as string[];
        allRows.push(...gate('dialogue', buildDialogueItems(unitId, oid, dialogueLines, allSpeakers)));
      }
    } catch (err: any) {
      errors.push(`objective reconciliation failed: ${err?.message || err}`);
    }

    // ── 3.5 Unified speech backfill: ONE audio generation for everything the
    // published unit will ever speak (owner decision 2026-08-18). Publish is
    // the PRIMARY generator for all TTS consumers; the play-time resolver
    // stays as the safety net. Sources, mirroring the client play contract
    // (apps/board/templates/speechPreload.ts speechTextOf + the story/dialogue
    // stages' per-page/per-line audio buttons):
    //   • pool rows — reference-based listening/production items whose speech
    //     text has no stored audio (LISTEN_SELECT / AUDIO_L1_SELECT /
    //     MINIMAL_PAIR_SWIPE / DICTATION / SPEAK_SENTENCE)
    //   • vocab example sentences → vocabulary_items.example_audio_url
    //   • story page text → story_pages.audio_asset_id
    //   • dialogue line text → dialogue_lines.audio_asset_id
    // Cache-first by the SAME canonical prompt_hash the play-time resolver
    // computes (and step 1.5 used for words): hits reuse the stored MP3 with
    // zero synthesis, only true misses are generated — exactly once, ever.
    // Grammar emits no audio fields and no grammar game speaks text, so there
    // is deliberately nothing to generate for grammar.
    try {
      const speechJobs: { text: string; lang: string; hash: string }[] = [];
      const seenText = new Set<string>();
      const addSpeech = async (raw: any) => {
        const text = String(raw || '').trim();
        if (!text || seenText.has(text)) return;
        seenText.add(text);
        const lang = detectLang(text);
        const sig = primarySpeechSignature(lang, null);
        speechJobs.push({ text, lang, hash: await canonicalSpeechHash(text, lang, sig.voice, sig.model) });
      };

      for (const row of allRows) {
        const c = row.content as any;
        if (c.audio_url) continue; // already carries stored audio
        switch (row.exercise_type) {
          case 'LISTEN_SELECT':
          case 'AUDIO_L1_SELECT':
          case 'MINIMAL_PAIR_SWIPE':
            await addSpeech(c.prompt_text);
            break;
          case 'DICTATION':
            await addSpeech(c.prompt_text || c.correct_text);
            break;
          case 'SPEAK_SENTENCE':
            if (!c.target_audio) await addSpeech(c.target_sentence || c.target_word);
            break;
        }
      }
      for (const v of vocabWithImages) {
        if (v.word && !v.example_audio_url && v.example_sentence) await addSpeech(v.example_sentence);
      }

      const storyPagesNeedingAudio: { id: string; text: string }[] = [];
      try {
        const { data: spRows } = await sb.from('story_pages')
          .select('id, text, audio_asset_id')
          .eq('unit_id', unitId)
          .order('page_number', { ascending: true });
        for (const p of (spRows || []) as any[]) {
          if (p?.id && p?.text && !p.audio_asset_id) storyPagesNeedingAudio.push({ id: p.id, text: String(p.text) });
        }
      } catch { /* best-effort — table may not exist yet on legacy projects */ }
      for (const p of storyPagesNeedingAudio) await addSpeech(p.text);

      const dialogueLinesNeedingAudio: { id: string; text: string }[] = [];
      try {
        const { data: dlRows } = await sb.from('dialogue_lines')
          .select('id, text, audio_asset_id')
          .eq('unit_id', unitId)
          .order('order_index', { ascending: true });
        for (const l of (dlRows || []) as any[]) {
          if (l?.id && l?.text && !l.audio_asset_id) dialogueLinesNeedingAudio.push({ id: l.id, text: String(l.text) });
        }
      } catch { /* best-effort */ }
      for (const l of dialogueLinesNeedingAudio) await addSpeech(l.text);

      if (speechJobs.length > 0) {
        const urlByHash = new Map<string, string>();
        const hashes = [...new Set(speechJobs.map((j) => j.hash))];
        try {
          const { data: cached } = await sb.from('assets')
            .select('prompt_hash, public_url')
            .eq('type', 'audio')
            .in('prompt_hash', hashes);
          for (const a of (cached || []) as any[]) {
            if (a?.prompt_hash && a?.public_url) urlByHash.set(a.prompt_hash, a.public_url);
          }
        } catch { /* cache lookup is best-effort — misses just generate */ }

        const misses = speechJobs.filter((j) => !urlByHash.has(j.hash));
        if (misses.length > 0) {
          const results = await mapWithConcurrency(misses, 3, (j) =>
            generateAndStoreAudio(j.text, unitId, { lang: j.lang, promptHash: j.hash })
              .then((r) => ({ hash: j.hash, url: r.url, error: r.error })),
          );
          let speechFailures = 0;
          for (const r of results) {
            if (r.url && !r.error) urlByHash.set(r.hash, r.url);
            else speechFailures++;
          }
          if (speechFailures > 0) {
            errors.push(`speech backfill: ${speechFailures}/${misses.length} generations failed — play-time resolver covers them`);
          }
        }

        const urlForText = (raw: any): string | undefined => {
          const job = speechJobs.find((j) => j.text === String(raw || '').trim());
          return job ? urlByHash.get(job.hash) : undefined;
        };

        // Patch the pool rows BEFORE the insert below, so the published items
        // carry their audio and games never hit the resolver for them.
        for (const row of allRows) {
          const c = row.content as any;
          if (c.audio_url) continue;
          if (row.exercise_type === 'SPEAK_SENTENCE') {
            if (!c.target_audio) {
              const url = urlForText(c.target_sentence || c.target_word);
              if (url) c.target_audio = url;
            }
          } else if (
            row.exercise_type === 'LISTEN_SELECT' ||
            row.exercise_type === 'AUDIO_L1_SELECT' ||
            row.exercise_type === 'MINIMAL_PAIR_SWIPE' ||
            row.exercise_type === 'DICTATION'
          ) {
            const url = urlForText(c.prompt_text || c.correct_text);
            if (url) c.audio_url = url;
          }
        }

        // Example sentences → vocabulary_items.example_audio_url (canonical
        // content row; future runs skip via the has-audio checks above).
        const exUpdates: Promise<any>[] = [];
        for (const v of vocabWithImages) {
          if (!v.example_audio_url && v.example_sentence) {
            const url = urlForText(v.example_sentence);
            if (url) {
              exUpdates.push(
                sb.from('vocabulary_items').update({ example_audio_url: url }).eq('unit_id', unitId).eq('word', String(v.word)),
              );
            }
          }
        }
        if (exUpdates.length > 0) await runBounded(exUpdates, 6);

        // Story pages + dialogue lines reference audio by asset ID (FK), so
        // resolve hash → asset id (covers cached AND freshly generated rows).
        if (storyPagesNeedingAudio.length > 0 || dialogueLinesNeedingAudio.length > 0) {
          const idByHash = new Map<string, string>();
          try {
            const { data: assetRows } = await sb.from('assets')
              .select('id, prompt_hash')
              .eq('type', 'audio')
              .in('prompt_hash', hashes);
            for (const a of (assetRows || []) as any[]) {
              if (a?.id && a?.prompt_hash) idByHash.set(a.prompt_hash, a.id);
            }
          } catch { /* best-effort */ }
          const assetIdForText = (raw: any): string | null => {
            const job = speechJobs.find((j) => j.text === String(raw || '').trim());
            return job ? (idByHash.get(job.hash) ?? null) : null;
          };
          const linkUpdates: Promise<any>[] = [];
          for (const p of storyPagesNeedingAudio) {
            const assetId = assetIdForText(p.text);
            if (assetId) linkUpdates.push(sb.from('story_pages').update({ audio_asset_id: assetId }).eq('id', p.id));
          }
          for (const l of dialogueLinesNeedingAudio) {
            const assetId = assetIdForText(l.text);
            if (assetId) linkUpdates.push(sb.from('dialogue_lines').update({ audio_asset_id: assetId }).eq('id', l.id));
          }
          if (linkUpdates.length > 0) await runBounded(linkUpdates, 6);
        }
      }
    } catch (err: any) {
      errors.push(`speech backfill failed: ${err?.message || err}`);
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

    // Zero errors with zero persisted items is a legitimate outcome (e.g. a
    // unit whose only content got registry-gated) — treat it as a successful
    // run that produced nothing, not a failure (audit 2026-08-17, landmine 5).
    //
    // AUDIT FIX (2026-08-28): audio-generation failures are NON-FATAL by
    // design — the play-time resolver generates speech on demand — but they
    // were still failing the WHOLE job, so the teacher saw "couldn't
    // generate" over 100-600 successfully persisted pool items. Pools
    // persisted ⇒ succeeded; audio degradation is a warning, never a failure.
    const FATAL_ERROR = /pool persistence failed|pool_items insert failed|retire-old|objective reconciliation failed|manifest media update failed|srs objective backfill failed|speech backfill failed:/;
    const fatal = errors.filter((e: string) => FATAL_ERROR.test(e));
    const warnings = errors.filter((e: string) => !FATAL_ERROR.test(e));
    const ok = fatal.length === 0;
    await markJob(ok ? 'succeeded' : 'failed', {
      error: ok
        ? (warnings.length > 0 ? `completed with warnings: ${warnings.join('; ').slice(0, 300)}` : undefined)
        : (fatal.join('; ') || 'no pool items persisted'),
    });

    return {
      success: ok,
      unitId,
      objectives: objectiveIdFor.size,
      poolItems: persistedCount,
      typeCounts,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(fatal.length > 0 ? { errors: fatal } : {}),
    };
  });
});
