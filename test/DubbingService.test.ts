import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, fromMock, storageMock, getUserMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue({ data: null, error: null }),
  fromMock: vi.fn(),
  storageMock: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null }),
    }),
  },
  getUserMock: vi.fn().mockResolvedValue({ data: { user: { id: 'student-1' } }, error: null }),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    from: fromMock,
    storage: storageMock,
    auth: { getUser: getUserMock },
  },
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { DubbingService, validateLines } from '../services/DubbingService';

/** Build a fully chainable query mock that records update/delete calls in order. */
function chainable(result: any = { data: [], error: null }) {
  const calls: any[] = [];
  const q: any = {
    select: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn((patch: any) => {
      calls.push({ op: 'update', patch });
      return q;
    }),
    delete: vi.fn(() => {
      calls.push({ op: 'delete' });
      return q;
    }),
    eq: vi.fn(() => q),
    neq: vi.fn(() => q),
    in: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    single: vi.fn(() => Promise.resolve(result.single ?? { data: null, error: null })),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return { q, calls };
}

const updates: any[] = [];
const tableState = new Map<string, { q: any; calls: any[]; result: any }>();

function setTable(table: string, result: any) {
  const { q, calls } = chainable(result);
  tableState.set(table, { q, calls, result });
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  tableState.clear();
  fromMock.mockImplementation((table: string) => {
    if (!tableState.has(table)) setTable(table, { data: [], error: null });
    return tableState.get(table)!.q;
  });
});

describe('validateLines', () => {
  it('throws "Lines overlap" when lines overlap', () => {
    expect(() =>
      validateLines([
        { startMs: 0, endMs: 2000, order: 1 },
        { startMs: 1500, endMs: 3000, order: 2 },
      ]),
    ).toThrowError('Lines overlap');
  });

  it('throws when end <= start', () => {
    expect(() =>
      validateLines([{ startMs: 1000, endMs: 1000, order: 1 }]),
    ).toThrowError('Line end must be after start');
    expect(() =>
      validateLines([{ startMs: 2000, endMs: 1000, order: 1 }]),
    ).toThrowError('Line end must be after start');
  });

  it('accepts ordered non-overlapping lines (any input order)', () => {
    expect(() =>
      validateLines([
        { startMs: 3000, endMs: 5000, order: 2 },
        { startMs: 0, endMs: 2000, order: 0 },
        { startMs: 2000, endMs: 3000, order: 1 },
      ]),
    ).not.toThrow();
  });

  it('accepts empty array', () => {
    expect(() => validateLines([])).not.toThrow();
  });
});

describe('publishDubbing', () => {
  it('unpublishes my other published take for the clip before publishing the given one', async () => {
    setTable('dubbings', {
      data: null,
      error: null,
      single: { data: { clip_id: 'clip-1' }, error: null },
    });

    await DubbingService.publishDubbing('dub-2');

    const calls = tableState.get('dubbings')!.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].op).toBe('update');
    expect(calls[0].patch).toEqual({ is_published: false, published_at: null });
    expect(calls[1].op).toBe('update');
    expect(calls[1].patch.is_published).toBe(true);
    expect(calls[1].patch.published_at).toBeTruthy();
    // publish targets the given dubbing id
    const q = tableState.get('dubbings')!.q;
    expect(q.eq).toHaveBeenCalledWith('id', 'dub-2');
  });
});

describe('deleteDubbing', () => {
  it('removes storage blobs BEFORE deleting the row', async () => {
    setTable('dubbings', {
      data: null,
      error: null,
      single: { data: { line_audio: { l1: 'dubs/s1/d1/l1.webm', l2: 'dubs/s1/d1/l2.webm' } }, error: null },
    });

    await DubbingService.deleteDubbing('dub-1');

    const storage = storageMock.from('dubbing-media');
    expect(storage.remove).toHaveBeenCalledWith([
      'dubs/s1/d1/l1.webm',
      'dubs/s1/d1/l2.webm',
    ]);
    const calls = tableState.get('dubbings')!.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('delete');
  });
});

describe('unpublishDubbing', () => {
  it('updates is_published=false, published_at=null for the given id', async () => {
    await DubbingService.unpublishDubbing('dub-9');

    const calls = tableState.get('dubbings')!.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('update');
    expect(calls[0].patch).toEqual({ is_published: false, published_at: null });
    const q = tableState.get('dubbings')!.q;
    expect(q.eq).toHaveBeenCalledWith('id', 'dub-9');
  });

  it('throws on DB error', async () => {
    setTable('dubbings', { data: null, error: { message: 'guard blocked' } });
    await expect(DubbingService.unpublishDubbing('dub-9')).rejects.toThrowError('guard blocked');
  });
});

describe('getClipLines', () => {
  it('queries dubbing_clip_lines for the clip ordered by order asc and maps rows', async () => {
    setTable('dubbing_clip_lines', {
      data: [
        { id: 'l2', order: 2, text: 'world', start_ms: 2000, end_ms: 3000, character_name: 'Bob' },
        { id: 'l1', order: 1, text: 'hello', start_ms: 0, end_ms: 2000, character_name: null },
      ],
      error: null,
    });

    const lines = await DubbingService.getClipLines('clip-1');

    const q = tableState.get('dubbing_clip_lines')!.q;
    expect(q.eq).toHaveBeenCalledWith('clip_id', 'clip-1');
    expect(q.order).toHaveBeenCalledWith('order', { ascending: true });
    expect(lines).toEqual([
      { id: 'l2', order: 2, text: 'world', startMs: 2000, endMs: 3000, characterName: 'Bob' },
      { id: 'l1', order: 1, text: 'hello', startMs: 0, endMs: 2000, characterName: null },
    ]);
  });
});

describe('evaluateTake', () => {
  it('invokes evaluate-dubbing with the lines as-is and returns results', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        results: { l1: { band: 'great', wordMatch: 1, transcript: 'hi', feedback: '', method: 'judge' } },
        overallBand: 'great',
      },
      error: null,
    });

    const res = await DubbingService.evaluateTake('clip-1', [
      { lineId: 'l1', text: 'hi', transcript: 'hi' },
    ]);

    expect(invokeMock).toHaveBeenCalledWith('evaluate-dubbing', {
      body: { lines: [{ lineId: 'l1', text: 'hi', transcript: 'hi' }] },
    });
    expect(res.overallBand).toBe('great');
    expect(res.results.l1.band).toBe('great');
  });

  it('throws when the function reports failure', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: false, error: 'boom' }, error: null });
    await expect(DubbingService.evaluateTake('clip-1', [])).rejects.toThrowError('boom');
  });
});

describe('signedUrl', () => {
  it('creates a 300s signed URL', async () => {
    const url = await DubbingService.signedUrl('clips/c1/source.webm');
    expect(storageMock.from).toHaveBeenCalledWith('dubbing-media');
    expect(storageMock.from('dubbing-media').createSignedUrl).toHaveBeenCalledWith(
      'clips/c1/source.webm',
      300,
    );
    expect(url).toBe('https://signed.example/x');
  });
});

describe('saveClipLines', () => {
  it('rejects overlapping lines before touching the DB', async () => {
    await expect(
      DubbingService.saveClipLines('clip-1', [
        { order: 1, text: 'a', startMs: 0, endMs: 1000, characterName: null },
        { order: 2, text: 'b', startMs: 500, endMs: 1500, characterName: null },
      ]),
    ).rejects.toThrowError('Lines overlap');
    expect(tableState.get('dubbing_clip_lines')).toBeUndefined();
  });
});
