// YouTube URL helpers (media-resolution design W3.1): one canonical place to
// parse the URL forms teachers paste (watch / youtu.be / shorts / embed /
// nocookie / music / live) and to build search URLs — replaces the three
// copies that lived in BoardMediaPlayer, UnitContentVault and generate-media.
//
// oEmbed validation is keyless, CORS-open (the endpoint reflects any Origin),
// and degrades gracefully: when the probe cannot run (offline classroom /
// firewall), we accept the URL with an `offline` flag rather than blocking the
// teacher — playback itself would surface a real error if the URL is wrong.

export interface ParsedYouTubeUrl {
  videoId: string;
  canonicalUrl: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');

  let videoId: string | null = null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    videoId = url.searchParams.get('v');
    if (!videoId) {
      // /shorts/<id> · /embed/<id> · /live/<id> — the id must be the WHOLE
      // path segment (an id followed by more characters is a malformed paste,
      // not a longer id we should truncate).
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)\/?$/);
      videoId = m ? m[1] : null;
    }
  } else if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    videoId = m ? m[1] : null;
  }

  if (!videoId || !VIDEO_ID.test(videoId)) return null;
  return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query || '')}`;
}

export interface OembedLookupResult {
  ok: boolean;
  offline?: boolean;
  videoId: string;
  url: string;
  title?: string;
  channel?: string;
  thumbnailUrl?: string;
}

/** Keyless oEmbed validation of a KNOWN video id (title + channel + thumbnail). */
export async function oembedLookup(videoId: string): Promise<OembedLookupResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const base: OembedLookupResult = { ok: true, videoId, url };
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { ...base, ok: false };
    const j: any = await res.json();
    return {
      ...base,
      title: typeof j?.title === 'string' ? j.title : undefined,
      channel: typeof j?.author_name === 'string' ? j.author_name : undefined,
      thumbnailUrl: typeof j?.thumbnail_url === 'string' ? j.thumbnail_url : undefined,
    };
  } catch {
    // Offline / firewalled probe: accept with a warning (B2 graceful degrade).
    return { ...base, offline: true };
  }
}
