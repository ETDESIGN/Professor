import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from './supabaseClient';

let stripePromise: Promise<Stripe | null>;

function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (!key) return Promise.resolve(null);
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

const PRO_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '';

export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  credits: number;
  customerId: string | null;
  history: {
    id: string;
    amount_paid: number;
    currency: string;
    billing_reason: string;
    created_at: string;
  }[];
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

async function invokeFunction(name: string, body: Record<string, any>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw new Error(error.message || `Edge function ${name} failed`);
  if (!data.success && data.error) throw new Error(data.error);
  return data;
}

export async function startCheckout(priceId?: string): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const result = await invokeFunction('create-checkout', {
    priceId: priceId || PRO_PRICE_ID,
    successUrl: `${window.location.origin}/teacher/settings?checkout=success`,
    cancelUrl: `${window.location.origin}/teacher/settings?checkout=cancelled`,
  });

  if (result.url) {
    window.location.href = result.url;
    return result.url;
  }

  return null;
}

export async function openCustomerPortal(): Promise<string | null> {
  const result = await invokeFunction('customer-portal', {
    returnUrl: `${window.location.origin}/teacher/settings`,
  });
  if (result.url) {
    window.location.href = result.url;
  }
  return result.url || null;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const result = await invokeFunction('subscription-status', {});
  return {
    tier: result.tier || 'free',
    credits: result.credits || 0,
    customerId: result.customerId || null,
    history: result.history || [],
  };
}

export async function getLocalTier(): Promise<SubscriptionTier> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'free';

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  return (profile?.subscription_tier as SubscriptionTier) || 'free';
}
