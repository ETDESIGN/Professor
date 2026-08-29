// Class-plan proposal algorithm (FIXPLAN I, doc 11 §4). Pure TypeScript —
// NO Deno imports — shared by the propose-class-plans edge function,
// vitest, and the Classes tab UI.
//
// Deterministic, no AI. The book's rhythm is a LABEL, not authority
// (doc 10 §5): cut points are *suggested* from lesson signals (set-label
// changes, song sheets, openers, review pages) and balanced vocabulary
// load; the teacher drags the final boundaries in the editor.

export interface ClassPageStructure {
  structure_type: string;
  set_label?: string | null;
  review_status?: string | null;
  /** Number of vocabulary words this structure carries (0 for non-vocab). */
  vocab_count?: number;
}

export interface ClassPageInput {
  id: string;
  upload_order: number;
  printed_page_number?: string | null;
  /** Non-removed structures on this page. */
  structures: ClassPageStructure[];
}

export interface ClassProposal {
  title: string;
  from_page_id: string;
  to_page_id: string;
  from_printed: string | null;
  to_printed: string | null;
  set_labels: string[];
  vocab_weight: number;
  page_count: number;
}

const norm = (s: unknown): string => String(s ?? '').trim().replace(/\s+/g, ' ');

/** Non-removed set labels on a page (normalized, deduped, order kept). */
export function pageSetLabels(p: ClassPageInput): string[] {
  const out: string[] = [];
  for (const s of p.structures) {
    if ((s.review_status ?? 'confirmed') === 'removed') continue;
    const label = norm(s.set_label);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

const pageVocabWeight = (p: ClassPageInput): number =>
  p.structures.reduce((sum, s) => {
    if ((s.review_status ?? 'confirmed') === 'removed') return sum;
    return sum + (Number.isFinite(s.vocab_count) ? Math.max(0, s.vocab_count!) : 0);
  }, 0);

const hasType = (p: ClassPageInput, type: string): boolean =>
  p.structures.some((s) => s.structure_type === type && (s.review_status ?? 'confirmed') !== 'removed');

/** Default class count: ~12 new words per class, clamped 1..6 (doc 11 §3). */
export function defaultClassCount(pages: ClassPageInput[]): number {
  const total = pages.reduce((s, p) => s + pageVocabWeight(p), 0);
  if (total === 0) return 1;
  return Math.min(6, Math.max(1, Math.ceil(total / 12)));
}

/**
 * Candidate cut positions between consecutive pages (gap i = between page i
 * and i+1). A gap is a SIGNAL cut when the book itself suggests a lesson
 * boundary there: a set-label change, a song ending the segment, an opener
 * starting the next segment, or a review page starting the tail.
 */
export function candidateCuts(pages: ClassPageInput[]): { gap: number; signal: boolean }[] {
  const cuts: { gap: number; signal: boolean }[] = [];
  for (let i = 0; i < pages.length - 1; i++) {
    const labelsA = pageSetLabels(pages[i]);
    const labelsB = pageSetLabels(pages[i + 1]);
    const labelChange = labelsA.length > 0 && labelsB.length > 0 &&
      (labelsB.some((l) => !labelsA.includes(l)) || labelsA.some((l) => !labelsB.includes(l)));
    const songEnds = hasType(pages[i], 'song_sheet');
    const openerStarts = hasType(pages[i + 1], 'mission_opener');
    const reviewStarts = hasType(pages[i + 1], 'review_statements');
    cuts.push({ gap: i, signal: labelChange || songEnds || openerStarts || reviewStarts });
  }
  return cuts;
}

/**
 * Balanced n-partition over the candidate gaps. DP minimizing the sum of
 * squared deviation of class vocab weights from the ideal mean, with a
 * penalty for non-signal cuts. Deterministic: on equal cost the earlier
 * cut sequence wins (strict < comparison in ascending j order).
 */
export function proposeClasses(
  pages: ClassPageInput[],
  targetCount: number,
  unitTitle?: string | null,
): ClassProposal[] {
  const sorted = [...pages].sort((a, b) => a.upload_order - b.upload_order);
  const n = sorted.length;
  if (n === 0) return [];
  const k = Math.max(1, Math.min(targetCount, n));

  const weights = sorted.map(pageVocabWeight);
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + weights[i]);
  const total = prefix[n];
  const ideal = total / k;
  const NON_SIGNAL_PENALTY = 0.01 * Math.max(1, ideal * ideal);

  const cuts = candidateCuts(sorted);
  const isSignal = new Array(n - 1).fill(false);
  for (const c of cuts) if (c.signal) isSignal[c.gap] = true;

  const classCost = (from: number, to: number): number => {
    const w = prefix[to + 1] - prefix[from];
    return (w - ideal) * (w - ideal);
  };

  // dp[j][c] = min cost partitioning pages[0..j] into c classes; cutAfter
  // stores the last cut position (gap index) used.
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: n }, () => new Array(k + 1).fill(INF));
  const cutAt: number[][] = Array.from({ length: n }, () => new Array(k + 1).fill(-1));
  for (let j = 0; j < n; j++) {
    dp[j][1] = classCost(0, j);
  }
  for (let c = 2; c <= k; c++) {
    for (let j = 0; j < n; j++) {
      // last class = pages[i+1..j]; cut gap i closes class c-1 at page i.
      for (let i = c - 2; i < j; i++) {
        if (dp[i][c - 1] === INF) continue;
        const gapCost = i < n - 1 && !isSignal[i] ? NON_SIGNAL_PENALTY : 0;
        const cost = dp[i][c - 1] + classCost(i + 1, j) + gapCost;
        if (cost < dp[j][c]) {
          dp[j][c] = cost;
          cutAt[j][c] = i;
        }
      }
    }
  }

  // Recover the cut gaps from the end.
  const gaps: number[] = [];
  let j = n - 1;
  for (let c = k; c >= 2; c--) {
    const i = cutAt[j][c];
    if (i < 0) return proposeClasses(pages, 1, unitTitle); // safety: fall back to 1 class
    gaps.push(i);
    j = i;
  }
  gaps.reverse();

  const bounds: number[] = [0, ...gaps.map((g) => g + 1), n];
  const proposals: ClassProposal[] = [];
  for (let c = 0; c < k; c++) {
    const from = bounds[c];
    const to = bounds[c + 1] - 1;
    const slice = sorted.slice(from, to + 1);

    // Title: opener page keeps the unit title (class 1); else the dominant
    // set label; else the printed range; else "Class N".
    const labels: string[] = [];
    for (const p of slice) {
      for (const l of pageSetLabels(p)) if (!labels.includes(l)) labels.push(l);
    }
    const freq = new Map<string, number>();
    for (const p of slice) {
      for (const l of pageSetLabels(p)) freq.set(l, (freq.get(l) ?? 0) + 1);
    }
    let dominant = '';
    let best = 0;
    for (const [l, f] of freq) {
      if (f > best || (f === best && !dominant)) {
        dominant = l;
        best = f;
      }
    }
    const fp = norm(slice[0].printed_page_number) || null;
    const tp = norm(slice[slice.length - 1].printed_page_number) || null;
    const hasOpener = slice.some((p) => hasType(p, 'mission_opener'));
    const range = fp && tp ? (fp === tp ? `pp. ${fp}` : `pp. ${fp}–${tp}`) : null;

    let title: string;
    if (k === 1) title = norm(unitTitle) || dominant || range || 'Class 1';
    else if (hasOpener && c === 0) title = norm(unitTitle) || dominant || range || `Class ${c + 1}`;
    else title = dominant || range || `Class ${c + 1}`;

    proposals.push({
      title,
      from_page_id: slice[0].id,
      to_page_id: slice[slice.length - 1].id,
      from_printed: fp,
      to_printed: tp,
      set_labels: labels,
      vocab_weight: slice.reduce((s, p) => s + pageVocabWeight(p), 0),
      page_count: slice.length,
    });
  }
  return proposals;
}
