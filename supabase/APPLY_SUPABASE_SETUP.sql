-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — CONFIGURATION BACKEND, À EXÉCUTER EN UNE SEULE FOIS
-- Supabase → SQL Editor → New query → coller → Run.
-- Contient : alertes de sortie (J-2 / jour J) + historique de recherche par compte.
-- Rejouable sans risque : tout est en CREATE IF NOT EXISTS / CREATE OR REPLACE.
-- Contenu = movie_alerts_setup.sql + 20260922010000_release_email_alerts.sql
--           + la table user_search_history (historique rattaché au compte).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Création de la table user_movie_alerts
CREATE TABLE IF NOT EXISTS public.user_movie_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  movie_id BIGINT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  media_type TEXT DEFAULT 'movie',
  overview TEXT,
  notified_j_minus_2 BOOLEAN DEFAULT FALSE,
  notified_release_day BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_movie_alert UNIQUE (user_id, movie_id)
);

-- 2. Index de performance pour les requêtes quotidiennes du Cron et la navigation utilisateur
CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_release_date
  ON public.user_movie_alerts(release_date);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_user_id
  ON public.user_movie_alerts(user_id);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_email
  ON public.user_movie_alerts(email);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_j2
  ON public.user_movie_alerts(release_date, notified_j_minus_2);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_day
  ON public.user_movie_alerts(release_date, notified_release_day);

-- 3. Activation de Row Level Security (RLS)
ALTER TABLE public.user_movie_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can read own movie alerts"
  ON public.user_movie_alerts
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
    OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS "Users can insert own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can insert own movie alerts"
  ON public.user_movie_alerts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
  );

DROP POLICY IF EXISTS "Users can delete own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can delete own movie alerts"
  ON public.user_movie_alerts
  FOR DELETE
  USING (
    user_id = auth.uid()::text
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
    OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS "Service role full access on movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Service role full access on movie alerts"
  ON public.user_movie_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Un même identifiant TMDB peut désigner un film et une série : l'identité d'une alerte
--    devient (user_id, movie_id, media_type). On retire l'ancienne contrainte quel que soit son nom.
begin;
alter table public.user_movie_alerts add column if not exists status text not null default 'active';
do $$
declare item record;
begin
  for item in
    select con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'user_movie_alerts' and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) = array['movie_id', 'user_id']
  loop
    execute format('alter table public.user_movie_alerts drop constraint %I', item.name);
  end loop;

  for item in
    select idx.relname as name
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_class rel on rel.oid = i.indrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'user_movie_alerts'
      and i.indisunique and i.indpred is null and i.indexprs is null
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(i.indkey::smallint[]) as k(attnum)
        join pg_attribute att on att.attrelid = i.indrelid and att.attnum = k.attnum
      ) = array['movie_id', 'user_id']
  loop
    execute format('drop index if exists public.%I', item.name);
  end loop;
end $$;
update public.user_movie_alerts
set media_type = case when upper(coalesce(media_type, '')) in ('TV', 'SÉRIE', 'SERIE', 'SERIES') then 'tv' else 'movie' end
where media_type is distinct from 'movie' and media_type is distinct from 'tv';
alter table public.user_movie_alerts alter column media_type set default 'movie';
alter table public.user_movie_alerts alter column media_type set not null;
create unique index if not exists release_alert_identity on public.user_movie_alerts(user_id, movie_id, media_type);
create index if not exists release_alert_due on public.user_movie_alerts(status, release_date);

-- 5. Les clients ne peuvent ni forger un statut Pro ni réarmer un envoi depuis PostgREST.
revoke all on public.user_movie_alerts from anon, authenticated;
grant select on public.user_movie_alerts to authenticated;
drop policy if exists "Users can read own movie alerts" on public.user_movie_alerts;
drop policy if exists "Users can insert own movie alerts" on public.user_movie_alerts;
drop policy if exists "Users can delete own movie alerts" on public.user_movie_alerts;
create policy "Users can read own movie alerts" on public.user_movie_alerts for select to authenticated using (user_id = auth.uid()::text);

-- 6. Journal des envois : un jalon ne peut être réservé qu'une fois par alerte.
create table if not exists public.release_email_deliveries (
  id uuid primary key,
  alert_id uuid not null references public.user_movie_alerts(id),
  milestone text not null check (milestone in ('j_minus_2','release_day')),
  status text not null default 'sending' check (status in ('sending','accepted','delivered','failed','unknown')),
  payload jsonb not null,
  provider_id text,
  provider_status text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(alert_id, milestone)
);
alter table public.release_email_deliveries enable row level security;
revoke all on public.release_email_deliveries from anon, authenticated;
grant all on public.release_email_deliveries to service_role;
create index if not exists release_email_pending on public.release_email_deliveries(status, updated_at);

-- 7. Fonctions appelées par l'API (service_role uniquement).
create or replace function public.subscribe_release_alert(p_user_id text, p_email text, p_movie_id bigint, p_media_type text, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.user_movie_alerts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
  if (select count(*) from public.user_movie_alerts where user_id = p_user_id and status = 'active') >= 100
    and not exists(select 1 from public.user_movie_alerts where user_id = p_user_id and movie_id = p_movie_id and media_type = p_media_type and status = 'active') then
    raise exception 'ALERT_LIMIT_REACHED';
  end if;
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
  -- to_jsonb() sur une ligne absente renvoie un objet rempli de null : renvoyer un vrai NULL.
  if result.id is null then return null; end if;
  return to_jsonb(result);
end $$;
revoke all on function public.subscribe_release_alert(text,text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_release_email(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.subscribe_release_alert(text,text,bigint,text,jsonb) to service_role;
grant execute on function public.claim_release_email(uuid,text,uuid,jsonb) to service_role;
commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Historique de recherche rattaché au compte (et non à l'appareil).
--    L'appareil n'est plus qu'un affichage : se connecter ailleurs retrouve l'historique.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.user_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id <> ''),
  query text not null check (char_length(query) between 1 and 300),
  -- Clé de dédoublonnage : relancer la même recherche la remonte au lieu de la dupliquer.
  query_key text not null check (char_length(query_key) between 1 and 300),
  results_count integer not null default 0 check (results_count >= 0),
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, query_key)
);

create index if not exists user_search_history_recent
  on public.user_search_history(user_id, updated_at desc);

alter table public.user_search_history enable row level security;
revoke all on public.user_search_history from anon, authenticated;
grant select, insert, update, delete on public.user_search_history to authenticated;
grant all on public.user_search_history to service_role;

drop policy if exists "Members read their own search history" on public.user_search_history;
create policy "Members read their own search history"
  on public.user_search_history for select
  to authenticated using (user_id = auth.uid()::text);

drop policy if exists "Members insert their own search history" on public.user_search_history;
create policy "Members insert their own search history"
  on public.user_search_history for insert
  to authenticated with check (user_id = auth.uid()::text);

drop policy if exists "Members update their own search history" on public.user_search_history;
create policy "Members update their own search history"
  on public.user_search_history for update
  to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "Members delete their own search history" on public.user_search_history;
create policy "Members delete their own search history"
  on public.user_search_history for delete
  to authenticated using (user_id = auth.uid()::text);

drop policy if exists "Service role full access on search history" on public.user_search_history;
create policy "Service role full access on search history"
  on public.user_search_history for all
  to service_role using (true) with check (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Produit Paddle « Eliciné Supporter » : soutiens ponctuels, jamais un Pass Pro.
--    Le statut Supporter est porté par le profil utilisateur.
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists is_supporter boolean not null default false;
alter table public.profiles add column if not exists supporter_total_cents integer not null default 0;
alter table public.profiles add column if not exists supporter_last_amount_cents integer;
alter table public.profiles add column if not exists supporter_last_at timestamptz;

-- Journal des soutiens : la clé primaire est l'identifiant d'événement Paddle, ce qui rend
-- un rejeu de webhook strictement sans effet (aucun double comptage).
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

-- Journal d'idempotence des webhooks Paddle (abonnements Pro et soutiens Supporter).
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

  -- Événement déjà comptabilisé : on ne crédite pas une seconde fois.
  if inserted.event_id is null then
    return jsonb_build_object('recorded', false, 'duplicate', true);
  end if;

  -- Le statut Supporter est indépendant du Pass Pro : is_pro n'est jamais touché ici.
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

-- 10. Contrôle : ces tables doivent apparaître dans le résultat.
-- ══════════════════════════════════════════════════════════════════════════════
-- 11. Préférences utilisateur : les propositions des recherches suivantes
--     s'appuient sur les goûts déjà exprimés (recherches, œuvres gardées).
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.user_preference_profile (
  user_id text primary key check (user_id <> ''),
  genres jsonb not null default '{}'::jsonb,
  themes jsonb not null default '{}'::jsonb,
  moods jsonb not null default '{}'::jsonb,
  languages jsonb not null default '{}'::jsonb,
  media_types jsonb not null default '{}'::jsonb,
  searches integer not null default 0 check (searches >= 0),
  signals integer not null default 0 check (signals >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_preference_profile_recent
  on public.user_preference_profile(updated_at desc);

alter table public.user_preference_profile enable row level security;
revoke all on public.user_preference_profile from anon, authenticated;
grant select, insert, update, delete on public.user_preference_profile to authenticated;
grant all on public.user_preference_profile to service_role;

drop policy if exists "Members read their own preferences" on public.user_preference_profile;
drop policy if exists "Members insert their own preferences" on public.user_preference_profile;
drop policy if exists "Members update their own preferences" on public.user_preference_profile;
drop policy if exists "Members delete their own preferences" on public.user_preference_profile;
drop policy if exists "Service role full access on preferences" on public.user_preference_profile;

create policy "Members read their own preferences" on public.user_preference_profile
  for select to authenticated using (user_id = auth.uid()::text);
create policy "Members insert their own preferences" on public.user_preference_profile
  for insert to authenticated with check (user_id = auth.uid()::text);
create policy "Members update their own preferences" on public.user_preference_profile
  for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "Members delete their own preferences" on public.user_preference_profile
  for delete to authenticated using (user_id = auth.uid()::text);
create policy "Service role full access on preferences" on public.user_preference_profile
  for all to service_role using (true) with check (true);

-- 12. Contrôle : ces tables doivent apparaître dans le résultat.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('user_movie_alerts', 'release_email_deliveries', 'user_search_history',
                     'supporter_contributions', 'paddle_webhook_events', 'user_preference_profile')
order by table_name;
