import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureLedgerRpc, queueMerge, flushLedgerNow } from '../apps/board/ledgerWriter';

describe('ledgerWriter', () => {
  const rpc = vi.fn().mockResolvedValue({});
  beforeEach(() => {
    rpc.mockClear();
    configureLedgerRpc(rpc as any);
    return flushLedgerNow();
  });

  it('coalesces repeated marks into one RPC call', async () => {
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['a']);
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['b']);
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['a', 'c']);
    await flushLedgerNow();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('merge_dealt_objectives', {
      p_session_id: '11111111-1111-1111-1111-111111111111',
      p_unit_id: '22222222-2222-2222-2222-222222222222',
      p_objective_ids: ['a', 'b', 'c'],
    });
  });

  it('never calls the rpc for non-uuid session ids (local fallback)', async () => {
    queueMerge('local', '22222222-2222-2222-2222-222222222222', ['a']);
    await flushLedgerNow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('survives rpc failures without throwing', async () => {
    rpc.mockRejectedValueOnce(new Error('network'));
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['x']);
    await expect(flushLedgerNow()).resolves.toBeUndefined();
  });
});
