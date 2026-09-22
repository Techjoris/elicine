import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { dueMilestone, parisDate, releaseEmailPayload, sendReleaseEmail } from '../../api/_release-email.js';
import { handleReleaseAlerts, handleReleaseCron } from '../../api/_release-alerts.js';

test('J-2 and release day use Paris calendar dates, including daylight saving', () => {
  assert.equal(parisDate(new Date('2026-09-22T22:30:00Z')), '2026-09-23');
  assert.equal(dueMilestone('2026-09-25', new Date('2026-09-22T22:30:00Z')), 'j_minus_2');
  assert.equal(dueMilestone('2026-09-23', new Date('2026-09-23T09:00:00Z')), 'release_day');
  assert.equal(dueMilestone('2026-03-30', new Date('2026-03-28T09:00:00Z')), 'j_minus_2');
  assert.equal(dueMilestone('2026-10-26', new Date('2026-10-24T09:00:00Z')), 'j_minus_2');
  assert.equal(dueMilestone('2026-09-24', new Date('2026-09-23T09:00:00Z')), null);
  assert.equal(dueMilestone('2026-09-22', new Date('2026-09-23T09:00:00Z')), null);
});

test('email output escapes TMDB content and addresses the authenticated recipient', () => {
  const payload = releaseEmailPayload({ movie_id: 42, movie_title: '<script>bad</script>', release_date: '2026-10-01', overview: '<img onerror=bad>', media_type: 'tv' }, 'j_minus_2', 'owner@example.com');
  assert.deepEqual(payload.to, ['owner@example.com']);
  assert.ok(!payload.html.includes('<script>'));
  assert.ok(payload.html.includes('&lt;script&gt;'));
});

test('missing credentials never simulate or return a successful email', async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try { await assert.rejects(sendReleaseEmail({}, 'test'), /RESEND_NOT_CONFIGURED/); }
  finally { if (previous) process.env.RESEND_API_KEY = previous; }
});

test('API rejects forged identity without a verified session; cron fails closed', async () => {
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  for (const method of ['GET', 'POST', 'DELETE']) {
    await handleReleaseAlerts({ method, headers: {}, body: { email: 'ivanjoris959@gmail.com', isPro: true } }, res);
    assert.equal(res.code, 401);
  }
  await handleReleaseCron({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 401);
});

test('real PostgreSQL: creation, media identity, cancellation, idempotency and client write denial', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`);
    await db.exec(await readFile(new URL('../../supabase/movie_alerts_setup.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/20260922010000_release_email_alerts.sql', import.meta.url), 'utf8'));
    const subscribe = async type => (await db.query(`select subscribe_release_alert($1,$2,$3,$4,$5::jsonb) as alert`,
      ['11111111-1111-1111-1111-111111111111', 'owner@example.com', 42, type, JSON.stringify({ movie_title: 'A real database test', release_date: '2026-10-01' })])).rows[0].alert;
    const movie = await subscribe('movie');
    const duplicate = await subscribe('movie');
    const series = await subscribe('tv');
    assert.equal(movie.id, duplicate.id);
    assert.notEqual(series.id, movie.id);
    const claim = async (id, milestone) => (await db.query(`select claim_release_email($1,$2,gen_random_uuid(),'{}') as delivery`, [id, milestone])).rows[0].delivery;
    assert.ok((await claim(movie.id, 'j_minus_2')).id);
    assert.equal(await claim(movie.id, 'j_minus_2'), null);
    assert.ok((await claim(movie.id, 'release_day')).id);
    await db.query(`update user_movie_alerts set status='cancelled' where id=$1`, [series.id]);
    assert.equal(await claim(series.id, 'j_minus_2'), null);
    await subscribe('movie');
    assert.equal(await claim(movie.id, 'release_day'), null, 'reactivation cannot reset sends');
    await db.exec('set role authenticated');
    await assert.rejects(db.exec(`insert into user_movie_alerts(user_id,email,movie_id,movie_title) values('x','x',1,'x')`), /permission denied/);
    await assert.rejects(db.exec(`update user_movie_alerts set notified_release_day=false`), /permission denied/);
    await assert.rejects(db.exec(`select subscribe_release_alert('x','x',1,'movie','{}')`), /permission denied/);
    await assert.rejects(db.exec(`select * from release_email_deliveries`), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('the migration can be replayed safely on a database that already holds legacy alerts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`);
    const setup = await readFile(new URL('../../supabase/movie_alerts_setup.sql', import.meta.url), 'utf8');
    const migration = await readFile(new URL('../../supabase/migrations/20260922010000_release_email_alerts.sql', import.meta.url), 'utf8');
    await db.exec(setup);
    // Legacy rows used the old (user_id, movie_id) identity and mixed media type spellings.
    await db.exec(`insert into user_movie_alerts(user_id,email,movie_id,movie_title,media_type,release_date)
      values('11111111-1111-1111-1111-111111111111','owner@example.com',7,'Legacy film','FILM','2030-01-01'),
            ('11111111-1111-1111-1111-111111111111','owner@example.com',8,'Legacy series','SÉRIE','2030-01-02');`);
    await db.exec(migration);
    await db.exec(migration);

    const rows = (await db.query(`select movie_id::int as movie_id, media_type from user_movie_alerts order by movie_id`)).rows;
    assert.deepEqual(rows, [{ movie_id: 7, media_type: 'movie' }, { movie_id: 8, media_type: 'tv' }]);

    const series = (await db.query(`select subscribe_release_alert($1,$2,$3,'tv',$4::jsonb) as alert`,
      ['11111111-1111-1111-1111-111111111111', 'owner@example.com', 8, JSON.stringify({ movie_title: 'Legacy series', release_date: '2030-01-02' })])).rows[0].alert;
    assert.equal(Number(series.movie_id), 8);
    assert.equal((await db.query(`select count(*)::int as total from user_movie_alerts where movie_id = 8`)).rows[0].total, 1);

    await db.exec(`insert into user_movie_alerts(user_id,email,movie_id,movie_title) values('22222222-2222-2222-2222-222222222222','other@example.com',1,'no media type')`);
    assert.equal((await db.query(`select media_type from user_movie_alerts where movie_id = 1`)).rows[0].media_type, 'movie');
    await assert.rejects(db.exec(`insert into user_movie_alerts(user_id,email,movie_id,movie_title,media_type)
      values('11111111-1111-1111-1111-111111111111','owner@example.com',7,'duplicate','movie')`), /release_alert_identity/);
  } finally { await db.close(); }
});
