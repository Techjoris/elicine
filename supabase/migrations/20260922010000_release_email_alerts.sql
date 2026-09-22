-- Apply after movie_alerts_setup.sql. Existing rows and sent flags are preserved.
begin;
alter table public.user_movie_alerts add column if not exists status text not null default 'active';
-- Legacy setups stored a single alert per (user_id, movie_id), which makes a film and a
-- series sharing a TMDB id impossible to follow separately. Drop that constraint whatever
-- its name, then enforce identity on (user_id, movie_id, media_type).
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
-- Normalise legacy media types so the identity index below can never miss a duplicate.
update public.user_movie_alerts
set media_type = case when upper(coalesce(media_type, '')) in ('TV', 'SÉRIE', 'SERIE', 'SERIES') then 'tv' else 'movie' end
where media_type is distinct from 'movie' and media_type is distinct from 'tv';
alter table public.user_movie_alerts alter column media_type set default 'movie';
alter table public.user_movie_alerts alter column media_type set not null;
create unique index if not exists release_alert_identity on public.user_movie_alerts(user_id, movie_id, media_type);
create index if not exists release_alert_due on public.user_movie_alerts(status, release_date);

-- Clients cannot forge Pro status or reset delivery flags through PostgREST.
revoke all on public.user_movie_alerts from anon, authenticated;
grant select on public.user_movie_alerts to authenticated;
drop policy if exists "Users can read own movie alerts" on public.user_movie_alerts;
drop policy if exists "Users can insert own movie alerts" on public.user_movie_alerts;
drop policy if exists "Users can delete own movie alerts" on public.user_movie_alerts;
create policy "Users can read own movie alerts" on public.user_movie_alerts for select to authenticated using (user_id = auth.uid()::text);

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

create or replace function public.subscribe_release_alert(p_user_id text, p_email text, p_movie_id bigint, p_media_type text, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.user_movie_alerts;
begin
  -- Serialise subscriptions per account, including concurrent quota checks.
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
  -- to_jsonb() on a NULL composite returns an object full of nulls, which would look like a
  -- successful claim to the caller: return a real SQL NULL instead.
  if result.id is null then return null; end if;
  return to_jsonb(result);
end $$;
revoke all on function public.subscribe_release_alert(text,text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_release_email(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.subscribe_release_alert(text,text,bigint,text,jsonb) to service_role;
grant execute on function public.claim_release_email(uuid,text,uuid,jsonb) to service_role;
commit;
