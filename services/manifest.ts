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
  return normalizeManifest(manifest).vocabulary;
}

export interface StoryPage {
  text?: string;
  speaker?: string;
  image?: string;
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
  return normalizeManifest(manifest).story;
}
