// Avatar v2 art pipeline — drives generation THROUGH the deployed edge
// (AI_API_KEY lives only in dashboard secrets), extracts item layers by
// differencing dressed renders against the clean master, validates, and
// uploads approved art to Storage. Curation happens on the local out/
// artifacts (review before --approve).
//
// Usage:
//   npx tsx scripts/avatars/art-pipeline.ts --status
//   npx tsx scripts/avatars/art-pipeline.ts --phase masters [--only human_boy]
//   npx tsx scripts/avatars/art-pipeline.ts --phase items [--only id,id] [--limit N]
//   npx tsx scripts/avatars/art-pipeline.ts --phase extract  [--only id,id]
//   npx tsx scripts/avatars/art-pipeline.ts --phase defaults
//   npx tsx scripts/avatars/art-pipeline.ts --phase placeholders
//   npx tsx scripts/avatars/art-pipeline.ts --approve id,id | --approve all
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  BASES, ITEMS, SKIN_TONES, ROSTER_DEFAULTS, ITEM_ANCHORS,
  masterPrompt, skinPrompt, itemPrompt, standaloneItemPrompt,
} from './manifest.ts';

// ---------------------------------------------------------------- config
const PROJECT_REF = 'xsdnzijketjnzhakqtit';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const OUT = path.resolve(import.meta.dirname, 'out');
const DIRS = {
  masters: path.join(OUT, 'masters'),
  raw: path.join(OUT, 'raw'),
  extracted: path.join(OUT, 'extracted'),
  previews: path.join(OUT, 'previews'),
  defaults: path.join(OUT, 'defaults'),
  placeholders: path.join(OUT, 'placeholders'),
};
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

const PIPELINE_EMAIL = 'avatar-pipeline@professor.internal';
const ENV_LOCAL = path.resolve(import.meta.dirname, '../../.env.local');

function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* no .env.local yet */ }
  return out;
}

function writeEnvLocal(key: string, value: string) {
  const env = readEnvLocal();
  env[key] = value;
  fs.writeFileSync(ENV_LOCAL, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

// ---------------------------------------------------------------- bootstrap
async function fetchServiceKeys(): Promise<string[]> {
  const pat = process.env.SUPABASE_ACCESS_TOKEN || readEnvLocal().SUPABASE_ACCESS_TOKEN;
  if (!pat) throw new Error('SUPABASE_ACCESS_TOKEN not set (env or .env.local)');
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!resp.ok) throw new Error(`api-keys ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const rows: { name: string; api_key: string }[] = await resp.json();
  // Prefer legacy JWTs for the Storage upload endpoint (AGENTS.md §6), but
  // keep new-style keys too — PostgREST accepts them.
  const svc = rows.filter((r) => r.name === 'service_role').map((r) => r.api_key);
  svc.sort((a, b) => (b.startsWith('eyJ') ? 1 : 0) - (a.startsWith('eyJ') ? 1 : 0));
  if (svc.length === 0) throw new Error('no service_role key found');
  return svc;
}

interface Ctx { serviceKeys: string[]; jwt: string }

async function restAuthed(ctx: Ctx, p: string, init: RequestInit = {}, key?: string): Promise<any> {
  const k = key || ctx.serviceKeys[0];
  const resp = await fetch(`${SUPABASE_URL}${p}`, {
    ...init,
    headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`rest ${p} ${resp.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function bootstrap(): Promise<Ctx> {
  const serviceKeys = await fetchServiceKeys();
  const env = readEnvLocal();
  let password = env.AVATAR_PIPELINE_PASSWORD;
  let userId: string | null = null;

  if (!password) {
    password = crypto.randomBytes(18).toString('base64url');
    writeEnvLocal('AVATAR_PIPELINE_PASSWORD', password);
  }

  // Sign in; create the pipeline teacher account on first run.
  const signIn = async (): Promise<string | null> => {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: serviceKeys[0], 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PIPELINE_EMAIL, password }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token || null;
  };

  let jwt = await signIn();
  if (!jwt) {
    for (const key of serviceKeys) {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: PIPELINE_EMAIL, password, email_confirm: true }),
      });
      if (resp.ok) {
        const u = await resp.json();
        userId = u.id;
        break;
      }
      const err = await resp.text();
      if (!err.includes('already')) console.log(`create user attempt: ${resp.status} ${err.slice(0, 120)}`);
    }
    // Link/ensure profile role teacher (idempotent).
    if (userId) {
      await restAuthed({ serviceKeys, jwt: '' }, '/rest/v1/profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: userId, full_name: 'Avatar Pipeline', role: 'teacher', email: PIPELINE_EMAIL }),
      }).catch((e) => console.log('profile upsert:', e.message));
    }
    jwt = await signIn();
  }
  if (!jwt) throw new Error('could not create/sign in pipeline account');
  return { serviceKeys, jwt };
}

// ---------------------------------------------------------------- edge calls
let lastCall = 0;
async function callEdge(ctx: Ctx, body: Record<string, unknown>): Promise<any> {
  const wait = Math.max(0, 1600 - (Date.now() - lastCall)); // edge limit: 40/min
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  for (let attempt = 1; attempt <= 4; attempt++) {
    lastCall = Date.now();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.jwt}`, apikey: ctx.jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      continue;
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) throw new Error(`edge ${body.action}: ${resp.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  }
  throw new Error(`edge ${body.action}: rate limited after retries`);
}

// ---------------------------------------------------------------- storage
async function upload(ctx: Ctx, storagePath: string, bytes: Buffer | Uint8Array, contentType: string): Promise<string> {
  let lastErr = '';
  for (const key of ctx.serviceKeys) {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/generated-media/${storagePath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes as any,
    });
    if (resp.ok) return `${SUPABASE_URL}/storage/v1/object/public/generated-media/${storagePath}`;
    lastErr = `${resp.status}: ${(await resp.text()).slice(0, 150)}`;
  }
  throw new Error(`upload ${storagePath} failed with all keys — ${lastErr}`);
}

async function storageExists(ctx: Ctx, storagePath: string): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/generated-media/${storagePath}`, {
    headers: { Authorization: `Bearer ${ctx.serviceKeys[0]}` },
    method: 'HEAD',
  }).catch(() => null);
  return !!resp && resp.ok;
}

async function download(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download ${url} ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

const publicUrl = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/generated-media/${p}`;

// ---------------------------------------------------------------- phases
const itemById = new Map(ITEMS.map((i) => [i.id, i]));
const baseById = new Map(BASES.map((b) => [b.id, b]));

async function phaseMasters(ctx: Ctx, only?: string[]) {
  // t2i per base with a FIXED seed per base id — humans get 6 same-seed tone
  // variants (identical prompt except the tone word) so every skin render
  // shares composition. No i2i dependency (OpenRouter account blocked
  // 2026-09-04; pollinations flux = t2i only).
  for (const base of BASES) {
    if (only && !only.includes(base.id)) continue;
    const skins = base.id.startsWith('human') ? SKIN_TONES.length : 1;
    for (let s = 1; s <= skins; s++) {
      if (fs.existsSync(path.join(DIRS.masters, `${base.id}_skin${s}.png`))) { console.log(`· ${base.id}_skin${s}: exists, skipping`); continue; }
      await genAndSave(
        ctx,
        masterPrompt(base, base.id.startsWith('human') ? SKIN_TONES[s - 1] : undefined),
        [],
        `avatars/bases/${base.id}_skin${s}.png`,
        DIRS.masters,
        `${base.id}_skin${s}`,
        idSeed(`${base.id}_skin1`), // same seed for every tone of a base
      );
    }
  }
  void skinPrompt;
}

async function phaseItems(ctx: Ctx, only?: string[], limit?: number, mode: 'standalone' | 'i2i' = 'standalone') {
  let n = 0;
  for (const item of ITEMS) {
    if (only && !only.includes(item.id)) continue;
    if (limit && n >= limit) break;
    if (mode === 'i2i' && item.slot === 'background') continue; // backgrounds stay full-canvas art
    const existing = fs.readdirSync(DIRS.raw).some((f) => f.startsWith(`${item.id}.`) || f === `${item.id}.png`);
    if (existing) { console.log(`· ${item.id}: raw exists, skipping`); continue; }
    const outPath = `avatars/artifacts/item/${item.id}/${Date.now()}.png`;
    if (mode === 'i2i') {
      // Full-character render wearing the item against the FLAT master —
      // the layer is then isolated by diffing (alignment by construction).
      const masterBody = item.onBody || 'human_boy';
      const refUrl = publicUrl(`avatars/bases/${masterBody}_skin1_ref.png`);
      await genAndSave(ctx, itemPrompt(item), [refUrl], outPath, DIRS.raw, item.id, idSeed(item.id));
    } else {
      await genAndSave(ctx, standaloneItemPrompt(item), [], outPath, DIRS.raw, item.id, idSeed(item.id));
    }
    n++;
  }
  void standaloneItemPrompt;
}

const SALT = (Number(process.argv.find((a, i) => process.argv[i - 1] === '--salt') || 0) || 0) * 7919;

function idSeed(id: string): number {
  let h = SALT;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1_000_000;
  return h;
}

async function genAndSave(ctx: Ctx, prompt: string, refs: string[], outPath: string, localDir: string, localName: string, seed?: number) {
  const t0 = Date.now();
  let res: any;
  try {
    res = await callEdge(ctx, {
    action: 'avatar-art-generate',
    kind: outPath.includes('/bases/') ? 'base' : 'item',
    id: localName,
    prompt,
      references: refs.length ? refs : undefined,
      outPath,
      seed,
    });
  } catch (e: any) {
    // One retry after a pause — pollinations occasionally 500s under load.
    await new Promise((r) => setTimeout(r, 8000));
    res = await callEdge(ctx, {
      action: 'avatar-art-generate',
      kind: outPath.includes('/bases/') ? 'base' : 'item',
      id: localName,
      prompt,
      references: refs.length ? refs : undefined,
      outPath,
      seed: seed != null ? seed + 1 : undefined,
    });
    if (!res.ok) throw new Error(`generate ${localName}: ${res.error} | retry: ${e.message.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`generate ${localName}: ${res.error}`);
  let buf = await download(res.url);
  // Normalize EVERYTHING to the pipeline contract: 1024 sacred canvas, NO
  // alpha (flatten over white — seedream sometimes returns sticker-style
  // die-cuts with native alpha, which the extraction path doesn't expect).
  const meta = await sharp(buf).metadata();
  if ((meta.width || 0) !== 1024 || (meta.height || 0) !== 1024 || meta.hasAlpha) {
    buf = await sharp(buf).flatten({ background: '#ffffff' }).resize(1024, 1024, { fit: 'fill' }).png().toBuffer();
    await upload(ctx, outPath, buf, 'image/png');
  }
  fs.writeFileSync(path.join(localDir, `${localName}.png`), buf);
  console.log(`✓ ${localName} via ${res.model} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// ---- diff extraction -------------------------------------------------------
const S = 1024;

async function rawRgba(buf: Buffer): Promise<Buffer> {
  return sharp(buf).ensureAlpha().resize(S, S, { fit: 'fill' }).raw().toBuffer();
}

function despeckle(mask: Uint8Array, w: number, h: number, passes = 2): Uint8Array {
  let m = mask;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 0, tot = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          tot++; if (m[ny * w + nx]) on++;
        }
        out[y * w + x] = on * 2 > tot ? 1 : 0;
      }
    }
    m = out;
  }
  return m;
}

async function diffExtract(item: { id: string; slot: string; onBody?: string }): Promise<{ ok: boolean; coverage: number; reason?: string }> {
  const masterBody = item.onBody || 'human_boy';
  const refPath = path.join(DIRS.masters, `${masterBody}_skin1_ref.png`);
  const plainPath = path.join(DIRS.masters, `${masterBody}_skin1.png`);
  const masterBuf = fs.readFileSync(fs.existsSync(refPath) ? refPath : plainPath);
  const rawFiles = fs.readdirSync(DIRS.raw).filter((f) => f.startsWith(`${item.id}.`) || f === `${item.id}.png`).sort();
  if (rawFiles.length === 0) return { ok: false, coverage: 0, reason: 'no_raw' };
  const dressedBuf = fs.readFileSync(path.join(DIRS.raw, rawFiles[rawFiles.length - 1]));

  const m = await rawRgba(masterBuf);
  const d = await rawRgba(dressedBuf);
  const mask = new Uint8Array(S * S);
  let count = 0;
  for (let i = 0, px = 0; i < mask.length; i++, px += 4) {
    const diff =
      Math.abs(d[px] - m[px]) + Math.abs(d[px + 1] - m[px + 1]) + Math.abs(d[px + 2] - m[px + 2]);
    if (diff > 90) { mask[i] = 1; count++; }
  }
  const coverage = count / mask.length;
  if (coverage > 0.5) return { ok: false, coverage, reason: 'drift (image changed too much)' };
  if (coverage < 0.0015) return { ok: false, coverage, reason: 'no_change (item not visible?)' };

  const clean = despeckle(mask, S, S);

  // Feather the mask edge (1px) for anti-aliased compositing.
  const maskImg = sharp(Buffer.from(clean), { raw: { width: S, height: S, channels: 1 } });
  const feathered = await maskImg.blur(1).raw().toBuffer();

  // Layer = dressed colors with feathered mask as alpha.
  const layer = Buffer.allocUnsafe(S * S * 4);
  for (let i = 0, px = 0; i < clean.length; i++, px += 4) {
    layer[px] = d[px]; layer[px + 1] = d[px + 1]; layer[px + 2] = d[px + 2];
    layer[px + 3] = feathered[i];
  }
  const layerPng = await sharp(Buffer.from(layer), { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();

  // Sanity: layer over master must reproduce the dressed render.
  const recomposite = await sharp(masterBuf)
    .composite([{ input: layerPng, top: 0, left: 0 }])
    .ensureAlpha().resize(S, S, { fit: 'fill' }).raw().toBuffer();
  let errSum = 0;
  for (let px = 0; px < recomposite.length; px += 4) {
    errSum += Math.abs(recomposite[px] - d[px]) + Math.abs(recomposite[px + 1] - d[px + 1]) + Math.abs(recomposite[px + 2] - d[px + 2]);
  }
  const meanErr = errSum / (S * S * 3);
  if (meanErr > 10) return { ok: false, coverage, reason: `recomposite_error ${meanErr.toFixed(1)}` };

  fs.writeFileSync(path.join(DIRS.extracted, `${item.id}.png`), layerPng);
  return { ok: true, coverage };
}

async function phaseExtract(only?: string[]) {
  const report: string[] = [];
  for (const item of ITEMS) {
    if (item.slot === 'background') continue; // full-canvas art, no diff
    if (only && !only.includes(item.id)) continue;
    try {
      const r = await diffExtract(item);
      report.push(`${r.ok ? '✓' : '✗'} ${item.id} — ${(r.coverage * 100).toFixed(1)}% ${r.reason || ''}`);
    } catch (e: any) {
      report.push(`✗ ${item.id} — ${e.message.slice(0, 100)}`);
    }
  }
  console.log(report.join('\n'));
}


// ---- master processing: transparent bases on the sacred skeleton -----------
// Masters come back with white backgrounds (generator output); the paperdoll
// needs them transparent and normalized to the skeleton (content centered,
// top at y≈60, filling ~90% of canvas height) so anchor rects align.
async function processMaster(name: string): Promise<{ ok: boolean; reason?: string }> {
  const src = path.join(DIRS.masters, name);
  if (!fs.existsSync(src)) return { ok: false, reason: 'missing' };
  const rgba = await sharp(src).ensureAlpha().resize(W, W, { fit: 'fill' }).raw().toBuffer();
  // Guard against double-processing: an already-transparent master (from a
  // previous run) must not be flooded again — that eats its dark pixels.
  let alreadyOpaque = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 200) alreadyOpaque++;
  const isRawWhiteBg = alreadyOpaque / (W * W) > 0.85;
  if (!isRawWhiteBg) {
    const refName = name.replace('.png', '_ref.png');
    if (fs.existsSync(path.join(DIRS.masters, refName))) return { ok: true, reason: 'already processed' };
    return { ok: false, reason: 'not a raw white-bg master' };
  }
  const { alpha, removedPct } = floodBackgroundAlpha(rgba);
  if (removedPct < 0.20) return { ok: false, reason: `bg_removal_only_${(removedPct * 100).toFixed(0)}%` };
  const soft = await featherAlpha(alpha);
  const out = Buffer.allocUnsafe(W * W * 4);
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    out[p] = rgba[p]; out[p + 1] = rgba[p + 1]; out[p + 2] = rgba[p + 2];
    out[p + 3] = soft[i];
  }
  const cutout = await sharp(Buffer.from(out), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(cutout).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  // Fit the content to ~90% of canvas height, centered, top at y=62.
  const targetH = 900;
  const scale = targetH / ih;
  const dw = Math.min(W, Math.round(iw * scale));
  const dh = targetH;
  const left = Math.max(0, Math.round((W - dw) / 2));
  const top = 62;
  const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
  const layer = await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }]).png().toBuffer();
  fs.writeFileSync(src, layer); // replace the local master with the processed one
  // White-flattened reference for i2i generation (seedream paints alpha as a
  // checkerboard — references must be opaque).
  const flat = await sharp(layer).flatten({ background: '#ffffff' }).png().toBuffer();
  fs.writeFileSync(src.replace('.png', '_ref.png'), flat);
  return { ok: true };
}

async function phaseProcessMasters(ctx: Ctx, only?: string[]) {
  for (const base of BASES) {
    if (only && !only.includes(base.id)) continue;
    const skins = base.id.startsWith('human') ? SKIN_TONES.length : 1;
    for (let sk = 1; sk <= skins; sk++) {
      const name = `${base.id}_skin${sk}.png`;
      try {
        const r = await processMaster(name);
        if (!r.ok) { console.log(`✗ ${name} ${r.reason}`); continue; }
        await upload(ctx, `avatars/bases/${name}`, fs.readFileSync(path.join(DIRS.masters, name)), 'image/png');
        const refName = name.replace('.png', '_ref.png');
        await upload(ctx, `avatars/bases/${refName}`, fs.readFileSync(path.join(DIRS.masters, refName)), 'image/png');
        console.log(`✓ ${name} (+ref)`);
      } catch (e: any) {
        console.log(`✗ ${name} — ${e.message.slice(0, 100)}`);
      }
    }
  }
}

// ---- standalone processing: white removal → trim → anchor placement -------
const W = 1024;

/**
 * Adaptive background removal: detect the dominant border color (handles
 * white, off-white, gray and even dark studio backdrops), then flood from
 * the borders accepting pixels close to the global bg OR a small step from
 * the neighbor they were reached from (follows gradients/vignettes).
 */


/** Keep only the largest connected opaque component — drops disconnected
 *  scene fragments that survive the flood (robot master remnant bug). */
function largestComponent(alpha: Buffer): { alpha: Buffer; keptPct: number } {
  const seen = new Uint8Array(W * W);
  let best: number[] | null = null;
  for (let i = 0; i < W * W; i++) {
    if (seen[i] || alpha[i] <= 40) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      comp.push(idx);
      const x = idx % W, y = (idx - x) / W;
      const push = (nx: number, ny: number) => {
        const n = ny * W + nx;
        if (!seen[n] && alpha[n] > 40) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < W - 1) push(x, y + 1);
    }
    if (!best || comp.length > best.length) best = comp;
  }
  if (!best) return { alpha, keptPct: 0 };
  const out = Buffer.alloc(W * W, 0);
  for (const idx of best) out[idx] = alpha[idx];
  return { alpha: out, keptPct: best.length / (W * W) };
}


/** Skin-key: item layers generated on the BOY master carry face-skin pixels
 *  around the item — invisible on the boy, a face-ghost overlay on every
 *  other body. Key the human-skin band (hue 6-40deg, sat 0.12-0.6, val
 *  0.35-0.95 — orange beanies at sat ~1.0 and dark outlines survive). */
function skinKeyAlpha(rgba: Buffer, alpha: Buffer): { removedPct: number } {
  let removed = 0;
  let content = 0;
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    if (alpha[i] === 0) continue;
    content++;
    const r = rgba[p] / 255, g = rgba[p + 1] / 255, b = rgba[p + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    if (v < 0.35 || v > 0.98 || d === 0) continue;
    const sat = d / max;
    if (sat < 0.12 || sat > 0.60) continue;
    let h = 0;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (h >= 6 && h <= 40) {
      alpha[i] = 0;
      removed++;
    }
  }
  return { removedPct: content ? removed / content : 0 };
}

/** Feather a binary alpha mask. sharp returns blurred 1-ch input as 3-ch
 *  interleaved raw — index accordingly (this bug corrupted every asset on
 *  2026-09-04: streaked semi-transparent layers). */
async function featherAlpha(alpha: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(Buffer.from(alpha), { raw: { width: W, height: W, channels: 1 } })
    .blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.allocUnsafe(W * W);
  for (let i = 0; i < W * W; i++) out[i] = data[i * ch];
  return out;
}

/** Chroma-key: if the border mode color is green-dominant, key every
 *  green-dominant pixel (g > r+40 && g > b+40), with despill on edges. */
function chromaKeyGreen(rgba: Buffer): { alpha: Buffer; removedPct: number } | null {
  // detect: sample border mode color
  let g = 0, n = 0;
  for (let x = 0; x < W; x += 8) {
    for (const y of [0, W - 1]) { const p = (y * W + x) * 4; if (rgba[p + 1] > rgba[p] + 40 && rgba[p + 1] > rgba[p + 2] + 40) g++; n++; }
  }
  for (let y = 0; y < W; y += 8) {
    for (const x of [0, W - 1]) { const p = (y * W + x) * 4; if (rgba[p + 1] > rgba[p] + 40 && rgba[p + 1] > rgba[p + 2] + 40) g++; n++; }
  }
  if (g / n < 0.8) return null; // not a green-screen render
  const alpha = Buffer.alloc(W * W, 255);
  let removed = 0;
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    const r = rgba[p], gg = rgba[p + 1], b = rgba[p + 2];
    if (gg > r + 40 && gg > b + 40) {
      alpha[i] = 0;
      removed++;
    } else if (gg > r + 15 && gg > b + 15) {
      // partial green (spill/anti-alias): scale by green dominance
      const dom = (gg - Math.max(r, b)) / 40;
      alpha[i] = Math.round(255 * Math.min(1, Math.max(0, 1 - dom)));
      if (alpha[i] === 0) removed++;
    }
  }
  return { alpha, removedPct: removed / (W * W) };
}

function floodBackgroundAlpha(rgba: Buffer, globalOnly = false): { alpha: Buffer; removedPct: number } {
  const alpha = Buffer.alloc(W * W, 255);
  // 1) mode (most common) border color — robust to thin decorative frames.
  const buckets = new Map<string, { n: number; rgb: [number, number, number] }>();
  const bump = (r: number, g: number, b: number) => {
    const k = `${r >> 4}_${g >> 4}_${b >> 4}`;
    const e = buckets.get(k) || { n: 0, rgb: [r, g, b] };
    e.n++;
    buckets.set(k, e);
  };
  for (let x = 0; x < W; x += 4) {
    for (const y of [0, 1, W - 2, W - 1]) { const p = (y * W + x) * 4; bump(rgba[p], rgba[p + 1], rgba[p + 2]); }
  }
  for (let y = 0; y < W; y += 4) {
    for (const x of [0, 1, W - 2, W - 1]) { const p = (y * W + x) * 4; bump(rgba[p], rgba[p + 1], rgba[p + 2]); }
  }
  let bestN = -1; let bg: [number, number, number] = [255, 255, 255];
  for (const v of buckets.values()) if (v.n > bestN) { bestN = v.n; bg = v.rgb; }
  const distBg = (p: number) =>
    Math.sqrt((rgba[p] - bg[0]) ** 2 + (rgba[p + 1] - bg[1]) ** 2 + (rgba[p + 2] - bg[2]) ** 2);
  const distPx = (a: number, b: number) =>
    Math.sqrt((rgba[a] - rgba[b]) ** 2 + (rgba[a + 1] - rgba[b + 1]) ** 2 + (rgba[a + 2] - rgba[b + 2]) ** 2);

  // 2) flood with bounded gradient following: a pixel joins the background if
  //    close to the global bg OR a small step (<=28) from an already-removed
  //    neighbor within <=60 steps of true bg. Handles thin frames, vignettes
  //    and soft backdrops without leaking through anti-aliased art edges.
  const gdist = new Uint8Array(W * W).fill(255);
  const stack: number[] = [];
  const push = (idx: number, gd: number) => {
    if (gdist[idx] <= gd) return;
    gdist[idx] = gd;
    stack.push(idx);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x + (W - 1) * W, 0); }
  for (let y = 0; y < W; y++) { push(y * W, 0); push(W - 1 + y * W, 0); }
  let removed = 0;
  while (stack.length) {
    const idx = stack.pop()!;
    const myGd = gdist[idx];
    const p = idx * 4;
    if (distBg(p) > 85 && myGd >= 60) continue;
    alpha[idx] = 0;
    removed++;
    const x = idx % W, y = (idx - x) / W;
    const spread = (nidx: number) => {
      const np = nidx * 4;
      if (distBg(np) <= 85) push(nidx, 0);
      else if (!globalOnly && myGd < 60 && distPx(p, np) <= 28) push(nidx, myGd + 1);
    };
    if (x > 0) spread(idx - 1);
    if (x < W - 1) spread(idx + 1);
    if (y > 0) spread(idx - W);
    if (y < W - 1) spread(idx + W);
  }
  return { alpha, removedPct: removed / (W * W) };
}

async function processItem(item: { id: string; slot: string; onBody?: string }): Promise<{ ok: boolean; reason?: string }> {
  const rawFiles = fs.readdirSync(DIRS.raw).filter((f) => f.startsWith(`${item.id}.`) || f === `${item.id}.png`).sort();
  if (rawFiles.length === 0) return { ok: false, reason: 'no_raw' };
  const rawBuf = fs.readFileSync(path.join(DIRS.raw, rawFiles[rawFiles.length - 1]));

  if (item.slot === 'background') {
    const fixed = await sharp(rawBuf).resize(W, W, { fit: 'cover' }).png().toBuffer();
    fs.writeFileSync(path.join(DIRS.extracted, `${item.id}.png`), fixed);
    return { ok: true };
  }

  const rgba = await sharp(rawBuf).ensureAlpha().resize(W, W, { fit: 'fill' }).raw().toBuffer();
  const keyed = chromaKeyGreen(rgba);
  let { alpha, removedPct } = keyed ? keyed : floodBackgroundAlpha(rgba);
  if (removedPct < 0.12) {
    if (item.slot === 'eyes') {
      // Thin/soft eyes renders: retry with the conservative global-only
      // flood (gradient-following eats soft art).
      const g = floodBackgroundAlpha(rgba, true);
      if (g.removedPct > 0.10) { alpha = g.alpha; removedPct = g.removedPct; }
    }
    if (removedPct < 0.12) return { ok: false, reason: `bg_removal_only_${(removedPct * 100).toFixed(0)}%` };
  }
  // Drop disconnected scene fragments, then key out carried skin pixels
  // (items render with the boy's face skin around them).
  const cc = largestComponent(alpha);
  if (cc.keptPct > 0.003) alpha = cc.alpha;
  const sk = skinKeyAlpha(rgba, alpha);
  if (sk.removedPct > 0.65) return { ok: false, reason: `skinkey_ate_${(sk.removedPct * 100).toFixed(0)}% (item is skin-toned?)` };

  // Feather the alpha edge by 1px, then extract color+alpha into one RGBA png.
  const soft = await featherAlpha(alpha);
  const out = Buffer.allocUnsafe(W * W * 4);
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    out[p] = rgba[p]; out[p + 1] = rgba[p + 1]; out[p + 2] = rgba[p + 2];
    out[p + 3] = soft[i];
  }
  const cutoutPng = await sharp(Buffer.from(out), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();

  // Trim to content bbox, then place onto the slot anchor rect.
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  const anchor = ITEM_ANCHORS[item.slot] || ITEM_ANCHORS.handheld;
  const scale = Math.min(anchor.w / iw, anchor.h / ih, 1); // never upscale past the anchor
  const dw = Math.min(W, Math.max(1, Math.round(iw * scale)));
  const dh = Math.min(W, Math.max(1, Math.round(ih * scale)));
  const left = Math.max(0, Math.min(W - dw, Math.round(anchor.x + (anchor.w - dw) / 2)));
  const top = Math.max(0, Math.min(W - dh, anchor.topAnchor ? anchor.y : Math.round(anchor.y + (anchor.h - dh) / 2)));
  const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
  const layer = await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }]).png().toBuffer();
  fs.writeFileSync(path.join(DIRS.extracted, `${item.id}.png`), layer);

  // Curation preview: the layer over its species master.
  const masterBody = item.onBody || 'human_boy';
  const masterLocal = path.join(DIRS.masters, `${masterBody}_skin1.png`);
  if (fs.existsSync(masterLocal)) {
    if (process.env.AV_DEBUG) {
      const lm = await sharp(layer).metadata();
      const mm = await sharp(masterLocal).metadata();
      console.error('DEBUG', item.id, 'layer', lm.width, lm.height, 'pages', lm.pages, '| master', mm.width, mm.height, 'pages', mm.pages);
    }
    try {
      // sharp 0.35 bug: composite+resize in ONE pipeline misvalidates sizes —
      // always composite to a buffer first, then resize.
      const flatPrev = await sharp(masterLocal)
        .composite([{ input: layer, top: 0, left: 0 }]).png().toBuffer();
      const prev = await sharp(flatPrev).resize(512, 512).png().toBuffer();
      fs.writeFileSync(path.join(DIRS.previews, `${item.id}.png`), prev);
    } catch (prevErr) {
      // Preview is curation-only — never fail the whole item for it.
      fs.writeFileSync('/tmp/fail_layer.png', layer);
      fs.copyFileSync(masterLocal, '/tmp/fail_master.png');
      console.error('PREVIEW_FAIL', item.id, prevErr.message);
    }
  }
  return { ok: true };
}

async function phaseProcess(only?: string[]) {
  const report: string[] = [];
  for (const item of ITEMS) {
    if (only && !only.includes(item.id)) continue;
    try {
      const r = await processItem(item);
      report.push(`${r.ok ? '✓' : '✗'} ${item.id} ${r.reason || ''}`);
    } catch (e: any) {
      report.push(`✗ ${item.id} — ${e.message.slice(0, 120)}`);
      console.error('STACK', item.id, String(e.stack || '').split('\n').slice(0, 4).join(' || '));
    }
  }
  console.log(report.join('\n'));
}

// ---- backgrounds: promote raw → layer directly ------------------------------
async function phaseApprove(ctx: Ctx, ids: string[] | 'all') {
  const targets = ids === 'all'
    ? ITEMS.map((i) => i.id).filter((id) => fs.existsSync(path.join(DIRS.extracted, `${id}.png`)) || itemById.get(id)?.slot === 'background')
    : ids;
  for (const id of targets) {
    const item = itemById.get(id);
    if (!item) { console.log(`? ${id}: not in manifest`); continue; }
    if (item.slot === 'background') {
      const rawFiles = fs.readdirSync(DIRS.raw).filter((f) => f.startsWith(`${id}.`)).sort();
      if (rawFiles.length === 0) { console.log(`✗ ${id}: no raw`); continue; }
      const buf = fs.readFileSync(path.join(DIRS.raw, rawFiles[rawFiles.length - 1]));
      const fixed = await sharp(buf).resize(S, S, { fit: 'cover' }).png().toBuffer();
      fs.writeFileSync(path.join(DIRS.extracted, `${id}.png`), fixed);
    }
    const layerBuf = fs.readFileSync(path.join(DIRS.extracted, `${id}.png`));
    await upload(ctx, `avatars/layers/${id}.png`, layerBuf, 'image/png');
    // Grid thumbnail: trimmed content fitted to a 256 canvas — full-canvas
    // layers render nearly invisible in 60px shop/builder cells.
    try {
      const trimmed = await sharp(layerBuf).trim({ threshold: 12 }).png().toBuffer();
      const tm = await sharp(trimmed).metadata();
      const tw = tm.width || 1, th = tm.height || 1;
      const sc = Math.min(224 / tw, 224 / th);
      const dw = Math.max(1, Math.round(tw * sc)), dh = Math.max(1, Math.round(th * sc));
      const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
      const thumb = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: sprite, left: Math.round((256 - dw) / 2), top: Math.round((256 - dh) / 2) }]).png().toBuffer();
      await upload(ctx, `avatars/thumbs/${id}.png`, thumb, 'image/png');
    } catch { /* thumb best-effort */ }
    console.log(`✓ approved ${id} → avatars/layers/${id}.png (+thumb)`);
  }
}

// ---- defaults ---------------------------------------------------------------
const RENDER_ORDER = ['background', 'back', 'body', 'outfit', 'hair', 'eyes', 'face', 'headwear', 'handheld'];

async function phaseDefaults(ctx: Ctx) {
  for (let i = 0; i < ROSTER_DEFAULTS.length; i++) {
    const def = ROSTER_DEFAULTS[i];
    const baseBuf = await layerBytes(ctx, `avatars/bases/${def.body}_skin1.png`, path.join(DIRS.masters, `${def.body}_skin1.png`));
    const comps: { input: Buffer; top: number; left: number }[] = [];
    const layerFor = async (id: string) => {
      const p = path.join(DIRS.extracted, `${id}.png`);
      if (fs.existsSync(p)) return await sharp(p).resize(S, S).png().toBuffer();
      const remote = `avatars/layers/${id}.png`;
      if (await storageExists(ctx, remote)) return await sharp(await download(publicUrl(remote))).resize(S, S).png().toBuffer();
      return null;
    };
    for (const slot of ['background', 'back']) {
      const id = def.items[slot];
      if (id) { const b = await layerFor(id); if (b) comps.push({ input: b, top: 0, left: 0 }); }
    }
    comps.push({ input: await sharp(baseBuf).resize(S, S).png().toBuffer(), top: 0, left: 0 });
    for (const slot of ['outfit', 'hair', 'eyes', 'face', 'headwear', 'handheld']) {
      const id = def.items[slot];
      if (id) { const b = await layerFor(id); if (b) comps.push({ input: b, top: 0, left: 0 }); }
    }
    const flat = await sharp(comps[0].input).composite(comps.slice(1)).png().toBuffer();
    for (const size of [768, 512, 256, 128]) {
      const out = await sharp(flat).resize(size, size).png().toBuffer();
      await upload(ctx, `avatars/defaults/def${i}_${size}.png`, out, 'image/png');
    }
    console.log(`✓ default def${i} (${def.body})`);
  }
  void RENDER_ORDER;
}

async function layerBytes(_ctx: Ctx, remote: string, local: string): Promise<Buffer> {
  if (fs.existsSync(local)) return fs.readFileSync(local);
  return download(publicUrl(remote));
}

// ---- placeholders -----------------------------------------------------------
function idHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function placeholderSvg(kind: 'base' | string, id: string, opts: { skin?: string; accent?: string } = {}): string {
  const hue = idHue(id);
  const accent = opts.accent || `hsl(${hue},70%,55%)`;
  const skin = opts.skin || '#F1C27D';
  const H = { cx: 512, cy: 300, r: 170 };
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">`;
  const body = `
    <rect x="412" y="470" width="200" height="330" rx="80" fill="${skin}"/>
    <rect x="330" y="500" width="70" height="230" rx="35" fill="${skin}"/>
    <rect x="624" y="500" width="70" height="230" rx="35" fill="${skin}"/>
    <rect x="440" y="770" width="64" height="130" rx="30" fill="${skin}"/>
    <rect x="520" y="770" width="64" height="130" rx="30" fill="${skin}"/>`;
  const head = `<circle cx="${H.cx}" cy="${H.cy}" r="${H.r}" fill="${skin}"/>`;
  const face = `<circle cx="452" cy="300" r="16" fill="#1f2937"/><circle cx="572" cy="300" r="16" fill="#1f2937"/><path d="M462 352 Q512 388 562 352" stroke="#1f2937" stroke-width="10" fill="none" stroke-linecap="round"/>`;

  switch (kind) {
    case 'base':
      if (id === 'robot') return `${open}<g>${body}</g><rect x="352" y="150" width="320" height="320" rx="60" fill="#93c5fd"/><rect x="352" y="150" width="320" height="320" rx="60" fill="none" stroke="#3b82f6" stroke-width="10"/><circle cx="452" cy="300" r="18" fill="#1e3a8a"/><circle cx="572" cy="300" r="18" fill="#1e3a8a"/><rect x="502" y="90" width="20" height="60" fill="#60a5fa"/><circle cx="512" cy="80" r="18" fill="#fbbf24"/><rect x="470" y="356" width="84" height="14" rx="7" fill="#1e3a8a"/></svg>`;
      if (id === 'alien') return `${open}${body}<ellipse cx="512" cy="290" rx="150" ry="180" fill="#86efac" stroke="#22c55e" stroke-width="10"/><circle cx="452" cy="270" r="14" fill="#14532d"/><circle cx="512" cy="250" r="14" fill="#14532d"/><circle cx="572" cy="270" r="14" fill="#14532d"/><path d="M462 340 Q512 372 562 340" stroke="#14532d" stroke-width="10" fill="none" stroke-linecap="round"/></svg>`;
      if (id === 'monster') return `${open}${body}<circle cx="512" cy="300" r="170" fill="#c4b5fd" stroke="#8b5cf6" stroke-width="10"/><path d="M392 190 L360 110 L450 160 Z" fill="#a78bfa"/><path d="M632 190 L664 110 L574 160 Z" fill="#a78bfa"/><circle cx="452" cy="290" r="18" fill="#312e81"/><circle cx="572" cy="290" r="18" fill="#312e81"/><path d="M452 340 Q512 400 572 340 Z" fill="#4c1d95"/></svg>`;
      if (id === 'human_girl') return `${open}<path d="M400 320 Q380 120 512 120 Q644 120 624 320 L624 470 L400 470 Z" fill="#1f2937"/>${body}${head}${face}</svg>`;
      return `${open}${body}${head}${face}</svg>`; // human_boy
    default: {
      // item placeholder: slot-generic silhouette in the item hue, anchored
      // to the shared skeleton.
      if (kind === 'hair') return `${open}<path d="M362 300 Q362 120 512 120 Q662 120 662 300 L662 260 Q600 190 512 190 Q424 190 362 260 Z" fill="${accent}" stroke="rgba(0,0,0,.15)" stroke-width="6"/></svg>`;
      if (kind === 'eyes') return `${open}<circle cx="452" cy="300" r="22" fill="${accent}"/><circle cx="572" cy="300" r="22" fill="${accent}"/><circle cx="452" cy="300" r="10" fill="#111827"/><circle cx="572" cy="300" r="10" fill="#111827"/></svg>`;
      if (kind === 'outfit') return `${open}<path d="M420 480 L604 480 L640 700 L560 700 L560 810 L464 810 L464 700 L384 700 Z" fill="${accent}" stroke="rgba(0,0,0,.15)" stroke-width="6"/></svg>`;
      if (kind === 'headwear') return `${open}<path d="M392 210 Q512 60 632 210 L632 240 Q512 280 392 240 Z" fill="${accent}" stroke="rgba(0,0,0,.15)" stroke-width="6"/><circle cx="512" cy="90" r="22" fill="${accent}"/></svg>`;
      if (kind === 'face') return `${open}<circle cx="452" cy="300" r="34" fill="none" stroke="${accent}" stroke-width="12"/><circle cx="572" cy="300" r="34" fill="none" stroke="${accent}" stroke-width="12"/><rect x="470" y="288" width="84" height="14" fill="${accent}"/></svg>`;
      if (kind === 'handheld') return `${open}<rect x="856" y="600" width="26" height="240" rx="12" fill="${accent}" transform="rotate(18 869 720)"/><circle cx="886" cy="590" r="46" fill="${accent}" opacity=".85"/></svg>`;
      if (kind === 'back') return `${open}<path d="M400 490 Q300 620 330 830 L440 780 Z" fill="${accent}" opacity=".9"/><path d="M624 490 Q724 620 694 830 L584 780 Z" fill="${accent}" opacity=".9"/></svg>`;
      if (kind === 'background') return `${open}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="200" cy="200" r="60" fill="#ffffff" opacity=".8"/><circle cx="820" cy="320" r="80" fill="#ffffff" opacity=".6"/><circle cx="640" cy="840" r="100" fill="#ffffff" opacity=".4"/></svg>`;
      return `${open}<circle cx="512" cy="512" r="200" fill="${accent}" opacity=".5"/></svg>`;
    }
  }
}

const SKIN_HEX = ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#5C3A21'];

async function phaseCleanMasters(ctx: Ctx) {
  // Remove disconnected scene remnants from already-processed masters
  // (robot/alien/monster came back with wide scene fragments).
  for (const base of BASES) {
    const skins = base.id.startsWith('human') ? SKIN_TONES.length : 1;
    for (let sk = 1; sk <= skins; sk++) {
      const name = `${base.id}_skin${sk}.png`;
      const src = path.join(DIRS.masters, name);
      if (!fs.existsSync(src)) continue;
      const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alpha = Buffer.alloc(W * W);
      for (let i2 = 0; i2 < W * W; i2++) alpha[i2] = data[i2 * 4 + 3];
      const before = (() => { let n = 0; for (let i2 = 0; i2 < alpha.length; i2++) if (alpha[i2] > 40) n++; return n / (W * W); })();
      const cc = largestComponent(alpha);
      if (cc.keptPct < before * 0.6) {
        console.log(`· ${name}: CC filter would drop too much (${(before * 100).toFixed(1)}% → ${(cc.keptPct * 100).toFixed(1)}%), skipping`);
        continue;
      }
      const out = Buffer.from(data);
      for (let i2 = 0; i2 < W * W; i2++) out[i2 * 4 + 3] = cc.alpha[i2];
      const cleaned = await sharp(Buffer.from(out), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
      fs.writeFileSync(src, cleaned);
      const flat = await sharp(cleaned).flatten({ background: '#ffffff' }).png().toBuffer();
      fs.writeFileSync(src.replace('.png', '_ref.png'), flat);
      await upload(ctx, `avatars/bases/${name}`, cleaned, 'image/png');
      await upload(ctx, `avatars/bases/${name.replace('.png', '_ref.png')}`, flat, 'image/png');
      console.log(`✓ cleaned ${name} (${(before * 100).toFixed(1)}% → ${(cc.keptPct * 100).toFixed(1)}%)`);
    }
  }
}

async function phasePlaceholders(ctx: Ctx) {
  // Bases (5 bodies × skins for humans)
  for (const base of BASES) {
    const skins = base.id.startsWith('human') ? SKIN_TONES.length : 1;
    for (let s = 1; s <= skins; s++) {
      const svg = placeholderSvg('base', base.id, { skin: SKIN_HEX[s - 1] });
      const png = await sharp(Buffer.from(svg)).resize(S, S).png().toBuffer();
      fs.writeFileSync(path.join(DIRS.placeholders, `${base.id}_skin${s}.png`), png);
      await upload(ctx, `avatars/bases/${base.id}_skin${s}.png`, png, 'image/png');
    }
    console.log(`✓ placeholder base ${base.id}`);
  }
  // Items
  for (const item of ITEMS) {
    const svg = placeholderSvg(item.slot, item.id);
    const png = await sharp(Buffer.from(svg)).resize(S, S).png().toBuffer();
    fs.writeFileSync(path.join(DIRS.placeholders, `${item.id}.png`), png);
    await upload(ctx, `avatars/layers/${item.id}.png`, png, 'image/png');
  }
  console.log(`✓ placeholder layers ×${ITEMS.length}`);
  await phaseDefaults(ctx);
}

// ---- status ------------------------------------------------------------------
async function phaseStatus(ctx: Ctx) {
  const missingBases: string[] = [];
  for (const base of BASES) {
    const skins = base.id.startsWith('human') ? SKIN_TONES.length : 1;
    for (let s = 1; s <= skins; s++) {
      if (!(await storageExists(ctx, `avatars/bases/${base.id}_skin${s}.png`))) missingBases.push(`${base.id}_skin${s}`);
    }
  }
  const missingLayers: string[] = [];
  for (const item of ITEMS) if (!(await storageExists(ctx, `avatars/layers/${item.id}.png`))) missingLayers.push(item.id);
  const missingDefaults: string[] = [];
  for (let i = 0; i < 12; i++) if (!(await storageExists(ctx, `avatars/defaults/def${i}_512.png`))) missingDefaults.push(`def${i}`);
  console.log(`bases missing (${missingBases.length}): ${missingBases.join(', ') || '—'}`);
  console.log(`layers missing (${missingLayers.length}): ${missingLayers.join(', ') || '—'}`);
  console.log(`defaults missing (${missingDefaults.length}): ${missingDefaults.join(', ') || '—'}`);
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const phase = flag('phase');
  const only = flag('only')?.split(',').map((s) => s.trim());
  const ctx = await bootstrap();
  console.log(`bootstrap ok (service keys: ${ctx.serviceKeys.length})`);

  if (phase === 'masters') await phaseMasters(ctx, only);
  else if (phase === 'items') await phaseItems(ctx, only, Number(flag('limit') || 0) || undefined, (flag('mode') as 'standalone' | 'i2i') || 'standalone');
  else if (phase === 'extract') await phaseExtract(only);
  else if (phase === 'process') await phaseProcess(only);
  else if (phase === 'process-masters') await phaseProcessMasters(ctx, only);
  else if (phase === 'clean-masters') await phaseCleanMasters(ctx);
  else if (phase === 'defaults') await phaseDefaults(ctx);
  else if (phase === 'placeholders') await phasePlaceholders(ctx);
  else if (args.includes('--approve')) {
    const a = flag('approve');
    await phaseApprove(ctx, a === 'all' ? 'all' : (a || '').split(',').filter(Boolean));
  } else if (phase === 'status') await phaseStatus(ctx);
  else {
    console.log('phases: masters | items | extract | defaults | placeholders | status ; --approve id|all');
  }
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
