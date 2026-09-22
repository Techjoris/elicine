import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { buildUpcomingFeed, buildUpcomingReport, releaseWindowRange, tmdbKey } from '../../api/releases.js';
import { fetchUpcoming, fetchUpcomingFromTmdb } from '../../src/services/upcomingService.ts';

const NOW = new Date('2026-09-22T09:00:00Z');
const day = offset => new Date(Date.UTC(2026, 8, 22 + offset)).toISOString().slice(0, 10);

const movie = (id, title, releaseDate, extra = {}) => ({
  id, title, release_date: releaseDate, poster_path: `/p${id}.jpg`, backdrop_path: null,
  overview: '', vote_average: 0, popularity: 0, vote_count: 0, genre_ids: [28], ...extra
});

function fakeResponse() {
  return {
    headers: {}, code: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

function stubTmdb(routes) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    const path = parsed.pathname.replace(/^\/3\//, '');
    calls.push(path);
    const payload = routes[path];
    if (payload === 'error') return { ok: false, status: 500, json: async () => ({}) };
    if (payload === undefined) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    return { ok: true, status: 200, json: async () => payload };
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

test('the server feed ranks a saga above an imminent film and only enriches the leaders', async () => {
  const stub = stubTmdb({
    'discover/movie': { results: [
      movie(2, 'Sortie imminente', day(10), { popularity: 28 }),
      movie(3, 'Avengers : Doomsday', day(85), { popularity: 54 }),
      movie(4, 'Sans affiche', day(60), { poster_path: null }),
      movie(5, 'Déjà sorti', day(-4), { popularity: 400 })
    ] },
    'discover/tv': { results: [] },
    'trending/movie/week': { results: [movie(3, 'Avengers : Doomsday', day(85), { popularity: 54 })] },
    'trending/movie/day': { results: [movie(2, 'Sortie imminente', day(10), { popularity: 28 })] },
    'trending/tv/week': { results: [] },
    'trending/tv/day': { results: [] },
    'movie/3': { id: 3, belongs_to_collection: { id: 9, name: 'Saga attendue' } },
    'collection/9': { id: 9, name: 'Saga attendue', parts: [{ vote_count: 32000 }, { vote_count: 18000 }, { vote_count: 0 }] },
    'movie/2': { id: 2, belongs_to_collection: null }
  });
  try {
    const feed = await buildUpcomingFeed({ apiKey: 'test', now: NOW });
    assert.deepEqual(feed.map(item => item.id), [3, 2]);
    const saga = feed[0];
    assert.ok(saga.scale > 0.9, `saga weight is nearly maximal (${saga.scale})`);
    assert.equal(saga.trendingRank, 1);
    assert.equal(saga.daysUntilRelease, 85);
    assert.ok(saga.anticipation > feed[1].anticipation);
    assert.equal(feed[1].scale, 0);
    assert.ok(!feed.some(item => item.id === 4 || item.id === 5), 'titles without artwork or already released are dropped');
    assert.ok(stub.calls.includes('movie/3') && stub.calls.includes('movie/2'));
    assert.ok(stub.calls.includes('collection/9'), 'the saga weight is fetched from the collection');
  } finally { stub.restore(); }
});

test('enrichLimit controls how many per-title TMDB calls the feed is allowed to make', async () => {
  const stub = stubTmdb({
    'discover/movie': { results: [movie(1, 'A', day(30), { popularity: 90 }), movie(2, 'B', day(60), { popularity: 40 })] },
    'discover/tv': { results: [] }
  });
  try {
    await buildUpcomingFeed({ apiKey: 'test', now: NOW, enrichLimit: 1 });
    const detailCalls = stub.calls.filter(path => path.startsWith('movie/') && !path.startsWith('movie/popular'));
    assert.deepEqual(detailCalls, ['movie/1']);
  } finally { stub.restore(); }
});

test('a missing TMDB key fails closed and a broken discover surfaces an error', async () => {
  const previous = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  const previousViteKey = process.env.VITE_TMDB_API_KEY;
  delete process.env.VITE_TMDB_API_KEY;
  try {
    assert.equal(tmdbKey(), '');
    await assert.rejects(buildUpcomingFeed({ apiKey: '' }), /TMDB_KEY_MISSING/);
  } finally {
    if (previous !== undefined) process.env.TMDB_API_KEY = previous;
    if (previousViteKey !== undefined) process.env.VITE_TMDB_API_KEY = previousViteKey;
  }

  const stub = stubTmdb({ 'discover/movie': 'error' });
  try {
    await assert.rejects(buildUpcomingFeed({ apiKey: 'test', now: NOW }), /TMDB_500/);
  } finally { stub.restore(); }
});

test('the release window starts tomorrow and covers six months', () => {
  const range = releaseWindowRange(NOW);
  assert.deepEqual(range, { today: '2026-09-22', from: '2026-09-23', to: '2027-03-23' });
});

test('the endpoint answers the ranked feed and caches a complete enrichment', async () => {
  const previousKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test';
  const stub = stubTmdb({
    'discover/movie': { results: [movie(3, 'Saga', day(85), { popularity: 54 }), movie(2, 'Bruit', day(8), { popularity: 28 })] },
    'discover/tv': { results: [] },
    'movie/3': { id: 3, belongs_to_collection: { id: 9 } },
    'collection/9': { id: 9, parts: [{ vote_count: 32000 }, { vote_count: 0 }] },
    'movie/2': { id: 2, belongs_to_collection: null }
  });
  try {
    const res = fakeResponse();
    await handler({ method: 'GET', query: { language: 'fr-FR' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.items.map(item => item.id), [3, 2]);
    assert.match(res.headers['Cache-Control'], /s-maxage=900/);
    const report = await buildUpcomingReport({ apiKey: 'test', now: NOW, enrichLimit: 2 });
    assert.deepEqual(report.enrichment, { requested: 2, resolved: 2 });
  } finally {
    stub.restore();
    if (previousKey === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previousKey;
  }
});

test('a degraded enrichment is only cached for a minute instead of fifteen', async () => {
  const previousKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test';
  const stub = stubTmdb({
    'discover/movie': { results: [movie(3, 'Saga', day(85), { popularity: 54 }), movie(2, 'Bruit', day(8), { popularity: 28 })] },
    'discover/tv': { results: [] },
    'movie/3': 'error',
    'movie/2': 'error'
  });
  try {
    const res = fakeResponse();
    await handler({ method: 'GET', query: {} }, res);
    assert.equal(res.code, 200);
    assert.match(res.headers['Cache-Control'], /s-maxage=60\b/);
    assert.ok(!/s-maxage=900/.test(res.headers['Cache-Control']));
  } finally {
    stub.restore();
    if (previousKey === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previousKey;
  }
});

test('the endpoint refuses other methods and fails closed without a TMDB key', async () => {
  const post = fakeResponse();
  await handler({ method: 'POST', query: {} }, post);
  assert.equal(post.code, 405);

  const previous = { main: process.env.TMDB_API_KEY, vite: process.env.VITE_TMDB_API_KEY };
  delete process.env.TMDB_API_KEY;
  delete process.env.VITE_TMDB_API_KEY;
  try {
    const res = fakeResponse();
    await handler({ method: 'GET', query: {} }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.success, undefined);
  } finally {
    if (previous.main !== undefined) process.env.TMDB_API_KEY = previous.main;
    if (previous.vite !== undefined) process.env.VITE_TMDB_API_KEY = previous.vite;
  }

  const options = fakeResponse();
  await handler({ method: 'OPTIONS', query: {} }, options);
  assert.equal(options.code, 200);
});

test('a broken trending feed never blocks the column', async () => {
  const stub = stubTmdb({
    'discover/movie': { results: [movie(7, 'Film attendu', day(80), { popularity: 90 })] },
    'trending/movie/week': 'error',
    'trending/movie/day': 'error',
    'trending/tv/week': 'error',
    'trending/tv/day': 'error'
  });
  try {
    const feed = await buildUpcomingFeed({ apiKey: 'test', now: NOW });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].trendingRank, null);
  } finally { stub.restore(); }
});

test('the client falls back to its own TMDB pipeline when the ranking endpoint is down', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.startsWith('/api/releases')) return { ok: false, status: 503, json: async () => ({}) };
    const endpoint = new URLSearchParams(target.split('?')[1] || '').get('endpoint');
    const payload = endpoint === 'discover/movie'
      ? { results: [movie(11, 'Repli', day(50), { popularity: 70 })] }
      : { results: [] };
    return { ok: true, status: 200, json: async () => payload };
  };
  try {
    const feed = await fetchUpcoming(undefined, 'fr-FR', NOW);
    assert.equal(feed.length, 1);
    assert.equal(feed[0].id, 11);
    assert.ok(feed[0].anticipation > 0);
    assert.equal(feed[0].scale, 0);
    const direct = await fetchUpcomingFromTmdb(undefined, 'fr-FR', NOW);
    assert.equal(direct[0].id, 11);
  } finally { globalThis.fetch = previous; }
});

test('the client uses the ranked feed from the server when it answers', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async url => ({
    ok: true, status: 200,
    json: async () => ({
      success: true,
      items: [{
        id: 42, title: 'Saga attendue', overview: '', poster_path: '/p42.jpg', backdrop_path: null,
        release_date: day(90), media_type: 'movie', vote_average: 7, popularity: 40, voteCount: 0,
        anticipation: 0.71, buzzPercentile: 1, scale: 0.9, trendingRank: 4, daysUntilRelease: 90
      }]
    })
  });
  try {
    const feed = await fetchUpcoming(undefined, 'fr-FR', NOW);
    assert.equal(feed.length, 1);
    assert.equal(feed[0].title, 'Saga attendue');
    assert.equal(feed[0].anticipation, 0.71);
    assert.equal(feed[0].scale, 0.9);
    assert.equal(feed[0].trendingRank, 4);
    assert.deepEqual(feed[0].genres, []);
  } finally { globalThis.fetch = previous; }
});
