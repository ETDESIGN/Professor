// tests/illustrationCore.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  composePrompt,
  aspectRatioFor,
  HOUSE_STYLE,
  sha256Hex,
  promptHashFor,
  callOpenRouterImages,
  uploadImageToStorage,
} from '../supabase/functions/_shared/illustrationCore';

afterEach(() => vi.unstubAllGlobals());

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
    expect(calls[0].input_references).toEqual([
      { type: 'image_url', image_url: { url: 'https://x/1.png' } },
    ]);
  });
  it('returns ok:false on HTTP error with status', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"bad"}', { status: 402 }));
    const r = await callOpenRouterImages({ openrouterKey: 'k' }, { model: 'm', prompt: 'p' });
    expect(r.ok).toBe(false);
    // `r.ok === false` (not `!r.ok`): this non-strict tsconfig does not narrow
    // the ImageGenResult union inside a negated-truthiness branch.
    if (r.ok === false) expect(r.error).toContain('402');
  });
  it('returns ok:false when b64_json missing', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    const r = await callOpenRouterImages({ openrouterKey: 'k' }, { model: 'm', prompt: 'p' });
    expect(r.ok).toBe(false);
  });
});

describe('uploadImageToStorage', () => {
  it('resolves to null when fetch rejects — never throws (contract)', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('boom'); });
    const url = await uploadImageToStorage(
      { supabaseUrl: 'https://s.example', serviceKey: 'k' },
      'unit-1',
      new Uint8Array([1, 2, 3]),
      'image/png',
    );
    expect(url).toBeNull();
  });
});
