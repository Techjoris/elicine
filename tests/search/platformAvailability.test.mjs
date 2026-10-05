/**
 * Contrainte de plateforme : seules les œuvres réellement disponibles sur le
 * fournisseur demandé sont conservées, et le complément TMDB interroge bien
 * `discover` avec le fournisseur et le genre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const requests = [];
let mode = 'available';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = String(url);
  requests.push(target);
  if (mode === 'offline') throw new Error('network down');
  const decoded = decodeURIComponent(target);

  if (decoded.includes('/watch/providers')) {
    const id = Number(decoded.match(/movie\/(\d+)\/watch\/providers/)?.[1] || 0);
    const onNetflix = id === 1 || id === 3;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: { FR: { flatrate: onNetflix ? [{ provider_id: 8, provider_name: 'Netflix' }] : [{ provider_id: 119, provider_name: 'Prime Video' }] } }
      })
    };
  }

  if (decoded.includes('discover/')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{
          id: 900, title: 'Netflix Horror', media_type: 'movie', genre_ids: [27],
          release_date: '2022-01-01', vote_average: 7.5, poster_path: '/x.jpg'
        }]
      })
    };
  }

  return { ok: true, status: 200, json: async () => ({}) };
};

const { filterMoviesAvailableOnPlatform, fetchPlatformGenreTopUp } =
  await import('../../src/search/platformAvailability.ts');

const platform = { id: 'netflix', label: 'Netflix', providerId: 8 };
const movie = (id) => ({
  id, title: `Film ${id}`, overview: '', poster_path: '/p.jpg', backdrop_path: null,
  release_date: '2020-01-01', vote_average: 7, media_type: 'FILM', genres: []
});

test('only titles actually available on the platform are kept', async () => {
  requests.length = 0;
  mode = 'available';
  const result = await filterMoviesAvailableOnPlatform([movie(1), movie(2), movie(3)], platform, { apiKey: '' });
  assert.deepEqual(result.movies.map((m) => m.id), [1, 3]);
  assert.equal(result.verifiedCount, 3);
  assert.equal(result.uncheckedCount, 0);
});

test('an unreachable TMDB proxy marks the titles as unchecked instead of unavailable', async () => {
  mode = 'offline';
  const result = await filterMoviesAvailableOnPlatform([movie(11), movie(12)], platform, { apiKey: '' });
  assert.deepEqual(result.movies, []);
  assert.equal(result.verifiedCount, 0);
  assert.equal(result.uncheckedCount, 2);
  mode = 'available';
});

test('the top-up asks TMDB for the requested provider and genre', async () => {
  requests.length = 0;
  const movies = await fetchPlatformGenreTopUp({
    platform,
    query: "film d'horreur",
    mediaType: 'Films',
    language: 'fr-FR',
    apiKey: '',
    limit: 4
  });
  assert.equal(movies.length, 1);
  assert.equal(movies[0].title, 'Netflix Horror');
  const discoverRequest = requests
    .map((url) => decodeURIComponent(url))
    .find((url) => url.includes('discover/'));
  assert.ok(discoverRequest, 'aucune requête discover');
  assert.ok(discoverRequest.includes('with_watch_providers=8'), discoverRequest);
  assert.ok(discoverRequest.includes('with_genres=27'), discoverRequest);
  assert.ok(discoverRequest.includes('with_watch_monetization_types=flatrate'), discoverRequest);
});

test('a top-up without a known genre never fabricates a selection', async () => {
  requests.length = 0;
  const movies = await fetchPlatformGenreTopUp({
    platform,
    query: 'un film avec Tom Hanks',
    mediaType: 'Films',
    apiKey: ''
  });
  assert.deepEqual(movies, []);
  assert.equal(requests.length, 0);
});

test.after(() => { globalThis.fetch = originalFetch; });
