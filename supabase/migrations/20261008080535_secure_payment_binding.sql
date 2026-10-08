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
  CHECK (status IN ('pending_payment', 'active', 'trialing', 'past_due', 'cancelled', 'canceled', 'expired', 'paused', 'failed'));

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

-- Called only after server-side verification of the exact gateway session and price.
create table if not exists public.saspay_payment_events (
  payment_reference text primary key, subscription_id text not null,
  user_id uuid not null, processed_at timestamptz not null default now()
);
alter table public.saspay_payment_events enable row level security;
revoke all on public.saspay_payment_events from public, anon, authenticated;
grant all on public.saspay_payment_events to service_role;

create or replace function public.complete_saspay_subscription(p_subscription_id text, p_payment_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sub public.subscriptions; profile public.profiles; end_at timestamptz; inserted integer;
begin
  select * into sub from public.subscriptions where id=p_subscription_id for update;
  if sub.id is null or sub.payment_reference is distinct from p_payment_reference
    or sub.payment_provider is distinct from 'saspay' then raise exception 'PAYMENT_BINDING_INVALID'; end if;
  if sub.status='active' then return jsonb_build_object('activated',false,'duplicate',true,'expiresAt',sub.expires_at); end if;
  if sub.status<>'pending_payment' then raise exception 'PAYMENT_STATUS_INVALID'; end if;
  select p.* into profile from public.profiles p join auth.users u on u.id=p.id
    where p.id::text=sub.user_id and u.email_confirmed_at is not null for update of p;
  if profile.id is null then raise exception 'PAYMENT_ACCOUNT_INVALID'; end if;
  insert into public.saspay_payment_events(payment_reference,subscription_id,user_id)
    values(p_payment_reference,sub.id,profile.id) on conflict(payment_reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted=0 then raise exception 'PAYMENT_REFERENCE_ALREADY_USED'; end if;
  if profile.is_pro=true and profile.expires_at is null then end_at:=null;
  else end_at:=greatest(now(),coalesce(profile.expires_at,now())) +
    case when sub.plan='yearly' then interval '365 days' else interval '30 days' end;
  end if;
  update public.profiles set is_pro=true,expires_at=end_at,updated_at=now() where id=profile.id;
  update public.subscriptions set status='active',expires_at=end_at,updated_at=now() where id=sub.id;
  return jsonb_build_object('activated',true,'duplicate',false,'expiresAt',end_at);
end $$;
revoke all on function public.complete_saspay_subscription(text,text) from public, anon, authenticated;
grant execute on function public.complete_saspay_subscription(text,text) to service_role;

alter table public.subscriptions enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='subscriptions' loop
    execute format('drop policy %I on public.subscriptions',p.policyname);
  end loop;
end $$;
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
drop policy if exists "Members read their own protected subscriptions" on public.subscriptions;
create policy "Members read their own protected subscriptions" on public.subscriptions
  for select to authenticated using (user_id=(select auth.uid())::text);

-- Sensitive APIs also reject access tokens whose refresh session has been revoked.
create or replace function public.is_active_auth_session(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id
    and (not_after is null or not_after>now()));
$$;
revoke all on function public.is_active_auth_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_active_auth_session(uuid,uuid) to service_role;
