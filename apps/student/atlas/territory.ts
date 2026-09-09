// Wonder Atlas territory theming — pure helpers, no React. The DB columns
// (units.theme / tagline / mascot_*) are the authoritative source; keyword
// matching is the fallback for units without metadata (migration 20260909000001).
export interface TerritoryTheme {
  emoji: string;
  label: string;
  tagline: string;
}

const DEFAULT_THEME: TerritoryTheme = {
  emoji: '🧭',
  label: 'Discovery',
  tagline: 'New words are waiting to be explored!',
};

// Order matters: first match wins ("Farm animals" must be Farm, not Safari).
const RULES: Array<{ match: RegExp; theme: TerritoryTheme }> = [
  { match: /farm|tractor|field|crop|village|harvest/i, theme: { emoji: '🚜', label: 'Farm', tagline: 'Sunny fields and farm friends!' } },
  { match: /ocean|sea|beach|water|fish|river|coral|dolphin/i, theme: { emoji: '🐬', label: 'Ocean', tagline: 'Dive beneath the waves!' } },
  { match: /space|star|planet|sky|weather|season|cloud/i, theme: { emoji: '🚀', label: 'Sky', tagline: 'Look up — adventure waits above!' } },
  { match: /food|fruit|veget|kitchen|eat|drink/i, theme: { emoji: '🍕', label: 'Kitchen', tagline: 'Tasty words to discover!' } },
  { match: /animal|zoo|safari|jungle|wild|forest|pet/i, theme: { emoji: '🦁', label: 'Safari', tagline: 'Explore the wild and meet the animals!' } },
  { match: /city|home|house|school|family|body|cloth|people|job/i, theme: { emoji: '🏡', label: 'Everyday', tagline: 'Words you use every day!' } },
];

export function themeForUnit(unit: {
  title?: string;
  topic?: string;
  theme?: string | null;
  tagline?: string | null;
  mascotEmoji?: string | null;
}): TerritoryTheme {
  if (unit.theme && unit.mascotEmoji) {
    return { emoji: unit.mascotEmoji, label: unit.theme, tagline: unit.tagline ?? DEFAULT_THEME.tagline };
  }
  const haystack = `${unit.topic ?? ''} ${unit.title ?? ''}`;
  const rule = RULES.find((r) => r.match.test(haystack));
  return rule ? rule.theme : DEFAULT_THEME;
}

export function pickFocusUnit(
  units: Array<{ id: string; status?: string }>,
  mastery: Record<string, { isComplete?: boolean } | undefined>
): { id: string; status?: string } | undefined {
  const playable = units.filter((u) => u.status !== 'Locked');
  if (playable.length === 0) return units[0];
  return playable.find((u) => !mastery[u.id]?.isComplete) ?? playable[0];
}
