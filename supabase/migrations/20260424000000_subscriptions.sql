-- 1. Add Stripe & Billing Columns to Profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS ai_credits_balance INTEGER DEFAULT 10000; -- 10k free welcome credits

-- 2. Create Billing Cycles / Subscriptions Log (Optional but good for history)
CREATE TABLE IF NOT EXISTS public.billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_invoice_id TEXT UNIQUE,
    amount_paid INTEGER NOT NULL, -- in cents
    currency TEXT DEFAULT 'usd',
    billing_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own billing history"
    ON public.billing_history FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

CREATE POLICY "Service role can insert billing history"
    ON public.billing_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.billing_history TO authenticated, service_role;
