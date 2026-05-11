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
    name: 'create-checkout',
    requireAuth: true,
    rateLimit: { maxRequests: 10, windowMs: 60_000 },
    validationRules: [
      { field: 'priceId', required: true, type: 'string' },
      { field: 'successUrl', required: true, type: 'string' },
      { field: 'cancelUrl', required: true, type: 'string' },
    ],
  }, async (body, auth) => {
    if (!auth?.userId) {
      throw new Error('Authentication required');
    }

    const { priceId, successUrl, cancelUrl } = body;
    const userId = auth.userId;

    let customerId: string | undefined;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single();

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: profile?.email || undefined,
        name: profile?.full_name || undefined,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: userId },
    });

    return { sessionId: session.id, url: session.url };
  });
});
