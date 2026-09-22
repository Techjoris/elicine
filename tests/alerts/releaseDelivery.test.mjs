import test from 'node:test';
import assert from 'node:assert/strict';
import { processReleaseAlerts } from '../../api/_release-alerts.js';

const NOW = new Date('2026-09-22T09:00:00Z'); // 22/09/2026 11:00 Paris
const J_MINUS_2 = '2026-09-24';
const RELEASE_DAY = '2026-09-22';

class QueryBuilder {
  constructor(state, table, mode, payload) {
    this.state = state; this.table = table; this.mode = mode; this.payload = payload;
    this.predicates = []; this.max = null; this.single = false;
  }
  select() { return this; }
  eq(column, value) { this.predicates.push(row => row[column] === value); return this; }
  in(column, values) { this.predicates.push(row => values.includes(row[column])); return this; }
  gt(column, value) { this.predicates.push(row => row[column] > value); return this; }
  order() { return this; }
  limit(count) { this.max = count; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  run() {
    const rows = this.state[this.table].filter(row => this.predicates.every(predicate => predicate(row)));
    if (this.mode === 'update') {
      for (const row of rows) Object.assign(row, this.payload);
      return { data: null, error: null };
    }
    const selected = (this.max === null ? rows : rows.slice(0, this.max)).map(row => ({ ...row }));
    return { data: this.single ? (selected[0] ?? null) : selected, error: null };
  }
}

function fakeDatabase(state) {
  return {
    from(table) {
      return {
        select: () => new QueryBuilder(state, table, 'select'),
        update: patch => new QueryBuilder(state, table, 'update', patch)
      };
    },
    rpc(name, args) {
      assert.equal(name, 'claim_release_email');
      const alert = state.user_movie_alerts.find(row => row.id === args.p_alert_id);
      const alreadyNotified = alert && (args.p_milestone === 'j_minus_2' ? alert.notified_j_minus_2 : alert.notified_release_day);
      const alreadyClaimed = state.release_email_deliveries.some(row => row.alert_id === args.p_alert_id && row.milestone === args.p_milestone);
      if (!alert || alert.status !== 'active' || alreadyNotified || alreadyClaimed) return Promise.resolve({ data: null, error: null });
      const row = {
        id: args.p_delivery_id, alert_id: args.p_alert_id, milestone: args.p_milestone, status: 'sending',
        payload: args.p_payload, provider_id: null, provider_status: null, error_code: null,
        created_at: NOW.toISOString(), updated_at: NOW.toISOString()
      };
      state.release_email_deliveries.push(row);
      return Promise.resolve({ data: { ...row }, error: null });
    },
    auth: { admin: { getUserById: async id => ({ data: { user: state.users[id] }, error: null }) } }
  };
}

function stateWith(alerts, { isPro = true, expiresAt = null, subscriptions = [] } = {}) {
  return {
    user_movie_alerts: alerts.map(alert => ({
      status: 'active', email: 'ignored@example.com', media_type: 'movie', overview: '',
      poster_path: '/poster.jpg', notified_j_minus_2: false, notified_release_day: false, ...alert
    })),
    release_email_deliveries: [],
    profiles: [{ id: 'u1', is_pro: isPro, expires_at: expiresAt }],
    subscriptions,
    users: { u1: { id: 'u1', email: 'pro@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } }
  };
}

function useEnvironment({ tmdb, resend }) {
  const previous = { fetch: globalThis.fetch, key: process.env.RESEND_API_KEY, tmdbKey: process.env.TMDB_API_KEY };
  const posts = [];
  process.env.RESEND_API_KEY = 're_test';
  process.env.TMDB_API_KEY = 'tmdb_test';
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const json = body => ({ ok: true, status: 200, json: async () => body });
    if (href.startsWith('https://api.themoviedb.org/3/')) {
      const id = Number(href.match(/\/(movie|tv)\/(\d+)/)[2]);
      return tmdb(id);
    }
    if (href === 'https://api.resend.com/emails' && options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return resend(posts.length);
    }
    if (href.startsWith('https://api.resend.com/emails/')) return json({ id: href.split('/').pop(), last_event: 'delivered' });
    throw new Error(`Unexpected fetch ${href}`);
  };
  return {
    posts,
    restore() {
      globalThis.fetch = previous.fetch;
      if (previous.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previous.key;
      if (previous.tmdbKey === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previous.tmdbKey;
    }
  };
}

const PROVIDER_ID = '3f9a1c2e-0000-4000-8000-000000000001';
const delivered = () => ({ ok: true, status: 200, json: async () => ({ id: PROVIDER_ID }) });
const confirmed = releaseDate => () => ({ ok: true, status: 200, json: async () => ({ title: 'Dune', release_date: releaseDate, poster_path: '/poster.jpg', overview: 'Sable' }) });

test('a Pro alert receives the J-2 email once, then the delivery status is verified', async () => {
  const state = stateWith([{ id: 'a1', user_id: 'u1', movie_id: 101, movie_title: 'Dune', release_date: J_MINUS_2 }]);
  const env = useEnvironment({ tmdb: confirmed(J_MINUS_2), resend: delivered });
  try {
    const first = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(first.accepted, 1);
    assert.equal(env.posts.length, 1);
    assert.deepEqual(env.posts[0].to, ['pro@example.com']);
    assert.match(env.posts[0].subject, /sort dans 2 jours/);
    assert.match(env.posts[0].html, /Dune/);
    assert.equal(state.user_movie_alerts[0].notified_j_minus_2, true);
    assert.equal(state.release_email_deliveries[0].status, 'accepted');
    assert.equal(state.release_email_deliveries[0].provider_id, PROVIDER_ID);

    const second = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(second.delivered, 1);
    assert.equal(state.release_email_deliveries[0].status, 'delivered');
    assert.equal(env.posts.length, 1, 'the same milestone is never sent twice');
  } finally { env.restore(); }
});

test('release day sends its own milestone and only to a confirmed Pro account', async () => {
  const state = stateWith([{ id: 'a2', user_id: 'u1', movie_id: 202, movie_title: 'Severance', media_type: 'tv', release_date: RELEASE_DAY }]);
  const env = useEnvironment({ tmdb: confirmed(RELEASE_DAY), resend: delivered });
  try {
    const counts = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(counts.accepted, 1);
    assert.match(env.posts[0].subject, /sort aujourd’hui/);
    assert.equal(state.user_movie_alerts[0].notified_release_day, true);
  } finally { env.restore(); }
});

test('free and expired accounts are skipped before any send', async () => {
  const alert = [{ id: 'a3', user_id: 'u1', movie_id: 303, movie_title: 'Dune', release_date: J_MINUS_2 }];
  const env = useEnvironment({ tmdb: confirmed(J_MINUS_2), resend: delivered });
  try {
    const free = await processReleaseAlerts(fakeDatabase(stateWith(alert, { isPro: false })), { now: NOW });
    assert.equal(free.skipped, 1);

    const expired = stateWith(alert, {
      isPro: true, expiresAt: '2025-01-01T00:00:00Z',
      subscriptions: [{ user_id: 'u1', status: 'active', expires_at: '2025-06-01T00:00:00Z' }]
    });
    const lapsed = await processReleaseAlerts(fakeDatabase(expired), { now: NOW });
    assert.equal(lapsed.skipped, 1);
    assert.equal(env.posts.length, 0);
  } finally { env.restore(); }
});

test('an unconfirmed email address is never used', async () => {
  const state = stateWith([{ id: 'a4', user_id: 'u1', movie_id: 404, movie_title: 'Dune', release_date: RELEASE_DAY }]);
  state.users.u1.email_confirmed_at = null;
  const env = useEnvironment({ tmdb: confirmed(RELEASE_DAY), resend: delivered });
  try {
    const counts = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(counts.skipped, 1);
    assert.equal(env.posts.length, 0);
  } finally { env.restore(); }
});

test('a release date changed at the source postpones the alert instead of mailing a wrong date', async () => {
  const state = stateWith([{ id: 'a5', user_id: 'u1', movie_id: 505, movie_title: 'Dune', release_date: J_MINUS_2 }]);
  const env = useEnvironment({ tmdb: confirmed('2026-11-05'), resend: delivered });
  try {
    const counts = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(counts.skipped, 1);
    assert.equal(state.user_movie_alerts[0].release_date, '2026-11-05');
    assert.equal(env.posts.length, 0);
  } finally { env.restore(); }
});

test('an ambiguous provider failure is recorded and never retried into a duplicate', async () => {
  const state = stateWith([{ id: 'a6', user_id: 'u1', movie_id: 606, movie_title: 'Dune', release_date: J_MINUS_2 }]);
  const env = useEnvironment({
    tmdb: confirmed(J_MINUS_2),
    resend: () => ({ ok: false, status: 500, json: async () => ({ name: 'provider_error' }) })
  });
  try {
    const first = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(first.unknown, 1);
    assert.equal(state.release_email_deliveries[0].status, 'unknown');
    assert.equal(state.user_movie_alerts[0].notified_j_minus_2, false);

    const second = await processReleaseAlerts(fakeDatabase(state), { now: NOW });
    assert.equal(second.skipped, 1);
    assert.equal(env.posts.length, 1, 'ambiguous attempts are preserved, not resent');
  } finally { env.restore(); }
});
