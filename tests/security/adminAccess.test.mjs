import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { verifyAccountSession } from '../../api/_account-access.js';
import { verifyServerSession } from '../../api/_security.js';
import { createAdminHandler } from '../../api/admin.js';
import activatePro from '../../api/activate-pro.js';
import { readAccountAccess } from '../../src/services/accountAccessService.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const ADMIN = '22222222-2222-2222-2222-222222222222';
function database({ admin = false, failure = false, missing = false, email = 'member@example.com', expiry = null } = {}) {
  const state = { writes: 0, admin, lookups: [], email };
  const db = {
    auth: { getUser: async token => token === 'valid-token'
      ? { data: { user: { id: USER, email, user_metadata: { role: 'admin', is_admin: true, is_pro: true } } } }
      : { data: {}, error: { message: 'invalid' } } },
    from(table) {
      let targetId;
      const query = {
        select() { return this; },
        eq(key, value) { state.lookups.push([table, key, value]); if (key === 'id') targetId = value; return this; },
        maybeSingle: async () => ({ error: failure ? { message: 'unavailable' } : null,
          data: missing ? null : { id: targetId || USER, email, is_admin: state.admin, is_pro: false, expires_at: expiry } }),
        update() { state.writes++; return this; },
        delete() { state.writes++; return this; },
        limit: async () => ({ data: [{ id: USER, email, is_admin: state.admin, is_pro: false }] }),
        then(resolve) { return Promise.resolve({ data: [], error: failure ? {} : null }).then(resolve); }
      };
      return query;
    }
  };
  return { db, state };
}
const response = () => ({ statusCode: 0, setHeader() {}, status(n) { this.statusCode = n; return this; },
  json(body) { this.body = body; return this; }, end() { return this; } });

test('email, user metadata, caller identity and legacy admin secrets never authorize', async () => {
  for (const email of ['member@example.com', 'ivanjoris959@gmail.com', 'techjoris@gmail.com']) {
    const { db, state } = database({ email });
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      for (const token of [null, 'forged-token', 'valid-token']) {
        const req = { method, headers: { 'x-admin-secret': 'elicine2026', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          query: { email: 'ivanjoris959@gmail.com', userId: ADMIN }, body: { userId: ADMIN, role: 'admin', is_admin: true, isPro: true } };
        const res = response();
        await createAdminHandler(db)(req, res);
        assert.equal(res.statusCode, token === 'valid-token' ? 403 : 401);
        const session = await verifyServerSession(req, db);
        assert.equal(session.isAdmin, false);
        assert.equal(session.isPro, false);
        assert.equal(session.isBypassQuotas, false);
      }
    }
    assert.equal(state.writes, 0);
    assert.ok(state.lookups.every(([, key, value]) => key === 'id' && value === USER));
  }
});

test('current database permission grants admin and revocation takes effect on the next request', async () => {
  const { db, state } = database({ admin: true });
  const req = { method: 'GET', headers: { authorization: 'Bearer valid-token' } };
  const granted = response();
  await createAdminHandler(db)(req, granted);
  assert.equal(granted.statusCode, 200);
  assert.equal((await verifyAccountSession(req, db)).isAdmin, true);
  state.admin = false;
  const revoked = response();
  await createAdminHandler(db)(req, revoked);
  assert.equal(revoked.statusCode, 403);
});

test('missing profile, database error or missing database fails closed', async () => {
  const req = { method: 'PATCH', headers: { authorization: 'Bearer valid-token' }, body: { userId: ADMIN, isPro: true } };
  for (const options of [{ missing: true }, { failure: true }]) {
    const { db, state } = database(options);
    const res = response();
    await createAdminHandler(db)(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(state.writes, 0);
  }
  assert.equal((await verifyAccountSession(req, null)).isAdmin, false);
});

test('even an administrator cannot grant admin through the user management API', async () => {
  const { db, state } = database({ admin: true });
  for (const body of [{ role: 'admin' }, { is_admin: true }, { isAdmin: true }]) {
    const res = response();
    await createAdminHandler(db)({ method: 'PATCH', headers: { authorization: 'Bearer valid-token' }, body: { userId: ADMIN, ...body } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(state.writes, 0);
});

test('status, cron and thank-you routes reject forged founder and activation requests', async () => {
  for (const [action, expected] of [['check-status', 401], ['cron', 401], ['thank-you-email', 403]]) {
    const res = response();
    await activatePro({ method: action === 'thank-you-email' ? 'POST' : 'GET', headers: {}, query: { action },
      body: { email: 'ivanjoris959@gmail.com', isPro: true, plan: 'yearly' } }, res);
    assert.equal(res.statusCode, expected);
  }
});

test('browser entitlements come only from a matching protected profile', async () => {
  // Inject the transport without granting authority to local Auth metadata.
  const { db } = database({ admin: true });
  assert.equal((await readAccountAccess(USER, db)).is_admin, true);
  const denied = database({ missing: true }).db;
  assert.deepEqual(await readAccountAccess(USER, denied), { role: 'user', is_admin: false, isPro: false, expires_at: null });
});

for (const subscriptions of [false, true]) {
  test(`PostgreSQL: profile write denial, forged metadata, signup and subscriptions=${subscriptions}`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
        create table auth.users(id uuid primary key, email text);
        create table public.profiles(id uuid primary key, email text, is_pro boolean default false, expires_at timestamptz, updated_at timestamptz default now());
        grant all on public.profiles to anon, authenticated, service_role;
        grant update(is_pro) on public.profiles to authenticated;
        create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,email,is_pro) values(new.id,new.email,false); return new; end $$;
        create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
        alter table public.profiles enable row level security;
        create policy insecure_admin on public.profiles for all using (auth.jwt()->'user_metadata'->>'role'='admin');
        create function public.handle_admin_role_assignment() returns trigger language plpgsql as $$ begin new.is_pro=true; return new; end $$;
        create trigger tr_assign_admin_role before insert on public.profiles for each row execute function public.handle_admin_role_assignment();
      `);
      if (subscriptions) await db.exec(`create table public.subscriptions(id text primary key, user_id text, status text);
        grant all on public.subscriptions to anon, authenticated, service_role;
        insert into subscriptions values('s1','${USER}','active'),('s2','${ADMIN}','active');`);
      const migration = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).find(n => n.endsWith('_lock_account_permissions.sql'));
      const sql = await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8');
      await db.exec(sql);
      await db.exec(sql); // Safe to reapply the manual setup.
      await db.exec(`insert into auth.users values('${USER}','ivanjoris959@gmail.com'),('${ADMIN}','owner@example.com');
        update public.profiles set is_admin=true where id='${ADMIN}';
        set request.jwt.claim.sub='${USER}';
        set request.jwt.claims='{"email":"ivanjoris959@gmail.com","user_metadata":{"role":"admin","is_admin":true},"app_metadata":{"role":"admin"}}';
        set role authenticated;`);
      const own = (await db.query('select id,is_admin,is_pro from public.profiles')).rows;
      assert.deepEqual(own, [{ id: USER, is_admin: false, is_pro: false }]);
      for (const statement of [
        `update profiles set is_admin=true`, `update profiles set is_pro=true`,
        `update profiles set email='owner@example.com'`, `delete from profiles`, `truncate profiles`,
        `insert into profiles(id,email,is_admin) values(gen_random_uuid(),'x',true)`
      ]) await assert.rejects(db.exec(statement), /permission denied/);
      await assert.rejects(db.exec('select handle_new_user()'), /permission denied/);
      if (subscriptions) {
        assert.equal((await db.query('select * from subscriptions')).rows.length, 1);
        await assert.rejects(db.exec(`update subscriptions set status='active'`), /permission denied/);
      }
      await db.exec('reset role; set role anon;');
      await assert.rejects(db.exec('select * from profiles'), /permission denied/);
      await db.exec(`reset role; set role service_role; update profiles set is_admin=true where id='${USER}';`);
      assert.equal((await db.query(`select is_admin from profiles where id='${USER}'`)).rows[0].is_admin, true);
    } finally { await db.close(); }
  });
}
