import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, limitMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue({ data: null, error: null }),
  limitMock: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        then: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  canonicalSpeechHash,
  detectLang,
  resolveSpeech,
  speechHashFor,
  clearSpeechCache,
} from '../services/speechResolver';

describe('speechResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSpeechCache();
    limitMock.mockResolvedValue({ data: [] });
    invokeMock.mockResolvedValue({ data: null, error: null });
  });

  describe('detectLang', () => {
    it('detects Simplified Chinese via CJK characters', () => {
      expect(detectLang('你好，世界')).toBe('zh');
      expect(detectLang('apple 苹果')).toBe('zh');
    });

    it('defaults to English for Latin text', () => {
      expect(detectLang('The cat sat on the mat.')).toBe('en');
      expect(detectLang('')).toBe('en');
    });
  });

  describe('canonicalSpeechHash determinism', () => {
    it('same (text + lang + voice + model) → same hash', async () => {
      const a = await canonicalSpeechHash('Dog', 'en', 'Jennifer', 'qwen/qwen-audio-3.0-tts-flash');
      const b = await canonicalSpeechHash('  dog  ', 'EN', 'Jennifer', 'qwen/qwen-audio-3.0-tts-flash');
      expect(a).toBe(b); // case + whitespace normalized
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('different voice → different hash', async () => {
      const a = await canonicalSpeechHash('dog', 'en', 'Jennifer', 'm');
      const b = await canonicalSpeechHash('dog', 'en', 'Cherry', 'm');
      expect(a).not.toBe(b);
    });

    it('different model → different hash', async () => {
      const a = await canonicalSpeechHash('dog', 'en', 'Jennifer', 'model-a');
      const b = await canonicalSpeechHash('dog', 'en', 'Jennifer', 'model-b');
      expect(a).not.toBe(b);
    });

    it('different lang → different hash', async () => {
      const a = await canonicalSpeechHash('dog', 'en', 'Jennifer', 'm');
      const b = await canonicalSpeechHash('dog', 'zh', 'Jennifer', 'm');
      expect(a).not.toBe(b);
    });

    it('speechHashFor applies per-language default voices', async () => {
      const en = await speechHashFor('dog');
      const zh = await speechHashFor('小狗');
      expect(en.lang).toBe('en');
      expect(zh.lang).toBe('zh');
      expect(en.hash).not.toBe(zh.hash);
      // Explicit lang override is respected.
      const forced = await speechHashFor('dog', 'zh');
      expect(forced.lang).toBe('zh');
    });
  });

  describe('resolveSpeech', () => {
    it('fails fast on empty text', async () => {
      const res = await resolveSpeech({ text: '' });
      expect(res.status).toBe('failed');
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('returns cached URL from the assets table without invoking the edge', async () => {
      limitMock.mockResolvedValueOnce({ data: [{ public_url: 'https://cdn/dog.mp3' }] });
      const res = await resolveSpeech({ text: 'dog' });
      expect(res.status).toBe('cached');
      expect(res.url).toBe('https://cdn/dog.mp3');
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('memory-caches: second call is instant (no supabase traffic)', async () => {
      limitMock.mockResolvedValueOnce({ data: [{ public_url: 'https://cdn/dog.mp3' }] });
      await resolveSpeech({ text: 'dog' });
      const second = await resolveSpeech({ text: 'dog' });
      expect(second.status).toBe('cached');
      expect(second.url).toBe('https://cdn/dog.mp3');
      expect(invokeMock).toHaveBeenCalledTimes(0);
      expect(limitMock).toHaveBeenCalledTimes(1);
    });

    it('invokes resolve-speech on cache miss and caches the result', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { url: 'https://cdn/generated.mp3', prompt_hash: 'abc123', status: 'generated', provider: 'openrouter' },
        error: null,
      });
      const res = await resolveSpeech({ text: 'elephant', unitId: 'unit-1' }, { budgetMs: 2000 });
      expect(res.status).toBe('cached');
      expect(res.url).toBe('https://cdn/generated.mp3');
      expect(res.promptHash).toBe('abc123');
      expect(invokeMock).toHaveBeenCalledWith('generate-media', expect.objectContaining({
        body: expect.objectContaining({ action: 'resolve-speech', text: 'elephant', lang: 'en' }),
      }));
    });

    it('returns generating when the edge exceeds the budget (non-blocking)', async () => {
      // Invoke that never resolves within the tiny budget.
      invokeMock.mockReturnValueOnce(new Promise(() => {}));
      const started = Date.now();
      const res = await resolveSpeech({ text: 'slow word' }, { budgetMs: 50 });
      expect(res.status).toBe('generating');
      expect(Date.now() - started).toBeLessThan(1000); // caller never blocked
    });

    it('reports failed when the edge errors', async () => {
      invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
      const res = await resolveSpeech({ text: 'broken' }, { budgetMs: 2000 });
      expect(res.status).toBe('failed');
      expect(res.url).toBeUndefined();
    });

    it('auto-detects zh and passes it to the edge', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { url: 'https://cdn/zh.mp3', prompt_hash: 'zh1', status: 'generated' },
        error: null,
      });
      await resolveSpeech({ text: '你好' }, { budgetMs: 2000 });
      expect(invokeMock).toHaveBeenCalledWith('generate-media', expect.objectContaining({
        body: expect.objectContaining({ action: 'resolve-speech', lang: 'zh' }),
      }));
    });
  });
});
