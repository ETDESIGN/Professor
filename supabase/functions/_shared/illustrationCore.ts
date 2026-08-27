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
