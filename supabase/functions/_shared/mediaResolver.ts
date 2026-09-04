// Media resolver — the networked half of the catalog-first resolution ladder
// (media-resolution design §4.1-§4.3). Uses mediaResolverCore for all pure
// decisions; this module adds: keyless oEmbed validation, the system catalog
// (assets rows seeded by scripts/media/seed-catalog.ts), one region-safe AI
// candidate call via OpenRouter, deadline-bounded ladder orchestration, and
// the asset + unit_media write-back.
//
// Everything here is BEST-EFFORT: a resolver failure must never fail the
// caller (orchestrate-lesson / generate-media) — callers wrap in try/catch
// and the ladder itself checks a deadline between rungs.
import {
  AGE_BAND_RANGES,
  autoApplyAllowed,
  rankCandidates,
  scoreCatalogEntry,
  titleSimilarity,
  type AgeBand,
  type CatalogScoreInput,
  type MediaCandidate,
} from './mediaResolverCore.ts';
import { fetchChatCompletion } from './ai.ts';
import { parseJsonLenient } from './json.ts';

export type { AgeBand, MediaCandidate } from './mediaResolverCore.ts';
export { ageBandFromGrade, ageBandFromManifest } from './mediaResolverCore.ts';

// Auto-apply threshold for catalog matches: title match scores ≥5 (rungs 1-2),
// topic-supported matches need topic(2) + vocab/age support → ≥3.
export const CATALOG_MIN_SCORE = 3;
// oEmbed probes: parallel cap and per-probe bound (oEmbed is fast; 8s is generous).
const OEMBED_TIMEOUT_MS = 8000;
const AI_MAX_CANDIDATES = 5;
const TITLE_MATCH_MIN = 0.5;

export interface ResolveBlockInput {
  kind: 'song' | 'video';
  blockTitle?: string | null;
  searchQuery?: string | null;
  suggestionTitle?: string | null;
  bookSongTitle?: string | null;
  topic?: string | null;
  vocab?: string[];
  ageBand?: AgeBand | null;
  /** Pre-seeded guesses (enrich-unit v2 suggestions may carry video_id/channel). */
  aiHints?: Array<{ videoId?: string; title?: string; channel?: string }>;
}

export interface ResolvedMedia extends MediaCandidate {
  videoId: string;
  url: string;
  thumbnailUrl?: string;
  resolvedVia: 'catalog' | 'book' | 'ai';
  resolvedAt: string;
  ageBand?: AgeBand | null;
}

export interface ResolveResult {
  resolved: ResolvedMedia | null;
  /** Top unapplied candidates for one-click UI chips. */
  candidates: MediaCandidate[];
  rung: 'book' | 'suggestion-title' | 'topic' | 'ai' | 'none';
  notes?: string[];
}

interface CatalogRow {
  assetId: string;
  title: string;
  channel: string;
  videoId: string;
  url: string;
  thumbnailUrl?: string;
  durationSec?: number | null;
  topics: string[];
  ageBands: AgeBand[];
}

// ── oEmbed (keyless, public) ─────────────────────────────────────────────

export interface OembedResult {
  ok: boolean;
  status?: number;
  videoId: string;
  url: string;
  title?: string;
  channel?: string;
  thumbnailUrl?: string;
}

export async function oembedValidate(
  videoId: string,
  deadlineMs?: number,
): Promise<OembedResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const budget = Math.min(
    OEMBED_TIMEOUT_MS,
    deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : OEMBED_TIMEOUT_MS,
  );
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(budget) },
    );
    if (!res.ok) return { ok: false, status: res.status, videoId, url };
    const j: any = await res.json();
    return {
      ok: true,
      videoId,
      url,
      title: typeof j?.title === 'string' ? j.title : undefined,
      channel: typeof j?.author_name === 'string' ? j.author_name : undefined,
      thumbnailUrl: typeof j?.thumbnail_url === 'string' ? j.thumbnail_url : undefined,
    };
  } catch (_err) {
    return { ok: false, status: 0, videoId, url }; // timeout / network
  }
}

// ── System catalog (assets rows) ─────────────────────────────────────────
// The catalog is small (a few hundred rows); one fetch + score in JS keeps
// matching flexible (title/topic/vocab) without special indexes.

export async function fetchSystemCatalog(sb: any): Promise<CatalogRow[]> {
  const { data, error } = await sb
    .from('assets')
    .select('id, prompt, source_url, public_url, tags, metadata')
    .eq('type', 'video')
    .eq('kind', 'external_url')
    .is('unit_id', null)
    .is('owner_id', null)
    .eq('is_deleted', false)
    .limit(2000);
  if (error || !Array.isArray(data)) return [];
  const rows: CatalogRow[] = [];
  for (const r of data) {
    const meta = r.metadata || {};
    const videoId = String(meta.videoId || '');
    const url = r.source_url || r.public_url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    if (!videoId || !url) continue;
    rows.push({
      assetId: r.id,
      title: String(meta.title || r.prompt || ''),
      channel: String(meta.channel || ''),
      videoId,
      url,
      thumbnailUrl: meta.thumbnailUrl || undefined,
      durationSec: Number.isFinite(meta.durationSec) ? meta.durationSec : null,
      topics: Array.isArray(meta.topics) ? meta.topics.map(String) : [],
      ageBands: Array.isArray(meta.ageBands) ? meta.ageBands : [],
    });
  }
  return rows;
}

// ── AI candidates (one bounded region-safe call) ─────────────────────────

export async function aiProposeCandidates(input: ResolveBlockInput): Promise<
  Array<{ videoId?: string; title?: string; channel?: string }>
> {
  const ageLine = input.ageBand ? `Target audience: young English LEARNERS, ${AGE_BAND_RANGES[input.ageBand]}.` : '';
  const sys = `You suggest REAL, EXISTING children's educational videos on YouTube for ESL lessons.
You may only name videos you are CONFIDENT exist — prefer famous kids-ESL channels (Super Simple Songs, Noodle & Pals, The Singing Walrus, Dream English Kids, Steve and Maggie / Wow English, Maple Leaf Learning, ELF Kids Videos, English Singsing).
Return ONLY a valid JSON object.`;
  const usr = `Lesson topic: ${input.topic || input.searchQuery || 'general English for kids'}
Suggested song/video title: ${input.suggestionTitle || input.blockTitle || ''}
${input.vocab?.length ? `Lesson words: ${input.vocab.slice(0, 20).join(', ')}` : ''}
${ageLine}

Propose up to ${AI_MAX_CANDIDATES} YouTube videos that fit as a classroom warm-up.
Return ONLY: { "candidates": [ { "video_id": "11-char YouTube video id (omit if unsure)", "title": "exact video title", "channel": "channel name" } ] }
Quality over quantity: zero entries is a valid answer.`;
  const res = await fetchChatCompletion(
    [
      { role: 'system', content: sys },
      { role: 'user', content: usr },
    ],
    { temperature: 0.2, maxTokens: 700, timeoutMs: 20000 },
  );
  if (!res?.content) return [];
  try {
    // parseJsonLenient tolerates trailing prose / reasoning prefixes ({} on
    // no JSON at all — the candidates check below handles that).
    const parsed = parseJsonLenient<any>(res.content);
    const list = parsed?.candidates;
    if (!Array.isArray(list)) return [];
    return list
      .filter((c: any) => c && (typeof c.video_id === 'string' || typeof c.title === 'string'))
      .slice(0, AI_MAX_CANDIDATES)
      .map((c: any) => ({
        videoId: typeof c.video_id === 'string' ? c.video_id.trim() : undefined,
        title: typeof c.title === 'string' ? c.title.trim() : undefined,
        channel: typeof c.channel === 'string' ? c.channel.trim() : undefined,
      }));
  } catch {
    return [];
  }
}

// ── The ladder ───────────────────────────────────────────────────────────

export interface ResolveOpts {
  /** Absolute Date.now() deadline for the whole ladder. */
  deadlineMs?: number;
  /** Skip the AI rung (e.g. low-stakes or budget-constrained contexts). */
  skipAi?: boolean;
}

export async function resolveMedia(
  sb: any,
  input: ResolveBlockInput,
  opts: ResolveOpts = {},
): Promise<ResolveResult> {
  const notes: string[] = [];
  const outOfTime = () => opts.deadlineMs !== undefined && Date.now() >= opts.deadlineMs;

  // ── Rungs 1-3: catalog ──
  let catalog: CatalogRow[] = [];
  try {
    catalog = await fetchSystemCatalog(sb);
  } catch (err: any) {
    notes.push(`catalog fetch failed: ${err?.message || err}`);
  }

  if (catalog.length > 0) {
    const scoreInput: CatalogScoreInput = {
      kind: input.kind,
      suggestionTitle: input.suggestionTitle || input.blockTitle || null,
      bookSongTitle: input.bookSongTitle || null,
      topic: input.topic || null,
      vocab: input.vocab || [],
      ageBand: input.ageBand || null,
    };
    const scored = catalog
      .map((row) => ({ row, score: scoreCatalogEntry(row, scoreInput) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score >= CATALOG_MIN_SCORE) {
      const best = scored[0];
      const cand: ResolvedMedia = {
        ...best.row,
        source: best.score >= 5 && input.bookSongTitle && titleSimilarity(input.bookSongTitle, best.row.title) >= TITLE_MATCH_MIN
          ? 'book'
          : 'catalog',
        resolvedVia: 'catalog',
        resolvedAt: new Date().toISOString(),
        ageBand: input.ageBand || null,
      };
      if (autoApplyAllowed(cand, input.kind)) {
        return {
          resolved: cand,
          candidates: scored.slice(1, 4).map((s) => ({ ...s.row, source: 'catalog' as const })),
          rung: cand.source === 'book' ? 'book' : best.score >= 5 ? 'suggestion-title' : 'topic',
          notes,
        };
      }
      // Best catalog hit failed the duration gate — offer it as a chip.
      return {
        resolved: null,
        candidates: scored.slice(0, 3).map((s) => ({ ...s.row, source: 'catalog' as const })),
        rung: 'none',
        notes: [...notes, 'top catalog hit failed duration gate'],
      };
    }
    notes.push(`no catalog match above threshold (best=${scored[0]?.score ?? 0})`);
  }

  // ── Rung 4: AI candidates + oEmbed validation ──
  if (opts.skipAi || outOfTime()) return { resolved: null, candidates: [], rung: 'none', notes };

  let guesses = input.aiHints?.length ? input.aiHints : [];
  if (guesses.length === 0) {
    try {
      guesses = await aiProposeCandidates(input);
    } catch (err: any) {
      notes.push(`ai candidates failed: ${err?.message || err}`);
    }
    if (outOfTime()) return { resolved: null, candidates: [], rung: 'none', notes };
  }

  const withIds = guesses.filter((g) => g.videoId && /^[A-Za-z0-9_-]{11}$/.test(g.videoId));
  if (withIds.length === 0) return { resolved: null, candidates: [], rung: 'none', notes };

  const validated = await Promise.all(
    withIds.slice(0, AI_MAX_CANDIDATES).map(async (g): Promise<(MediaCandidate & { videoId: string; url: string }) | null> => {
      const oe = await oembedValidate(g.videoId!, opts.deadlineMs);
      if (!oe.ok || !oe.title) return null;
      // Hallucination gate: the REAL title must resemble the claimed one, OR
      // (when the model gave no title) the video must simply exist.
      if (g.title && titleSimilarity(oe.title, g.title) < TITLE_MATCH_MIN) return null;
      return {
        videoId: oe.videoId,
        url: oe.url,
        title: oe.title,
        channel: oe.channel || g.channel || '',
        thumbnailUrl: oe.thumbnailUrl,
        durationSec: null as number | null, // oEmbed has no duration
        source: 'ai' as const,
      };
    }),
  );

  const candidates = rankCandidates(
    validated.filter(Boolean) as Array<MediaCandidate & { videoId: string; url: string }>,
    { kind: input.kind, ageBand: input.ageBand || null },
  );
  if (candidates.length === 0) return { resolved: null, candidates: [], rung: 'none', notes };

  const top = candidates[0];
  if (autoApplyAllowed(top, input.kind)) {
    return {
      resolved: { ...top, videoId: top.videoId, url: top.url, resolvedVia: 'ai', resolvedAt: new Date().toISOString(), ageBand: input.ageBand || null },
      candidates: candidates.slice(1, 4),
      rung: 'ai',
      notes,
    };
  }
  return { resolved: null, candidates: candidates.slice(0, 3), rung: 'none', notes };
}

// ── Write-back: flow block data + reusable asset ─────────────────────────

/** Fields the board/vault render (design §4.3 contract). */
export function resolvedToBlockData(r: ResolvedMedia): Record<string, any> {
  return {
    videoUrl: r.url,
    videoTitle: r.title,
    videoChannel: r.channel,
    ...(r.thumbnailUrl ? { videoThumbnailUrl: r.thumbnailUrl } : {}),
    resolvedVia: r.resolvedVia,
    resolvedAt: r.resolvedAt,
    ...(r.ageBand ? { ageBand: r.ageBand } : {}),
  };
}

/**
 * Record a resolved media item as a reusable asset (flywheel): idempotent on
 * metadata.videoId. Optionally link it to the unit via unit_media (role =
 * 'song' | 'video'). Never throws.
 */
export async function upsertMediaAsset(
  sb: any,
  r: { videoId: string; url: string; title: string; channel?: string; thumbnailUrl?: string; durationSec?: number | null; topics?: string[]; ageBands?: string[] },
  opts: { unitId?: string | null; role?: string; teacherId?: string | null; source?: string } = {},
): Promise<string | null> {
  try {
    const meta: Record<string, any> = {
      videoId: r.videoId,
      title: r.title,
      ...(r.channel ? { channel: r.channel } : {}),
      ...(r.durationSec != null ? { durationSec: r.durationSec } : {}),
      ...(r.topics?.length ? { topics: r.topics } : {}),
      ...(r.ageBands?.length ? { ageBands: r.ageBands } : {}),
      ...(r.thumbnailUrl ? { thumbnailUrl: r.thumbnailUrl } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      verifiedAt: new Date().toISOString(),
    };
    const tags = [
      ...(opts.source ? [`source:${opts.source}`] : []),
      ...(r.topics || []).map((t) => `topic:${t}`),
      ...(r.ageBands || []).map((a) => `age:${a}`),
    ];

    // Idempotent: same video already recorded (any scope) → reuse the row.
    const { data: existing } = await sb
      .from('assets')
      .select('id')
      .eq('type', 'video')
      .eq('kind', 'external_url')
      .contains('metadata', { videoId: r.videoId })
      .limit(1);
    let assetId: string | null = existing?.[0]?.id || null;

    if (!assetId) {
      const { data: inserted, error } = await sb
        .from('assets')
        .insert({
          unit_id: opts.unitId || null,
          owner_id: opts.teacherId || null,
          type: 'video',
          kind: 'external_url',
          prompt: r.title,
          source_url: r.url,
          public_url: r.url,
          storage_path: 'external',
          tags,
          metadata: meta,
        })
        .select('id')
        .single();
      if (error) return null;
      assetId = inserted?.id || null;
    }

    if (assetId && opts.unitId && opts.role) {
      const { error: linkErr } = await sb
        .from('unit_media')
        .upsert(
          { unit_id: opts.unitId, asset_id: assetId, role: opts.role, order_index: 0 },
          { onConflict: 'unit_id,asset_id,role' },
        );
      if (linkErr) { /* non-fatal: the asset still exists */ }
    }
    return assetId;
  } catch {
    return null;
  }
}

// ── orchestrate-lesson integration helper ────────────────────────────────

/** Edge-side parse of a pasted YouTube URL → 11-char video id (client twin:
 *  services/youtubeUrl.ts — kept separate so functions never import app code). */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)\/?$/);
      id = m ? m[1] : null;
    }
  } else if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    id = m ? m[1] : null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/**
 * Propagate resolutions from units.flow into the unit's class_plans.flow rows
 * (the live session may be driven by a class plan — its flow is a materialized
 * copy, so it must be healed too or the board keeps the stale suggestion).
 * Matches blocks by normalized search_query, then title, then the
 * single-unresolved-block fallback. Returns the number of plans updated.
 */
export async function syncClassPlanFlows(
  sb: any,
  unitId: string,
  resolvedBlocks: Array<{ searchQuery?: string | null; title?: string | null; data: Record<string, any> }>,
): Promise<number> {
  if (resolvedBlocks.length === 0) return 0;
  const norm = (s: any) => String(s || '').trim().toLowerCase();
  const { data: plans } = await sb
    .from('class_plans')
    .select('id, flow')
    .eq('unit_id', unitId)
    .not('flow', 'is', null);
  let updated = 0;
  for (const plan of plans || []) {
    const flow = Array.isArray(plan.flow) ? plan.flow : [];
    let changed = false;
    const unresolved = flow.filter((b: any) => b?.type === 'MEDIA_PLAYER' && !b?.data?.videoUrl && !b?.data?.audioUrl);
    for (const block of unresolved) {
      const match = resolvedBlocks.find((rb) =>
        (rb.searchQuery && norm(rb.searchQuery) === norm(block.data?.search_query)) ||
        (rb.title && norm(rb.title) === norm(block.data?.title)),
      ) ?? (resolvedBlocks.length === 1 && unresolved.length === 1 ? resolvedBlocks[0] : undefined);
      if (match) {
        block.data = { ...(block.data || {}), ...match.data };
        changed = true;
      }
    }
    if (changed) {
      const { error } = await sb.from('class_plans').update({ flow }).eq('id', plan.id);
      if (!error) updated++;
    }
  }
  return updated;
}

export interface FlowResolveContext {
  unitId: string;
  teacherId?: string | null;
  topic?: string | null;
  vocab?: string[];
  ageBand?: AgeBand | null;
  /** AI hints carried from enrich-unit v2 suggestions (manifest). */
  suggestions?: any[];
  deadlineMs?: number;
}

/**
 * Resolve every MEDIA_PLAYER block that lacks a playable URL, merging the
 * resolution fields into block.data in place. NEVER throws — a resolution
 * failure leaves the block exactly as it was (the honest suggestion card).
 */
export async function resolveMediaForFlow(sb: any, flow: any[], ctx: FlowResolveContext): Promise<{ resolved: number; rungs: string[] }> {
  let resolved = 0;
  const rungs: string[] = [];
  try {
    for (const block of flow) {
      if (!block || block.type !== 'MEDIA_PLAYER') continue;
      const data = block.data || {};
      if (data.videoUrl || data.audioUrl) continue;
      if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs) break;

      const isBook = data.source === 'book';
      // enrich-unit v2: suggestions may carry video_id/channel hints.
      const hints = (ctx.suggestions || [])
        .filter((s: any) => s && (s.video_id || s.videoId))
        .map((s: any) => ({ videoId: s.video_id || s.videoId, title: s.title, channel: s.channel || s.channel_name }))
        .slice(0, 5);

      const result = await resolveMedia(sb, {
        kind: data.kind === 'video' ? 'video' : 'song',
        blockTitle: data.title || null,
        searchQuery: data.search_query || null,
        suggestionTitle: data.title || null,
        bookSongTitle: isBook ? data.title : null,
        topic: ctx.topic || null,
        vocab: ctx.vocab || [],
        ageBand: ctx.ageBand || null,
        aiHints: hints,
      }, { deadlineMs: ctx.deadlineMs });

      rungs.push(result.rung);
      if (result.resolved) {
        Object.assign(data, resolvedToBlockData(result.resolved));
        block.data = data;
        resolved++;
        // Flywheel: record the resolution as a reusable asset (best-effort).
        await upsertMediaAsset(sb, result.resolved, {
          unitId: ctx.unitId,
          role: data.kind === 'video' ? 'video' : 'song',
          teacherId: ctx.teacherId || null,
          source: result.resolved.resolvedVia,
        });
      } else if (result.candidates.length > 0) {
        // Surface unapplied candidates to the teacher UI as one-click chips.
        block.data = {
          ...data,
          candidates: result.candidates.slice(0, 3).map((c) => ({
            videoId: c.videoId,
            url: c.url,
            title: c.title,
            channel: c.channel,
            ...(c.thumbnailUrl ? { thumbnailUrl: c.thumbnailUrl } : {}),
          })),
        };
      }
    }
  } catch (_err) {
    // Never fatal — the unresolved block is a valid state (suggestion card).
  }
  return { resolved, rungs };
}
