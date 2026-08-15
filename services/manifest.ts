// Canonical lesson manifest normalizer.
//
// Phase 2 (audit P1-1 / P1-2): the manifest JSONB column has historically been
// written in THREE different shapes by different producers:
//   1. { meta, knowledge_graph: { vocabulary, grammar_rules, characters }, timeline }
//        — written by AssetWorkshop and expected by LessonTransformer.
//   2. { meta, enriched_content: { vocabulary, grammar, characters, story, ... } }
//        — written by the enrich-unit edge function (incremental enrichment).
//   3. flat { title, topic, vocabulary, grammar, ... }
//        — the "approvedAssets" payload passed to orchestrate-lesson.
// Plus units with NO manifest at all (created before enrichment).
//
// normalizeManifest() accepts ANY of these (or null) and returns one flat
// CanonicalManifest so every consumer (LessonTransformer, LessonStudio,
// UnitContentVault, SoloLessonPlayer, orchestrate-lesson) reads through a
// single, crash-proof contract.

export interface CanonicalVocab {
  word: string;
  definition?: string;
  /** Normalised from example_sentence || context_sentence. */
  example_sentence?: string;
  translation?: string;
  /** Simplified Chinese (L1) translation — STRICT L1 for the Chinese market. */
  l1_translation?: string;
  /** IPA phonetic transcription (BoardFocusCards reads this, not a missing `pronunciation`). */
  phonetic?: string;
  part_of_speech?: string;
  image_prompt?: string;
  image_url?: string;
  /** TTS narration of the word (generated at enrich time). */
  audio_url?: string;
  /** TTS narration of the example_sentence (generated at enrich time). */
  example_audio_url?: string;
  distractors?: string[];
  /** Words easily confused with this one (spelling/sound/meaning). */
  confusables?: string[];
}

export interface CanonicalGrammar {
  rule: string;
  explanation?: string;
  /** Normalised from examples || world_examples. */
  examples?: string[];
  /** Fill-in-the-blank structure for substitution drills. */
  pattern_template?: string;
  /** Pairs showing a grammar transformation (affirmative->negative, etc.). */
  transformation_pairs?: any[];
  /** Common learner errors with corrections (for ERROR_SPOT). */
  error_examples?: any[];
}

export interface CanonicalManifest {
  meta: {
    unit_title: string;
    theme: string;
    difficulty_cefr?: string;
    description?: string;
  };
  vocabulary: CanonicalVocab[];
  grammar: CanonicalGrammar[];
  characters: any[];
  story: { title?: string; setting?: string; pages: any[] };
  song_suggestions: any[];
  video_suggestions: any[];
  dialogues: any[];
  timeline: any[];
}

const EMPTY_MANIFEST: CanonicalManifest = {
  meta: { unit_title: 'Lesson', theme: '' },
  vocabulary: [],
  grammar: [],
  characters: [],
  story: { pages: [] },
  song_suggestions: [],
  video_suggestions: [],
  dialogues: [],
  timeline: [],
};

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function normalizeVocab(v: any): CanonicalVocab {
  const out: CanonicalVocab = {
    word: String(v?.word ?? v?.term ?? v?.name ?? '').trim(),
    definition: v?.definition ?? v?.meaning,
    example_sentence: v?.example_sentence ?? v?.context_sentence ?? v?.sentence,
    translation: v?.translation,
    l1_translation: v?.l1_translation,
    phonetic: v?.phonetic ?? v?.ipa ?? v?.pronunciation,
    part_of_speech: v?.part_of_speech ?? v?.pos ?? v?.category,
    image_prompt: v?.image_prompt ?? v?.visual_prompt,
    image_url: v?.image_url,
    audio_url: v?.audio_url,
    example_audio_url: v?.example_audio_url,
    distractors: asArray(v?.distractors),
    confusables: asArray(v?.confusables),
  };
  if (!out.word) return out;
  Object.keys(out).forEach((k) => (out as any)[k] === undefined && delete (out as any)[k]);
  return out;
}

function normalizeGrammar(g: any): CanonicalGrammar {
  const out: CanonicalGrammar = {
    rule: String(g?.rule ?? g?.name ?? '').trim(),
    explanation: g?.explanation,
    examples: asArray(g?.examples ?? g?.world_examples),
    pattern_template: g?.pattern_template ?? g?.pattern,
    transformation_pairs: asArray(g?.transformation_pairs),
    error_examples: asArray(g?.error_examples),
  };
  if (!out.rule) return out;
  Object.keys(out).forEach((k) => (out as any)[k] === undefined && delete (out as any)[k]);
  return out;
}

/**
 * Reduce any manifest shape (or null) to the flat CanonicalManifest.
 * Source priority: explicit `enriched_content` first (most complete), then
 * `knowledge_graph`, then top-level fields.
 */
export function normalizeManifest(raw: any): CanonicalManifest {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_MANIFEST };

  const ec = raw.enriched_content && typeof raw.enriched_content === 'object' ? raw.enriched_content : null;
  const kg = raw.knowledge_graph && typeof raw.knowledge_graph === 'object' ? raw.knowledge_graph : null;

  const vocabulary = asArray(ec?.vocabulary ?? kg?.vocabulary ?? raw.vocabulary).map(normalizeVocab).filter((v: CanonicalVocab) => v.word);
  const grammar = asArray(ec?.grammar ?? kg?.grammar_rules ?? raw.grammar_rules ?? raw.grammar).map(normalizeGrammar).filter((g: CanonicalGrammar) => g.rule);
  const characters = asArray(ec?.characters ?? kg?.characters ?? raw.characters);
  const storyRaw = ec?.story ?? raw.story ?? { pages: asArray(kg?.narrative_arc ? [{ text: kg.narrative_arc }] : []) };
  const story = {
    title: storyRaw?.title,
    setting: storyRaw?.setting,
    pages: asArray(storyRaw?.pages),
  };

  return {
    meta: {
      unit_title: raw?.meta?.unit_title ?? ec?.title ?? raw?.title ?? raw?.meta?.theme ?? EMPTY_MANIFEST.meta.unit_title,
      theme: raw?.meta?.theme ?? ec?.topic ?? raw?.topic ?? '',
      difficulty_cefr: raw?.meta?.difficulty_cefr ?? ec?.gradeLevel ?? raw?.gradeLevel,
      description: ec?.description ?? raw?.description,
    },
    vocabulary,
    grammar,
    characters,
    story,
    song_suggestions: asArray(ec?.song_suggestions ?? raw.song_suggestions),
    video_suggestions: asArray(ec?.video_suggestions ?? raw.video_suggestions),
    dialogues: asArray(ec?.dialogues ?? raw.dialogues),
    timeline: asArray(raw?.timeline),
  };
}

/** Convenience accessor: vocabulary (tolerant of any manifest shape). */
export function getVocabulary(manifest: any): CanonicalVocab[] {
  // C.4: prefer the relational vocabulary_items (attached to the manifest as
  // _relational by the activeUnit loader via get_unit_bundle), falling back to
  // the manifest for units whose vocab hasn't cleared C.3 yet. Per-category gate.
  const rel = manifest?._relational;
  if (rel && Array.isArray(rel.vocabulary_items) && rel.vocabulary_items.length > 0) {
    return rel.vocabulary_items.map((v: any) => ({
      word: v.word || '', definition: v.definition, example_sentence: v.example_sentence,
      translation: v.l1_translation, l1_translation: v.l1_translation, phonetic: v.phonetic,
      part_of_speech: v.part_of_speech, image_prompt: v.image_prompt, image_url: v.image_url,
      audio_url: v.audio_url, example_audio_url: v.example_audio_url,
      distractors: Array.isArray(v.distractors) ? v.distractors : [],
      confusables: Array.isArray(v.confusables) ? v.confusables : [],
    })).filter((v: CanonicalVocab) => v.word);
  }
  return normalizeManifest(manifest).vocabulary;
}

export interface StoryPage {
  text?: string;
  speaker?: string;
  image?: string;
  imageUrl?: string;
  image_url?: string;
  image_prompt?: string;
  comprehension_questions?: { question?: string; options?: string[]; answer?: number }[];
}

export interface CanonicalStory {
  title?: string;
  setting?: string;
  pages: StoryPage[];
}

/** The unit's story (title/setting + pages with text/image/comprehension). */
export function getStory(manifest: any): CanonicalStory {
  // C.4: prefer relational story_pages (via _relational), keeping title/setting
  // from the manifest; fall back to the manifest story for unmigrated units.
  const base = normalizeManifest(manifest).story;
  const rel = manifest?._relational;
  if (rel && Array.isArray(rel.story_pages) && rel.story_pages.length > 0) {
    // Build a lookup of comprehension questions by story_page_id.
    const questions: any[] = Array.isArray(rel.story_questions) ? rel.story_questions : [];
    const qByPageId = new Map<string, any[]>();
    const qNoPageId: any[] = [];
    for (const q of questions) {
      if (q.story_page_id) {
        const arr = qByPageId.get(q.story_page_id) || [];
        arr.push(q);
        qByPageId.set(q.story_page_id, arr);
      } else {
        qNoPageId.push(q);
      }
    }
    // Sort each group by order_index for stable ordering.
    for (const arr of qByPageId.values()) arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    qNoPageId.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    return {
      title: base.title,
      setting: base.setting,
      pages: rel.story_pages.map((p: any, i: number) => {
        // Attach comprehension questions: match by story_page_id, fallback to
        // order_index-based assignment for questions with null story_page_id.
        const matched = qByPageId.get(p.id) || [];
        const fallback = qNoPageId.filter((q) => q.order_index === i);
        const cqs = [...matched, ...fallback].map((q) => ({
          question: q.question,
          options: Array.isArray(q.options) ? q.options : [],
          answer: typeof q.answer_index === 'number' ? q.answer_index : 0,
        }));
        // Resolve image URL from the bundle's asset join (Part B migration).
        const imgUrl = p.image_url || undefined;
        return {
          text: p.text,
          speaker: p.speaker || p.speaker_override_name,
          image_prompt: p.image_prompt,
          image: imgUrl,
          imageUrl: imgUrl,
          image_url: imgUrl,
          comprehension_questions: cqs.length > 0 ? cqs : [],
        };
      }),
    };
  }
  return base;
}

export interface DialogueLine {
  speaker?: string;
  text?: string;
  translation?: string;
}

/**
 * The unit's grammar rules. Phase 4 (grammar strand, 2026-08-06): prefers the
 * canonical `grammar_rules` relational rows (via _relational, attached by the
 * activeUnit loader through get_unit_bundle), falling back to the manifest
 * cache for units whose grammar hasn't been relationalized yet. Carries
 * pattern_template / transformation_pairs / error_examples — the fields
 * BoardGrammarSandbox v2 and BoardGrammarForge rung 4 read directly (not via
 * pool items), per the grammar-strand spec's content-source map.
 */
export function getGrammar(manifest: any): CanonicalGrammar[] {
  const rel = manifest?._relational;
  if (rel && Array.isArray(rel.grammar_rules) && rel.grammar_rules.length > 0) {
    return rel.grammar_rules.map((g: any): CanonicalGrammar => ({
      rule: String(g?.rule ?? '').trim(),
      explanation: g?.explanation ?? undefined,
      examples: asArray(g?.examples),
      pattern_template: g?.pattern_template ?? undefined,
      transformation_pairs: asArray(g?.transformation_pairs),
      error_examples: asArray(g?.error_examples),
    })).filter((g: CanonicalGrammar) => g.rule);
  }
  // Fallback: manifest cache (normalized).
  return normalizeManifest(manifest).grammar;
}

/** The unit's dialogue lines (speaker-attributed), flattened across dialogues. */
export function getDialogues(manifest: any): DialogueLine[] {
  // C.4: prefer relational dialogue_lines (via _relational), resolving the
  // speaker character id to a name via the bundle's characters; fall back to the
  // manifest's dialogues[].lines[]. BoardDialogueStage routes through this so it
  // is no longer a direct enriched_content read (the one exception the advisor
  // flagged).
  const rel = manifest?._relational;
  if (rel && Array.isArray(rel.dialogue_lines) && rel.dialogue_lines.length > 0) {
    const chars: any[] = Array.isArray(rel.characters) ? rel.characters : [];
    const charName = new Map<string, string>(chars.map((c: any) => [c.id, c.name]));
    return rel.dialogue_lines.map((l: any) => ({
      speaker: (l.speaker_character_id && charName.get(l.speaker_character_id)) || l.speaker_override_name || 'Speaker',
      text: l.text,
      translation: l.translation,
    }));
  }
  const dialogues = normalizeManifest(manifest).dialogues || [];
  return dialogues.flatMap((d: any) =>
    Array.isArray(d?.lines)
      ? d.lines.map((l: any) => ({ speaker: l.speaker, text: l.text, translation: l.translation }))
      : []
  );
}
