// scoringUtils.ts — Shared scoring and partial credit helpers
//
// Extracted from BoardUnscramble for reuse across all new-gen games.
// Provides LCS-based partial credit, text normalization, and feedback helpers.

// ── LCS (Longest Common Subsequence) partial credit ──────────────────────

export function lcsLength(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function computeLCSPartialCredit(placedTiles: string[], targetTiles: string[]): number {
  if (targetTiles.length === 0) return placedTiles.length === 0 ? 1 : 0;
  return lcsLength(placedTiles, targetTiles) / targetTiles.length;
}

export const PARTIAL_PASS_THRESHOLD = 0.5; // below this = full miss

// ── Feedback helpers ─────────────────────────────────────────────────────

export function detectSwappedPair(placed: string[], target: string[]): [number, number] | null {
  if (placed.length !== target.length) return null;
  const diffPositions = target.map((_, i) => i).filter((i) => placed[i] !== target[i]);
  if (diffPositions.length === 2) {
    const [a, b] = diffPositions;
    if (b === a + 1 && placed[a] === target[b] && placed[b] === target[a]) return [a, b];
  }
  return null;
}

export function highlightFirstWrongPosition(placed: string[], target: string[]): number {
  for (let i = 0; i < placed.length; i++) {
    if (placed[i] !== target[i]) return i;
  }
  return placed.length < target.length ? placed.length : -1;
}

// ── Levenshtein distance (for speech recognition scoring) ────────────────

export function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export const SPEECH_PASS_THRESHOLD = 0.6; // ≥60% = pass for pronunciation

// ── Text normalization ───────────────────────────────────────────────────

export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, '') // keep word chars + Chinese
    .replace(/\s+/g, ' ')
    .trim();
}

export function textMatches(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

// ── Shuffle helper ───────────────────────────────────────────────────────

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
