// Avatar system v2 — server-side composite + art generation (edge).
// Spec: docs/superpowers/specs/2026-09-03-avatar-system-v2-design.md
//
// composeAvatar(userId): reads profiles.avatar_config (single source of
// truth), flattens the layer stack into ONE multi-res PNG set, caches by
// config hash in avatar_renders, and writes profiles.avatar_url. Every
// downstream <img> consumer then "just works" — the invariant that fixed
// the broken-JSON bug.
//
// generateAvatarArt(): staff-only pipeline action that generates master /
// item candidate art via OpenRouter (owner lifted the geo-lock 2026-09-04;
// nano-banana-class models preferred for i2i consistency, seedream/flux
// fallbacks, resolved against the live /models list).
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { callOpenRouterImages } from './illustrationCore.ts';
import { serviceRoleKey } from './serviceKey.ts';

const BODIES = ['human_boy', 'human_girl', 'robot', 'robot_bender', 'alien', 'monster'] as const;
const SLOTS = ['hair', 'eyes', 'outfit', 'headwear', 'face', 'handheld', 'back', 'background'] as const;
const HUMAN_ONLY = new Set(['hair', 'eyes', 'outfit']);
// Composite order; 'body' is the base render.
const RENDER_ORDER = ['background', 'back', 'body', 'outfit', 'eyes', 'face', 'hair', 'headwear', 'handheld'];
const SIZES = [768, 512, 256, 128];
const CANVAS = 1024;

type Body = (typeof BODIES)[number];
type Slot = (typeof SLOTS)[number];

interface NormalizedConfig {
  body: Body;
  skin: number;
  items: Partial<Record<Slot, string | null>>;
}

function isHuman(b: Body): boolean {
  return b === 'human_boy' || b === 'human_girl';
}

/** Mirrors services/avatarCore.ts normalizeConfig — keep in sync. */
function normalizeConfig(raw: unknown): NormalizedConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const body = (BODIES as readonly string[]).includes(obj?.body) ? (obj.body as Body) : 'human_boy';
  const skin = Number.isFinite(Number(obj?.skin)) ? Math.min(Math.max(Math.round(Number(obj.skin)), 1), 6) : 1;
  const items: NormalizedConfig['items'] = {};
  const rawItems = (obj?.items && typeof obj.items === 'object' ? obj.items : {}) as Record<string, unknown>;
  for (const slot of SLOTS) {
    items[slot] = typeof rawItems[slot] === 'string' && rawItems[slot] ? rawItems[slot] : null;
  }
  return { body, skin, items };
}

async function sha256Hex16(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function rest(path: string, init: RequestInit = {}): Promise<any> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceRoleKey();
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`rest ${path} ${r.status}: ${t.slice(0, 200)}`);
    }
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  });
}

function publicUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/generated-media/${path}`;
}

async function uploadBytes(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const resp = await fetch(`${url}/storage/v1/object/generated-media/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`storage upload ${path} ${resp.status}: ${t.slice(0, 200)}`);
  }
  return publicUrl(path);
}

async function fetchPngImage(url: string): Promise<Image | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    return await Image.decode(new Uint8Array(await resp.arrayBuffer()));
  } catch {
    return null;
  }
}

interface ShopItemLite {
  id: string;
  slot: string | null;
  kind: string;
  active: boolean;
  compatible_bodies: string[] | null;
  layer_asset_path: string | null;
}

export async function composeAvatar(userId: string): Promise<{ ok: boolean; url?: string; cached?: boolean; error?: string }> {
  if (!userId) return { ok: false, error: 'not_authenticated' };

  // 1) Source of truth: the profile row (NOT a client-supplied config).
  const profiles = await rest(`/rest/v1/profiles?id=eq.${userId}&select=avatar_config,avatar_url`);
  if (!profiles || profiles.length === 0) return { ok: false, error: 'profile_not_found' };
  const config = normalizeConfig(profiles[0].avatar_config);

  // 2) Deterministic cache key (canonical: sorted "slot:id" pairs). ART_VERSION
  //    invalidates render caches when the underlying layer art is regenerated
  //    (the config alone can't see art changes). Bump on wholesale art refresh.
  const itemParts = SLOTS.filter((s) => config.items[s]).map((s) => `${s}:${config.items[s]}`).sort();
  const canonical = JSON.stringify({ version: 1, art: 9, body: config.body, skin: config.skin, items: itemParts });
  const hash = await sha256Hex16(canonical);

  const basePath = `avatars/renders/${userId}/${hash}`;
  const canonicalUrl = `${publicUrl(basePath)}/512.png`;

  const existing = await rest(
    `/rest/v1/avatar_renders?profile_id=eq.${userId}&config_hash=eq.${hash}&variant=eq.idle&select=id`,
  ).catch(() => null);
  if (existing && existing.length > 0) {
    if (profiles[0].avatar_url !== canonicalUrl) {
      await rest(`/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: canonicalUrl }),
      }).catch(() => null);
    }
    return { ok: true, url: canonicalUrl, cached: true };
  }

  // 3) Resolve layers: item metadata first (compat enforced again here — the
  //    RPCs already guarantee it, but a stale config must not break renders).
  const itemIds = itemParts.map((p) => p.split(':')[1]);
  const itemRows: ShopItemLite[] = itemIds.length
    ? await rest(
        `/rest/v1/shop_items?id=in.(${itemIds.map((i) => `"${i}"`).join(',')})` +
          `&select=id,slot,kind,active,compatible_bodies,layer_asset_path`,
      ).catch(() => [])
    : [];
  const byId = new Map(itemRows.map((r) => [r.id, r]));

  const layers: { order: number; url: string; fallbackUrl?: string }[] = [];
  for (const slot of SLOTS) {
    const id = config.items[slot];
    if (!id) continue;
    const item = byId.get(id);
    if (!item || item.kind !== 'item' || item.active === false || !item.slot) continue;
    if (HUMAN_ONLY.has(item.slot as Slot) && !isHuman(config.body)) continue;
    if (item.compatible_bodies && item.compatible_bodies.length > 0 && !item.compatible_bodies.includes(config.body)) continue;
    if (!item.layer_asset_path) continue;
    // Per-body variant first (ChatGPT audit), default layer as fallback.
    const bodyPath = `avatars/layers/${config.body}/${id}.png`;
    layers.push({ order: RENDER_ORDER.indexOf(item.slot), url: publicUrl(bodyPath), fallbackUrl: publicUrl(item.layer_asset_path) });
  }
  const bgLayer = layers.find((l) => l.order === RENDER_ORDER.indexOf('background'));

  const skin = isHuman(config.body) ? config.skin : 1;
  let baseImg = await fetchPngImage(publicUrl(`avatars/bases/${config.body}_skin${skin}.png`));
  if (!baseImg) baseImg = await fetchPngImage(publicUrl(`avatars/bases/${config.body}_skin1.png`));
  if (!baseImg) return { ok: false, error: 'base_art_missing' };

  // 4) Flatten in strict RENDER_ORDER: background → back items → BODY →
  //    front items. A missing layer is skipped, never fatal.
  const bodyOrder = RENDER_ORDER.indexOf('body');
  const itemLayers = layers
    .filter((l) => l.order !== RENDER_ORDER.indexOf('background'))
    .sort((a, b) => a.order - b.order);
  const backLayers = itemLayers.filter((l) => l.order < bodyOrder);
  const frontLayers = itemLayers.filter((l) => l.order > bodyOrder);

  let out: Image;
  if (bgLayer) {
    const bg = await fetchPngImage(bgLayer.url);
    out = bg
      ? bg.clone()
      : new Image(CANVAS, CANVAS, [255, 255, 255, 255] as unknown as number);
  } else {
    out = new Image(CANVAS, CANVAS, [255, 255, 255, 255] as unknown as number);
  }

  for (const l of [...backLayers, ...frontLayers]) {
    if (l.order === RENDER_ORDER.indexOf('background')) continue;
    let img = await fetchPngImage(l.url);
    if (!img && l.fallbackUrl) img = await fetchPngImage(l.fallbackUrl);
    if (img) out.composite(img, 0, 0);
  }

  // 5) Multi-res encode + upload + cache row + avatar_url writeback.
  for (const size of SIZES) {
    const resized = out.clone().resize(size, size);
    const bytes = await resized.encode();
    await uploadBytes(`${basePath}/${size}.png`, bytes, 'image/png');
  }

  await rest('/rest/v1/avatar_renders?on_conflict=profile_id,config_hash,variant', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      profile_id: userId,
      config_hash: hash,
      variant: 'idle',
      base_path: basePath,
      sizes: SIZES,
    }),
  }).catch(() => null);

  await rest(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ avatar_url: canonicalUrl }),
  });

  return { ok: true, url: canonicalUrl, cached: false };
}

// ---------------------------------------------------------------------
// Art generation (pipeline) — staff only. Generates a base master or an
// item candidate via OpenRouter images (optionally i2i against masters).
// ---------------------------------------------------------------------

let resolvedArtModel: string | null = null;

async function resolveArtModel(): Promise<string> {
  const envModel = Deno.env.get('AVATAR_ART_MODEL');
  if (envModel) return envModel;
  if (resolvedArtModel) return resolvedArtModel;
  const key = Deno.env.get('AI_API_KEY') || '';
  // Owner decision 2026-09-04: geo-lock lifted. Prefer nano-banana-class
  // models for character consistency; seedream/flux as fallbacks.
  // 2026-09-04 finding: the OpenRouter account is RESTRICTED from
  // closed-weight providers (Google/OpenAI/Anthropic — dashboard banner),
  // AND OpenRouter's image catalog now contains ONLY Google/OpenAI image
  // models (seedream/flux image models were delisted after 2026-08-28).
  // → image generation via OpenRouter is impossible until the account
  //   appeal lands. Operating mode: AVATAR_ART_MODEL=pollinations (secret)
  //   skips OpenRouter entirely. After the appeal: unset that secret and
  //   gemini (nano-banana) resolves first.
  const candidates = [
    'google/gemini-3-pro-image-preview',
    'google/gemini-2.5-flash-image',
    'google/gemini-2.5-flash-image-preview',
    'bytedance-seed/seedream-4.5',
  ];
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok) {
      const data: any = await resp.json();
      const ids = new Set<string>((data?.data || []).map((m: any) => m.id));
      for (const c of candidates) {
        if (ids.has(c)) {
          resolvedArtModel = c;
          return c;
        }
      }
    }
  } catch { /* fall through to known-good default */ }
  resolvedArtModel = 'bytedance-seed/seedream-4.5';
  return resolvedArtModel;
}

/**
 * Fallback: the SAME models via /chat/completions (the wire the legacy
 * illustration provider used). Some OpenRouter accounts are blocked on the
 * /images endpoint (ToS 403 for every prompt — seen 2026-09-04) while chat
 * multimodal output still works. Gemini image models return
 * choices[0].message.images[].image_url.url (data: URL).
 */
async function chatImageFallback(
  prompt: string,
  references?: string[],
): Promise<{ ok: true; b64: string; mediaType: string; model: string } | { ok: false; model: string; error: string }> {
  const key = Deno.env.get('AI_API_KEY') || '';
  const model = await resolveArtModel();
  const content: unknown[] = [{ type: 'text', text: prompt }];
  for (const url of references || []) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  let resp: Response;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(110000),
    });
  } catch (err: any) {
    return { ok: false, model, error: `chat fetch failed: ${err?.name || ''} ${err?.message || ''}`.trim() };
  }
  const raw = await resp.text();
  if (!resp.ok) return { ok: false, model, error: `chat ${resp.status}: ${raw.slice(0, 200)}` };
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* handled below */ }

  const pick = (url: string): { ok: true; b64: string; mediaType: string; model: string } | null => {
    const m = url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) return { ok: true, b64: m[2], mediaType: `image/${m[1]}`, model };
    return null;
  };
  // Envelope 1: OpenRouter native multimodal output.
  const imgs = data?.choices?.[0]?.message?.images || [];
  for (const im of imgs) {
    const url = im?.image_url?.url || (typeof im === 'string' ? im : null);
    if (url) { const r = pick(url); if (r) return r; }
  }
  // Envelope 2: bare b64 fields.
  for (const k2 of ['b64_json', 'image_base64']) {
    const v = data?.choices?.[0]?.message?.[k2] || data?.[k2];
    if (typeof v === 'string' && v.length > 100) return { ok: true, b64: v, mediaType: 'image/png', model };
  }
  // Envelope 3: data URL embedded in the text content.
  const contentText = String(data?.choices?.[0]?.message?.content || '');
  const dm = contentText.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
  if (dm) { const r = pick(dm[0]); if (r) return r; }
  return { ok: false, model, error: `chat returned no image: ${contentText.slice(0, 160) || raw.slice(0, 160)}` };
}

async function finalizeWithNote(
  params: { kind: string; id: string; outPath?: string },
  b64: string,
  mediaType: string,
  usedModel: string,
  note: string,
): Promise<{ ok: boolean; url?: string; model?: string; note?: string; error?: string }> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const outPath = params.outPath || `avatars/artifacts/${params.kind}/${params.id}/${Date.now()}.png`;
  const url = await uploadBytes(outPath, bytes, mediaType || 'image/png');
  return { ok: true, url, model: usedModel, note };
}

export async function generateAvatarArt(params: {
  kind: 'base' | 'item' | 'default' | 'misc';
  id: string;
  prompt: string;
  references?: string[];
  outPath?: string;
  aspectRatio?: string;
  seed?: number;
}): Promise<{ ok: boolean; url?: string; model?: string; error?: string }> {
  const openrouterKey = Deno.env.get('AI_API_KEY') || '';
  if (!openrouterKey) return { ok: false, error: 'AI_API_KEY not configured' };
  if (!params.prompt || !params.id) return { ok: false, error: 'prompt and id required' };

  // Operating-mode shortcut (see resolveArtModel note): while the OpenRouter
  // account is restricted from all current image models, go straight to the
  // keyless fallback instead of burning two 403 round-trips per asset.
  if ((Deno.env.get('AVATAR_ART_MODEL') || '').toLowerCase() === 'pollinations') {
    const direct = await pollinationsImage(params.prompt, params.references, params.seed);
    if (direct.ok) {
      return await finalizeWithNote(params, direct.b64, 'image/jpeg', `pollinations:${direct.model}`, 'pollinations operating mode (openrouter restricted)');
    }
    return { ok: false, error: `pollinations: ${(direct as { error: string }).error}` };
  }

  const model = await resolveArtModel();
  let b64 = '';
  let mediaType = 'image/png';
  let usedModel = model;
  let lastError = '';

  const result = await callOpenRouterImages(
    { openrouterKey },
    {
      model,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio || '1:1',
      inputReferences: params.references && params.references.length > 0 ? params.references : undefined,
    },
  );
  if (result.ok) {
    b64 = result.b64;
    mediaType = result.mediaType;
  } else {
    lastError = result.error;
    const fb = await chatImageFallback(params.prompt, params.references);
    if (fb.ok) {
      b64 = fb.b64;
      mediaType = fb.mediaType;
      usedModel = `${fb.model} (chat)`;
    } else {
      lastError = `${lastError} | chat fallback: ${fb.error}`;
      // Last resort: keyless Pollinations (Flux) — the legacy pipeline's
      // region-safe default. kontext supports i2i via &image=; flux is t2i.
      const poll = await pollinationsImage(params.prompt, params.references, params.seed);
      if (poll.ok) {
        b64 = poll.b64;
        mediaType = 'image/jpeg';
        usedModel = `pollinations:${poll.model}`;
        return await finalizeWithNote(params, b64, mediaType, usedModel, `openrouter blocked: ${lastError}`);
      } else {
        return { ok: false, error: `${lastError} | pollinations: ${poll.error}` };
      }
    }
  }

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const outPath = params.outPath || `avatars/artifacts/${params.kind}/${params.id}/${Date.now()}.png`;
  const url = await uploadBytes(outPath, bytes, mediaType || 'image/png');
  return { ok: true, url, model: usedModel };
}

/** Keyless Pollinations fallback (flux = t2i, kontext = i2i via &image=). */
async function pollinationsImage(
  prompt: string,
  references?: string[],
  seed?: number,
): Promise<{ ok: true; b64: string; model: string } | { ok: false; error: string }> {
  const useKontext = !!(references && references.length > 0);
  const model = useKontext ? 'kontext' : 'flux';
  const s = seed ?? Math.floor(Math.random() * 1_000_000);
  const qs = new URLSearchParams({
    width: '1024', height: '1024', nologo: 'true', model, seed: String(s),
  });
  if (useKontext) qs.set('image', references![0]);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1800))}?${qs}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(110000) });
    if (!resp.ok) return { ok: false, error: `pollinations ${resp.status}` };
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length < 5000) return { ok: false, error: 'pollinations returned tiny payload' };
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    return { ok: true, b64: btoa(binary), model };
  } catch (err: any) {
    return { ok: false, error: `pollinations fetch failed: ${err?.name || ''} ${err?.message || ''}`.trim() };
  }
}
