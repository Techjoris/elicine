-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — BLOC 2/3 : historique de recherche rattaché au compte
-- Supabase → SQL Editor → New query → coller TOUT ce fichier → Run.
-- Rejouable sans risque. À la fin, le résultat doit afficher HISTORIQUE-OK.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.user_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (user_id <> ''),
  query text not null check (char_length(query) between 1 and 300),
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
drop policy if exists "Members insert their own search history" on public.user_search_history;
drop policy if exists "Members update their own search history" on public.user_search_history;
drop policy if exists "Members delete their own search history" on public.user_search_history;
drop policy if exists "Service role full access on search history" on public.user_search_history;

create policy "Members read their own search history" on public.user_search_history
  for select to authenticated using (user_id = auth.uid()::text);
create policy "Members insert their own search history" on public.user_search_history
  for insert to authenticated with check (user_id = auth.uid()::text);
create policy "Members update their own search history" on public.user_search_history
  for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "Members delete their own search history" on public.user_search_history
  for delete to authenticated using (user_id = auth.uid()::text);
create policy "Service role full access on search history" on public.user_search_history
  for all to service_role using (true) with check (true);

-- Preuve d'exécution : le tableau doit afficher HISTORIQUE-OK.
select 'HISTORIQUE-OK' as resultat,
       to_regclass('public.user_search_history')::text as table_historique;
