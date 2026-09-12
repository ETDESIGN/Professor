// contentGroups — naming helpers for unit content groups (spec 2026-09-13
// docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md).
// Pure TS (no Deno imports) so vitest covers it from test/contentGroups.test.ts;
// enrich-unit calls these around one batched region-safe AI call.

export interface GroupNamingInput {
  id: string;
  kind: 'vocab_series' | 'story' | 'comic' | 'song';
  printed_label: string | null;
  /** vocab_series: the member words (max ~15 shown to the model). */
  words?: string[];
  /** story/comic: short verbatim excerpt of the member text. */
  excerpt?: string;
}

export const MAX_GROUP_TITLE_LEN = 60;

/**
 * Build the one-shot naming prompt for all unnamed groups. Songs are excluded
 * upstream (their printed titles are already descriptive song titles).
 */
export function buildGroupNamingPrompt(groups: GroupNamingInput[]): { sys: string; usr: string } {
  const payload = groups.map((g) => ({
    id: g.id,
    kind: g.kind,
    printed_header: g.printed_label || null,
    words: g.kind === 'vocab_series' ? (g.words || []).slice(0, 15) : undefined,
    text_excerpt: g.kind === 'story' || g.kind === 'comic' ? (g.excerpt || '').slice(0, 400) : undefined,
  }));
  const sys = `You name content groups inside a children's ESL textbook unit.
Given each group's printed header (often generic, e.g. "Vocabulary 1"), its member words or a verbatim text excerpt, produce a SHORT DESCRIPTIVE name a teacher instantly understands.
Rules:
- Max 5 words. No quotes. No trailing period.
- vocabulary groups: name what the words share (e.g. "Days of the week", "Free time activities").
- stories/comics: name the actual story from its text (e.g. "The Friendly Farm"), not "Story 1".
- Keep the language of the textbook (English).
Return ONLY a valid JSON object.`;
  const usr = `Groups:
${JSON.stringify(payload, null, 1)}

Return ONLY: { "names": [ { "id": "<same id>", "title": "<short name>" } ] }
One entry per input group, same order.`;
  return { sys, usr };
}

/**
 * Sanitize the model's naming response into a safe id→title map. Unknown ids,
 * empty/oversized/quoted titles are dropped — the seeded title stays.
 */
export function pickGroupNames(raw: unknown, knownIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const names = (raw as any)?.names;
  if (!Array.isArray(names)) return out;
  for (const entry of names) {
    const id = String(entry?.id || '');
    let title = String(entry?.title || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\.$/, '').trim();
    if (!id || !knownIds.has(id)) continue;
    if (!title) continue;
    if (title.length > MAX_GROUP_TITLE_LEN) title = title.slice(0, MAX_GROUP_TITLE_LEN).trim();
    if (/^(series|story|comic|song)\s*\d+$/i.test(title)) continue; // model echoed the seed default
    out.set(id, title);
  }
  return out;
}

/** Vocab words belonging to each vocab group, from basket rows (structure_id keyed). */
export function wordsByStructure(basketVocab: { word: string; structure_id?: string | null }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const v of basketVocab || []) {
    const sid = v?.structure_id ? String(v.structure_id) : '';
    const w = String(v?.word || '').trim();
    if (!sid || !w) continue;
    const list = map.get(sid) || [];
    list.push(w);
    map.set(sid, list);
  }
  return map;
}
