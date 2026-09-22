-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Paddle Billing subscription mapping and webhook idempotency
-- Run this migration in the production Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. The production database is expected to contain this table. Create it if it
--    was never applied, then add the Paddle identifiers used by the webhook.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  customer_name TEXT,
  phone TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  currency TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_reference TEXT,
  payment_provider TEXT DEFAULT 'paddle',
  terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_status TEXT,
  ADD COLUMN IF NOT EXISTS paddle_last_event_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_event_at TIMESTAMPTZ;

-- 2. Paddle can send active, trialing, past_due and canceled. The historical
--    table check only allowed the SASPay vocabulary; replace it without
--    altering the existing rows.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending_payment', 'active', 'trialing', 'past_due', 'cancelled', 'canceled', 'expired', 'paused'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON public.subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_customer ON public.subscriptions(paddle_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paddle_subscription
  ON public.subscriptions(paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

-- 3. Durable idempotency for Paddle events. Only the service role needs access;
--    no public policy is created, so customer payloads stay private.
CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subscription_id TEXT,
  transaction_id TEXT,
  customer_id TEXT,
  occurred_at TIMESTAMPTZ,
  payload_hash TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  status TEXT NOT NULL DEFAULT 'processed'
);

ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.paddle_webhook_events TO service_role;
GRANT ALL ON public.subscriptions TO service_role;

-- 4. Useful production checks after applying the migration:
-- SELECT id, email, status, paddle_subscription_id, paddle_customer_id, expires_at
-- FROM public.subscriptions WHERE payment_provider = 'paddle'
-- ORDER BY updated_at DESC LIMIT 20;
--
-- SELECT event_id, event_type, subscription_id, processed_at
-- FROM public.paddle_webhook_events ORDER BY processed_at DESC LIMIT 20;
