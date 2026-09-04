// Media resolver CORE (media-resolution design §4.1) — the pure half of the
// catalog-first resolution ladder. Age-band mapping, title normalization +
// similarity (the hallucination gate: an AI-guessed video must oEmbed-validate
// AND its real title must resemble the claimed one), channel allowlist tiers,
// duration sanity, candidate ranking, catalog scoring, and the auto-apply
// safety gate.
//
// Pure TypeScript — NO Deno imports — so vitest and the edge runtime share
// the exact same behavior (same contract as bookScan.ts / storySegments.ts).
// The networked half (oEmbed fetch, catalog SQL, AI candidates, ladder
// orchestration) lives in mediaResolver.ts.

export type AgeBand = 'toddler' | 'early_primary' | 'upper_primary' | 'teen';

export const AGE_BAND_RANGES: Record<AgeBand, string> = {
  toddler: 'ages 3-5',
  early_primary: 'ages 6-8',
  upper_primary: 'ages 9-12',
  teen: 'ages 13+',
};

export interface MediaCandidate {
  title: string;
  channel: string;
  videoId?: string;
  url?: string;
  thumbnailUrl?: string;
  durationSec?: number | null;
  source: 'catalog' | 'book' | 'ai' | 'teacher';
  topics?: string[];
  ageBands?: AgeBand[];
}

// ── Age bands ────────────────────────────────────────────────────────────
// Sources: classes.grade_level (teacher-declared: 'Pre-K'…'4th Grade',
// 'ESL Beginner') and the manifest's AI-guessed CEFR ('A1/A2/B1',
// meta.difficulty_cefr). Unknown → null (the resolver then treats age as
// unconstrained instead of guessing wrong on purpose).

const GRADE_BANDS: Array<[RegExp, AgeBand]> = [
  [/pre-?k|preschool|nursery|kindergarten|kinder/i, 'toddler'],
  [/[123](st|nd|rd) grade|grade\s*[123]/i, 'early_primary'],
  [/[456](th) grade|grade\s*[456]/i, 'upper_primary'],
  [/esl beginner|esl\s*1/i, 'early_primary'],
];

const CEFR_BANDS: Array<[RegExp, AgeBand]> = [
  [/pre-?a1|a1/i, 'early_primary'],
  [/a2/i, 'upper_primary'],
  [/b1|b2|c1/i, 'teen'],
];

export function ageBandFromGrade(grade?: string | null): AgeBand | null {
  const g = typeof grade === 'string' ? grade.trim() : '';
  if (!g || /^general$/i.test(g)) return null;
  for (const [re, band] of GRADE_BANDS) if (re.test(g)) return band;
  for (const [re, band] of CEFR_BANDS) if (re.test(g)) return band;
  return null;
}

export function ageBandFromManifest(manifest?: any): AgeBand | null {
  if (!manifest || typeof manifest !== 'object') return null;
  return (
    ageBandFromGrade(manifest.gradeLevel) ||
    ageBandFromGrade(manifest.meta?.difficulty_cefr) ||
    null
  );
}

// ── Title normalization + similarity (hallucination gate) ────────────────

// Promo/boilerplate tokens that appear in kids-song titles but say nothing
// about WHICH song it is. Stripped before comparison so channel-branding
// noise cannot inflate or deflate similarity.
const TITLE_NOISE = new Set([
  'kids', 'kid', 'children', 'childrens', 'child', 'song', 'songs', 'sing',
  'along', 'singalong', 'nursery', 'rhymes', 'rhyme', 'for', 'kidsongs',
  'featuring', 'feat', 'ft', 'with', 'the', 'a', 'an', 'and', 'from', 'official',
  'video', 'music', 'animation', 'cartoon', 'learn', 'learning', 'english',
  'fun', 'best', 'more', 'hd', 'lyrics', 'version', 'remake', 'clip',
  'super', 'simple', 'songs', 'walrus', 'dream', 'esp', 'full',
]);

export function normalizeTitle(t: string): string[] {
  return String(t || '')
    // Split camelCase branding (@NoodleAndPals → Noodle And Pals) BEFORE
    // lowercasing so channel names written in CamelCase become comparable
    // tokens instead of one glued blob.
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ') // punctuation + symbols (emoji, pipes, @…)
    .replace(/\d+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !TITLE_NOISE.has(w));
}

/** Jaccard overlap of normalized title tokens: 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a));
  const tb = new Set(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ── Channel allowlist tiers (docs/media/kids-song-channels-analysis.md) ──

const CHANNEL_TIERS: Array<Array<string>> = [
  // tier 0 — ESL-native (built for language learners; auto-apply core)
  ['super simple', 'noodle & pals', 'noodle and pals', 'singing walrus',
    'dream english', 'wow english', 'steve and maggie', 'elf kids', 'elf learning',
    'maple leaf learning', 'english singsing', 'super simple play'],
  // tier 1 — classroom staples (education-first)
  ['jack hartmann', 'learning station', 'harry kindergarten', 'miss linky',
    'pancake manor', 'barefoot books', 'sesame'],
  // tier 2 — kids entertainment (clean but not ESL-graded)
  ['bounce patrol', 'pinkfong', 'cocomelon', 'little baby bum', 'chuchu tv',
    'kids tv', 'blippi', 'pancake'],
];

export function channelTier(channel: string): number {
  const c = String(channel || '').toLowerCase();
  for (let t = 0; t < CHANNEL_TIERS.length; t++) {
    if (CHANNEL_TIERS[t].some((n) => c.includes(n))) return t;
  }
  return CHANNEL_TIERS.length; // unknown — never auto-applies
}

// ── Duration sanity ──────────────────────────────────────────────────────
// The #1 search failure is compilations: the right song inside a 1-hour mix.
// Songs: 45s..8min. Videos: 60s..15min. Unknown duration passes (cannot
// judge) but ranks below a known-sane candidate.

export function durationOk(sec: number | null | undefined, kind: 'song' | 'video'): boolean {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return true;
  const min = kind === 'song' ? 45 : 60;
  const max = kind === 'song' ? 480 : 900;
  return sec >= min && sec <= max;
}

// ── Ranking ──────────────────────────────────────────────────────────────

export function rankCandidates(
  cands: MediaCandidate[],
  opts: { kind: 'song' | 'video'; ageBand?: AgeBand | null },
): MediaCandidate[] {
  const known = (c: MediaCandidate) => c.durationSec != null && Number.isFinite(c.durationSec);
  return [...cands].sort((a, b) => {
    // ESL value first — the whole point of the allowlist.
    const tier = channelTier(a.channel) - channelTier(b.channel);
    if (tier !== 0) return tier;
    // Duration-sane beats insane (compilations sink).
    const sane = Number(durationOk(a.durationSec, opts.kind)) - Number(durationOk(b.durationSec, opts.kind));
    if (sane !== 0) return -sane;
    // Known duration beats unknown (verifiable).
    const k = Number(known(a)) - Number(known(b));
    if (k !== 0) return -k;
    // Age-band match.
    const am = Number(Boolean(opts.ageBand && a.ageBands?.includes(opts.ageBand)))
      - Number(Boolean(opts.ageBand && b.ageBands?.includes(opts.ageBand)));
    if (am !== 0) return -am;
    // Shorter song is the tighter classroom fit.
    return (a.durationSec ?? 9999) - (b.durationSec ?? 9999);
  });
}

// ── Catalog scoring (ladder rungs 1-3) ───────────────────────────────────
// Scale: title match (book/suggestion) is decisive (≥5); topic match 2;
// vocab overlap up to 2; age match 1. Threshold for auto-apply lives in the
// resolver (networked half) — the core only scores.

export interface CatalogScoreInput {
  kind: 'song' | 'video';
  suggestionTitle?: string | null;
  bookSongTitle?: string | null;
  topic?: string | null;
  vocab?: string[];
  ageBand?: AgeBand | null;
}

/** Tokens of a catalog topic tag: 'animals_farm' → ['animals','farm']. */
const topicTokens = (topics?: string[]): Set<string> =>
  new Set((topics || []).flatMap((t) => String(t).split(/[_\s]+/)));

export function scoreCatalogEntry(
  entry: { title: string; topics?: string[]; ageBands?: AgeBand[] },
  input: CatalogScoreInput,
): number {
  let score = 0;

  // Rung 1/2: exact-ish title match — the book's own song title or the AI's
  // suggested title resolving to a catalog entry is the strongest signal.
  for (const claimed of [input.bookSongTitle, input.suggestionTitle]) {
    if (!claimed) continue;
    if (titleSimilarity(claimed, entry.title) >= 0.5) {
      score += input.bookSongTitle === claimed ? 6 : 5;
      break;
    }
  }

  // Rung 3: topic + vocab + age. Vocab words match the entry's TITLE tokens
  // as well as its topic tags ("finger" is in "One Little Finger", not in
  // the 'body' topic tag).
  const entryTopics = topicTokens(entry.topics);
  const entryTitleTokens = new Set(normalizeTitle(entry.title));
  if (input.topic) {
    const topicWords = normalizeTitle(input.topic);
    if (entryTopics.size > 0 && topicWords.some((w) => entryTopics.has(w))) score += 2;
    // Title corroboration (+1): among equally-tagged entries, the one whose
    // TITLE also names the topic is the better, deterministic pick — and a
    // topic match + title hit reaches the auto-apply threshold on its own
    // (real regression: "Animals and nature" stranded at 2 with no tiebreak).
    if (topicWords.some((w) => entryTitleTokens.has(w))) score += 1;
  }
  if (input.vocab?.length) {
    const hits = input.vocab.filter((v) => {
      const w = String(v || '').toLowerCase().trim();
      return Boolean(w) && (entryTopics.has(w) || entryTitleTokens.has(w));
    }).length;
    if (hits > 0) score += Math.min(2, hits * 0.5);
  }
  if (input.ageBand && entry.ageBands?.includes(input.ageBand)) score += 1;

  // A title-mismatching entry with no topic/vocab/age support is not a match.
  const hasSupport = score >= 2;
  if (!hasSupport && score < 5) return 0;
  return score;
}

// ── Auto-apply gate (age safety, design §4.4) ────────────────────────────
// Catalog/book/teacher sources are trusted-but-duration-checked; AI-guessed
// candidates only auto-apply from a KNOWN allowlisted channel (tier < 3) —
// plus, in the networked half, an oEmbed 200 + title-similarity ≥ 0.5.

export function autoApplyAllowed(cand: MediaCandidate, kind: 'song' | 'video'): boolean {
  if (cand.source === 'teacher') return true; // the teacher IS the truth
  if (!durationOk(cand.durationSec, kind)) return false;
  if (cand.source === 'ai') return channelTier(cand.channel) < 3;
  return true; // catalog / book: curated + verified at seed time
}
