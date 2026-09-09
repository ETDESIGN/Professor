# Wonder Atlas — Plan 1: Foundation & Atlas Home (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Wonder Atlas design system (exact Stitch tokens) and reskin the student app shell + Home map into the world-atlas territory layout — the foundation every later Tier 1 plan builds on.

**Architecture:** A single-source token module (`apps/student/atlas/tokens.ts`) feeds Tailwind (new `wa-*` namespace, imported into the shared config — add-only, other portals untouched), plus small pure helpers (`themeForUnit`, `pickFocusUnit`) with vitest coverage, one migration adding per-unit atlas metadata, and JSX reskins of `StudentApp.tsx` + `HomeMap.tsx` using only token classes.

**Tech Stack:** Vite + TS + Tailwind 3 (jiti-loaded config) + framer-motion + vitest. No new dependencies.

## Global Constraints

- All commands run from `professor-0.1 (1)/`. Git: work on branch `feature/wonder-atlas-foundation` (create in Task 1). Never push to master (push auto-deploys to Vercel prod) — the owner merges.
- `tailwind.config.js` is shared by ALL portals (teacher/board/parent/admin). **Never modify or remove existing colors/fonts (`duo-*`, `teacher-*`, `parent-*`, `primary/secondary/accent`, `sans/display/fun/...`).** Add `wa-*` keys only.
- **No raw hex in `apps/student/**` JSX/TSX.** Use `wa-*` classes; SVG/canvas code imports from `apps/student/atlas/tokens.ts`. (Existing `duo-*`/`slate-*` in files this plan doesn't touch stay until Plans 2–3.)
- Exact token values (from the Stitch `code.html` frequency analysis — do not "improve" them): teal `#2A9D8F`, ink `#264653`, cream `#EAE0D0`, terracotta `#E76F51`, tealDeep `#1E6F5C`, sand `#E9C46A`, sandDeep `#C99E32`, peach `#F4A261`, paper `#FDFBF7`, border `#E2D7C3`, muted `#8C7A68`, mist `#F7F3E8`, terraDeep `#C4553B`, inkDeep `#1D3557`, successBg `#E8F5E9`.
- Test command: `npm test` (vitest run). Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Every task ends green on all three (where applicable) + a commit.
- Supabase project ref is always `xsdnzijketjnzhakqtit` (Management API), never the other PAT-visible projects.

---

### Task 1: Wonder Atlas token module + Tailwind integration

**Files:**
- Create: `apps/student/atlas/tokens.ts`
- Modify: `tailwind.config.js`
- Test: `tests/wonderAtlasTokens.test.ts`

**Interfaces:**
- Produces: `waColors` (`{ cream, paper, mist, ink, inkDeep, muted, teal, tealDeep, terra, terraDeep, sand, sandDeep, peach, border, successBg }` as const record of hex strings), `waRadii` (`{ card: '24px', tile: '20px' }`), `waShadows` (`{ btnTeal, btnTerra, btnSand, card }`), `waFonts`; Tailwind classes `wa-<name>` for colors, `rounded-wa-card` / `rounded-wa-tile`, `shadow-wa-btn-teal` / `shadow-wa-btn-terra` / `shadow-wa-btn-sand` / `shadow-wa-card`, `font-wa-display` / `font-wa-body`. Later tasks rely on all of these existing.

- [ ] **Step 1: Create the feature branch**

```bash
cd "professor-0.1 (1)"
git checkout master && git pull
git checkout -b feature/wonder-atlas-foundation
```

- [ ] **Step 2: Write the failing test**

Create `tests/wonderAtlasTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { waColors, waRadii, waShadows } from '../apps/student/atlas/tokens';
// @ts-ignore — JS config without type declarations
import tailwindConfig from '../tailwind.config.js';

const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, any>;

describe('Wonder Atlas tokens (exact Stitch values)', () => {
  it('holds the frequency-verified hex values', () => {
    expect(waColors).toMatchObject({
      teal: '#2A9D8F', ink: '#264653', cream: '#EAE0D0', terra: '#E76F51',
      tealDeep: '#1E6F5C', sand: '#E9C46A', sandDeep: '#C99E32', peach: '#F4A261',
      paper: '#FDFBF7', border: '#E2D7C3', muted: '#8C7A68', mist: '#F7F3E8',
      terraDeep: '#C4553B', inkDeep: '#1D3557', successBg: '#E8F5E9',
    });
  });

  it('exposes every color as a wa-* Tailwind color', () => {
    for (const name of Object.keys(waColors)) {
      expect(extend.colors[`wa-${name}`]).toBe(waColors[name as keyof typeof waColors]);
    }
  });

  it('keeps the other portals’ tokens untouched', () => {
    expect(extend.colors['duo-pink']).toBe('#e91e63');
    expect(extend.colors['teacher-primary']).toBe('#e91e63');
    expect(extend.colors['parent-primary']).toBe('#0dccf2');
  });

  it('registers wa radii, shadows and fonts', () => {
    expect(extend.borderRadius['wa-card']).toBe(waRadii.card);
    expect(extend.borderRadius['wa-tile']).toBe(waRadii.tile);
    expect(extend.boxShadow['wa-btn-teal']).toBe(waShadows.btnTeal);
    expect(extend.boxShadow['wa-card']).toBe(waShadows.card);
    expect(extend.fontFamily['wa-display'][0]).toBe('Fredoka');
    expect(extend.fontFamily['wa-body'][0]).toBe('Nunito');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/wonderAtlasTokens.test.ts`
Expected: FAIL — cannot resolve `../apps/student/atlas/tokens`.

- [ ] **Step 4: Create `apps/student/atlas/tokens.ts`**

```ts
// Wonder Atlas design tokens — single source of truth for the student app reskin.
// Values extracted 2026-09-09 from the Stitch exports (frequency-weighted across
// all 33 code.html files). tailwind.config.js imports this module (Tailwind loads
// its config through jiti, which transpiles TS imports); components use the
// generated wa-* classes; SVG/canvas code imports the hex values directly.
export const waColors = {
  cream: '#EAE0D0',      // app background
  paper: '#FDFBF7',      // card surface
  mist: '#F7F3E8',       // subtle tinted background
  ink: '#264653',        // primary text (navy)
  inkDeep: '#1D3557',    // alt navy (star fills, emphasis)
  muted: '#8C7A68',      // secondary text (warm gray)
  teal: '#2A9D8F',       // primary action
  tealDeep: '#1E6F5C',   // 3D shadow under teal buttons
  terra: '#E76F51',      // accent: streak, energy, active states
  terraDeep: '#C4553B',  // 3D shadow under terracotta buttons
  sand: '#E9C46A',       // stars / highlights / completed nodes
  sandDeep: '#C99E32',   // 3D shadow under sand elements
  peach: '#F4A261',      // warm accent
  border: '#E2D7C3',     // card borders
  successBg: '#E8F5E9',  // success tint
} as const;

export const waRadii = {
  card: '24px',
  tile: '20px',
} as const;

export const waShadows = {
  btnTeal: '0 4px 0 #1E6F5C',
  btnTerra: '0 4px 0 #C4553B',
  btnSand: '0 4px 0 #C99E32',
  card: '0 4px 12px rgba(45, 55, 72, 0.05)',
} as const;

export const waFonts = {
  display: "'Fredoka', 'Fredoka One', system-ui, sans-serif",
  body: "'Nunito', 'Noto Sans SC', system-ui, sans-serif",
} as const;

export type WaColorName = keyof typeof waColors;
```

- [ ] **Step 5: Integrate into `tailwind.config.js`**

At the very top, add:

```js
import { waColors, waRadii, waShadows } from './apps/student/atlas/tokens';

// Wonder Atlas (student app, 2026-09-09) — flattened to wa-* Tailwind keys.
const waTailwindColors = Object.fromEntries(
  Object.entries(waColors).map(([name, hex]) => [`wa-${name}`, hex])
);
```

Inside `theme.extend.colors` (first keys, before `'duo-pink'`), add:

```js
                // Wonder Atlas — student app (apps/student/atlas/tokens.ts)
                ...waTailwindColors,
```

Inside `theme.extend`, add (merge with existing keys, do not replace them):

```js
            borderRadius: {
                'wa-card': waRadii.card,
                'wa-tile': waRadii.tile,
            },
            boxShadow: {
                'wa-btn-teal': waShadows.btnTeal,
                'wa-btn-terra': waShadows.btnTerra,
                'wa-btn-sand': waShadows.btnSand,
                'wa-card': waShadows.card,
            },
```

Inside the existing (second) `fontFamily` block, add:

```js
                // Wonder Atlas (student app)
                'wa-display': ['Fredoka', 'Fredoka One', 'system-ui', 'sans-serif'],
                'wa-body': ['Nunito', 'Noto Sans SC', 'system-ui', 'sans-serif'],
```

- [ ] **Step 6: Run the tests + build**

Run: `npm test -- tests/wonderAtlasTokens.test.ts` → PASS
Run: `npx tsc --noEmit` → clean
Run: `npm run build` → succeeds (proves Tailwind/jiti loads the TS import chain).
If (and only if) the build fails to load the `.ts` import from the `.js` config, convert `tokens.ts` values into `tokens.js` with `// @ts-check` + JSDoc and re-point both imports — single source stays, in JS.

- [ ] **Step 7: Commit**

```bash
git add apps/student/atlas/tokens.ts tailwind.config.js tests/wonderAtlasTokens.test.ts
git commit -m "feat(atlas): Wonder Atlas token module + wa-* Tailwind namespace"
```

---

### Task 2: Load the Wonder Atlas webfonts

**Files:**
- Modify: `student.html:8-10`

**Interfaces:**
- Consumes: `waFonts` naming (Fredoka display, Nunito body) from Task 1.
- Produces: `font-wa-display` / `font-wa-body` render with the real families in the student entry only.

- [ ] **Step 1: Replace the font link**

In `student.html`, replace the `<link href="https://fonts.googleapis.com/css2?family=Lexend…` line with:

```html
  <link
    href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800;900&family=Lexend:wght@300;400;500;600;700;800&family=Noto+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap"
    rel="stylesheet">
```

(Lexend stays until Plans 2–3 reskin the remaining screens; Fredoka One is covered by the Fredoka variable family fallback in `wa-display`.)

- [ ] **Step 2: Verify + commit**

Run: `grep -c "Fredoka:wght" student.html` → `1`; `npm run build` → succeeds.

```bash
git add student.html
git commit -m "feat(atlas): load Fredoka + Nunito webfonts for the student entry"
```

---

### Task 3: Territory theme helper (pure, TDD)

**Files:**
- Create: `apps/student/atlas/territory.ts`
- Test: `tests/territory.test.ts`

**Interfaces:**
- Produces:
  - `interface TerritoryTheme { emoji: string; label: string; tagline: string }`
  - `themeForUnit(unit: { title?: string; topic?: string; theme?: string | null; tagline?: string | null; mascotEmoji?: string | null }): TerritoryTheme` — explicit `unit.theme` + `unit.mascotEmoji` (Task 4 columns) win; else keyword match on `topic + title`; else a default.
  - `pickFocusUnit(units: Array<{ id: string; status?: string }>, mastery: Record<string, { isComplete?: boolean } | undefined>): { id: string; status?: string } | undefined` — first unlocked, not-complete unit (the one the TerritoryIntro card renders for).

- [ ] **Step 1: Write the failing tests**

Create `tests/territory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { themeForUnit, pickFocusUnit } from '../apps/student/atlas/territory';

describe('themeForUnit', () => {
  it('uses explicit unit theme columns when present', () => {
    expect(themeForUnit({ title: 'Power Up', topic: 'mix', theme: 'Safari', mascotEmoji: '🦁', tagline: 'Go wild!' }))
      .toEqual({ emoji: '🦁', label: 'Safari', tagline: 'Go wild!' });
  });

  it('derives Farm from topic/title keywords', () => {
    expect(themeForUnit({ title: 'Down on the Farm', topic: 'Farm animals' }).label).toBe('Farm');
    expect(themeForUnit({}).emoji).toBe('🚜');
  });

  it('derives Ocean for sea topics', () => {
    expect(themeForUnit({ title: 'Power Up', topic: 'Ocean life' }).label).toBe('Ocean');
  });

  it('derives Safari for animal topics that are not farm', () => {
    expect(themeForUnit({ title: 'Zoo Day', topic: 'Wild animals' }).label).toBe('Safari');
  });

  it('falls back to the default territory', () => {
    expect(themeForUnit({ title: 'Mystery', topic: 'grammar' }).label).toBe('Discovery');
    expect(themeForUnit({}).emoji).toBe('🧭');
  });
});

describe('pickFocusUnit', () => {
  const units = [{ id: 'a', status: 'Completed' }, { id: 'b', status: 'Active' }, { id: 'c', status: 'Locked' }];
  it('prefers the first unlocked unit not mastered-complete', () => {
    expect(pickFocusUnit(units, { a: { isComplete: true } })?.id).toBe('b');
    expect(pickFocusUnit(units, {})?.id).toBe('a');
  });
  it('returns the first unit when everything is complete', () => {
    expect(pickFocusUnit(units, { a: { isComplete: true }, b: { isComplete: true } })?.id).toBe('a');
  });
  it('handles empty input', () => {
    expect(pickFocusUnit([], {})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/territory.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `apps/student/atlas/territory.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/territory.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/student/atlas/territory.ts tests/territory.test.ts
git commit -m "feat(atlas): territory theme + focus-unit helpers with tests"
```

---

### Task 4: Units atlas-metadata migration + type mapping

**Files:**
- Create: `supabase/migrations/20260909000001_unit_atlas_metadata.sql`
- Modify: `services/SupabaseService.ts` (Unit interface ~line 54 + row→object mappings ~lines 97, 157, 184)

**Interfaces:**
- Produces: DB columns `units.theme`, `units.tagline`, `units.mascot_name`, `units.mascot_emoji` (nullable text); `Unit` type gains `theme?: string | null; tagline?: string | null; mascotName?: string | null; mascotEmoji?: string | null`. Consumed by Task 3's override path and Task 9's intro card.

- [ ] **Step 1: Write the migration file**

```sql
-- Wonder Atlas (2026-09-09): per-unit territory metadata for the student app
-- world-map framing. All nullable — units without metadata use the client-side
-- keyword fallback (apps/student/atlas/territory.ts).
alter table public.units
  add column if not exists theme text,
  add column if not exists tagline text,
  add column if not exists mascot_name text,
  add column if not exists mascot_emoji text;

comment on column public.units.theme is 'Wonder Atlas territory label (e.g. Safari, Ocean). NULL → client keyword fallback.';
comment on column public.units.mascot_emoji is 'Territory mascot glyph shown on banners/intro cards when mascot art is absent.';
```

- [ ] **Step 2: Apply on cloud (primary path: Supabase MCP)**

Use the `supabase_apply_migration` MCP tool with the file's SQL (name `20260909000001_unit_atlas_metadata`, project `xsdnzijketjnzhakqtit`) — it applies AND records the migration. If MCP is unavailable this session, equivalent curl (applies but does NOT record — then also run the insert below):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "alter table public.units add column if not exists theme text, add column if not exists tagline text, add column if not exists mascot_name text, add column if not exists mascot_emoji text; insert into supabase_migrations(version, name) values (20260909000001, 'unit_atlas_metadata') on conflict do nothing;"}'
```

- [ ] **Step 3: Verify the columns exist**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "select column_name from information_schema.columns where table_name = '"'"'units'"'"' and column_name in ('"'"'theme'"'"','"'"'tagline'"'"','"'"'mascot_name'"'"','"'"'mascot_emoji'"'"');"}'
```
Expected: 4 rows.

- [ ] **Step 4: Map the columns in `services/SupabaseService.ts`**

In the `Unit` interface (~line 54, next to `coverImage: string;`) add:

```ts
    theme?: string | null;
    tagline?: string | null;
    mascotName?: string | null;
    mascotEmoji?: string | null;
```

In every `row → Unit` mapping (~lines 97, 157, 184 — wherever `coverImage:` is assigned from a row) add:

```ts
            theme: row.theme ?? null,
            tagline: row.tagline ?? null,
            mascotName: row.mascot_name ?? null,
            mascotEmoji: row.mascot_emoji ?? null,
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → clean; `npm test` → all green (no regressions).

```bash
git add supabase/migrations/20260909000001_unit_atlas_metadata.sql services/SupabaseService.ts
git commit -m "feat(atlas): units territory metadata columns + Unit mapping"
```

---

### Task 5: App shell reskin (frame, header, homework, bottom nav)

**Files:**
- Modify: `apps/student/StudentApp.tsx` (lines 42-46, 241-272, 287-346, 368-404)

**Interfaces:**
- Consumes: `wa-*` Tailwind classes from Task 1.
- Produces: the shell every tab screen renders inside; Plans 2–3 assume it.

- [ ] **Step 1: Reskin the frame + PageLoader**

Line 241 — replace the outer div className with:

```tsx
    <div className="h-full bg-wa-cream font-wa-body max-w-md mx-auto shadow-xl border-x border-wa-border flex flex-col pb-20 overflow-hidden">
```

Lines 42-46 (PageLoader) — spinner color:

```tsx
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wa-teal" />
```

- [ ] **Step 2: Reskin the header (lines 244-273)**

Replace the header block's classNames only (keep structure/handlers identical):

```tsx
        <header className="sticky top-0 bg-wa-paper/90 backdrop-blur z-20 border-b border-wa-border px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-6 rounded overflow-hidden relative border border-wa-border shadow-sm">
              {/* Mock Flag */}
              <div className="absolute inset-0 bg-white">
                <div className="w-full h-1/3 bg-blue-500"></div>
                <div className="w-full h-1/3 bg-white top-1/3 absolute"></div>
                <div className="w-full h-1/3 bg-red-500 bottom-0 absolute"></div>
              </div>
            </div>
            <span className="font-wa-display font-semibold text-wa-ink">English</span>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowJoinClassModal(true)}
              className="flex items-center gap-1 text-white text-sm font-wa-display bg-wa-teal px-3 py-1.5 rounded-full shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all"
            >
              <Users size={15} />
              <span>{t('student.joinClass')}</span>
            </button>
            <div className="flex items-center gap-1 text-wa-terra font-bold bg-wa-terra/10 px-2.5 py-1.5 rounded-full">
              <span className="text-lg">🔥</span> {userStats.streak}
            </div>
            <div className="flex items-center gap-1 text-wa-teal font-bold bg-wa-teal/10 px-2.5 py-1.5 rounded-full">
              <span className="text-lg">💎</span> {userStats.gems}
            </div>
          </div>
        </header>
```

- [ ] **Step 3: Reskin the homework section (lines 289-346)**

Class replacements within the block (structure unchanged): section wrapper stays; each assignment card `className="bg-wa-paper rounded-wa-card p-4 shadow-wa-card border border-wa-border"`; headings `text-wa-ink`; the pending-count pill `bg-wa-terra/15 text-wa-terra`; the "All caught up" card `bg-wa-paper rounded-wa-card p-6 text-center border border-wa-border` with icon chip `bg-wa-successBg` + `text-wa-teal`; the due-date row `text-wa-terra`; Mark Done button `className="ml-2 px-3 py-1.5 bg-wa-teal text-white text-xs font-wa-display rounded-full shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all"`.

- [ ] **Step 4: Reskin the bottom nav (lines 368-404)**

Nav container: `className="fixed bottom-0 w-full max-w-md bg-wa-paper border-t border-wa-border pb-safe grid grid-cols-5 z-50"`.
Every tab button: active variant `text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10`, inactive `text-wa-muted hover:text-wa-ink`, and label span `font-wa-display`. Example (Learn tab — apply the same pattern to all five):

```tsx
        <button
          onClick={() => navigate('/student')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display">{t('nav.learn')}</span>
        </button>
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit`; `npm run build`; then `npm run dev` and eyeball `/student`: cream frame, paper header with teal Join pill, terracotta streak + teal gems chips, teal active tab.

```bash
git add apps/student/StudentApp.tsx
git commit -m "feat(atlas): WA reskin of student shell (frame, header, homework, nav)"
```

---

### Task 6: Join-class modal reskin + 6-box code input

**Files:**
- Create: `apps/student/atlas/CodeInput.tsx`
- Modify: `apps/student/StudentApp.tsx:406-502` (modal)

**Interfaces:**
- Produces: `CodeInput({ value, onChange, length? }: { value: string; onChange: (v: string) => void; length?: number })` — renders 6 code boxes over a hidden real input (keyboard/tap safe), normalizes to uppercase A-Z0-9.

- [ ] **Step 1: Create `apps/student/atlas/CodeInput.tsx`**

```tsx
import React from 'react';

// 6-box class-code input (Wonder Atlas). One hidden real input carries the
// state — taps anywhere focus it; boxes are pure display. Kid keyboards on
// tablets never see a native mid-screen keyboard jump.
export function CodeInput({ value, onChange, length = 6 }: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}) {
  return (
    <div className="relative w-full" data-testid="wa-code-input">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        autoFocus
        autoCapitalize="characters"
        aria-label="Class code"
      />
      <div className="flex justify-center gap-2 pointer-events-none">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-11 h-14 rounded-2xl border-2 flex items-center justify-center font-mono text-2xl font-bold transition-colors ${
              i === value.length
                ? 'border-wa-teal bg-wa-mist text-wa-ink'
                : value[i]
                  ? 'border-wa-border bg-wa-paper text-wa-ink'
                  : 'border-wa-border bg-wa-mist/60'
            }`}
          >
            {value[i] ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CodeInput;
```

- [ ] **Step 2: Wire it into the modal**

In `StudentApp.tsx`: add `import CodeInput from './atlas/CodeInput';` near the other imports. Replace the `<input … maxLength={6} />` block (lines 435-445) with:

```tsx
              <CodeInput
                value={classCodeInput}
                onChange={(v) => { setClassCodeInput(v); setJoinError(''); }}
              />
```

- [ ] **Step 3: Reskin the modal**

Class replacements only: modal card `bg-wa-paper rounded-wa-card p-6 w-full max-w-sm shadow-xl border border-wa-border`; title `font-wa-display text-wa-ink`; close button `text-wa-muted hover:text-wa-ink`; helper text `text-wa-muted`; error `text-wa-terra`; class chips `bg-wa-teal/10 text-wa-teal`; Join button `className="w-full bg-wa-teal text-white font-wa-display py-3 rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all"`.

- [ ] **Step 4: Verify + commit**

`npx tsc --noEmit` → clean; `npm run build`; dev-check: open Join modal, type `farm4` → boxes show F A R M 4 with cursor box highlighted; Join disabled until 6 chars.

```bash
git add apps/student/atlas/CodeInput.tsx apps/student/StudentApp.tsx
git commit -m "feat(atlas): 6-box code input + WA join-class modal"
```

---

### Task 7: HomeMap — quests card + territory banners

**Files:**
- Modify: `apps/student/HomeMap.tsx` (lines 100-269)

**Interfaces:**
- Consumes: `wa-*` classes (Task 1), `themeForUnit` (Task 3), `waColors` for the SVG stroke.

- [ ] **Step 1: Territory banner (replace lines 222-255)**

```tsx
            {/* Unit Header — Wonder Atlas territory card */}
            <div className={`mx-4 mt-4 rounded-wa-card p-5 bg-wa-paper border-b-4 border-wa-border shadow-wa-card transform transition-transform ${unit.status === 'Locked' ? 'grayscale opacity-70' : ''}`}>
              {unit.coverImage && !unit.coverImage.includes('dicebear') && (
                <img src={unit.coverImage} alt={unit.title} className="w-full h-36 object-cover rounded-2xl shadow-md mb-4" />
              )}
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <span className="inline-flex items-center gap-1.5 bg-wa-teal/10 text-wa-teal px-2.5 py-1 rounded-full text-xs font-wa-display font-semibold mb-2">
                    {themeForUnit(unit).emoji} {themeForUnit(unit).label}
                  </span>
                  <h3 className="font-wa-display font-semibold text-2xl text-wa-ink tracking-wide">{unit.title}</h3>
                  <p className="text-wa-muted text-sm font-medium mt-1">{unit.topic} • {unit.level}</p>
                  {summary && summary.total > 0 && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 bg-wa-sand/25 text-wa-inkDeep px-2 py-0.5 rounded-full text-xs font-bold">
                        <Crown size={13} className="text-wa-sandDeep" />
                        {summary.crowns}/{summary.total}
                      </span>
                      {summary.crackedCount > 0 && (
                        <button
                          onClick={() => onNavigate('practice', unit.id)}
                          className="flex items-center gap-1 bg-wa-terra/15 text-wa-terra px-2 py-0.5 rounded-full text-xs font-bold animate-pulse"
                          title={`${summary.crackedCount} skill(s) need review`}
                        >
                          <AlertTriangle size={13} />
                          {summary.crackedCount} cracked
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-wa-mist p-3 rounded-2xl text-wa-teal">
                  {unit.status === 'Locked' ? <Lock size={24} /> : summary?.isComplete ? <Crown size={24} className="text-wa-sandDeep" /> : <BookOpen size={24} />}
                </div>
              </div>
            </div>
```

- [ ] **Step 2: Tokenize the path stroke (lines 258-269)**

Add `import { waColors } from './atlas/tokens';` to the imports at the top of `apps/student/HomeMap.tsx`. Replace the `<path … />` props:

```tsx
                <path
                  d={generatePath(nodeCount)}
                  fill="none"
                  stroke={unitLocked ? waColors.border : waColors.sand}
                  strokeWidth="3"
                  strokeDasharray="2 7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
```

- [ ] **Step 3: Quests card (lines 102-153) — class replacements**

Card: `bg-wa-paper mx-4 mt-6 mb-8 rounded-wa-card p-4 shadow-wa-card border border-wa-border`. Title: `font-wa-display font-semibold text-wa-ink`; time-left `text-wa-muted`. Flame chip `bg-wa-terra/15 text-wa-terra`; headphones chip `bg-wa-teal/15 text-wa-teal`; star chip `bg-wa-sand/25 text-wa-inkDeep`. Progress tracks `bg-wa-border/60`, fills `bg-wa-terra` (XP) and `bg-wa-teal` (lessons).

- [ ] **Step 4: Verify + commit**

`npx tsc --noEmit`; `npm run build`; dev-check `/student`: territory chips (🚜 Farm etc. per unit topic), paper banners, dashed sand path.

```bash
git add apps/student/HomeMap.tsx
git commit -m "feat(atlas): territory banners + tokenized path + WA quests card"
```

---

### Task 8: HomeMap — nodes, chest, states, floating CTAs

**Files:**
- Modify: `apps/student/HomeMap.tsx` (lines 101, 155-206, 272-384)

- [ ] **Step 1: Node theming (lines 298-337 class replacements)**

- completed: `bg-wa-sand border-b-8 border-wa-sand-deep shadow-xl` with check `text-wa-inkDeep`
- active: `bg-wa-terra border-b-8 border-wa-terra-deep scale-110 shadow-2xl animate-bounce-subtle ring-4 ring-wa-terra/25`
- locked: `bg-wa-mist border-b-8 border-wa-border` with lock `text-wa-muted`
- stars row wrapper: `bg-wa-paper/90 backdrop-blur rounded-full px-2 py-0.5 border border-wa-border`; stars `text-wa-sandDeep fill-wa-sandDeep` / dim `text-wa-border fill-transparent`
- START popover: `bg-wa-paper px-4 py-2 rounded-2xl shadow-wa-card border border-wa-border text-wa-terra font-wa-display font-semibold text-sm whitespace-nowrap animate-bounce` (tail square: `bg-wa-paper border-b border-r border-wa-border`)
- node label: `text-wa-muted` (locked: `text-wa-border`)

- [ ] **Step 2: Chest node + states + CTAs**

Chest (line 349): done state → `bg-wa-sand border-wa-sand-deep shadow-2xl ring-4 ring-wa-sand/30`, locked → `bg-wa-mist border-wa-border`. "UNIT DONE!" badge (357): `bg-wa-sand text-wa-inkDeep border border-wa-sandDeep/40`.
Loading skeletons (155-168): `bg-wa-paper … rounded-wa-card border border-wa-border`, pulses `bg-wa-mist`/`bg-wa-border`.
Error card (170-182): `bg-wa-paper rounded-wa-card p-8 shadow-wa-card border border-wa-terra/30`, retry button `bg-wa-teal text-white font-wa-display rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none`.
Empty state (184-206): card `bg-wa-paper rounded-wa-card p-8 shadow-wa-card border border-wa-border`, icon chip `bg-wa-teal/10 text-wa-teal`, join button same teal 3D, tour link `text-wa-teal font-bold underline underline-offset-4`.
Floating CTAs (368-384): practice button `bg-wa-paper rounded-2xl shadow-xl border-2 border-wa-border text-wa-teal hover:scale-110`.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit`; `npm run build`; `npm test` (full suite green).

```bash
git add apps/student/HomeMap.tsx
git commit -m "feat(atlas): WA nodes, chest, empty/error states, floating CTAs"
```

---

### Task 9: Territory intro hero card

**Files:**
- Create: `apps/student/atlas/TerritoryIntro.tsx`
- Modify: `apps/student/HomeMap.tsx` (render above the focus unit's banner)
- Test: `tests/territory.test.ts` (extend `pickFocusUnit` coverage — already done in Task 3)

**Interfaces:**
- Consumes: `TerritoryTheme` (Task 3), `pickFocusUnit` (Task 3), `wa-*` classes.
- Produces: `TerritoryIntro({ unit, theme, lessonsCount, crowns, isLocked, onStart }: { unit: { title: string; topic?: string }; theme: TerritoryTheme; lessonsCount: number; crowns?: { current: number; total: number }; isLocked?: boolean; onStart: () => void })`.

- [ ] **Step 1: Create `apps/student/atlas/TerritoryIntro.tsx`**

```tsx
import React from 'react';
import { Play, Crown } from 'lucide-react';
import type { TerritoryTheme } from './territory';

// "New Territory" hero shown above the focus unit's path (Stitch screen_17):
// mascot glyph, territory name, tagline, lesson/crown chips, START button.
export function TerritoryIntro({ unit, theme, lessonsCount, crowns, isLocked, onStart }: {
  unit: { title: string; topic?: string };
  theme: TerritoryTheme;
  lessonsCount: number;
  crowns?: { current: number; total: number };
  isLocked?: boolean;
  onStart: () => void;
}) {
  return (
    <div className="mx-4 mt-4 rounded-wa-card bg-wa-paper border border-wa-border shadow-wa-card p-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-wa-mist flex items-center justify-center text-4xl shrink-0">
          {theme.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-wa-display font-bold uppercase tracking-widest text-wa-teal">
            New Territory
          </span>
          <h2 className="font-wa-display font-semibold text-xl text-wa-ink leading-tight">{unit.title}</h2>
          <p className="text-sm text-wa-muted mt-1">{theme.tagline}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs font-bold text-wa-ink bg-wa-mist px-2.5 py-1 rounded-full">
              📖 {lessonsCount} {lessonsCount === 1 ? 'lesson' : 'lessons'}
            </span>
            {crowns && crowns.total > 0 && (
              <span className="text-xs font-bold text-wa-inkDeep bg-wa-sand/25 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Crown size={12} className="text-wa-sandDeep" /> {crowns.current}/{crowns.total}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={isLocked}
        className="mt-4 w-full bg-wa-teal text-white font-wa-display font-semibold py-3 rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        <Play size={18} fill="currentColor" /> START!
      </button>
    </div>
  );
}

export default TerritoryIntro;
```

- [ ] **Step 2: Render it in HomeMap**

Inside the `units.map((unit, unitIndex) => {` block, before the territory banner div, add:

```tsx
        {(() => {
          const focus = pickFocusUnit(units, masteryByUnit);
          if (focus?.id !== unit.id) return null;
          const focusSummary = masteryByUnit[unit.id];
          const activeNode = nodes.find((n) => n.state === 'active') ?? nodes[0];
          return (
            <TerritoryIntro
              unit={{ title: unit.title, topic: unit.topic }}
              theme={themeForUnit(unit)}
              lessonsCount={nodes.length}
              crowns={focusSummary ? { current: focusSummary.crowns, total: focusSummary.total } : undefined}
              isLocked={unitLocked}
              onStart={() => (activeNode ? onNavigate('lesson', unit.id, activeNode.stage.id) : onNavigate('lesson', unit.id))}
            />
          );
        })()}
```

Add imports at top of `HomeMap.tsx`: `import TerritoryIntro from './atlas/TerritoryIntro';` and add `pickFocusUnit` to the existing `./atlas/territory` import.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit`; `npm run build`; `npm test`; dev-check: exactly ONE intro card on the page, above the first non-complete unit, START opens that unit's active stage.

```bash
git add apps/student/atlas/TerritoryIntro.tsx apps/student/HomeMap.tsx
git commit -m "feat(atlas): territory intro hero card on the home map"
```

---

### Task 10: Token sweep + final verification

**Files:**
- Verify only: `apps/student/StudentApp.tsx`, `apps/student/HomeMap.tsx`, `apps/student/atlas/*`

- [ ] **Step 1: Sweep for stragglers**

```bash
grep -n "duo-\|slate-\|#e91e63\|#be185d\|#e5e7eb\|#e2e8f0" apps/student/StudentApp.tsx apps/student/HomeMap.tsx
```
Expected: **no matches** (the flag stripes `bg-blue-500`/`bg-red-500` and `font-mono`/`bg-white` utilities are allowed). Fix any hit with the nearest `wa-*` token and re-run.

- [ ] **Step 2: Full gate**

```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: all green.

- [ ] **Step 3: Manual smoke (dev)**

`npm run dev` → log in as a student → `/student`: cream canvas, atlas header, homework cards, territory banners with emoji chips, dashed sand path, themed nodes, ONE intro hero, WA nav + join modal. Screenshot for the owner.

- [ ] **Step 4: Commit any sweep fixes + summary**

```bash
git add -A apps/student/ && git commit -m "chore(atlas): token sweep — no raw duo/slate colors left in reskinned files"
```

---

## Out of scope (do NOT do in this plan)

- Reskinning lesson player, exercises, quests/leaderboard/shop/profile screens (Plans 2–3).
- Login screen reskin (`apps/Login.tsx`) — it is the SHARED portal front door (teacher/parent use it too); scheduled for Plan 3 with a deliberate cross-portal decision.
- Mascot ART generation (seedream pipeline) — metadata + emoji fallbacks land here; art swap is a follow-up.
- Pushing/merging to master — owner merges (push auto-deploys to Vercel).

---

## Execution record (2026-09-09)

Executed via subagent-driven development: 10 tasks + final whole-branch review + fix wave, all reviews clean.
Branch `feature/wonder-atlas-foundation`, commits `e0ef8d8..4312125` (14). Migration `20260909000001` is LIVE on cloud (4 columns + marker verified).
Plan defects found and fixed during execution: bookkeeping table is `supabase_migrations.schema_migrations` (not bare `supabase_migrations`); `wa-*` class keys are camelCase only (`wa-sandDeep`, never `wa-sand-deep`).

### Deferred to Plans 2-3 / owner (triaged by final review — nothing blocks merge)
- Owner: authenticated visual pass on a preview deploy BEFORE merge (dash trail on horizontal runs, locked-banner grayscale, CodeInput on tablet, fonts applying) — merge auto-deploys Vercel prod.
- Shadow strings duplicate deep hexes as literals in tokens.ts; unasserted `wa-btn-terra`/`wa-btn-sand` (unused until Plans 2-3).
- Dead first `fontFamily` block in tailwind.config.js (pre-existing JS duplicate-key trap) + dead `Fredoka One` fallback in `wa-display` — prune in a dedicated config-cleanup commit, NOT on this branch (add-only discipline).
- territory.ts RULES regex substring collisions (season→sea, start→star, teacher→eat) — fallback-only; 0 mislabels across the 60 newest live units; tighten with word boundaries or populate columns if odd labels appear.
- Skeleton thin-line contrast (~2% luminance delta) on paper; terra-as-error-color (no error token in Stitch palette — plan-level ruling); hero/banner title duplication for focus unit (Stitch-faithful); CodeInput mid-string caret (force `setSelectionRange(len,len)` if device testing shows confusion); dubbing CTA still purple (flag-gated OFF; Plans 2-3 scope).
