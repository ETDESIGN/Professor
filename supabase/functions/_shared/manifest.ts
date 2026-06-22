// Canonical lesson manifest normalizer (Edge mirror of services/manifest.ts).
//
// Phase 2 (audit P1-1 / P1-2): the units.manifest JSONB column and the
// `approvedAssets` payload arrive in multiple shapes (knowledge_graph vs
// enriched_content vs flat). normalizeManifest() reduces any of them to one
// flat CanonicalManifest so orchestrate-lesson reads a single, crash-proof
// contract regardless of which producer wrote the data.
//
// IMPORTANT: keep this file in sync with services/manifest.ts (client). They
// are intentionally duplicated because edge (Deno) and client (bundler) cannot
// share a module root.

export interface CanonicalVocab {
  word: string;
  definition?: string;
  example_sentence?: string;
  translation?: string;
  image_prompt?: string;
  image_url?: string;
  distractors?: string[];
}

export interface CanonicalGrammar {
  rule: string;
  explanation?: string;
  examples?: string[];
}

export interface CanonicalManifest {
  meta: { unit_title: string; theme: string; difficulty_cefr?: string; description?: string };
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
    image_prompt: v?.image_prompt ?? v?.visual_prompt,
    image_url: v?.image_url,
    distractors: asArray(v?.distractors),
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
  };
  if (!out.rule) return out;
  return out;
}

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
