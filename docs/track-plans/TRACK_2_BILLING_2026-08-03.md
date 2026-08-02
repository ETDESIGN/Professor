# TRACK 2 — Billing + Stripe Enforcement (P0-1 + P0-4)

> **Status:** Implementation-ready · **Date:** 2026-08-03
> **Scope:** One Stripe-webhook fix, one credit-gate helper + 4 call-site insertions, one client chokepoint gate, plus tier rehydration in the auth profile.
> **Isolation:** Shares `_shared/edgeHandler.ts` and `stripe-webhook/index.ts` with **potential pipeline-session overlap** — see Coordination.
> **Estimated effort:** 1.5–2 days · **Parent roadmap:** `docs/AUDIT_ROADMAP_2026-08-02.md` (P0-1, P0-4)

---

## Goal

Make the advertised plan limits **real**: Free = 3 classes / 10,000 AI credits; Pro = unlimited classes / 50,000 credits/month. Today `subscription_tier` is read for display only and `ai_credits_balance` is decremented nowhere (P0-1). Separately, fix the 3 Stripe-webhook correctness bugs that lose payments (P0-4).

---

## Verified current-state facts (from audit + follow-up agent)

- **Columns exist** (`20260424000000_subscriptions.sql:2-6`): `stripe_customer_id TEXT UNIQUE`, `stripe_subscription_id TEXT UNIQUE`, `subscription_tier TEXT DEFAULT 'free'`, `ai_credits_balance INTEGER DEFAULT 10000`. Defaults match the Free-plan marketing copy.
- **Marketing copy** (`apps/teacher/BillingSettings.tsx:13-14,28-29`): Free "Up to 3 classes" / "10,000 AI credits (welcome)"; Pro "Unlimited classes" / "50,000 AI credits/month".
- **All 4 AI edge functions share one chokepoint**: `_shared/edgeHandler.ts:79` calls `softAuthenticate(req)` → `auth = { userId, role, supabase }`. A gate inserted after line 84 (`requireAuth` check) covers `enrich-unit`, `generate-exercises`, `generate-media`, `evaluate-pronunciation` in one place.
- **Class creation has one client chokepoint**: `createClass` at `services/DataService.ts:331-355` (only caller: `apps/teacher/ClassManagement.tsx:54-59`).
- **`subscription-status` returns** `{ tier, credits, customerId, history }` (`subscription-status/index.ts:37-42`) — already the right shape; no field changes needed.
- **`AuthUser` carries no billing fields** (`services/AuthService.ts:8-14`) — `getCurrentUser` selects only `id, email, role, full_name, avatar_url`. To gate the UI, the auth profile needs `subscription_tier` (and optionally `ai_credits_balance`).
- **Stripe webhook bugs confirmed** (`stripe-webhook/index.ts`): line 54 dead `customers.list`; lines 59-62 silent no-op on unstamped `stripe_customer_id`; no event-id idempotency (lines 106-143).

---

## Files this track owns

```
supabase/functions/stripe-webhook/index.ts                              ← P0-4 (EDIT)
supabase/migrations/2026MMDD000005_processed_events_table.sql           ← P0-4(a) idempotency (NEW)
supabase/functions/_shared/credits.ts                                   ← P0-1 NEW helper
supabase/functions/_shared/edgeHandler.ts                               ← P0-1 insert gate call (EDIT — coordinate)
services/billingGate.ts                                                 ← P0-1 NEW client gate
services/DataService.ts                                                 ← P0-1 class-count check in createClass (EDIT)
services/AuthService.ts                                                 ← P0-1 add subscription_tier to AuthUser (EDIT)
apps/teacher/ClassManagement.tsx                                        ← P0-1 surface upgrade prompt (EDIT, minor)
```

**Do NOT touch:** `enrich-unit`, `orchestrate-lesson`, `generate-exercises`, `extract-page`, `_shared/ai.ts`, `subscription-status/index.ts`, `create-checkout`, `customer-portal` (unless P0-4(c) forces it — see below).

---

## STEP 1 — P0-4: Fix Stripe webhook (do first, it's the trust foundation)

### 1a. Idempotency table

**New file:** `supabase/migrations/2026MMDD000005_processed_events_table.sql`

```sql
CREATE TABLE IF NOT EXISTS public.processed_events (
    event_id    TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;
-- Service-role only (webhook writes/reads it). No client policy = no client access.
CREATE POLICY "processed_events_service_only" ON public.processed_events
    FOR ALL USING (false) WITH CHECK (false);
-- Optional retention: index for a future cleanup job.
CREATE INDEX IF NOT EXISTS idx_processed_events_created_at ON public.processed_events(created_at);
```

### 1b. Webhook fixes — `stripe-webhook/index.ts`

Three edits in the `Deno.serve` handler (lines 106-143):

**(i) Idempotency check** — at the top of the `try` block (after `constructEvent`, line 121), before the `switch`:
```ts
const { data: existing } = await supabase
  .from('processed_events').select('event_id').eq('event_id', event.id).maybeSingle();
if (existing) return jsonResponse({ received: true, duplicate: true });
```

**(ii) Resolve userId from customer metadata in `handleSubscriptionUpdate`** (lines 49-63) — delete line 54 (`customers.list`), and instead of the silent `.eq('stripe_customer_id')` no-op, resolve via metadata and upsert by `id`:
```ts
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceIdToTier(priceId);
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || (customer as Stripe.Customer).deleted) return;
  const userId = (customer as Stripe.Customer).metadata?.supabase_user_id;
  if (!userId) return;   // can't resolve — log + skip (matches handleCheckoutComplete's pattern)
  await supabase.from('profiles').update({
    stripe_subscription_id: subscription.id,
    subscription_tier: tier,
  }).eq('id', userId);
}
```
Apply the same metadata-first resolution to `handleSubscriptionDeleted` and `handleInvoicePaid` (they currently `.eq('stripe_customer_id')` and silently no-op). For `handleInvoicePaid`, fall back to `.eq('stripe_customer_id', customerId)` if metadata is missing, but prefer the `id` path.

**(iii) Record event after success** — at the end of the `try` block (before `return jsonResponse({ received: true })`):
```ts
await supabase.from('processed_events').insert({
  event_id: event.id, event_type: event.type
}).then(() => {});   // ignore duplicate-key (it means a parallel redelivery won)
```
Note: because of the UNIQUE PK on `event_id`, a true race across redeliveries throws — that's fine; the winner already processed it. Catch + ignore 23505.

### 1c. P0-4(c) — async tier race

**Decision:** the cleanest fix is for `subscription-status` to reconcile from Stripe when a subscription exists but tier is stale. But that adds a Stripe API call to every status poll and `subscription-status` is rate-limited to 30/min.

**Recommended lighter fix:** `create-checkout` already returns a URL and the client redirects. The issue is only the *post-redirect* poll. Add a `pending` state to the client: after redirect-back, the client polls `subscription-status` up to N times (e.g. 10 × 1.5s); if still `free` but a checkout just completed, show "Finalizing your upgrade…" instead of "failed". This is a `BillingService`/`BillingSettings` client change — **defer to STEP 3 below** to keep this step backend-only. If the owner wants server-side reconciliation instead, that goes in `subscription-status/index.ts` (coordinate — it's lightly touched here).

---

## STEP 2 — P0-1(server): AI credit gate + decrement

### 2a. New helper `supabase/functions/_shared/credits.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const COST: Record<string, number> = {
  'enrich-unit': 200,           // tune — multi-model enrichment
  'generate-exercises': 150,    // tune — large structured output
  'generate-media': 25,         // per image/audio asset
  'evaluate-pronunciation': 5,  // cheap (client STT default)
};

/** Throws if the user is out of credits (or tier-blocked). Returns the cost charged. */
export async function requireCredits(userId: string, fnName: string, costOverride?: number): Promise<number> {
  const cost = costOverride ?? COST[fnName] ?? 10;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await supabase.from('profiles')
    .select('subscription_tier, ai_credits_balance').eq('id', userId).single();
  if (!profile) throw new Error('Not authenticated');
  // Pro tier: skip the balance check (monthly quota enforced server-side elsewhere/Stripe-meters).
  if (profile.subscription_tier === 'pro') return cost;
  if ((profile.ai_credits_balance ?? 0) < cost) {
    throw new Error('Insufficient AI credits. Upgrade to Pro for unlimited generation.');
  }
  // Decrement atomically; guard against going negative.
  const { error } = await supabase.from('profiles')
    .update({ ai_credits_balance: Math.max(0, profile.ai_credits_balance - cost) })
    .eq('id', userId).gte('ai_credits_balance', cost);
  if (error) throw new Error('Failed to debit credits');
  return cost;
}
```

**Atomic-decrement caveat:** the `update ... gte` guard is the race-safe path on Supabase REST. If two concurrent calls both pass the read check, only one `update` matches the `gte` and the other throws — acceptable (caller retries or surfaces "busy"). Document this.

**Better (optional) version:** an RPC `debit_credits(p_user uuid, p_cost int)` with `UPDATE ... WHERE balance >= cost RETURNING balance` — fully atomic. If the pipeline session isn't touching RPCs, add this in the Step-1 migration file instead. **Default:** use the REST `gte` guard to avoid RPC-overlap.

### 2b. Wire the gate into `edgeHandler.ts` (THE single chokepoint)

**Edit `_shared/edgeHandler.ts`** — after the `requireAuth` check (line 84), before `req.json()` (line 86):

```ts
// AI credit gate — only for functions that consume credits.
const CREDIT_COSTING_FUNCTIONS = ['enrich-unit','generate-exercises','generate-media','evaluate-pronunciation'];
if (userId && CREDIT_COSTING_FUNCTIONS.includes(config.name)) {
  try {
    const { requireCredits } = await import('./credits.ts');
    await requireCredits(userId, config.name);
  } catch (e: any) {
    return errorResponse(e.message || 'Credit check failed', 402);   // 402 Payment Required
  }
}
```

**Why a 402:** lets the client distinguish "out of credits" from generic 500s and surface the upgrade prompt precisely. `BillingService.invokeFunction` (`services/BillingService.ts:41-53`) currently throws on any error — update it to detect 402 and throw a typed `InsufficientCreditsError` the UI catches.

**⚠️ Coordination:** `_shared/edgeHandler.ts` is the wrapper the pipeline session *might* also edit. **Before editing, read it fresh** (the audit's line numbers may have drifted). If the pipeline session has it in flight, fall back to plan B: insert the `requireCredits` call at the *top of each of the 4 function handlers* (e.g. `enrich-unit/index.ts:22` right after the existing `if (!auth?.userId)` check). Plan B is 4 edits instead of 1 but zero shared-file conflict.

---

## STEP 3 — P0-1(client): class-count gate + upgrade UX

### 3a. Add `subscription_tier` to the auth profile

**Edit `services/AuthService.ts`** — `AuthUser` interface (lines 8-14): add `subscription_tier: 'free' | 'pro'`. `getCurrentUser` (lines 173-197): add `subscription_tier` to the `profiles.select(...)` call. This flows into `useAppStore.userProfile` automatically, so every component can read `userProfile.subscription_tier`.

### 3b. New client gate `services/billingGate.ts`

```ts
import { getSubscriptionStatus, SubscriptionTier } from './BillingService';

export const FREE_CLASS_LIMIT = 3;

export async function canCreateClass(teacherId: string): Promise<{ allowed: boolean; reason?: string }> {
  const { tier } = await getSubscriptionStatus();
  if (tier === 'pro') return { allowed: true };
  const { supabase } = await import('./supabaseClient');
  const { count } = await supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId);
  if ((count ?? 0) >= FREE_CLASS_LIMIT) {
    return { allowed: false, reason: 'Free plan allows up to 3 classes. Upgrade to Pro for unlimited.' };
  }
  return { allowed: true };
}

export function isPro(tier: SubscriptionTier | undefined): boolean { return tier === 'pro'; }
```

### 3c. Gate `createClass`

**Edit `services/DataService.ts`** `createClass` (lines 331-355) — at the top:
```ts
const { canCreateClass } = await import('./billingGate');
const gate = await canCreateClass(teacherId);
if (!gate.allowed) throw new Error(gate.reason);
```

**Edit `apps/teacher/ClassManagement.tsx`** `handleCreateClass` (lines 51-69) — catch the gate error and surface an upgrade modal/banner instead of a generic toast. Reuse the existing `BillingSettings` modal or a new `<UpgradePrompt reason={...} />`.

### 3d. Surface "insufficient credits" in the AI flows

**Edit `BillingService.invokeFunction`** (lines 41-53) — detect HTTP 402 and throw a typed error. Then in the 2-3 components that call AI functions (textbook upload → `enrich-unit`; publish → `generate-exercises`; asset workshop → `generate-media`), catch `InsufficientCreditsError` and show the upgrade prompt. Don't gate *before* the call (the server is the source of truth); just handle the 402 cleanly.

---

## STEP 4 — Verification

1. **Idempotency:** replay a Stripe test event twice → `processed_events` has 1 row; `billing_history` unchanged on the second.
2. **Subscription update:** trigger `customer.subscription.updated` for a customer *without* a stamped `stripe_customer_id` but *with* `metadata.supabase_user_id` → profile tier updates (previously: silent no-op).
3. **Credit gate:** as a Free user with `ai_credits_balance < cost`, call `generate-media` → 402 with the upgrade message. As Pro → succeeds, no decrement.
4. **Class gate:** as a Free user with 3 classes, `createClass` → throws with the upgrade reason. As Pro → 4th class succeeds.
5. **Auth profile:** after sign-in, `useAppStore.userProfile.subscription_tier` is populated.
6. **Pipeline unaffected:** `get_unit_bundle` / board play / FSRS still work (they don't call the 4 gated functions).

Run `/verify` + the standard probe set.

---

## Coordination with the pipeline session

- **`_shared/edgeHandler.ts` is the one shared file.** Read-before-edit. If in flight there, use Plan B (per-handler gate insertions).
- **`subscription-status/index.ts`** — only touched if we choose server-side tier reconciliation (P0-4c heavier option). Default avoids it.
- **Migrations** — `processed_events` is a new table; no overlap unless the pipeline session also adds tables the same day (coordinate timestamps).
- **Do NOT** gate inside `enrich-unit`/`orchestrate-lesson`/`generate-exercises` bodies — gate at the wrapper (Plan A) or at the handler-entry `auth.userId` check (Plan B), not inside the generation logic the pipeline session owns.

---

## Open questions

1. **Credit costs** — the `COST` table values (200/150/25/5) are guesses; owner should tune against real OpenRouter/ElevenLabs/Pollinations invoices. Flagged as configurable.
2. **Pro-tier monthly quota** — Pro is "50,000/month" but there's no metering reset. Options: (a) Stripe-metered billing, (b) a `credits_reset_at` column + monthly job, (c) ignore the monthly cap for v1 and treat Pro as unlimited. **Default:** (c) for v1, document the gap. Needs owner decision.
3. **P0-4(c) client-poll vs server-reconcile** — defaulted to client-poll; flag if owner prefers server-side.
4. **Atomic debit via RPC vs REST `gte`** — defaulted to REST `gte` to avoid RPC overlap; flag if owner wants the RPC.

---

## Done =

- [ ] STEP 1a migration applied (processed_events)
- [ ] STEP 1b webhook fixed (3 bugs) + redeployed `stripe-webhook`
- [ ] STEP 2a `_shared/credits.ts` created
- [ ] STEP 2b gate wired into edgeHandler (Plan A) OR 4 handlers (Plan B)
- [ ] STEP 3a `AuthUser` carries `subscription_tier`
- [ ] STEP 3b `billingGate.ts` created
- [ ] STEP 3c `createClass` gated + ClassManagement upgrade UX
- [ ] STEP 3d 402 handling in `BillingService` + AI call-site components
- [ ] All 6 verification probes pass
- [ ] Strike through P0-1, P0-4 in `AUDIT_ROADMAP_2026-08-02.md`
