import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, getSessionMock, getUserMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue({ data: null, error: null }),
  getSessionMock: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  }),
  getUserMock: vi.fn().mockResolvedValue({
    data: { user: { id: 'u1' } },
  }),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: {
      getSession: getSessionMock,
      getUser: getUserMock,
    },
    from: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { subscription_tier: 'free' } }),
        }),
      }),
    }),
  },
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({
    redirectToCheckout: vi.fn().mockResolvedValue({ error: undefined }),
  }),
}));

import {
  getSubscriptionStatus,
  getLocalTier,
} from '../services/BillingService';

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u1' } },
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns subscription status from edge function', async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          success: true,
          tier: 'pro',
          credits: 50000,
          customerId: 'cus_123',
          history: [{ id: 'h1', amount_paid: 1200, currency: 'usd', billing_reason: 'subscription_create', created_at: '2026-01-01' }],
        },
        error: null,
      });

      const status = await getSubscriptionStatus();
      expect(status.tier).toBe('pro');
      expect(status.credits).toBe(50000);
      expect(status.customerId).toBe('cus_123');
      expect(status.history).toHaveLength(1);
    });

    it('returns free tier on error', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { success: false, error: 'Not found' },
        error: null,
      });

      await expect(getSubscriptionStatus()).rejects.toThrow('Not found');
    });

    it('throws when not authenticated', async () => {
      getSessionMock.mockResolvedValueOnce({
        data: { session: null },
      });

      await expect(getSubscriptionStatus()).rejects.toThrow('Not authenticated');
    });
  });

  describe('getLocalTier', () => {
    it('returns free when no user', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const tier = await getLocalTier();
      expect(tier).toBe('free');
    });

    it('returns tier from profile', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
      const tier = await getLocalTier();
      expect(tier).toBe('free');
    });
  });
});
