import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'subscription-status',
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60_000 },
    validationRules: [],
  }, async (_body, auth) => {
    if (!auth?.userId) {
      throw new Error('Authentication required');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, stripe_customer_id, ai_credits_balance')
      .eq('id', auth.userId)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const { data: billingHistory } = await supabase
      .from('billing_history')
      .select('id, amount_paid, currency, billing_reason, created_at')
      .eq('profile_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      tier: profile.subscription_tier || 'free',
      credits: profile.ai_credits_balance || 0,
      customerId: profile.stripe_customer_id,
      history: billingHistory || [],
    };
  });
});
