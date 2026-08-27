# Illustration System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the degraded free Pollinations image path with OpenRouter's Image API and build the missing illustration pipelines (unit covers, story scenes with character reference consistency, character portraits), including backfill and frontend wiring.

**Architecture:** A pure, runtime-agnostic core (`_shared/illustrationCore.ts`: style brain + OpenRouter `/v1/images` client + storage/asset REST helpers) is imported by both the edge wrapper (Deno) and tsx scripts (Node). `generate-media` gains per-surface actions (`cover`, `portrait`, `story_page`) that write `units.cover_image`, `characters.reference_image_asset_id`, `story_pages.image_asset_id`. Sequencing lives in the existing frontend orchestrator + an idempotent backfill script (a full 15–18-image pass cannot fit the ~150s edge limit — this is a refinement of the spec's "edge-side pass", which is physically impossible; browser-independent completion comes from the backfill script and manual regenerate buttons instead).

**Tech Stack:** Supabase Edge Functions (Deno), OpenRouter Image API, Postgres migration, React/TS frontend, vitest, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-illustration-system-design.md` (commit `466aeb1`)

## Global Constraints

- **Region-safe models ONLY** — never `google/*`, `openai/*`, `anthropic/*` image models even though OpenRouter lists them. Candidate ids: `bytedance-seed/seedream-4.5`, `bytedance-seed/seedream-5-0-lite`, `black-forest-labs/flux.2-pro`.
- **All commands run from `professor-0.1 (1)/`** (the git repo). Supabase ref is `xsdnzijketjnzhakqtit`.
- **Edge functions do NOT auto-deploy** — after any change under `supabase/functions/` run `npx supabase functions deploy <names> --project-ref xsdnzijketjnzhakqtit --no-verify-jwt`.
- **Verify functions via `/functions/v1/`** with `apikey` header (expect 401, not 404) — never `/functions/v2/`.
- **Dedup hash includes the model**: `sha256(model + '\n' + prompt + '\n' + refs.join(','))` — a model swap deliberately bypasses old dedup entries.
- **No new `pollinations.ai` references** in any code (frontend fallback included). Existing references are removed in Task 7.
- **Every generated image must be proxied into the `generated-media` storage bucket** — returned URLs are always `*.supabase.co/storage/...`.
- **`assets.model`** is recorded on every new image row.
- Frontend lint gate: `npm run lint` (tsc) and `npm test` (vitest) must pass after every frontend task.

---

### Task 1: Migration — `art_direction`, `assets.model`, bundle character portraits

**Files:**
- Create: `supabase/migrations/20260828000001_illustration_v2.sql`

**Interfaces:**
- Produces: `units.art_direction TEXT NULL`, `assets.model TEXT NULL`, `get_unit_bundle` now returns each character with `image_url` resolved from `reference_image_asset_id`.

- [ ] **Step 1: Write the migration file**

```sql
-- 20260828000001_illustration_v2.sql — Illustration System v2 (spec 2026-08-28)
-- 1. Per-unit art direction line (palette + motifs) used by the style brain.
alter table public.units add column if not exists art_direction text;

-- 2. Which model produced an image (model-aware dedup/regeneration later).
alter table public.assets add column if not exists model text;

-- 3. get_unit_bundle: resolve character portraits (reference_image_asset_id → image_url),
--    mirroring the existing story_pages audio/image resolution.
create or replace function public.get_unit_bundle(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_teacher uuid;
  v_status  text;
  v_bundle  jsonb;
begin
  select u.teacher_id, u.status into v_teacher, v_status from public.units u where u.id = p_unit_id;
  if not found then raise exception 'Unit not found'; end if;

  if v_teacher is not null and v_teacher is distinct from auth.uid() and not public.is_teacher_or_admin() then
    if not (public.is_role('student') and v_status = 'Active' and v_teacher = any(public.student_class_teacher_ids())) then
      raise exception 'Not authorized to read this unit';
    end if;
  end if;

  select jsonb_build_object(
    'unit_id',       p_unit_id,
    'objectives',    coalesce((select jsonb_agg(to_jsonb(o))  from public.objectives o  where o.unit_id  = p_unit_id), '[]'::jsonb),
    'pool_items',    coalesce((select jsonb_agg(to_jsonb(pi)) from public.pool_items pi where pi.unit_id = p_unit_id), '[]'::jsonb),
    'vocabulary_items', coalesce((select jsonb_agg(to_jsonb(vi) order by vi.order_index) from public.vocabulary_items vi where vi.unit_id = p_unit_id), '[]'::jsonb),
    'story_pages',   coalesce((
        select jsonb_agg(
          to_jsonb(sp) || jsonb_build_object('image_url', ia.public_url, 'audio_url', sa.public_url)
          order by sp.page_number
        )
        from public.story_pages sp
        left join public.assets ia on ia.id = sp.image_asset_id
        left join public.assets sa on sa.id = sp.audio_asset_id
        where sp.unit_id = p_unit_id
      ), '[]'::jsonb),
    'story_questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.order_index) from public.story_comprehension_questions q where q.unit_id = p_unit_id), '[]'::jsonb),
    'dialogue_lines', coalesce((
        select jsonb_agg(to_jsonb(dl) || jsonb_build_object('audio_url', da.public_url) order by dl.order_index)
        from public.dialogue_lines dl
        left join public.assets da on da.id = dl.audio_asset_id
        where dl.unit_id = p_unit_id
      ), '[]'::jsonb),
    'grammar_rules', coalesce((select jsonb_agg(to_jsonb(gr) order by gr.order_index) from public.grammar_rules gr where gr.unit_id = p_unit_id), '[]'::jsonb),
    'characters',    coalesce((
        select jsonb_agg(to_jsonb(c) || jsonb_build_object('image_url', pa.public_url) order by c.created_at)
        from public.characters c
        join public.unit_characters uc on uc.character_id = c.id
        left join public.assets pa on pa.id = c.reference_image_asset_id
        where uc.unit_id = p_unit_id
      ), '[]'::jsonb)
  ) into v_bundle;

  return v_bundle;
end;
$function$;
```

- [ ] **Step 2: Apply to cloud via Management API**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d @<(python3 - <<'EOF'
import json
sql = open('supabase/migrations/20260828000001_illustration_v2.sql').read()
print(json.dumps({"query": sql}))
EOF
)
```
Expected: `[]` (success, no error object). If the API rejects multi-statement bodies, split into 3 queries (alter / alter / create-or-replace) and apply each.

- [ ] **Step 3: Verify**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name from information_schema.columns where table_name='\''units'\'' and column_name='\''art_direction'\''; select column_name from information_schema.columns where table_name='\''assets'\'' and column_name='\''model'\'';"}'
```
Expected: two rows. Also insert the filename into `schema_migrations` if the cloud convention requires it (check `select version from schema_migrations order by version desc limit 3;` — if migration files are recorded, insert `'20260828000001_illustration_v2'`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260828000001_illustration_v2.sql
git commit -m "feat(illustration): migration — units.art_direction, assets.model, bundle character portraits"
```

---

### Task 2: Core — style brain (composePrompt)

**Files:**
- Create: `supabase/functions/_shared/illustrationCore.ts`
- Test: `tests/illustrationCore.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 4, 12, 13):
  - `type Surface = 'vocab' | 'cover' | 'story_scene' | 'portrait'`
  - `interface UnitArtContext { title: string; topic?: string | null; artDirection?: string | null }`
  - `composePrompt(surface: Surface, unit: UnitArtContext, content: string): string`
  - `aspectRatioFor(surface: Surface): '1:1' | '16:9'`
  - `const HOUSE_STYLE: string`

This file must stay **pure** — no `Deno.*`, no `process.*`, no Node imports (only `fetch`/`crypto.subtle`, available in both runtimes) — because tsx scripts import it directly.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/illustrationCore.test.ts
import { describe, it, expect } from 'vitest';
import { composePrompt, aspectRatioFor, HOUSE_STYLE } from '../supabase/functions/_shared/illustrationCore';

const unit = { title: 'Space Adventure', topic: 'planets and rockets', artDirection: 'deep blue palette; rockets, stars, soft glow' };

describe('composePrompt', () => {
  it('includes content, house style, surface directive, art direction, and no-text rule', () => {
    const p = composePrompt('vocab', unit, 'a cartoon astronaut.');
    expect(p).toContain('a cartoon astronaut');
    expect(p).toContain(HOUSE_STYLE);
    expect(p).toContain('centered');
    expect(p).toContain('deep blue palette');
    expect(p).toContain('Space Adventure');
    expect(p).toMatch(/no text/i);
  });

  it('uses per-surface directives', () => {
    expect(composePrompt('cover', unit, 'x')).toContain('upper third');
    expect(composePrompt('story_scene', unit, 'x')).toContain('reference images');
    expect(composePrompt('portrait', unit, 'x')).toContain('bust portrait');
  });

  it('works without art direction (old units)', () => {
    const p = composePrompt('vocab', { title: 'Farm Animals' }, 'a cow');
    expect(p).toContain('a cow');
    expect(p).not.toContain('Art direction');
  });
});

describe('aspectRatioFor', () => {
  it('maps surfaces', () => {
    expect(aspectRatioFor('vocab')).toBe('1:1');
    expect(aspectRatioFor('cover')).toBe('16:9');
    expect(aspectRatioFor('story_scene')).toBe('16:9');
    expect(aspectRatioFor('portrait')).toBe('1:1');
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

Run: `npx vitest run tests/illustrationCore.test.ts`
Expected: FAIL — cannot resolve `../supabase/functions/_shared/illustrationCore`.

- [ ] **Step 3: Implement the style brain**

```ts
// supabase/functions/_shared/illustrationCore.ts
// Pure, runtime-agnostic illustration core — imported by the edge wrapper
// (_shared/illustration.ts, Deno) AND tsx scripts (Node). Use only fetch +
// crypto.subtle. NEVER import Deno- or Node-specific APIs here.

export type Surface = 'vocab' | 'cover' | 'story_scene' | 'portrait';

export const HOUSE_STYLE =
  "modern children's picture-book illustration, soft rounded shapes, warm friendly palette, clean flat vector style with subtle gradients, gentle outlines, cheerful and expressive, high contrast for classroom projection, uncluttered composition";

const SURFACE_DIRECTIVES: Record<Surface, string> = {
  vocab: 'single main subject, perfectly centered, plain soft background, nothing else in frame',
  cover: 'wide establishing scene of the unit theme, upper third visually calm to leave room for a title',
  story_scene:
    'cinematic storybook scene of the described moment, clear environment and mood, any characters drawn exactly as they appear in the reference images',
  portrait: 'bust portrait of one character facing the viewer, friendly expression, simple soft background',
};

const ASPECT_RATIOS: Record<Surface, '1:1' | '16:9'> = {
  vocab: '1:1',
  cover: '16:9',
  story_scene: '16:9',
  portrait: '1:1',
};

export interface UnitArtContext {
  title: string;
  topic?: string | null;
  artDirection?: string | null;
}

export function aspectRatioFor(surface: Surface): '1:1' | '16:9' {
  return ASPECT_RATIOS[surface];
}

export function composePrompt(surface: Surface, unit: UnitArtContext, content: string): string {
  const parts = [String(content || '').trim().replace(/\.+$/, ''), `Style: ${HOUSE_STYLE}.`];
  parts.push(`${SURFACE_DIRECTIVES[surface]}.`);
  const dir = String(unit.artDirection || '').trim();
  if (dir) parts.push(`Art direction: ${dir.replace(/\.+$/, '')}.`);
  const ctx = [unit.title, unit.topic].filter(Boolean).join(' — ');
  if (ctx) parts.push(`Unit context: ${ctx}.`);
  parts.push('Strictly no text, no letters, no numbers, no logos, no watermark.');
  return parts.join(' ');
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/illustrationCore.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/illustrationCore.ts tests/illustrationCore.test.ts
git commit -m "feat(illustration): pure style brain — composePrompt + surface directives"
```

---

### Task 3: Core — OpenRouter images client + storage/asset helpers

**Files:**
- Modify: `supabase/functions/_shared/illustrationCore.ts` (append)
- Test: `tests/illustrationCore.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 exports.
- Produces (used by Tasks 4, 12):
  - `interface IllustrationConfig { openrouterKey: string; baseUrl?: string }`
  - `interface SupabaseRestConfig { supabaseUrl: string; serviceKey: string }`
  - `type ImageGenResult = { ok: true; b64: string; mediaType: string; model: string; cost?: number } | { ok: false; error: string }`
  - `sha256Hex(text: string): Promise<string>`
  - `promptHashFor(model: string, prompt: string, refs?: string[]): Promise<string>`
  - `callOpenRouterImages(cfg, req: { model; prompt; aspectRatio?; inputReferences? }): Promise<ImageGenResult>`
  - `uploadImageToStorage(cfg: SupabaseRestConfig, unitId: string, bytes: Uint8Array, contentType: string): Promise<string | null>`
  - `findAssetByHash(cfg, hash): Promise<{ id: string; public_url: string } | null>`
  - `insertAssetRow(cfg, row: AssetRowInput): Promise<{ id: string | null; conflict: boolean }>`

- [ ] **Step 1: Write the failing tests (append to tests/illustrationCore.test.ts)**

```ts
import { vi, afterEach } from 'vitest';
import { sha256Hex, promptHashFor, callOpenRouterImages } from '../supabase/functions/_shared/illustrationCore';

afterEach(() => vi.unstubAllGlobals());

describe('sha256Hex / promptHashFor', () => {
  it('hashes deterministically and lowercases like the legacy dedup', async () => {
    const h = await sha256Hex('Hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex('hello')).toBe(h);
  });
  it('promptHashFor includes model and refs', async () => {
    const base = await promptHashFor('m1', 'p');
    expect(await promptHashFor('m2', 'p')).not.toBe(base);
    expect(await promptHashFor('m1', 'p', ['r1'])).not.toBe(base);
  });
});

describe('callOpenRouterImages', () => {
  it('parses b64_json responses and passes input_references', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ data: [{ b64_json: 'QUJD', media_type: 'image/png' }], usage: { cost: 0.04 } }), { status: 200 });
    });
    const r = await callOpenRouterImages({ openrouterKey: 'k' }, { model: 'bytedance-seed/seedream-4.5', prompt: 'p', aspectRatio: '16:9', inputReferences: ['https://x/1.png'] });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.b64).toBe('QUJD'); expect(r.cost).toBe(0.04); }
    expect(calls[0].model).toBe('bytedance-seed/seedream-4.5');
    expect(calls[0].aspect_ratio).toBe('16:9');
    expect(calls[0].input_references).toEqual(['https://x/1.png']);
  });
  it('returns ok:false on HTTP error with status', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"bad"}', { status: 402 }));
    const r = await callOpenRouterImages({ openrouterKey: 'k' }, { model: 'm', prompt: 'p' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('402');
  });
  it('returns ok:false when b64_json missing', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    const r = await callOpenRouterImages({ openrouterKey: 'k' }, { model: 'm', prompt: 'p' });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (exports missing)**

Run: `npx vitest run tests/illustrationCore.test.ts`
Expected: FAIL — `sha256Hex` etc. not exported.

- [ ] **Step 3: Implement (append to illustrationCore.ts)**

```ts
// ── hashing / dedup ──────────────────────────────────────────────────
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Dedup key — includes the model + refs so a model swap deliberately regenerates. */
export async function promptHashFor(model: string, prompt: string, refs: string[] = []): Promise<string> {
  return sha256Hex(`${model}\n${prompt}\n${refs.join(',')}`);
}

// ── OpenRouter Image API ─────────────────────────────────────────────
export interface IllustrationConfig { openrouterKey: string; baseUrl?: string }

export type ImageGenResult =
  | { ok: true; b64: string; mediaType: string; model: string; cost?: number }
  | { ok: false; error: string };

export async function callOpenRouterImages(
  cfg: IllustrationConfig,
  req: { model: string; prompt: string; aspectRatio?: string; inputReferences?: string[] },
): Promise<ImageGenResult> {
  const baseUrl = cfg.baseUrl || 'https://openrouter.ai/api/v1';
  const body: Record<string, unknown> = { model: req.model, prompt: req.prompt, n: 1 };
  if (req.aspectRatio) body.aspect_ratio = req.aspectRatio;
  if (req.inputReferences && req.inputReferences.length > 0) body.input_references = req.inputReferences;
  try {
    const resp = await fetch(`${baseUrl}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.openrouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 300);
      return { ok: false, error: `openrouter images ${resp.status}: ${errText}` };
    }
    const data: any = await resp.json();
    const item = data?.data?.[0];
    if (!item?.b64_json) return { ok: false, error: 'openrouter images: no b64_json in response' };
    return { ok: true, b64: item.b64_json, mediaType: item.media_type || 'image/png', model: req.model, cost: data?.usage?.cost };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'openrouter images request failed' };
  }
}

// ── Supabase REST helpers (service role) ─────────────────────────────
export interface SupabaseRestConfig { supabaseUrl: string; serviceKey: string }

export async function uploadImageToStorage(cfg: SupabaseRestConfig, unitId: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
  const uploadPath = `images/${unitId || 'default'}/${Date.now()}.${ext}`;
  const resp = await fetch(`${cfg.supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': contentType },
    body: bytes,
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) return null;
  return `${cfg.supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}`;
}

export async function findAssetByHash(cfg: SupabaseRestConfig, promptHash: string): Promise<{ id: string; public_url: string } | null> {
  try {
    const resp = await fetch(
      `${cfg.supabaseUrl}/rest/v1/assets?select=id,public_url&type=eq.image&prompt_hash=eq.${encodeURIComponent(promptHash)}&limit=1`,
      { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return Array.isArray(rows) && rows[0]?.public_url ? rows[0] : null;
  } catch { return null; }
}

export interface AssetRowInput {
  unit_id?: string | null;
  type?: string;
  kind?: string;
  prompt: string;
  prompt_hash: string;
  model?: string | null;
  storage_path?: string;
  public_url: string;
  metadata?: Record<string, unknown>;
}

export async function insertAssetRow(cfg: SupabaseRestConfig, row: AssetRowInput): Promise<{ id: string | null; conflict: boolean }> {
  try {
    const resp = await fetch(`${cfg.supabaseUrl}/rest/v1/assets?select=id`, {
      method: 'POST',
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ type: 'image', kind: 'generated', ...row }),
    });
    if (resp.ok) {
      const inserted = await resp.json();
      return { id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id, conflict: false };
    }
    if (resp.status === 409) return { id: null, conflict: true };
    console.error('insertAssetRow failed:', resp.status);
    return { id: null, conflict: false };
  } catch { return { id: null, conflict: false }; }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/illustrationCore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/illustrationCore.ts tests/illustrationCore.test.ts
git commit -m "feat(illustration): OpenRouter /v1/images client + storage/asset REST helpers (pure core)"
```

---

### Task 4: Edge wrapper + `generate-media` per-surface actions

**Files:**
- Create: `supabase/functions/_shared/illustration.ts`
- Modify: `supabase/functions/generate-media/index.ts`
- Modify: `supabase/functions/_shared/imageGen.ts` (becomes a thin shim)

**Interfaces:**
- Consumes: Task 2/3 core exports; existing `serveEdgeFunction` (validationRules, `_auth`); existing `createClient` pattern from `crop-book-image`.
- Produces:
  - `generateIllustration(opts: { sb: SupabaseClient; unitId: string; surface: Surface; content: string; inputReferences?: string[]; regenerate?: boolean }): Promise<{ url: string; assetId?: string; cached?: boolean; error?: string }>`
  - `ensureArtDirection(sb, unit: { id, title, topic, art_direction }): Promise<string>`
  - `generate-media` action `generate-image` accepts extra `surface` (default `'vocab'`).
  - New action `generate-illustrations` with `surface: 'cover' | 'portrait' | 'story_page'`:
    - `cover`: needs `unitId`
    - `portrait`: needs `unitId` + `characterId`
    - `story_page`: needs `unitId` + `pageId`
  - `_shared/imageGen.ts` keeps exporting `generateAndStoreImage(prompt, unitId)` (delegates with `surface='vocab'`) so `generate-exercises/index.ts:456` keeps working unchanged.

- [ ] **Step 1: Write `_shared/illustration.ts`**

```ts
// Edge wrapper around illustrationCore: reads Deno env, resolves unit art
// context, does dedup → generate → upload → record, and the per-surface
// write-backs (units.cover_image / characters.reference_image_asset_id /
// story_pages.image_asset_id).
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  Surface, UnitArtContext, composePrompt, aspectRatioFor,
  IllustrationConfig, SupabaseRestConfig, ImageGenResult,
  callOpenRouterImages, uploadImageToStorage, findAssetByHash, insertAssetRow, promptHashFor,
} from './illustrationCore.ts';

const DICEBEAR = (seed: string) => `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;

function envConfig(): { ill: IllustrationConfig; rest: SupabaseRestConfig; model: string; fallbackModel: string | null } | null {
  const openrouterKey = Deno.env.get('AI_API_KEY') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!openrouterKey || !supabaseUrl || !serviceKey) return null;
  return {
    ill: { openrouterKey },
    rest: { supabaseUrl, serviceKey },
    model: Deno.env.get('IMAGE_GEN_MODEL') || 'bytedance-seed/seedream-4.5',
    fallbackModel: Deno.env.get('IMAGE_GEN_FALLBACK_MODEL') || null,
  };
}

export async function fetchUnitArtContext(sb: SupabaseClient, unitId: string): Promise<UnitArtContext & { teacherId: string | null; bookId: string | null } | null> {
  const { data: unit } = await sb.from('units').select('title, topic, art_direction, teacher_id, book_id').eq('id', unitId).single();
  if (!unit) return null;
  return {
    title: String(unit.title || 'Unit'),
    topic: unit.topic || null,
    artDirection: unit.art_direction || null,
    teacherId: unit.teacher_id || null,
    bookId: unit.book_id || null,
  };
}

/** One small chat call to derive the unit's art direction line (cached in units.art_direction). */
export async function ensureArtDirection(sb: SupabaseClient, unit: { id: string; title: string; topic?: string | null; artDirection?: string | null }): Promise<string> {
  const existing = String(unit.artDirection || '').trim();
  if (existing) return existing;
  const openrouterKey = Deno.env.get('AI_API_KEY') || '';
  const textModel = Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6';
  let dir = '';
  if (openrouterKey) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: 'system', content: 'You are an art director for a children\'s English course (ages 6-12). Reply with ONE line only: a color palette plus 2-3 visual motifs for the unit. No preamble, no quotes. Example: warm sunset palette; rockets, planets, soft glow' },
            { role: 'user', content: `Unit title: ${unit.title}\nTopic: ${unit.topic || 'general English'}` },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (resp.ok) {
        const data = await resp.json();
        dir = String(data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').split('\n')[0].slice(0, 200);
      }
    } catch { /* fall through to topic-derived default */ }
  }
  if (!dir) dir = `cheerful primary palette; motifs from ${unit.topic || unit.title}`;
  await sb.from('units').update({ art_direction: dir }).eq('id', unit.id);
  return dir;
}

async function runOneImage(cfg: { ill: IllustrationConfig; model: string }, prompt: string, aspectRatio: string, refs?: string[]): Promise<ImageGenResult> {
  const primary = await callOpenRouterImages(cfg.ill, { model: cfg.model, prompt, aspectRatio, inputReferences: refs });
  if (primary.ok) return primary;
  const fbModel = Deno.env.get('IMAGE_GEN_FALLBACK_MODEL');
  if (fbModel && fbModel !== cfg.model) {
    const fb = await callOpenRouterImages(cfg.ill, { model: fbModel, prompt, aspectRatio, inputReferences: refs });
    if (fb.ok) return fb;
  }
  return primary;
}

export async function generateIllustration(opts: {
  sb: SupabaseClient; unitId: string; surface: Surface; content: string;
  context: UnitArtContext; inputReferences?: string[]; regenerate?: boolean;
}): Promise<{ url: string; assetId?: string; cached?: boolean; error?: string }> {
  const cfg = envConfig();
  if (!cfg) return { url: DICEBEAR(opts.content), error: 'Illustration not configured (AI_API_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)' };

  const finalPrompt = composePrompt(opts.surface, opts.context, opts.content);
  const refs = (opts.inputReferences || []).filter(Boolean);
  const hash = await promptHashFor(cfg.model, finalPrompt, refs);

  if (!opts.regenerate) {
    const cached = await findAssetByHash(cfg.rest, hash);
    if (cached) return { url: cached.public_url, assetId: cached.id, cached: true };
  }

  const gen = await runOneImage({ ill: cfg.ill, model: cfg.model }, finalPrompt, aspectRatioFor(opts.surface), refs);
  if (!gen.ok) return { url: DICEBEAR(opts.content), error: gen.error };

  const bytes = Uint8Array.from(atob(gen.b64), (c) => c.charCodeAt(0));
  const publicUrl = await uploadImageToStorage(cfg.rest, opts.unitId, bytes, gen.mediaType);
  if (!publicUrl) return { url: DICEBEAR(opts.content), error: 'storage upload failed' };

  const { id: assetId, conflict } = await insertAssetRow(cfg.rest, {
    unit_id: opts.unitId || null,
    prompt: finalPrompt,
    prompt_hash: hash,
    model: gen.model,
    storage_path: `images/${opts.unitId || 'default'}`,
    public_url: publicUrl,
  });
  let finalUrl = publicUrl;
  if (conflict && !opts.regenerate) {
    const cached = await findAssetByHash(cfg.rest, hash);
    if (cached) { finalUrl = cached.public_url; }
  }
  // unit_media link (best-effort, mirrors old imageGen behavior)
  if (assetId && opts.unitId) {
    try {
      await fetch(`${cfg.rest.supabaseUrl}/rest/v1/unit_media`, {
        method: 'POST',
        headers: { apikey: cfg.rest.serviceKey, Authorization: `Bearer ${cfg.rest.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ unit_id: opts.unitId, asset_id: assetId, role: 'generated', order_index: 0 }),
      });
    } catch { /* non-fatal */ }
  }
  return { url: finalUrl, assetId: assetId || undefined, error: conflict && opts.regenerate ? undefined : undefined };
}

// ── per-surface flows (used by generate-media's generate-illustrations) ──

export async function generateCover(sb: SupabaseClient, unitId: string, regenerate = false) {
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');
  const artDirection = await ensureArtDirection(sb, { id: unitId, title: ctx.title, topic: ctx.topic, artDirection: ctx.artDirection });
  const content = `cover illustration for the unit "${ctx.title}" about ${ctx.topic || ctx.title}`;
  const r = await generateIllustration({ sb, unitId, surface: 'cover', content, context: { ...ctx, artDirection }, regenerate });
  if (r.url && !r.error) await sb.from('units').update({ cover_image: r.url }).eq('id', unitId);
  return r;
}

export async function generatePortrait(sb: SupabaseClient, unitId: string, characterId: string, regenerate = false) {
  const { data: ch } = await sb.from('characters').select('name, look_prompt, reference_image_asset_id').eq('id', characterId).single();
  if (!ch) throw new Error('Character not found');
  if (ch.reference_image_asset_id && !regenerate) {
    const { data: a } = await sb.from('assets').select('public_url').eq('id', ch.reference_image_asset_id).maybeSingle();
    if (a?.public_url) return { url: a.public_url, cached: true };
  }
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');
  const look = String(ch.look_prompt || '').trim() || `a friendly child character named ${ch.name}`;
  const r = await generateIllustration({ sb, unitId, surface: 'portrait', content: `character portrait of ${ch.name}: ${look}`, context: ctx, regenerate: true });
  if (r.assetId) await sb.from('characters').update({ reference_image_asset_id: r.assetId }).eq('id', characterId);
  return r;
}

export async function generateStoryPageScene(sb: SupabaseClient, unitId: string, pageId: string, regenerate = false) {
  const { data: page } = await sb.from('story_pages').select('id, page_number, text, speaker, speaker_character_id, image_prompt, image_asset_id').eq('id', pageId).single();
  if (!page) throw new Error('Story page not found');
  if (page.image_asset_id && !regenerate) {
    const { data: a } = await sb.from('assets').select('public_url').eq('id', page.image_asset_id).maybeSingle();
    if (a?.public_url) return { url: a.public_url, cached: true };
  }
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');

  // Reference chain: portraits of characters appearing/speaking on this page.
  const refs: string[] = [];
  const { data: linked } = await sb.from('unit_characters').select('characters(id, name, reference_image_asset_id)').eq('unit_id', unitId);
  const chars: any[] = (linked || []).map((l: any) => l.characters).filter(Boolean);
  const speakerName = String(page.speaker || '').trim().toLowerCase();
  for (const c of chars) {
    const isSpeaker = (page.speaker_character_id && c.id === page.speaker_character_id) || (speakerName && c.name?.toLowerCase() === speakerName);
    const mentioned = speakerName && String(page.text || '').toLowerCase().includes(String(c.name || '').toLowerCase());
    if ((isSpeaker || mentioned) && c.reference_image_asset_id) {
      const { data: a } = await sb.from('assets').select('public_url').eq('id', c.reference_image_asset_id).maybeSingle();
      if (a?.public_url) refs.push(a.public_url);
    }
  }

  const content = String(page.image_prompt || '').trim() || `scene: ${String(page.text || '').slice(0, 300)}`;
  const r = await generateIllustration({ sb, unitId, surface: 'story_scene', content, context: ctx, inputReferences: refs.slice(0, 2) });
  if (r.assetId) await sb.from('story_pages').update({ image_asset_id: r.assetId }).eq('id', pageId);
  return r;
}

export const dicebearPlaceholder = DICEBEAR;
```

- [ ] **Step 2: Make `imageGen.ts` a shim**

Replace the body of `supabase/functions/_shared/imageGen.ts` with:

```ts
// Thin shim: legacy signature kept for generate-exercises + generate-media's
// generate-image action. All real logic lives in illustration.ts (v2).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateIllustration } from './illustration.ts';

export interface GeneratedAsset { url: string; provider?: string; error?: string }

export async function generateAndStoreImage(prompt: string, unitId: string): Promise<GeneratedAsset> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(supabaseUrl, serviceKey);
  const { fetchUnitArtContext } = await import('./illustration.ts');
  const ctx = await fetchUnitArtContext(sb, unitId).catch(() => null);
  const r = await generateIllustration({
    sb, unitId: unitId || 'default', surface: 'vocab', content: prompt,
    context: ctx || { title: 'Unit', topic: null, artDirection: null },
  });
  return { url: r.url, provider: r.cached ? 'dedup' : 'openrouter', error: r.error };
}

export const dicebearPlaceholder = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;
```

- [ ] **Step 3: Wire the actions in `generate-media/index.ts`**

Add import at top:

```ts
import { generateCover, generatePortrait, generateStoryPageScene, generateIllustration, fetchUnitArtContext } from '../_shared/illustration.ts';
```

Replace `case 'generate-image':` body with surface support:

```ts
case 'generate-image': {
  // v2: surface-aware; server composes style + does dedup + records the asset.
  const surface = ['vocab', 'cover', 'story_scene', 'portrait'].includes(body.surface) ? body.surface : 'vocab';
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (surface !== 'vocab' || body.regenerate) {
    // ownership check for non-vocab surfaces (vocab is world-deduped by prompt)
    if (ctx?.teacherId && ctx.teacherId !== _auth?.userId && _auth?.role !== 'admin') {
      throw new Error('You do not own this unit');
    }
  }
  return generateIllustration({
    sb, unitId: unitId || 'default', surface, content: prompt || 'Educational item',
    context: ctx || { title: 'Unit', topic: null, artDirection: null },
    regenerate: Boolean(body.regenerate),
  });
}
```

Add the new action before `default:`:

```ts
// Illustration v2 per-surface pipeline (spec 2026-08-28). One surface per
// call — a full unit pass (~15-18 images) cannot fit the ~150s edge limit;
// sequencing lives in the client orchestrator + backfill script.
case 'generate-illustrations': {
  const surface = String(body.surface || '');
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  if (!unitId) throw new Error('unitId is required');
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');
  if (ctx.teacherId && ctx.teacherId !== _auth?.userId && _auth?.role !== 'admin') {
    throw new Error('You do not own this unit');
  }
  const regenerate = Boolean(body.regenerate);
  if (surface === 'cover') return generateCover(sb, unitId, regenerate);
  if (surface === 'portrait') {
    if (!body.characterId) throw new Error('characterId is required for portrait');
    // portrait must be a character linked to this unit (ownership proxy)
    const { data: link } = await sb.from('unit_characters').select('character_id').eq('unit_id', unitId).eq('character_id', body.characterId).maybeSingle();
    if (!link) throw new Error('Character is not linked to this unit');
    return generatePortrait(sb, unitId, String(body.characterId), regenerate);
  }
  if (surface === 'story_page') {
    if (!body.pageId) throw new Error('pageId is required for story_page');
    const { data: pg } = await sb.from('story_pages').select('unit_id').eq('id', body.pageId).maybeSingle();
    if (!pg || pg.unit_id !== unitId) throw new Error('Story page not in this unit');
    return generateStoryPageScene(sb, unitId, String(body.pageId), regenerate);
  }
  throw new Error(`Unknown surface: ${surface}. Valid: cover, portrait, story_page`);
}
```

Update the `default:` error string to include `generate-illustrations`.

- [ ] **Step 4: Deploy + verify**

```bash
npx supabase functions deploy generate-media --project-ref xsdnzijketjnzhakqtit --no-verify-jwt
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/generate-media" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"action":"generate-illustrations","surface":"cover"}'
```
Expected: `401` (auth required), never 404. (If anon key isn't in env, take `VITE_SUPABASE_ANON_KEY` from `professor-0.1 (1)/.env`.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/illustration.ts supabase/functions/_shared/imageGen.ts supabase/functions/generate-media/index.ts
git commit -m "feat(illustration): edge wrapper + generate-illustrations actions (cover/portrait/story_page)"
```

---

### Task 5: Bake-off — pick the model (OWNER GATE)

**Files:**
- Create: `scripts/testing/illustration-bakeoff.ts`

**Interfaces:**
- Consumes: Task 3 core (`callOpenRouterImages`), via relative import `../../supabase/functions/_shared/illustrationCore`.
- Produces: `/tmp/illustration-bakeoff/` images + `contact-sheet.html`; the owner's model choice sets dashboard secrets `IMAGE_GEN_MODEL` + `IMAGE_GEN_FALLBACK_MODEL`.

- [ ] **Step 1: Write the script**

```ts
// scripts/testing/illustration-bakeoff.ts — run with:
//   AI_API_KEY=sk-or-... npx tsx scripts/testing/illustration-bakeoff.ts
// Generates 6 canonical prompts x 3 candidate models, saves images + an HTML
// contact sheet to /tmp/illustration-bakeoff/ for the owner to judge.
import { writeFileSync, mkdirSync } from 'node:fs';
import { callOpenRouterImages } from '../../supabase/functions/_shared/illustrationCore';

const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('AI_API_KEY env var required'); process.exit(1); }

const MODELS = ['bytedance-seed/seedream-4.5', 'bytedance-seed/seedream-5-0-lite', 'black-forest-labs/flux.2-pro'];
const HOUSE = "modern children's picture-book illustration, soft rounded shapes, warm friendly palette, clean flat vector style with subtle gradients, gentle outlines, cheerful and expressive, high contrast for classroom projection, uncluttered composition";
const NO_TEXT = 'Strictly no text, no letters, no numbers, no logos, no watermark.';
const UNIT = { title: 'Space Adventure', topic: 'planets and rockets', dir: 'deep blue palette; rockets, stars, soft glow' };

const PROMPTS: { name: string; prompt: string; aspect: string; refs?: string[] }[] = [
  { name: 'vocab-astronaut', aspect: '1:1', prompt: `a cartoon astronaut child waving. Style: ${HOUSE}. single main subject, perfectly centered, plain soft background. Art direction: ${UNIT.dir}. Unit context: ${UNIT.title}. ${NO_TEXT}` },
  { name: 'vocab-planet', aspect: '1:1', prompt: `a happy cartoon planet with a ring, smiling. Style: ${HOUSE}. single main subject, perfectly centered, plain soft background. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'cover', aspect: '16:9', prompt: `cover illustration for the unit "${UNIT.title}" about ${UNIT.topic}. Style: ${HOUSE}. wide establishing scene, upper third visually calm for a title. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'portrait-mia', aspect: '1:1', prompt: `character portrait of Mia: a curious 8-year-old girl with curly hair and round glasses. Style: ${HOUSE}. bust portrait facing the viewer, friendly expression, simple soft background. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  // ref scenes get refs injected after portrait-mia is generated
  { name: 'scene-mia-launch', aspect: '16:9', prompt: `Mia the astronaut waving from a launchpad at night, rocket lights glowing behind her. Style: ${HOUSE}. cinematic storybook scene, characters drawn exactly as in the reference images. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'scene-mia-planet', aspect: '16:9', prompt: `Mia landing on a friendly planet, planting a small flag, stars above. Style: ${HOUSE}. cinematic storybook scene, characters drawn exactly as in the reference images. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
];

const OUT = '/tmp/illustration-bakeoff';
mkdirSync(OUT, { recursive: true });

async function gen(model: string, name: string, prompt: string, aspect: string, refs?: string[]): Promise<string> {
  const r = await callOpenRouterImages({ openrouterKey: KEY! }, { model, prompt, aspectRatio: aspect, inputReferences: refs });
  if (!r.ok) { console.error(`FAIL ${model}/${name}: ${r.error}`); return ''; }
  const file = `${model.split('/')[1]}-${name}.png`;
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.b64, 'base64'));
  console.log(`ok ${model}/${name} cost=${r.cost ?? '?'}`);
  return `${OUT}/${file}`;
}

async function main() {
  const cells: string[] = [];
  let refs: string[] = [];
  for (const model of MODELS) {
    for (const p of PROMPTS) {
      let useRefs = p.refs;
      if (p.name === 'portrait-mia') {
        // generate the portrait first; use THIS model's own portrait as its scene ref
        const portrait = await gen(model, p.name, p.prompt, p.aspect);
        refs = portrait ? [portrait.startsWith('http') ? portrait : `file://${portrait}`] : [];
        cells.push(`<div><h3>${model} — ${p.name}</h3><img src="${portrait.split('/').pop()}" width="360"></div>`);
        continue;
      }
      if (p.name.startsWith('scene-')) {
        // OpenRouter needs public URLs for input_references — local files won't do.
        // Fallback: run scenes without refs for non-ref quality judging, and note it.
        useRefs = undefined;
      }
      const img = await gen(model, p.name, p.prompt, p.aspect, useRefs);
      cells.push(img ? `<div><h3>${model} — ${p.name}</h3><img src="${img.split('/').pop()}" width="360"></div>` : `<div><h3>${model} — ${p.name}</h3><p>FAILED</p></div>`);
    }
  }
  // NOTE: reference-fidelity can't be judged from local files; after the owner
  // shortlists 1-2 models, run a follow-up: upload one portrait to storage,
  // then generate the two scenes WITH input_references for those models only.
  writeFileSync(`${OUT}/contact-sheet.html`, `<html><body style="font-family:sans-serif"><h1>Illustration bake-off</h1>${cells.join('\n')}</body></html>`);
  console.log(`\nContact sheet: ${OUT}/contact-sheet.html`);
}
main();
```

- [ ] **Step 2: Run it**

```bash
AI_API_KEY=<owner's OpenRouter key> npx tsx scripts/testing/illustration-bakeoff.ts
open /tmp/illustration-bakeoff/contact-sheet.html
```
Expected: 18 images (minus any failures), cost printed per image (~$0.7 total).

- [ ] **Step 3: Reference-fidelity follow-up for the shortlist**

After the owner shortlists 1–2 models: upload the winning `portrait-mia` to the `generated-media` bucket (via the Supabase dashboard → Storage → upload), then run the two `scene-*` prompts for the shortlisted models with `inputReferences: ['<public storage url>']` (small inline variant of the script or a curl). The owner confirms character fidelity.

- [ ] **Step 4: OWNER sets secrets** (Supabase dashboard → Edge Functions secrets):
- `IMAGE_PROVIDER=openrouter`
- `IMAGE_GEN_MODEL=<winner>`
- `IMAGE_GEN_FALLBACK_MODEL=<runner-up>`

- [ ] **Step 5: Commit + live smoke**

```bash
# with a real teacher JWT (fixture dev teacher):
FIXTURE_EMAIL=fixture-test+powerup2@passport.local FIXTURE_PASSWORD=<pw> npx tsx scripts/testing/legacy-smoke.ts  # env sanity only
git add scripts/testing/illustration-bakeoff.ts
git commit -m "feat(illustration): model bake-off script (seedream-4.5 / seedream-5-lite / flux.2-pro)"
```
Then from the teacher app vault, click "Generate" on any vocab image → confirm the returned URL is `*.supabase.co/storage/...` and a new `assets` row exists with `model` set.

---

### Task 6: `enrich-unit` — story prompts name characters

**Files:**
- Modify: `supabase/functions/enrich-unit/index.ts` (~line 644 story spec + rules)

**Interfaces:**
- Consumes: nothing new.
- Produces: story `image_prompt` values that name speaking characters (e.g. `Mia waving from the launchpad at night…`), which `generateStoryPageScene` matches to portraits by name.

- [ ] **Step 1: Update the story expectedOutputFormat + rules**

In the `case 'story':` block (~line 644), change the `image_prompt` example inside `expectedOutputFormat` from `"scene description for illustration"` to `"scene naming the characters who appear, e.g. 'Mia waving from the launchpad at night, rocket lights glowing'"`, and append to `categoryRules`:

```ts
categoryRules += "\n- image_prompt MUST start with the name(s) of the character(s) visible in that scene (matching the story's character names exactly) so illustrations can reuse their established look";
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy enrich-unit --project-ref xsdnzijketjnzhakqtit --no-verify-jwt
```
Verify: 401 probe on `/functions/v1/enrich-unit`. Then run the golden fixture regression to confirm the prompt change didn't break enrichment output shape:

```bash
FIXTURE_EMAIL=fixture-test+powerup2@passport.local FIXTURE_PASSWORD=<pw> npm run test:fixtures
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/enrich-unit/index.ts
git commit -m "feat(illustration): story image_prompts name characters for reference-matched scenes"
```

---

### Task 7: `MediaService` cleanup — kill the Pollinations path

**Files:**
- Modify: `services/MediaService.ts`

**Interfaces:**
- Consumes: Task 4's `generate-image` (now surface-aware, server-side dedup/record).
- Produces: `getVocabImage(unitId, word, contextSentence?)` unchanged signature (callers untouched); `pollinationsImageUrl` REMOVED (verified: zero usages outside MediaService).

- [ ] **Step 1: Delete `pollinationsImageUrl` (lines 20–29) and its internal use**

Replace the tail of `getVocabImage` (lines ~74–93) with:

```ts
    const result = await callGenerateMedia({
      action: 'generate-image',
      unitId,
      prompt,
      surface: 'vocab',
    });
    const url = result?.url || '';
    if (url && !url.includes('dicebear')) cache.images.set(cacheKey, url);
    return url;
```

Also delete the now-unused client-side `assets` insert and `hashPrompt` (check `hashPrompt` has no other references in the file first — it's only used by the deleted block).

- [ ] **Step 2: Lint + tests**

Run: `npm run lint && npx vitest run`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add services/MediaService.ts
git commit -m "fix(illustration): remove pollinations fallback + client asset double-write; server owns dedup"
```

---

### Task 8: Frontend orchestrator — drive the full unit illustration pass

**Files:**
- Modify: `hooks/useEnrichment.ts` (after the existing background media orchestrator effect, ~line 380)

**Interfaces:**
- Consumes: Task 4 actions `generate-illustrations` (cover/portrait/story_page).
- Produces: after enrichment, all surfaces get images without teacher interaction. Idempotent — the server skips items that already have images.

- [ ] **Step 1: Add the illustration pass**

Append after the existing background media orchestrator `useEffect` (the one keyed on `enriched` that processes `image_status === 'pending'` items):

```ts
  // Illustration v2 pass — runs AFTER vocab/character images settle. Drives
  // cover → portraits → story scenes via bounded per-surface edge calls.
  // Server-side each step is idempotent (already-has-image checks), so re-runs
  // are safe; this state just prevents an infinite client loop.
  const [illusPass, setIllusPass] = useState<{ done: boolean; step?: string }>({ done: false });
  useEffect(() => {
    if (!enriched || !unitId || illusPass.done) return;
    const vocabPending = enriched.vocabulary?.some((v: any) => v.image_status === 'pending') ?? false;
    const charPending = enriched.characters?.some((c: any) => c.image_status === 'pending') ?? false;
    if (vocabPending || charPending) return; // wait for the image loop above

    let cancelled = false;
    (async () => {
      const invoke = (body: any) => supabase.functions.invoke('generate-media', { body });
      try {
        setIllusPass({ done: false, step: 'cover' });
        await invoke({ action: 'generate-illustrations', surface: 'cover', unitId });

        if (cancelled) return;
        setIllusPass({ done: false, step: 'portraits' });
        const { data: chars } = await supabase
          .from('unit_characters').select('characters(id)').eq('unit_id', unitId);
        for (const row of chars || []) {
          const ch = (row as any).characters;
          if (ch?.id && !cancelled) await invoke({ action: 'generate-illustrations', surface: 'portrait', unitId, characterId: ch.id });
        }

        if (cancelled) return;
        setIllusPass({ done: false, step: 'story' });
        const { data: pages } = await supabase
          .from('story_pages').select('id').eq('unit_id', unitId).order('page_number');
        for (const pg of pages || []) {
          if (!cancelled) await invoke({ action: 'generate-illustrations', surface: 'story_page', unitId, pageId: (pg as any).id });
        }
      } catch (err: any) {
        log.warn('illustration_pass_error', { error: err?.message });
      } finally {
        if (!cancelled) setIllusPass({ done: true });
      }
    })();
    return () => { cancelled = true; };
  }, [enriched, unitId, illusPass.done]);
```

Add `useState` to the hook's React import if not present. Expose `illusPass` from the hook's return object (optional UI progress display; consumers that don't use it are unaffected).

- [ ] **Step 2: Lint + tests**

Run: `npm run lint && npx vitest run`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/useEnrichment.ts
git commit -m "feat(illustration): enrichment orchestrator drives cover/portrait/story pass"
```

---

### Task 9: Frontend — unit covers

**Files:**
- Modify: `apps/teacher/UnitPreviewModal.tsx` (header img, ~line 60)
- Modify: `apps/teacher/UnitList.tsx` (kebab menu, ~line 505)
- Modify: `apps/student/HomeMap.tsx` (unit header)

**Interfaces:**
- Consumes: `unit.coverImage` (already mapped from `units.cover_image` by `SupabaseService.ts:93`); Task 4 `generate-illustrations cover`.

- [ ] **Step 1: UnitPreviewModal — use the stored cover**

Replace the header `img` src:

```tsx
src={(unit.coverImage && !unit.coverImage.includes('dicebear')) ? unit.coverImage : `https://api.dicebear.com/7.x/shapes/svg?seed=${unit.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
```

- [ ] **Step 2: UnitList — "Regenerate cover" kebab item**

Inside the kebab menu (after the "Rebuild from pages" button, ~line 511), add:

```tsx
<button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); regenerateCover(unit); }}
  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
  <ImageIcon size={14} /> Regenerate cover
</button>
```

And the handler (next to `handleReorder`):

```tsx
const regenerateCover = async (unit: any) => {
  try {
    const { error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'generate-illustrations', surface: 'cover', unitId: unit.id, regenerate: true },
    });
    if (error) throw error;
    toast.success('Cover regenerated');
    await loadUnits();
  } catch (err: any) { toast.error(`Cover failed: ${err?.message || err}`); }
};
```

Import `Image as ImageIcon` from `lucide-react` and the `supabase` client per the file's existing import pattern (check the top of `UnitList.tsx` for the client import; if absent, `import { supabase } from '../../services/supabaseClient';`).

- [ ] **Step 3: HomeMap — unit cover in the path header**

Locate the unit header block (grep `unit.title` in `apps/student/HomeMap.tsx` — the header above the stage nodes). Above the title, render:

```tsx
{unit.coverImage && !unit.coverImage.includes('dicebear') && (
  <img src={unit.coverImage} alt={unit.title} className="w-full h-36 object-cover rounded-2xl shadow-md mb-4" />
)}
```

- [ ] **Step 4: Lint + commit**

```bash
npm run lint && npx vitest run
git add apps/teacher/UnitPreviewModal.tsx apps/teacher/UnitList.tsx apps/student/HomeMap.tsx
git commit -m "feat(illustration): real unit covers in preview, library regenerate, student map"
```

---

### Task 10: Frontend — story scene fixes

**Files:**
- Modify: `apps/board/templates/BoardStorySequencing.tsx` (~line 584, ~line 610)
- Modify: `apps/student/DubbingStudio.tsx` (~line 324)

**Interfaces:**
- Consumes: `story_pages.image_url` already resolved by `get_unit_bundle` → `services/manifest.ts getStory()` → `p.image`. `BoardStoryStage` (`current.imageUrl`) and `ReadingReader` (`page.image`) already render it — no changes needed there once data flows.

- [ ] **Step 1: BoardStorySequencing — gate the images**

In the slot card (~line 584):

```tsx
{slot.image ? (
  <img src={slot.image} className="w-full h-40 object-cover rounded-xl mb-3" />
) : (
  <div className="w-full h-40 rounded-xl mb-3 bg-purple-50 flex items-center justify-center text-3xl">📖</div>
)}
```

In the source card (~line 610):

```tsx
<div className="h-24 overflow-hidden rounded-lg mb-2 relative">
  {card.image
    ? <img src={card.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
    : <div className="w-full h-full bg-purple-50 flex items-center justify-center text-2xl">📖</div>}
</div>
```

- [ ] **Step 2: DubbingStudio — guard the empty scene image**

(~line 324):

```tsx
{sceneImage ? (
  <img src={sceneImage} alt="Comic Scene" className="w-full h-full object-cover opacity-60" />
) : (
  <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900" />
)}
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint && npx vitest run
git add apps/board/templates/BoardStorySequencing.tsx apps/student/DubbingStudio.tsx
git commit -m "fix(illustration): gate broken story imgs (sequencing + dubbing studio)"
```

---

### Task 11: Frontend — character portraits everywhere

**Files:**
- Modify: `services/CharacterService.ts` (`listForBook`, add `attachPortraitUrls`)
- Modify: `apps/teacher/UnitContentVault.tsx` (~line 873, character list img)
- Modify: `apps/teacher/CharacterPickerModal.tsx` (~line 108, `portrait()`)
- Modify: `apps/board/templates/BoardStoryStage.tsx` (~lines 405–408, 436–438 avatars)
- Modify: `apps/student/SoloLessonPlayer.tsx` (~line 300, speaker avatar)

**Interfaces:**
- Consumes: `characters.reference_image_asset_id` + `assets.public_url` (resolved client-side by `attachPortraitUrls`); bundle `characters[].image_url` from Task 1's RPC.
- Produces: `Character.image_url` populated on every list fetch.

- [ ] **Step 1: CharacterService — resolve portrait URLs**

Add to `CharacterService`:

```ts
    /** Resolve reference_image_asset_id → assets.public_url for a set of characters. */
    async attachPortraitUrls(chars: Character[]): Promise<Character[]> {
        const ids = chars.map(c => c.reference_image_asset_id).filter((v): v is string => Boolean(v));
        if (ids.length === 0) return chars;
        const { data: assets } = await supabase.from('assets').select('id, public_url').in('id', ids);
        const byId = new Map((assets || []).map(a => [a.id, a.public_url] as [string, string]));
        return chars.map(c => ({ ...c, image_url: c.reference_image_asset_id ? (byId.get(c.reference_image_asset_id) || null) : null }));
    },
```

And in `listForBook`, before returning: `return this.attachPortraitUrls((data || []) as Character[]);` (keep the `throw` on error). If `listForUnit` exists, apply the same wrapping.

- [ ] **Step 2: Vault character list img (~line 873)**

```tsx
<img src={c.image_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`} alt={c.name} className="w-9 h-9 rounded-full bg-slate-100 flex-shrink-0" />
```

- [ ] **Step 3: CharacterPickerModal `portrait()` (~line 108)**

```ts
    const portrait = (c: Character) =>
        c.image_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
```

- [ ] **Step 4: BoardStoryStage avatars (two sites)**

In both the title-card cast row (~line 405) and the page speaker avatar (~line 436), render the portrait when the character has one:

```tsx
{c.imageUrl || c.image_url ? (
  <img src={c.imageUrl || c.image_url} alt={c.name} className="w-16 h-16 rounded-full object-cover" />
) : (
  <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
    style={{ border: `3px solid ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}`, background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20` }}>
    {c.emoji || c.name?.charAt(0) || '👤'}
  </div>
)}
```

(the speaker-avatar site is 16×16 scaled — use `w-16 h-16` there too, matching its current size). Data path: the board's `data.characters` is frozen plan data; ALSO resolve live characters by adding to the component's memo area:

```tsx
const liveChars = useMemo(() => getCharacters ? (getCharacters(state.activeUnit?.manifest) || []) : [], [state.activeUnit?.manifest]);
const charByName = useMemo(() => new Map(liveChars.map((c: any) => [String(c.name).toLowerCase(), c])), [liveChars]);
```

and resolve lookups `charByName.get(name)?.image_url` before falling back to `c.imageUrl`. If `getCharacters` is not exported by `services/manifest.ts`, grep for the manifest characters getter and use it; if none exists, skip this addition — frozen plans gain portraits as they're re-published.

- [ ] **Step 5: SoloLessonPlayer speaker avatar (~line 300)**

```tsx
{page.speaker && (
  <div className="flex items-center gap-2 mb-4">
    {page.portrait ? (
      <img src={page.portrait} alt={page.speaker} className="w-9 h-9 rounded-full object-cover" />
    ) : (
      <div className="w-9 h-9 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-700">
        {page.avatar || page.speaker.charAt(0)}
      </div>
    )}
    <span className="font-bold text-amber-700">{page.speaker}</span>
  </div>
)}
```

If the page-type doesn't carry `portrait`, extend the story-page mapping where pages are built (grep `avatar:` in `SoloLessonPlayer.tsx`) to add `portrait: charByName?.get(String(page.speaker||'').toLowerCase())?.image_url` when characters are available; if the player has no characters context, leave the fallback circle (portrait arrives with the story data refresh) — note which path was taken in the commit message.

- [ ] **Step 6: Lint + commit**

```bash
npm run lint && npx vitest run
git add services/CharacterService.ts apps/teacher/UnitContentVault.tsx apps/teacher/CharacterPickerModal.tsx apps/board/templates/BoardStoryStage.tsx apps/student/SoloLessonPlayer.tsx
git commit -m "feat(illustration): character portraits rendered (vault, picker, board avatars, solo player)"
```

---

### Task 12: Backfill script + run

**Files:**
- Create: `scripts/testing/illustration-backfill.ts`

**Interfaces:**
- Consumes: Task 2/3 core directly (Node import — pure module), REST with `SUPABASE_SERVICE_ROLE_KEY`, OpenRouter with `AI_API_KEY`.
- Produces: regenerated covers/vocab/portraits/story scenes for existing units. Idempotent.

- [ ] **Step 1: Write the script**

```ts
// scripts/testing/illustration-backfill.ts
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY, IMAGE_GEN_MODEL (optional)
// Flags: [--unit <id>] [--surface vocab|cover|portrait|story] [--limit N] [--yes]
// Default is DRY-RUN: prints the plan + estimated cost. --yes executes.
import {
  Surface, composePrompt, aspectRatioFor, callOpenRouterImages,
  uploadImageToStorage, findAssetByHash, insertAssetRow, promptHashFor, UnitArtContext,
} from '../../supabase/functions/_shared/illustrationCore';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KEY = process.env.AI_API_KEY!;
const MODEL = process.env.IMAGE_GEN_MODEL || 'bytedance-seed/seedream-4.5';
const COST = 0.04;

if (!SUPABASE_URL || !SERVICE_KEY || !KEY) { console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY required'); process.exit(1); }

const rest = { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY };
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = !args.includes('--yes');
const onlyUnit = flag('--unit');
const onlySurface = flag('--surface');
const limit = Number(flag('--limit') || 0);

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as T;
}

const isBad = (url: string | null | undefined) => !url || /pollinations\.ai|dicebear\.com/i.test(url);

interface Job { surface: Surface; unitId: string; id: string; content: string; ctx: UnitArtContext; refs?: string[] }

async function plan(): Promise<Job[]> {
  const jobs: Job[] = [];
  const units: any[] = await api(`/rest/v1/units?select=id,title,topic,art_direction,cover_image,deleted_at&order=created_at&limit=500`);
  const live = units.filter(u => !u.deleted_at && (!onlyUnit || u.id === onlyUnit));
  for (const u of live) {
    const ctx: UnitArtContext = { title: u.title, topic: u.topic, artDirection: u.art_direction };
    if ((!onlySurface || onlySurface === 'cover') && isBad(u.cover_image)) {
      jobs.push({ surface: 'cover', unitId: u.id, id: u.id, content: `cover illustration for the unit "${u.title}" about ${u.topic || u.title}`, ctx });
    }
  }
  // vocab (only if the unit was selected or no unit filter and no surface filter)
  if (!onlySurface || onlySurface === 'vocab') {
    const q = onlyUnit ? `/rest/v1/vocabulary_items?select=id,unit_id,word,image_prompt,image_url&unit_id=eq.${onlyUnit}&limit=2000`
                       : `/rest/v1/vocabulary_items?select=id,unit_id,word,image_prompt,image_url&limit=2000`;
    const items: any[] = await api(q);
    const unitById = new Map(live.map(u => [u.id, u]));
    for (const v of items) {
      const u = unitById.get(v.unit_id); if (!u) continue;
      if (isBad(v.image_url)) {
        const ctx = { title: u.title, topic: u.topic, artDirection: u.art_direction };
        jobs.push({ surface: 'vocab', unitId: u.id, id: v.id, content: v.image_prompt || `illustration of ${v.word}`, ctx });
      }
    }
  }
  // portraits (needs unit join)
  if (!onlySurface || onlySurface === 'portrait') {
    const rows: any[] = await api('/rest/v1/unit_characters?select=unit_id,characters(id,name,look_prompt,reference_image_asset_id)&limit=2000');
    const unitById = new Map(live.map(u => [u.id, u]));
    const seen = new Set<string>();
    for (const r of rows) {
      const u = unitById.get(r.unit_id); const ch = r.characters;
      if (!u || !ch || seen.has(ch.id) || ch.reference_image_asset_id) continue;
      seen.add(ch.id);
      jobs.push({ surface: 'portrait', unitId: u.id, id: ch.id, content: `character portrait of ${ch.name}: ${ch.look_prompt || `a friendly child character named ${ch.name}`}`, ctx: { title: u.title, topic: u.topic, artDirection: u.art_direction } });
    }
  }
  // story scenes (after portraits in ordering)
  if (!onlySurface || onlySurface === 'story') {
    const q = onlyUnit ? `/rest/v1/story_pages?select=id,unit_id,page_number,text,speaker,image_prompt,image_asset_id&unit_id=eq.${onlyUnit}&order=page_number&limit=2000`
                       : `/rest/v1/story_pages?select=id,unit_id,page_number,text,speaker,image_prompt,image_asset_id&order=page_number&limit=2000`;
    const pages: any[] = await api(q);
    const unitById = new Map(live.map(u => [u.id, u]));
    for (const p of pages) {
      const u = unitById.get(p.unit_id); if (!u || p.image_asset_id) continue;
      jobs.push({ surface: 'story_scene', unitId: u.id, id: p.id, content: p.image_prompt || `scene: ${String(p.text || '').slice(0, 300)}`, ctx: { title: u.title, topic: u.topic, artDirection: u.art_direction } });
    }
  }
  // NOTE: story_scene refs (portraits) are omitted in the backfill v1 — the
  // model still follows the prompt's named characters; ref-based scenes come
  // from the orchestrator/regenerate buttons going forward. Rationale: the
  // backfill spans thousands of units; refs would add N asset lookups per page.
  return limit ? jobs.slice(0, limit) : jobs;
}

async function runJob(j: Job): Promise<string> {
  const prompt = composePrompt(j.surface, j.ctx, j.content);
  const hash = await promptHashFor(MODEL, prompt, []);
  const cached = await findAssetByHash(rest, hash);
  if (cached) {
    // Dedup hit: still write the target row (cover/vocab/portrait/page) —
    // the asset may exist from another flow while this row was never patched.
    if (j.surface === 'cover') await api(`/rest/v1/units?id=eq.${j.unitId}`, { method: 'PATCH', body: JSON.stringify({ cover_image: cached.public_url }) });
    if (j.surface === 'vocab') await api(`/rest/v1/vocabulary_items?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_url: cached.public_url }) });
    if (j.surface === 'portrait') await api(`/rest/v1/characters?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ reference_image_asset_id: cached.id }) });
    if (j.surface === 'story_scene') await api(`/rest/v1/story_pages?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_asset_id: cached.id }) });
    return 'cached';
  }
  const gen = await callOpenRouterImages({ openrouterKey: KEY }, { model: MODEL, prompt, aspectRatio: aspectRatioFor(j.surface) });
  if (!gen.ok) return `FAILED: ${gen.error.slice(0, 120)}`;
  const bytes = Uint8Array.from(atob(gen.b64), (c) => c.charCodeAt(0));
  const url = await uploadImageToStorage(rest, j.unitId, bytes, gen.mediaType);
  if (!url) return 'FAILED: upload';
  const { id: assetId } = await insertAssetRow(rest, { unit_id: j.unitId, prompt, prompt_hash: hash, model: gen.model, storage_path: `images/${j.unitId}`, public_url: url });
  if (!assetId) return 'generated (asset conflict)';
  if (j.surface === 'cover') await api(`/rest/v1/units?id=eq.${j.unitId}`, { method: 'PATCH', body: JSON.stringify({ cover_image: url }) });
  if (j.surface === 'vocab') await api(`/rest/v1/vocabulary_items?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_url: url }) });
  if (j.surface === 'portrait') await api(`/rest/v1/characters?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ reference_image_asset_id: assetId }) });
  if (j.surface === 'story_scene') await api(`/rest/v1/story_pages?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_asset_id: assetId }) });
  return 'generated';
}

async function main() {
  const jobs = await plan();
  console.log(`\n${jobs.length} jobs. Surfaces: ${JSON.stringify(jobs.reduce((m, j) => ({ ...m, [j.surface]: (m as any)[j.surface as keyof typeof m] ? (m as any)[j.surface] + 1 : 1 }), {}))}`);
  console.log(`Estimated cost: $${(jobs.length * COST).toFixed(2)} (at $${COST}/image, model ${MODEL})`);
  if (dryRun) { console.log('DRY RUN — re-run with --yes to execute.'); return; }
  let done = 0, failed = 0;
  for (const j of jobs) {
    const r = await runJob(j);
    if (r.startsWith('FAILED')) failed++;
    if (++done % 10 === 0 || r.startsWith('FAILED')) console.log(`[${done}/${jobs.length}] ${j.surface} ${j.id}: ${r}`);
  }
  console.log(`Done. ${done - failed} ok, ${failed} failed.`);
}
main();
```

- [ ] **Step 2: Dry-run**

```bash
SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co SUPABASE_SERVICE_ROLE_KEY=<owner pastes> AI_API_KEY=<owner pastes> npx tsx scripts/testing/illustration-backfill.ts --limit 30
```
Review the printed job counts and cost against the spec's ≤ ~$10 backfill estimate.

- [ ] **Step 3: Production run (staged)**

Run per-surface in stages: `--surface cover --yes`, then `--surface portrait --yes`, then `--surface vocab --yes`, then `--surface story --yes`. Spot-check after each: teacher library covers, vault portraits/vocab, one student reader.

- [ ] **Step 4: Commit**

```bash
git add scripts/testing/illustration-backfill.ts
git commit -m "feat(illustration): idempotent backfill script (cover/vocab/portrait/story)"
```

---

### Task 13: Vault — regenerate buttons for story pages + portraits

**Files:**
- Modify: `apps/teacher/UnitContentVault.tsx` (story tab ~line 685; characters ~line 884)

**Interfaces:**
- Consumes: Task 4 actions. `unitId` prop already in scope; `storyImgPickerFor` pattern at line ~685; `setCharPortraitFor` at ~884.

- [ ] **Step 1: Story page "AI Generate" button**

Next to the Image input's library-pick button (~line 685), add:

```tsx
<button onClick={() => generateStoryImage(i)} disabled={!!genBusy}
  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
  title="Generate illustration from this page's image prompt">
  ✨ AI
</button>
```

With the handler + state:

```tsx
const [genBusy, setGenBusy] = useState(false);
const generateStoryImage = async (pageIndex: number) => {
  // story pages come from the manifest view; resolve the relational row id
  const { data: pages } = await supabase.from('story_pages').select('id').eq('unit_id', unitId).order('page_number');
  const row = pages?.[pageIndex];
  if (!row) { toast.error('Story page not found in DB yet (save first)'); return; }
  setGenBusy(true);
  try {
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'generate-illustrations', surface: 'story_page', unitId, pageId: row.id, regenerate: true },
    });
    if (error) throw error;
    if (data?.url) { updateStoryPage(pageIndex, 'imageUrl', data.url); toast.success('Scene generated'); }
    else toast.error(data?.error || 'Generation failed');
  } finally { setGenBusy(false); }
};
```

(`updateStoryPage` and the `supabase` import follow the file's existing patterns — verify both names with grep before use.)

- [ ] **Step 2: Character "Generate portrait" button**

Next to the existing portrait-pick button (~line 884):

```tsx
<button onClick={() => generatePortrait(c.id)} className="text-indigo-500 hover:text-indigo-700 p-1 rounded" title="Generate portrait from look prompt">
  <Wand2 size={14} />
</button>
```

```tsx
const generatePortrait = async (characterId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'generate-illustrations', surface: 'portrait', unitId, characterId, regenerate: true },
    });
    if (error) throw error;
    if (data?.url) toast.success('Portrait generated');
    else toast.error(data?.error || 'Generation failed');
  } catch (err: any) { toast.error(err?.message || 'Generation failed'); }
};
```

Import `Wand2` from `lucide-react`.

- [ ] **Step 3: Lint + commit**

```bash
npm run lint && npx vitest run
git add apps/teacher/UnitContentVault.tsx
git commit -m "feat(illustration): vault AI-generate buttons for story scenes + portraits"
```

---

### Task 14: Verification sweep + docs

**Files:**
- Modify: `AGENTS.md` (§6 secret manifest)

**Interfaces:** none — final gate.

- [ ] **Step 1: Full local gates**

```bash
npm run lint && npx vitest run
```
Expected: clean.

- [ ] **Step 2: Deploy probes (AGENTS.md §8)**

```bash
for f in generate-media enrich-unit; do
  curl -s -o /dev/null -w "$f %{http_code}\n" -X POST "https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/$f" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'
done
```
Expected: `401` each.

- [ ] **Step 3: Data verification**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select (select count(*) from assets where type='\''image'\'' and model is not null) as v2_images, (select count(*) from units where cover_image like '\''%supabase.co/storage%'\'' and deleted_at is null) as real_covers, (select count(*) from story_pages where image_asset_id is not null) as illustrated_pages, (select count(*) from characters where reference_image_asset_id is not null) as portrait_chars, (select count(*) from vocabulary_items where image_url like '\''%supabase.co/storage%'\'' or (image_url is not null and image_url not like '\''%pollinations%'\'' and image_url not like '\''%dicebear%'\'')) as real_vocab;"}'
```
Expected: all counts > 0 after backfill; new image assets have `model` set and `storage_path` ≠ `'external'`.

- [ ] **Step 4: Manual smoke checklist** (owner, ~10 min)
  - Teacher library: real covers on unit cards + preview modal
  - Vault: vocab image regenerate; story page ✨ AI; character Wand2 portrait
  - Board: unit selection covers; Story Stage scene images + portrait avatars; Sequencing no broken imgs
  - Student: ReadingReader illustrations (not prompt text); HomeMap unit cover; SoloLessonPlayer portrait avatars

- [ ] **Step 5: AGENTS.md §6 update + final commit**

Add under "Edge functions — Supabase → Project Settings → Edge Functions → Secrets:":

```
- `IMAGE_PROVIDER` (`openrouter`), `IMAGE_GEN_MODEL` (bake-off winner, e.g. `bytedance-seed/seedream-4.5`), `IMAGE_GEN_FALLBACK_MODEL` — Illustration v2 (spec 2026-08-28; models must be region-safe, never google/openai/anthropic)
```

```bash
git add AGENTS.md
git commit -m "docs(AGENTS): illustration v2 secrets in the manifest"
```

---

## Spec deviations (documented deliberately)

1. **"Automatic unit pass edge-side"** → a full pass (~15–18 images × 10–20s) exceeds the ~150s edge-function wall clock. Decomposed into bounded per-surface edge actions; sequencing lives in the frontend orchestrator (existing pattern) and the idempotent backfill script guarantees browser-independent completion.
2. **Backfill story scenes omit reference portraits** in v1 (scale: thousands of pages, refs add per-page asset lookups). Ref-based consistency applies to new units via the orchestrator and to manual regeneration.
3. **`ensureArtDirection` lives in the cover action** (not enrich-unit) so old units get art direction during backfill with zero enrich-unit coupling.
4. **Per-unit attempt cap (spec §4)** — no retry loop exists to cap in this architecture: the orchestrator pass is single-shot (`illusPass.done` latch), every server step is a single bounded image call, and the backfill is `--limit`-able and idempotent. The cap is satisfied structurally rather than as a counter.
