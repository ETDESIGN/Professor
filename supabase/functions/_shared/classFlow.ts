// Class-flow derivation (FIXPLAN I-P4, doc 11 §4). Pure TypeScript — NO
// Deno imports — shared by the generate-class-flow edge function + vitest.
//
// The unit flow is the TEMPLATE: the game sequence, phase tags, rotation
// variety and teacher-composed blocks carry over unchanged. Only the
// content-bearing blocks are re-scoped to the class's slice; pool-driven
// shells stay as-is (the runtime pool pull is class-scoped by the session's
// activeClassPlan). Content-free-for-this-class blocks are DROPPED (an
// empty story stage must never reach the board). Deterministic, no AI.

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

/**
 * Scope the unit flow template to a class's content. Every block survives
 * except: content blocks rebuilt below, and content-bearing blocks whose
 * class content is empty (dropped). Unknown block types pass through
 * verbatim (teacher sovereignty — PlanComposer additions survive).
 */
export function buildClassFlow(unitFlow: any[], content: ClassContent): any[] {
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
          cards: content.vocab.map((v) => ({
            front: v.word,
            back: v.definition || '',
            context_sentence: exampleOf(v),
            phonetic: v.phonetic,
            image: v.image_url || dicebear(v.word),
            audio_url: v.audio_url || undefined,
          })),
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
              image: v.image_url || dicebear(v.word),
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
