// Pure exercise-quality helpers for generate-exercises. No Deno APIs, no I/O
// — repo-tested via test/exerciseQuality.test.ts (the _shared/contentGroups.ts
// pattern). Owner direction 2026-09-14: distractors must be REAL-grammar
// wrong variants of the same stem — "just by adding maybe some inversion on
// the place of the word would be enough. Creating fake world doesn't make
// sense."

/** Fold case/typographic apostrophes/terminal punctuation/whitespace so
 *  visually-identical options dedupe (the "He mustn't go outside" ×4 bug). */
export function normalizeForDedupe(s: string): string {
  return String(s ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:\s]+$/g, '')
    .trim();
}

/** AI `confusables` pass through unsanitized today — "Friday vs Saturday"
 *  reached kids verbatim. Drop vs/or-joined alternatives and questions. */
const VS_JOINER = /\bvs\.?\b|\bor\b|\|/;
export function sanitizeConfusables(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0 && x.length < 60 && !VS_JOINER.test(x) && !x.includes('?'));
}

/** Normalized dedupe of distractors against the correct answer AND each
 *  other; keeps first-seen surface form. */
export function dedupeDistinct(correct: string, distractors: string[]): string[] {
  const seen = new Set([normalizeForDedupe(correct)]);
  const out: string[] = [];
  for (const d of distractors) {
    const key = normalizeForDedupe(d);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

const FREQ_ADVERBS = new Set(['always', 'never', 'often', 'sometimes', 'usually', 'rarely', 'seldom']);
const MODALS = new Set(['must', "mustn't", 'should', "shouldn't", 'will', "won't", 'may', 'might']);

/**
 * REAL-grammar wrong variants of a CORRECT sentence — word-order inversions
 * and classic ESL error classes only (frequency-adverb misplacement, modal+
 * "to", third-person -s drop, a/an misuse, don't/doesn't swap). Conservative
 * pattern matching; returns [] when nothing applies. Never invents words.
 */
export function grammarMutations(sentence: string): string[] {
  const src = String(sentence ?? '').trim().replace(/\s+/g, ' ');
  if (!src) return [];
  const toks = src.split(' ');
  const norm = normalizeForDedupe(src);
  const out = new Set<string>();
  const push = (cand: string[]) => {
    // Insertions (modal+to) legitimately grow the token count by one.
    if (cand.length !== toks.length && cand.length !== toks.length + 1) return;
    const s = cand.join(' ');
    if (normalizeForDedupe(s) !== norm) out.add(s);
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].toLowerCase().replace(/[.!?,;:]+$/, '');

    // 1) frequency adverb swapped with its neighbour ("I always eat" → "I eat always")
    if (FREQ_ADVERBS.has(t)) {
      const j = i + 1 < toks.length ? i + 1 : i - 1;
      if (j >= 0 && j !== i) {
        const cand = [...toks];
        [cand[i], cand[j]] = [cand[j], cand[i]];
        push(cand);
      }
    }

    // 2) modal + to ("must wear" → "must to wear")
    if (
      MODALS.has(t) &&
      (toks[i + 1] || '').toLowerCase() !== 'to' &&
      (toks[i + 1] || '').toLowerCase() !== 'be'
    ) {
      push([...toks.slice(0, i + 1), 'to', ...toks.slice(i + 1)]);
    }

    // 3) third-person -s drop ("she eats" → "she eat")
    if (
      i > 0 &&
      /^(he|she|it)$/i.test(toks[i - 1]) &&
      /^[a-z]+s$/i.test(t) &&
      !/(ss|us|is)$/i.test(t)
    ) {
      push([...toks.slice(0, i), toks[i].replace(/s$/i, ''), ...toks.slice(i + 1)]);
    }

    // 4) a/an misuse (correct "an egg" → wrong "a egg"; correct "a dog" → wrong "an dog")
    const next0 = (toks[i + 1] || '').replace(/[^a-z]/gi, '')[0]?.toLowerCase();
    if (t === 'an' && next0 && 'aeiou'.includes(next0)) {
      const cand = [...toks];
      cand[i] = 'a';
      push(cand);
    }
    if (t === 'a' && next0 && !'aeiou'.includes(next0)) {
      const cand = [...toks];
      cand[i] = 'an';
      push(cand);
    }

    // 5) don't/doesn't swap
    if (t === "doesn't") {
      const cand = [...toks];
      cand[i] = "don't";
      push(cand);
    } else if (t === "don't") {
      const cand = [...toks];
      cand[i] = "doesn't";
      push(cand);
    }
  }
  return [...out];
}
