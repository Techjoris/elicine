-- Account entitlements are managed only by trusted database/server roles.
-- Clients can read their own profile; no Auth metadata or email grants privileges.
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles enable row level security;
drop trigger if exists tr_assign_admin_role on public.profiles;
drop function if exists public.handle_admin_role_assignment();

do $$
declare p record; c record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
  -- Also remove any legacy column grants, which survive table-level REVOKE.
  for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' loop
    execute format('revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.profiles from public, anon, authenticated', c.column_name);
  end loop;
end $$;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy "Members read their own protected profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Auth's trigger can still create profiles, but it cannot be invoked through the API.
do $$ begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke all on function public.handle_new_user() from public, anon, authenticated;
  end if;
end $$;

-- Some environments have no subscriptions table. When present, it is server-write-only.
do $$
declare p record; c record;
begin
  if to_regclass('public.subscriptions') is not null then
    alter table public.subscriptions enable row level security;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'subscriptions' loop
      execute format('drop policy %I on public.subscriptions', p.policyname);
    end loop;
    for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' loop
      execute format('revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.subscriptions from public, anon, authenticated', c.column_name);
    end loop;
    revoke all on public.subscriptions from public, anon, authenticated;
    grant select on public.subscriptions to authenticated;
    grant all on public.subscriptions to service_role;
    create policy "Members read their own protected subscriptions" on public.subscriptions
      for select to authenticated using (user_id::text = (select auth.uid())::text);
  end if;
end $$;
