-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — BLOC 4 : préférences utilisateur (propositions adaptées)
-- Supabase → SQL Editor → New query → coller TOUT ce fichier → Run.
-- Rejouable sans risque. À la fin, le résultat doit afficher PREFERENCES-OK.
--
-- Une ligne par compte, alimentée par les recherches et les œuvres gardées.
-- Aucune donnée personnelle : des compteurs par genre, thème, ambiance, langue
-- et type d'œuvre. Le moteur s'en sert pour ajuster les propositions suivantes.
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

-- Preuve d'exécution : le tableau doit afficher PREFERENCES-OK.
select 'PREFERENCES-OK' as resultat,
       to_regclass('public.user_preference_profile')::text as table_preferences;
