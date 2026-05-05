import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'customer-portal',
    rateLimit: { maxRequests: 10, windowMs: 60_000 },
    validationRules: [
      { field: 'returnUrl', required: true, type: 'string' },
    ],
  }, async (body, auth) => {
    if (!auth?.userId) {
      throw new Error('Authentication required');
    }

    const { returnUrl } = body;
    const userId = auth.userId;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error('No Stripe customer found. Please subscribe first.');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  });
});
