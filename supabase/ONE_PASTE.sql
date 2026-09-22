-- ÉLICINÉ — TOUT LE SCHÉMA EN UN SEUL COLLAGE.
-- SQL Editor → New query → Ctrl+V → cliquer DANS la zone → Ctrl+A → Run.
-- Résultat attendu en bas : ELICINE-OK | nb_tables = 5 | nb_fonctions = 3
-- Rejouable sans risque ; ne touche jamais au Pass Pro.

-- 1. Alertes de sortie
create table if not exists public.user_movie_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null, email text not null, movie_id bigint not null, movie_title text not null,
  poster_path text, backdrop_path text, release_date date, media_type text default 'movie', overview text,
  notified_j_minus_2 boolean default false, notified_release_day boolean default false,
  status text not null default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.user_movie_alerts add column if not exists status text not null default 'active';
update public.user_movie_alerts set media_type = 'movie' where media_type is null or media_type = '';
alter table public.user_movie_alerts alter column media_type set not null;
create unique index if not exists release_alert_identity on public.user_movie_alerts(user_id, movie_id, media_type);
create index if not exists release_alert_due on public.user_movie_alerts(status, release_date);
alter table public.user_movie_alerts enable row level security;
revoke all on public.user_movie_alerts from anon, authenticated;
grant select on public.user_movie_alerts to authenticated;
grant all on public.user_movie_alerts to service_role;
drop policy if exists "Users can read own movie alerts" on public.user_movie_alerts;
create policy "Users can read own movie alerts" on public.user_movie_alerts
  for select to authenticated using (user_id = auth.uid()::text);

create table if not exists public.release_email_deliveries (
  id uuid primary key,
  alert_id uuid not null references public.user_movie_alerts(id),
  milestone text not null check (milestone in ('j_minus_2','release_day')),
  status text not null default 'sending' check (status in ('sending','accepted','delivered','failed','unknown')),
  payload jsonb not null, provider_id text, provider_status text, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(alert_id, milestone)
);
alter table public.release_email_deliveries enable row level security;
revoke all on public.release_email_deliveries from anon, authenticated;
grant all on public.release_email_deliveries to service_role;

-- 2. Historique de recherche par compte
create table if not exists public.user_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null, query text not null, query_key text not null,
  results_count integer not null default 0, mood text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, query_key)
);
create index if not exists user_search_history_recent on public.user_search_history(user_id, updated_at desc);
alter table public.user_search_history enable row level security;
revoke all on public.user_search_history from anon, authenticated;
grant select, insert, update, delete on public.user_search_history to authenticated;
grant all on public.user_search_history to service_role;
drop policy if exists "Members read their own search history" on public.user_search_history;
drop policy if exists "Members write their own search history" on public.user_search_history;
create policy "Members read their own search history" on public.user_search_history
  for select to authenticated using (user_id = auth.uid()::text);
create policy "Members write their own search history" on public.user_search_history
  for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- 3. Soutiens ponctuels « Eliciné Supporter » (jamais un Pass Pro)
alter table public.profiles add column if not exists is_supporter boolean not null default false;
alter table public.profiles add column if not exists supporter_total_cents integer not null default 0;
alter table public.profiles add column if not exists supporter_last_amount_cents integer;
alter table public.profiles add column if not exists supporter_last_at timestamptz;

create table if not exists public.supporter_contributions (
  event_id text primary key, transaction_id text, user_id text, email text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EUR',
  product_type text not null default 'elicine_supporter',
  occurred_at timestamptz, created_at timestamptz not null default now()
);
alter table public.supporter_contributions enable row level security;
revoke all on public.supporter_contributions from anon, authenticated;
grant all on public.supporter_contributions to service_role;

create table if not exists public.paddle_webhook_events (
  event_id text primary key, event_type text, subscription_id text, transaction_id text, customer_id text,
  occurred_at timestamptz, payload_hash text,
  processed_at timestamptz not null default now(), status text not null default 'processed',
  created_at timestamptz not null default now()
);
alter table public.paddle_webhook_events enable row level security;
revoke all on public.paddle_webhook_events from anon, authenticated;
grant all on public.paddle_webhook_events to service_role;

-- 4. Fonctions appelées par l'API (service_role uniquement)
create or replace function public.subscribe_release_alert(p_user_id text, p_email text, p_movie_id bigint, p_media_type text, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.user_movie_alerts;
begin
  insert into public.user_movie_alerts(user_id,email,movie_id,media_type,movie_title,release_date,poster_path,backdrop_path,overview,status)
  values(p_user_id,p_email,p_movie_id,p_media_type,p_details->>'movie_title',(p_details->>'release_date')::date,p_details->>'poster_path',p_details->>'backdrop_path',p_details->>'overview','active')
  on conflict(user_id,movie_id,media_type) do update set status='active', email=excluded.email,
    release_date=excluded.release_date, movie_title=excluded.movie_title, updated_at=now()
  returning * into result;
  return to_jsonb(result);
end $$;

create or replace function public.claim_release_email(p_alert_id uuid, p_milestone text, p_delivery_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare alert public.user_movie_alerts; result public.release_email_deliveries;
begin
  select * into alert from public.user_movie_alerts where id=p_alert_id for update;
  if not found or alert.status <> 'active' then return null; end if;
  if (p_milestone='j_minus_2' and alert.notified_j_minus_2) or (p_milestone='release_day' and alert.notified_release_day) then return null; end if;
  insert into public.release_email_deliveries(id,alert_id,milestone,payload)
  values(p_delivery_id,p_alert_id,p_milestone,p_payload)
  on conflict(alert_id,milestone) do nothing returning * into result;
  if result.id is null then return null; end if;
  return to_jsonb(result);
end $$;

create or replace function public.record_supporter_contribution(
  p_event_id text, p_email text, p_user_id text, p_amount_cents integer,
  p_currency text, p_transaction_id text, p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inserted public.supporter_contributions; touched integer := 0;
begin
  if coalesce(trim(p_event_id), '') = '' then raise exception 'SUPPORTER_EVENT_REQUIRED'; end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'SUPPORTER_AMOUNT_INVALID'; end if;
  insert into public.supporter_contributions(event_id, transaction_id, user_id, email, amount_cents, currency, occurred_at)
  values (p_event_id, p_transaction_id, nullif(trim(coalesce(p_user_id,'')),''), nullif(trim(coalesce(p_email,'')),''),
          p_amount_cents, coalesce(nullif(upper(trim(coalesce(p_currency,''))),''),'EUR'), coalesce(p_occurred_at, now()))
  on conflict (event_id) do nothing returning * into inserted;
  if inserted.event_id is null then return jsonb_build_object('recorded', false, 'duplicate', true); end if;
  update public.profiles
  set is_supporter = true,
      supporter_total_cents = coalesce(supporter_total_cents, 0) + p_amount_cents,
      supporter_last_amount_cents = p_amount_cents,
      supporter_last_at = coalesce(p_occurred_at, now()), updated_at = now()
  where (p_user_id is not null and trim(p_user_id) <> '' and id::text = trim(p_user_id))
     or (p_email is not null and trim(p_email) <> '' and lower(email) = lower(trim(p_email)));
  get diagnostics touched = row_count;
  return jsonb_build_object('recorded', true, 'profilesUpdated', touched, 'amountCents', p_amount_cents);
end $$;

revoke all on function public.subscribe_release_alert(text,text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_release_email(uuid,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.record_supporter_contribution(text,text,text,integer,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.subscribe_release_alert(text,text,bigint,text,jsonb) to service_role;
grant execute on function public.claim_release_email(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.record_supporter_contribution(text,text,text,integer,text,text,timestamptz) to service_role;

-- 5. Preuve : doit afficher ELICINE-OK, nb_tables = 5, nb_fonctions = 3
select 'ELICINE-OK' as resultat,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in
      ('user_movie_alerts','release_email_deliveries','user_search_history','supporter_contributions','paddle_webhook_events')) as nb_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('subscribe_release_alert','claim_release_email','record_supporter_contribution')) as nb_fonctions;
