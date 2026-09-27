import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWatchlistService, mergeWatchlists } from '../../src/services/watchlistService.ts';

const film = (id, title = `Film ${id}`) => ({
  id, title, overview: '', poster_path: null, backdrop_path: null,
  release_date: '2026-01-01', vote_average: 7, genres: [], media_type: 'movie'
});

const storage = () => {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
};

const account = (id, users, { failWrites = false } = {}) => ({
  async getUser() {
    return { data: { user: { id, user_metadata: users.get(id) || {} } }, error: null };
  },
  async updateUser({ data }) {
    if (failWrites) return { data: { user: null }, error: { message: 'offline' } };
    const metadata = { ...(users.get(id) || {}), ...data };
    users.set(id, metadata);
    return { data: { user: { id, user_metadata: metadata } }, error: null };
  }
});

test('a saved film follows its account to another device, and removal follows too', async () => {
  const users = new Map();
  const first = createWatchlistService(account('alice', users), storage());
  const second = createWatchlistService(account('alice', users), storage());

  first.queue('alice', 'add', film(10));
  assert.deepEqual((await first.sync('alice')).map(movie => movie.id), [10]);
  assert.deepEqual((await second.sync('alice')).map(movie => movie.id), [10]);

  first.queue('alice', 'remove', film(10));
  assert.deepEqual(await first.sync('alice'), []);
  assert.deepEqual(await second.sync('alice'), []);
});

test('one profile never receives another profile’s local list', async () => {
  const users = new Map();
  const device = storage();
  device.setItem('cineia_watchlist_alice', JSON.stringify([film(11)]));
  device.setItem('cineia_user', JSON.stringify({ id: 'alice' }));

  const alice = createWatchlistService(account('alice', users), device);
  await alice.sync('alice');
  const bob = createWatchlistService(account('bob', users), device);
  assert.deepEqual(bob.readInitial('bob'), []);
  assert.deepEqual(await bob.sync('bob'), []);
  assert.deepEqual(users.get('bob').elicine_watchlist_v1, []);
});

test('an existing profile list and an anonymous list migrate to the account', async () => {
  const users = new Map();
  const device = storage();
  device.setItem('cineia_watchlist_alice', JSON.stringify([film(12)]));
  device.setItem('cineia_watchlist', JSON.stringify([film(13)]));
  const service = createWatchlistService(account('alice', users), device);

  assert.deepEqual(service.readInitial(null).map(movie => movie.id), [13]);
  assert.deepEqual((await service.sync('alice')).map(movie => movie.id), [12, 13]);
  assert.deepEqual(users.get('alice').elicine_watchlist_v1.map(movie => movie.id), [12, 13]);
  assert.deepEqual(service.readInitial(null), []);
});

test('a Google sign-in adopts the list of an older local profile with the same email', async () => {
  const users = new Map();
  const device = storage();
  device.setItem('cineia_registered_accounts', JSON.stringify([{ id: 'usr_old', email: 'alice@example.com' }]));
  device.setItem('cineia_watchlist_usr_old', JSON.stringify([film(16)]));
  const service = createWatchlistService(account('google-uuid', users), device);

  service.stageLegacyAccount('google-uuid', 'alice@example.com');
  assert.deepEqual((await service.sync('google-uuid')).map(movie => movie.id), [16]);
});

test('the former shared cache does not appear after a signed-in user logs out', () => {
  const device = storage();
  device.setItem('cineia_user', JSON.stringify({ id: 'alice' }));
  device.setItem('cineia_watchlist', JSON.stringify([film(17)]));
  const service = createWatchlistService(account('alice', new Map()), device);

  service.readInitial('alice');
  device.removeItem('cineia_user');
  assert.deepEqual(service.readInitial(null), []);
});

test('an offline change stays queued and is sent when the account returns', async () => {
  const users = new Map();
  const device = storage();
  const offline = createWatchlistService(account('alice', users, { failWrites: true }), device);
  offline.queue('alice', 'add', film(14));
  await assert.rejects(offline.sync('alice'), /offline/);
  assert.equal(users.has('alice'), false);

  const online = createWatchlistService(account('alice', users), device);
  assert.deepEqual((await online.sync('alice')).map(movie => movie.id), [14]);
  assert.deepEqual(users.get('alice').elicine_watchlist_v1.map(movie => movie.id), [14]);
});

test('a different authenticated account cannot read or write the requested profile', async () => {
  const users = new Map();
  const service = createWatchlistService(account('bob', users), storage());
  service.queue('alice', 'add', film(15));
  await assert.rejects(service.sync('alice'), /Session du compte indisponible/);
  assert.equal(users.size, 0);
});

test('a movie and a series with the same catalog id remain separate entries', () => {
  const movie = film(20);
  const series = { ...film(20, 'Série 20'), media_type: 'tv' };
  assert.deepEqual(mergeWatchlists([movie], [series]).map(item => item.title), ['Film 20', 'Série 20']);
});

test('a second change made during a network write is not lost', async () => {
  const users = new Map();
  const device = storage();
  let release;
  let started;
  const writing = new Promise(resolve => { release = resolve; });
  const firstWriteStarted = new Promise(resolve => { started = resolve; });
  let writes = 0;
  const auth = account('alice', users);
  const originalUpdate = auth.updateUser;
  auth.updateUser = async attrs => {
    writes += 1;
    if (writes === 1) {
      started();
      await writing;
    }
    return originalUpdate(attrs);
  };
  const service = createWatchlistService(auth, device);

  service.queue('alice', 'add', film(21));
  const firstSync = service.sync('alice');
  await firstWriteStarted;
  service.queue('alice', 'add', film(22));
  release();
  assert.deepEqual((await firstSync).map(movie => movie.id), [21, 22]);
  assert.deepEqual(users.get('alice').elicine_watchlist_v1.map(movie => movie.id), [21, 22]);
});

test('credential login cannot silently create a device-only account', () => {
  const source = readFileSync(new URL('../../src/services/authService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fallbackUser|tok_seed_/, 'no fabricated login or local-only session');
  assert.match(source, /data\.session\?\.access_token/, 'a real Supabase session is required');
});
