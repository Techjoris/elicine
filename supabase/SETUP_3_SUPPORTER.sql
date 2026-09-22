-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — BLOC 3/3 : soutiens ponctuels « Eliciné Supporter » (Paddle)
-- Supabase → SQL Editor → New query → coller TOUT ce fichier → Run.
-- Rejouable sans risque. À la fin, le résultat doit afficher SUPPORTER-OK.
-- Ce bloc ne touche jamais au Pass Pro (is_pro).
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists is_supporter boolean not null default false;
alter table public.profiles add column if not exists supporter_total_cents integer not null default 0;
alter table public.profiles add column if not exists supporter_last_amount_cents integer;
alter table public.profiles add column if not exists supporter_last_at timestamptz;

create table if not exists public.supporter_contributions (
  event_id text primary key,
  transaction_id text,
  user_id text,
  email text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EUR',
  product_type text not null default 'elicine_supporter',
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists supporter_contributions_email on public.supporter_contributions(lower(email));
alter table public.supporter_contributions enable row level security;
revoke all on public.supporter_contributions from anon, authenticated;
grant all on public.supporter_contributions to service_role;

-- Journal d'idempotence des webhooks Paddle (anti double traitement).
create table if not exists public.paddle_webhook_events (
  event_id text primary key,
  event_type text,
  subscription_id text,
  transaction_id text,
  customer_id text,
  occurred_at timestamptz,
  payload_hash text,
  processed_at timestamptz not null default now(),
  status text not null default 'processed',
  created_at timestamptz not null default now()
);
alter table public.paddle_webhook_events enable row level security;
revoke all on public.paddle_webhook_events from anon, authenticated;
grant all on public.paddle_webhook_events to service_role;

create or replace function public.record_supporter_contribution(
  p_event_id text,
  p_email text,
  p_user_id text,
  p_amount_cents integer,
  p_currency text,
  p_transaction_id text,
  p_occurred_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inserted public.supporter_contributions; touched integer := 0;
begin
  if coalesce(trim(p_event_id), '') = '' then raise exception 'SUPPORTER_EVENT_REQUIRED'; end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'SUPPORTER_AMOUNT_INVALID'; end if;

  insert into public.supporter_contributions(event_id, transaction_id, user_id, email, amount_cents, currency, occurred_at)
  values (p_event_id, p_transaction_id, nullif(trim(coalesce(p_user_id, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
          p_amount_cents, coalesce(nullif(upper(trim(coalesce(p_currency, ''))), ''), 'EUR'), coalesce(p_occurred_at, now()))
  on conflict (event_id) do nothing
  returning * into inserted;

  if inserted.event_id is null then
    return jsonb_build_object('recorded', false, 'duplicate', true);
  end if;

  update public.profiles
  set is_supporter = true,
      supporter_total_cents = coalesce(supporter_total_cents, 0) + p_amount_cents,
      supporter_last_amount_cents = p_amount_cents,
      supporter_last_at = coalesce(p_occurred_at, now()),
      updated_at = now()
  where (p_user_id is not null and trim(p_user_id) <> '' and id::text = trim(p_user_id))
     or (p_email is not null and trim(p_email) <> '' and lower(email) = lower(trim(p_email)));
  get diagnostics touched = row_count;

  return jsonb_build_object('recorded', true, 'profilesUpdated', touched, 'amountCents', p_amount_cents);
end $$;
revoke all on function public.record_supporter_contribution(text,text,text,integer,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_supporter_contribution(text,text,text,integer,text,text,timestamptz) to service_role;

-- Preuve d'exécution : le tableau doit afficher SUPPORTER-OK.
select 'SUPPORTER-OK' as resultat,
       to_regclass('public.supporter_contributions')::text as table_soutiens,
       to_regclass('public.paddle_webhook_events')::text as table_webhooks;
