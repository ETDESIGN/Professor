import { describe, it, expect } from 'vitest';
import { deriveAssetCategory, ASSET_CATEGORIES } from '../services/assetCategory';

describe('deriveAssetCategory', () => {
  it('vocab surface → vocabulary (incl. word_key-tagged)', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'vocab', word_key: 'rock' } })).toBe('vocabulary');
  });
  it('panel pool / book_extract → comics', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { pool: 'panel' } })).toBe('comics');
    expect(deriveAssetCategory({ type: 'image', kind: 'book_extract', metadata: { pool: 'snapshot' } })).toBe('comics');
  });
  it('scene pool wins over book_extract kind → story', () => {
    expect(deriveAssetCategory({ type: 'image', kind: 'book_extract', metadata: { pool: 'scene' } })).toBe('story');
  });
  it('portrait/cover surfaces → characters', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'portrait' } })).toBe('characters');
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'cover' } })).toBe('characters');
  });
  it('audio/video types and external links', () => {
    expect(deriveAssetCategory({ type: 'audio' })).toBe('audio');
    expect(deriveAssetCategory({ type: 'video' })).toBe('video');
    expect(deriveAssetCategory({ type: 'image', kind: 'external_url' })).toBe('links');
  });
  it('untagged generated images fall back to other', () => {
    expect(deriveAssetCategory({ type: 'image', kind: 'generated' })).toBe('other');
  });
  it('category list covers every derivable id plus all', () => {
    const ids = ASSET_CATEGORIES.map((c) => c.id);
    for (const id of ['vocabulary', 'comics', 'story', 'characters', 'audio', 'video', 'links', 'other'] as const) {
      expect(ids).toContain(id);
    }
  });
});
