// Class-flow derivation (FIXPLAN I-P4, doc 11 §4). Pure TypeScript — NO
// Deno imports — shared by the generate-class-flow edge function + vitest.
//
// The unit flow is the TEMPLATE: the game sequence, phase tags, rotation
// variety and teacher-composed blocks carry over unchanged. Only the
// content-bearing blocks are re-scoped to the class's slice; pool-driven
// shells stay as-is (the runtime pool pull is class-scoped by the session's
// activeClassPlan). Content-free-for-this-class blocks are DROPPED (an
// empty story stage must never reach the board). Deterministic, no AI.
//
// Also hosts the WS4 freeze-time vocab-image resolver (pure part + the
// best-effort word_images fetch, injected client — still no imports so
// vitest can load this file). Both flow composers (orchestrate-lesson and
// generate-class-flow) freeze card images through it so a unit/class flow
// never bakes a dicebear placeholder while the teacher's word library has
// a real asset for the word.

import { canonicalWordKey } from './wordImageCore.ts';

export interface ClassVocabItem {
  word: string;
  definition?: string | null;
  example_sentence?: string | null;
  image_url?: string | null;
  phonetic?: string | null;
  audio_url?: string | null;
}

export interface ClassGrammarRule {
  rule: string;
  explanation?: string | null;
  examples?: string[] | null;
}

export interface ClassStoryPage {
  text: string;
  speaker?: string | null;
}

export interface ClassDialogueLine {
  speaker?: string | null;
  text: string;
  translation?: string | null;
}

export interface ClassContent {
  title: string;      // class title
  theme?: string | null; // unit theme (subtitle)
  vocab: ClassVocabItem[];
  grammar: ClassGrammarRule[];
  story: ClassStoryPage[];
  dialogue: ClassDialogueLine[];
}

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'vocab')}`;

const exampleOf = (v: ClassVocabItem) => v.example_sentence || '';

// ── WS4: freeze-time vocab-image resolution ────────────────────────────────
// Real image = http(s) URL that is neither a dicebear fallback nor a dead
// pollinations placeholder (same realness rule as wordImageCore.ts).
export const isRealVocabImage = (url: string | null | undefined): url is string =>
  !!url && !/dicebear\.com|pollinations\.ai/i.test(url);

/**
 * Freeze order for vocabulary-backed card images (WS4):
 *   1. a REAL v.image_url (placeholders fall through, not just empties)
 *   2. the per-teacher word_images library (owner + canonicalWordKey(word))
 *   3. dicebear — flagged image_placeholder so consumers can heal at render.
 * The image is never null/empty: the fallback always stands.
 */
export function resolveVocabImage(
  word: string,
  imageUrl: string | null | undefined,
  wordImages: Map<string, string> | null | undefined,
): { image: string; image_placeholder: boolean } {
  if (isRealVocabImage(imageUrl)) return { image: imageUrl, image_placeholder: false };
  const hit = wordImages?.get(canonicalWordKey(word));
  if (isRealVocabImage(hit)) return { image: hit, image_placeholder: false };
  return { image: dicebear(String(word || '')), image_placeholder: true };
}

/**
 * Batch word_images lookup (SQL join word_images → assets.public_url by
 * owner_id + word_key) as a Map keyed by the SAME canonicalWordKey
 * ensureWordImage upserts with — lowercase/trim/collapse-whitespace — so an
 * exact `in` match IS the case-insensitive match. Best-effort: on any error
 * the map stays empty and the dicebear fallback stands.
 */
export async function fetchWordImageMap(
  sb: any, // SupabaseClient, injected — keeps this file import-free for vitest
  ownerId: string | null | undefined,
  words: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const keys = [...new Set((words || []).map(canonicalWordKey).filter(Boolean))];
  if (!ownerId || keys.length === 0) return map;
  try {
    const { data } = await sb
      .from('word_images')
      .select('word_key, assets(public_url)')
      .eq('owner_id', ownerId)
      .in('word_key', keys);
    for (const row of (data || []) as any[]) {
      const url = row?.assets?.public_url;
      if (row?.word_key && isRealVocabImage(url)) map.set(String(row.word_key), String(url));
    }
  } catch { /* freeze-time resolution is best-effort */ }
  return map;
}

/**
 * Scope the unit flow template to a class's content. Every block survives
 * except: content blocks rebuilt below, and content-bearing blocks whose
 * class content is empty (dropped). Unknown block types pass through
 * verbatim (teacher sovereignty — PlanComposer additions survive).
 *
 * `wordImages` (optional, WS4): canonical word_key → real asset URL, fetched
 * via fetchWordImageMap for the unit owner — the freeze-time rung between
 * v.image_url and the dicebear placeholder.
 */
export function buildClassFlow(unitFlow: any[], content: ClassContent, wordImages?: Map<string, string>): any[] {
  const out: any[] = [];

  for (const block of unitFlow || []) {
    if (!block || typeof block.type !== 'string') continue;
    const type: string = block.type;
    const data = (block.data && typeof block.data === 'object') ? block.data : {};

    if (type === 'INTRO_SPLASH') {
      out.push({ ...block, data: { ...data, title: content.title, subtitle: data.subtitle ?? content.theme ?? '' } });
      continue;
    }

    if (type === 'FOCUS_CARDS') {
      if (content.vocab.length === 0) continue; // drop: class has no words
      out.push({
        ...block,
        data: {
          ...data,
          title: `${content.title} — Vocabulary`,
          cards: content.vocab.map((v) => {
            const img = resolveVocabImage(v.word, v.image_url, wordImages);
            return {
              front: v.word,
              back: v.definition || '',
              context_sentence: exampleOf(v),
              phonetic: v.phonetic,
              image: img.image,
              // WS4: honest placeholder marker so the board can prefer the
              // manifest/word-library image at render time.
              ...(img.image_placeholder ? { image_placeholder: true } : {}),
              audio_url: v.audio_url || undefined,
            };
          }),
        },
      });
      continue;
    }

    if (type === 'SPEAKING') {
      const first = content.vocab[0];
      if (!first) continue;
      out.push({
        ...block,
        data: {
          ...data,
          targetSentence: exampleOf(first) || first.word,
          targetWord: first.word,
        },
      });
      continue;
    }

    if (type === 'STORY_STAGE') {
      if (content.story.length === 0) continue; // drop: class has no story pages
      out.push({
        ...block,
        data: {
          ...data,
          title: `${content.title} — Story`,
          pages: content.story.map((p) => ({
            text: p.text,
            speaker: p.speaker || 'Narrator',
            avatar: '👤',
          })),
        },
      });
      continue;
    }

    if (type === 'DIALOGUE_STAGE') {
      if (content.dialogue.length === 0) continue; // drop: class has no dialogue
      out.push({
        ...block,
        data: {
          ...data,
          title: `${content.title} — Dialogue`,
          lines: content.dialogue.map((l) => ({
            speaker: l.speaker || 'Speaker',
            text: l.text,
            translation: l.translation ?? undefined,
          })),
        },
      });
      continue;
    }

    if (type === 'GRAMMAR_SANDBOX') {
      const g = content.grammar[0];
      if (!g) continue; // drop: class has no grammar
      out.push({
        ...block,
        data: {
          ...data,
          title: g.rule,
          explanation: g.explanation || '',
          examples: g.examples || [],
        },
      });
      continue;
    }

    // Frozen-data variants of the competitive games: rebuild their frozen
    // payload from class vocab so even non-pool fallbacks stay in-scope.
    // Pool-driven shells (data.poolDriven) keep their shell untouched.
    if (type === 'TEAM_BATTLE' && !data.poolDriven) {
      if (content.vocab.length === 0) continue;
      // Distractors come from the class's OWN other words (deterministic
      // order — the board shuffles per round).
      out.push({
        ...block,
        data: {
          ...data,
          topic: content.theme || content.title,
          questions: content.vocab.slice(0, 8).map((v, i) => {
            const distractors = content.vocab
              .filter((w) => w.word !== v.word && w.definition)
              .slice(0, 3)
              .map((w) => w.definition as string);
            return {
              id: `q${i}`,
              text: `What does "${v.word}" mean?`,
              image: resolveVocabImage(v.word, v.image_url, wordImages).image,
              options: [v.definition || v.word, ...distractors].slice(0, 4),
              correct: v.definition || v.word,
            };
          }),
        },
      });
      continue;
    }

    if (type === 'FLASH_MATCH' && !data.poolDriven) {
      if (content.vocab.length < 2) continue;
      out.push({
        ...block,
        data: {
          ...data,
          pairs: content.vocab.slice(0, 5).map((v, i) => ({
            id: `p_${i}`,
            left: v.word,
            right: v.definition || `${v.word} def`,
          })),
        },
      });
      continue;
    }

    // Everything else: pool-driven shells (SOUND_LAB, MEMORY_LAB, WORD_
    // DETECTIVE, SENTENCE_LAB, GRAMMAR_LAB, STORY_QUEST, CLASS_RALLY, …),
    // MEDIA_PLAYER warm-ups, and teacher-composed blocks — verbatim (the
    // spread keeps phase tags and poolDriven flags).
    out.push({ ...block });
  }

  return out;
}
