// Unit-title junk filter (WS3, owner-confirmed bug 2026-09-08): auto-generated
// unit titles can be junk — real cases were a unit titled "NRISH" (OCR misread
// of a printed "ENRISH"/"ENGLISH" section header copied verbatim) and a unit
// titled literally "Unit". Every site that AUTO-assigns a title must pass it
// through sanitizeUnitTitle() and fall back to (book title – Unit N) when the
// result is null. Manual renames are the teacher's authority and never pass
// through this filter.
//
// TWO identical runtime copies exist because the client bundle must not import
// from supabase/functions: this file (client) and
// supabase/functions/_shared/unitTitle.ts (edge). Keep their logic IDENTICAL.

/** Printed textbook section headers an OCR fragment can fuzzy-match. A lone
 *  ALL-CAPS token within edit distance ≤ 2 of one of these is treated as a
 *  scanned header, not a unit title (NRISH→ENRISH d=1, ENRISH→ENGLISH d=2). */
const HEADER_DENY_LIST = [
  'ENRICH', 'ENGLISH', 'ENGLISH!', 'VOCABULARY', 'GRAMMAR', 'READING', 'WRITING',
  'LISTENING', 'SPEAKING', 'PRONUNCIATION', 'REVIEW', 'PRACTICE', 'PRACTISE',
  'HOMEWORK', 'LESSON', 'EXERCISE', 'EXERCISES', 'WORKBOOK', 'TEXTBOOK', 'STORY',
  'SONG', 'ACTIVITY', 'ACTIVITIES', 'DICTIONARY', 'WORDS', 'LETTERS', 'SOUNDS',
  'SENTENCES', 'LANGUAGE', 'LEARN', 'LEARNING', 'PUPIL', 'STUDENT', 'TEACHER',
  'PAGE',
];

/** Normalize a raw title: trim + collapse internal whitespace. */
const normalizeUnitTitle = (raw: string): string =>
  String(raw ?? '').trim().replace(/\s+/g, ' ');

/** Bounded Levenshtein test: true when editDistance(a, b) <= max. Early-exits
 *  on the length delta and the per-row minimum so the deny-list scan stays
 *  cheap (deny words are ≤ 13 chars, max is always 2 here). */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Single token, at least one letter, no lowercase letters — the shape of a
 *  scanned ALL-CAPS section header ("NRISH", "VOCABULARY"). Multi-word titles
 *  and mixed-case single words ("Animals") are not headers. */
const isAllCapsToken = (s: string): boolean =>
  !/\s/.test(s) && /[A-Z]/.test(s) && s === s.toUpperCase();

/** Case-insensitive deny-list fuzzy match, only for tokens long enough for
 *  edit distance ≤ 2 to be meaningful (short tokens would match too much). */
const matchesHeaderDenyList = (token: string): boolean => {
  if (token.length < 4) return false;
  const t = token.toUpperCase();
  return HEADER_DENY_LIST.some((w) => withinEditDistance(t, w, 2));
};

/** True when a title is unusable as an auto-assigned unit title. */
export function isJunkUnitTitle(raw: string): boolean {
  const s = normalizeUnitTitle(raw);
  if (!s) return true; // empty
  if (s.length < 3 || s.length > 80) return true; // too short / too long
  const digits = (s.match(/\d/g) || []).length;
  if (digits / s.length > 0.3) return true; // pure numbers / digits-heavy
  if (/^unit( title)?$/i.test(s)) return true; // bare "Unit" / "Unit title" placeholder
  if (isAllCapsToken(s) && matchesHeaderDenyList(s)) return true; // OCR'd section header
  return false;
}

/** Normalized title when usable, null when junk (callers fall back to the
 *  book title + unit number ladder or a numbered "Unit N" placeholder). */
export function sanitizeUnitTitle(raw: string): string | null {
  const s = normalizeUnitTitle(raw);
  return isJunkUnitTitle(s) ? null : s;
}

/** Enrich-overwrite rule: titles the AI is ALLOWED to replace on the unit.
 *  Anything else (a real, teacher-visible title) is never overwritten by the
 *  AI echo — junk, "Unit 3"-style numbered placeholders and "Draft Unit <date>"
 *  upload placeholders are all fair game. */
export function isOverwritableAutoTitle(raw: string): boolean {
  const s = normalizeUnitTitle(raw);
  if (!s) return true;
  if (isJunkUnitTitle(s)) return true;
  if (/^unit( \d+)?$/i.test(s)) return true; // numbered fallback ("Unit 3")
  if (/^draft unit /i.test(s)) return true; // upload-flow draft placeholder
  return false;
}
