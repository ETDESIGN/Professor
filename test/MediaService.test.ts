import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MediaService } from '../services/MediaService';

describe('MediaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MediaService.clearCache();
  });

  it('calls generate-media for image generation', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { url: 'https://example.com/img.png' },
      error: null,
    });

    const url = await MediaService.getVocabImage('unit-1', 'cat', 'The cat sat');
    expect(url).toBe('https://example.com/img.png');
    expect(invokeMock).toHaveBeenCalledWith('generate-media', expect.objectContaining({
      body: expect.objectContaining({ action: 'generate-image' }),
    }));
  });

  it('calls generate-media for audio generation', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { url: 'https://example.com/audio.mp3' },
      error: null,
    });

    const url = await MediaService.getVocabAudio('unit-1', 'dog');
    expect(url).toBe('https://example.com/audio.mp3');
    expect(invokeMock).toHaveBeenCalledWith('generate-media', expect.objectContaining({
      body: expect.objectContaining({ action: 'generate-audio' }),
    }));
  });

  it('returns empty string on error', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'fail' },
    });

    const url = await MediaService.getVocabImage('unit-1', 'cat');
    expect(url).toBe('');
  });

  it('caches image URLs on second call', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { url: 'https://example.com/img.png' },
      error: null,
    });

    const url1 = await MediaService.getVocabImage('unit-1', 'cat');
    const url2 = await MediaService.getVocabImage('unit-1', 'cat');

    expect(url1).toBe('https://example.com/img.png');
    expect(url2).toBe('https://example.com/img.png');
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('clearCache removes cached items', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { url: 'https://example.com/img.png' },
      error: null,
    });

    await MediaService.getVocabImage('unit-1', 'cat');
    MediaService.clearCache();

    expect(MediaService.getCachedImage('unit-1', 'cat')).toBeUndefined();
  });

  it('getCachedImage returns undefined for uncached items', () => {
    expect(MediaService.getCachedImage('unit-1', 'nonexistent')).toBeUndefined();
  });

  it('getCachedAudio returns undefined for uncached items', () => {
    expect(MediaService.getCachedAudio('unit-1', 'nonexistent')).toBeUndefined();
  });

  it('generateBatch returns empty results when no items', async () => {
    const result = await MediaService.generateBatch('unit-1', []);
    expect(result).toEqual({ images: {}, audios: {} });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('generateBatch sends batch payload', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        results: {
          images: { cat: 'https://example.com/cat.png' },
          audios: { cat: 'https://example.com/cat.mp3' },
        },
      },
      error: null,
    });

    const result = await MediaService.generateBatch('unit-1', [
      { key: 'cat', imagePrompt: 'A cat', audioText: 'The cat sat' },
    ]);

    expect(result.images.cat).toBe('https://example.com/cat.png');
    expect(result.audios.cat).toBe('https://example.com/cat.mp3');
  });

  it('generateBatch caches results after generation', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        results: {
          images: { dog: 'https://example.com/dog.png' },
          audios: { dog: 'https://example.com/dog.mp3' },
        },
      },
      error: null,
    });

    await MediaService.generateBatch('unit-1', [
      { key: 'dog', imagePrompt: 'A dog', audioText: 'The dog ran' },
    ]);

    expect(MediaService.getCachedImage('unit-1', 'dog')).toBe('https://example.com/dog.png');
    expect(MediaService.getCachedAudio('unit-1', 'dog')).toBe('https://example.com/dog.mp3');
  });
});
