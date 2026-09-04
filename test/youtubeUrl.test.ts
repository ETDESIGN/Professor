// YouTube URL helpers (media-resolution design W3.1): one canonical place to
// parse the URL forms teachers paste (watch / youtu.be / shorts / embed /
// nocookie / music.youtube) and to build search URLs — the three copies this
// replaces lived in BoardMediaPlayer, UnitContentVault and generate-media.
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  parseYouTubeUrl,
  youtubeSearchUrl,
  oembedLookup,
} from '../services/youtubeUrl';

describe('parseYouTubeUrl — every pasteable form', () => {
  it('parses watch URLs with the canonical 11-char id', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=jYAWf8Y91hA')).toEqual({
      videoId: 'jYAWf8Y91hA',
      canonicalUrl: 'https://www.youtube.com/watch?v=jYAWf8Y91hA',
    });
  });
  it('parses watch URLs with extra params (t=, list=, index=)', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=jYAWf8Y91hA&t=30s&list=xyz')).toEqual({
      videoId: 'jYAWf8Y91hA',
      canonicalUrl: 'https://www.youtube.com/watch?v=jYAWf8Y91hA',
    });
  });
  it('parses youtu.be short links', () => {
    expect(parseYouTubeUrl('https://youtu.be/jYAWf8Y91hA?t=10')?.videoId).toBe('jYAWf8Y91hA');
  });
  it('parses shorts, embed and music.youtube forms', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/D9lXr4GwMVY')?.videoId).toBe('D9lXr4GwMVY');
    expect(parseYouTubeUrl('https://www.youtube.com/embed/eBVqcTEC3zQ')?.videoId).toBe('eBVqcTEC3zQ');
    expect(parseYouTubeUrl('https://music.youtube.com/watch?v=eBVqcTEC3zQ')?.videoId).toBe('eBVqcTEC3zQ');
  });
  it('parses nocookie embeds', () => {
    expect(parseYouTubeUrl('https://www.youtube-nocookie.com/embed/_Ir0Mc6Qilo')?.videoId).toBe('_Ir0Mc6Qilo');
  });
  it('parses live URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/live/8F0NYBBKczM')?.videoId).toBe('8F0NYBBKczM');
  });
  it('accepts mobile www-less and m. hosts', () => {
    expect(parseYouTubeUrl('https://m.youtube.com/watch?v=jYAWf8Y91hA')?.videoId).toBe('jYAWf8Y91hA');
  });
  it('returns null for non-YouTube URLs, bare ids and garbage', () => {
    expect(parseYouTubeUrl('https://vimeo.com/123456')).toBeNull();
    expect(parseYouTubeUrl('jYAWf8Y91hA')).toBeNull();
    expect(parseYouTubeUrl('')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/channel/UC123')).toBeNull();
  });
  it('rejects malformed ids (length != 11 or bad charset)', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeUrl('https://youtu.be/toolongvideoid123')).toBeNull();
  });
});

describe('youtubeSearchUrl — encodes the query', () => {
  it('builds the results URL (encodeURIComponent, the repo convention)', () => {
    expect(youtubeSearchUrl('one little finger super simple songs')).toBe(
      'https://www.youtube.com/results?search_query=one%20little%20finger%20super%20simple%20songs',
    );
  });
  it('empty query still produces a valid URL', () => {
    expect(youtubeSearchUrl('')).toBe('https://www.youtube.com/results?search_query=');
  });
});

describe('oembedLookup — keyless validation with graceful offline fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns title/channel/thumbnail on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ title: 'One Little Finger', author_name: 'Super Simple Songs', thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' }),
      { status: 200 },
    )));
    const r = await oembedLookup('eBVqcTEC3zQ');
    expect(r.ok).toBe(true);
    expect(r.title).toBe('One Little Finger');
    expect(r.channel).toBe('Super Simple Songs');
    expect(r.thumbnailUrl).toContain('ytimg');
  });

  it('404 / 401 → not ok (hallucinated, private or deleted)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const r = await oembedLookup('AAAAAAAAAAA');
    expect(r.ok).toBe(false);
  });

  it('network failure → warn-and-accept (the teacher is online even if we are not)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const r = await oembedLookup('eBVqcTEC3zQ');
    expect(r.ok).toBe(true);
    expect(r.offline).toBe(true);
  });
});
