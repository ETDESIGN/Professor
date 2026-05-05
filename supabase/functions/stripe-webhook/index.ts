import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  const { data: customer } = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return;

  const userId = (customer as Stripe.Customer).metadata?.supabase_user_id;
  if (!userId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceIdToTier(priceId);

  await supabase.from('profiles').update({
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_tier: tier,
  }).eq('id', userId);

  if (session.invoice) {
    const invoice = await stripe.invoices.retrieve(session.invoice as string);
    await supabase.from('billing_history').insert({
      profile_id: userId,
      stripe_invoice_id: invoice.id,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      billing_reason: invoice.billing_reason,
    });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceIdToTier(priceId);

  const { data: customers } = await stripe.customers.list({ limit: 1 });
  const customer = await stripe.customers.retrieve(customerId);
  const userId = (customer as Stripe.Customer).metadata?.supabase_user_id;
  if (!userId) return;

  await supabase.from('profiles').update({
    stripe_subscription_id: subscription.id,
    subscription_tier: tier,
  }).eq('stripe_customer_id', customerId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  await supabase.from('profiles').update({
    stripe_subscription_id: null,
    subscription_tier: 'free',
  }).eq('stripe_customer_id', customerId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) return;

  await supabase.from('billing_history').insert({
    profile_id: profile.id,
    stripe_invoice_id: invoice.id,
    amount_paid: invoice.amount_paid,
    currency: invoice.currency,
    billing_reason: invoice.billing_reason,
  });

  const priceId = invoice.lines.data[0]?.price?.id;
  if (priceId) {
    const tier = priceIdToTier(priceId);
    await supabase.from('profiles').update({ subscription_tier: tier }).eq('id', profile.id);
  }
}

function priceIdToTier(priceId: string | undefined): string {
  if (!priceId) return 'free';
  const env = Deno.env.get('STRIPE_PRO_PRICE_ID');
  if (priceId === env) return 'pro';
  return 'free';
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return errorResponse('Missing stripe-signature header', 400);
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
    }

    return jsonResponse({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    return errorResponse(`Webhook Error: ${error.message}`, 400);
  }
});
