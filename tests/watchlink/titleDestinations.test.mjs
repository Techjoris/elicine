import test from 'node:test';
import assert from 'node:assert/strict';
import { providerKeyFor, normalizeOfferUrl, isTitleOfferUrl, resolveTitleWatchLinks } from '../../api/_watchLink.js';
import { pickBestCandidate } from '../../api/_watchLink.js';
import { deepLinkForProvider, fetchTitleWatchLinks } from '../../src/services/watchLinkResolver.ts';
import { redirectToStreamingProvider, handleStreamingClick, isIntermediaryWatchLink, getUniversalStreamingUrl } from '../../src/services/deepLinkHelper.ts';

const providers = [
  ['Netflix', 'https://www.netflix.com/title/80057281'],
  ['Amazon Prime Video', 'https://www.primevideo.com/detail?gti=amzn1.dv.gti.9ab600aa-6625-b547-cfc0-190e3ad8a27d'],
  ['Disney Plus', 'https://www.disneyplus.com/browse/entity-b39aa962-be56-4b09-a536-98617031717f'],
  ['Apple TV', 'https://tv.apple.com/fr/show/the-boys/umc.cmc.91mn0jm4nlkzuqoueg22v3b1'],
  ['HBO Max', 'https://play.hbomax.com/show/e7dc7b3a-a494-4ef1-8107-f4308aa6bbf7?utm_source=universal_search'],
  ['Canal+', 'https://www.canalplus.com/series/the-boys/h/14192380_40099'],
  ['Paramount+', 'https://www.paramountplus.com/fr/shows/title/'],
  ['ARTE', 'https://boutique.arte.tv/detail/dune'],
  ['TF1+', 'https://www.tf1.fr/tf1/serie/videos/episode.html'],
  ['France.tv', 'https://www.france.tv/france-2/serie/episode.html'],
  ['M6+', 'https://www.m6.fr/serie/episode'],
  ['Rakuten TV', 'https://www.rakuten.tv/fr/movies/dune-2021'],
  ['Pathé Home', 'https://www.pathehome.com/fr/fr/film/phf-K0IK57VAL5/dune'],
  ['MUBI', 'https://mubi.com/fr/films/title'],
  ['Crunchyroll', 'https://www.crunchyroll.com/series/ID/title'],
  ['Sooner', 'https://sooner.fr/films/dune'],
  ['Plex', 'https://watch.plex.tv/watch/movie/title'],
  ['FilmBox', 'https://filmboxplus.com/movie/title'],
  ['Google Play Movies', 'https://play.google.com/store/movies/details?id=ID'],
  ['YouTube', 'https://www.youtube.com/watch?v=ID']
];
const okFetch = links => async () => ({ ok: true, json: async () => ({ links }) });
function mockGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
}

for (const [name, url] of providers) {
  test(`${name}: a resolved title opens without losing path, parameters, or provider`, async t => {
    const open = t.mock.fn();
    mockGlobal(t, 'window', { open });
    assert.equal(isTitleOfferUrl(url, name), true);
    await redirectToStreamingProvider({ title: 'Test title' }, name, undefined, url);
    assert.deepEqual(open.mock.calls[0].arguments, [normalizeOfferUrl(url), '_blank', 'noopener,noreferrer']);
    assert.equal(isTitleOfferUrl(url, 'Unknown provider'), false);
  });

  test(`${name}: missing link is resolved before navigating the reserved tab`, async t => {
    const replace = t.mock.fn();
    const tab = { location: { replace }, closed: false, opener: {} };
    mockGlobal(t, 'window', { open: t.mock.fn(() => tab) });
    const key = providerKeyFor(name);
    const fetchMock = t.mock.method(globalThis, 'fetch', okFetch({ [`${key}:stream`]: url }));
    await redirectToStreamingProvider({ title: `Unique title ${name}`, release_date: '2021-01-01' }, name);
    assert.equal(tab.opener, null);
    assert.equal(replace.mock.calls[0].arguments[0], normalizeOfferUrl(url));
    assert.ok(fetchMock.mock.calls[0].arguments[0].includes('year=2021'));
    assert.ok(fetchMock.mock.calls[0].arguments[0].includes('v=2'));
  });
}

test('the real Prime mobile offer keeps its GTI and becomes a browser title URL', () => {
  const mobile = 'https://app.primevideo.com/detail?gti=amzn1.dv.gti.a8025548-3908-4562-8896-8fffd945cfb6&tag=old-21';
  assert.equal(normalizeOfferUrl(mobile), 'https://www.primevideo.com/detail?gti=amzn1.dv.gti.a8025548-3908-4562-8896-8fffd945cfb6&tag=elicine-21');
});

test('known title IDs are used even if no resolvedUrl argument was passed', async t => {
  const open = t.mock.fn();
  mockGlobal(t, 'window', { open });
  await redirectToStreamingProvider({ title: 'Stranger Things', netflix_id: '80057281' }, 'Netflix');
  assert.equal(open.mock.calls[0].arguments[0], 'https://www.netflix.com/title/80057281');
  await redirectToStreamingProvider({ title: 'The Boys', prime_id: 'amzn1.dv.gti.9ab600aa-6625-b547-cfc0-190e3ad8a27d' }, 'Amazon Prime Video');
  assert.equal(open.mock.calls[1].arguments[0], 'https://www.primevideo.com/detail?gti=amzn1.dv.gti.9ab600aa-6625-b547-cfc0-190e3ad8a27d&tag=elicine-21');
});

test('the legacy click signature preserves its URL and catalogue ID', async t => {
  const open = t.mock.fn();
  mockGlobal(t, 'window', { open });
  await handleStreamingClick('https://www.netflix.com/title/80057281', 'Netflix', 'Stranger Things');
  await handleStreamingClick('', 'Netflix', 'Stranger Things', '80057281');
  assert.ok(open.mock.calls.every(call => call.arguments[0] === 'https://www.netflix.com/title/80057281'));
});

test('provider watch paths and tracking parameters are not intermediary links', () => {
  assert.equal(isIntermediaryWatchLink('https://www.youtube.com/watch?v=ID'), false);
  assert.equal(isIntermediaryWatchLink('https://www.netflix.com/title/ID?source=justwatch.com'), false);
  assert.equal(isIntermediaryWatchLink('https://www.themoviedb.org/movie/ID/watch'), true);
});

test('search, catalogue, homepage and another provider are rejected as title links', () => {
  for (const url of ['https://www.primevideo.com/', 'https://www.primevideo.com/storefront',
    'https://www.primevideo.com/search?phrase=Dune', 'https://www.primevideo.com/region/eu/splash/t/getTheApp',
    'https://www.netflix.com/title/80057281', 'https://primevideo.com.example.com/detail/ID']) {
    assert.equal(isTitleOfferUrl(url, 'Amazon Prime Video'), false);
  }
});

test('streaming, rental, purchase and Amazon Channels never share the selected offer', async () => {
  const primeStream = 'https://www.primevideo.com/detail/STREAM';
  const primeRent = 'https://www.primevideo.com/detail/RENT';
  const primeBuy = 'https://www.primevideo.com/detail/BUY';
  const maxChannel = 'https://www.primevideo.com/detail/CHANNEL';
  const appleRent = 'https://tv.apple.com/fr/movie/rental/ID';
  const appleStream = 'https://tv.apple.com/fr/show/streaming/ID';
  const offers = [
    ['HBO Max Amazon Channel', 'FLATRATE', maxChannel], ['Amazon Video', 'BUY', primeBuy],
    ['Amazon Video', 'RENT', primeRent], ['Amazon Prime Video', 'FLATRATE', primeStream],
    ['Apple TV Store', 'RENT', appleRent], ['Apple TV+', 'FLATRATE', appleStream]
  ].map(([clearName, monetizationType, standardWebURL]) => ({ package: { clearName }, monetizationType, standardWebURL }));
  const links = await resolveTitleWatchLinks({ title: 'Test', year: '2021', fetchImpl: async () => ({
    ok: true, json: async () => ({ data: { popularTitles: { edges: [{ node: {
      objectType: 'MOVIE', content: { title: 'Test', originalReleaseYear: 2021 }, offers
    } }] } } })
  }) });
  assert.equal(deepLinkForProvider(links, 'Amazon Prime Video', 'stream'), normalizeOfferUrl(primeStream));
  assert.equal(deepLinkForProvider(links, 'Amazon Video', 'rent'), normalizeOfferUrl(primeRent));
  assert.equal(deepLinkForProvider(links, 'Amazon Video', 'buy'), normalizeOfferUrl(primeBuy));
  assert.equal(deepLinkForProvider(links, 'HBO Max Amazon Channel', 'stream'), normalizeOfferUrl(maxChannel));
  assert.equal(deepLinkForProvider(links, 'Apple TV+', 'stream'), appleStream);
  assert.equal(deepLinkForProvider(links, 'Apple TV Store', 'rent'), appleRent);
  assert.equal(deepLinkForProvider(links, 'Apple TV Store', 'buy'), null);
});

test('failed upstream resolution is retried instead of being cached for the session', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', okFetch({}));
  const params = { title: 'Retry test', country: 'FR', mediaType: 'tv', year: '2024' };
  await fetchTitleWatchLinks(params);
  await fetchTitleWatchLinks(params);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('concurrent resolution for the same title is shared and series retain type=tv', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', okFetch({ 'netflix:stream': providers[0][1] }));
  const params = { title: 'Shared series test', country: 'FR', mediaType: 'tv', year: '2016' };
  await Promise.all([fetchTitleWatchLinks(params), fetchTitleWatchLinks(params)]);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.ok(fetchMock.mock.calls[0].arguments[0].includes('type=tv'));
});

test('a missing rental does not reuse a streaming subscription URL', async t => {
  const replace = t.mock.fn();
  const toast = t.mock.fn();
  mockGlobal(t, 'window', { open: () => ({ closed: false, location: { replace } }) });
  t.mock.method(globalThis, 'fetch', okFetch({ 'apple:stream': 'https://tv.apple.com/fr/show/title/ID' }));
  await redirectToStreamingProvider({ title: 'Rent fallback test' }, 'Apple TV Store', toast, undefined, 'rent');
  assert.equal(replace.mock.calls[0].arguments[0], 'https://tv.apple.com/search?term=Rent%20fallback%20test');
  assert.match(toast.mock.calls.at(-1).arguments[0], /Fiche indisponible/);
});

test('a different adaptation or the movie of a series never supplies its links', () => {
  const remake = [{ node: { objectType: 'MOVIE', content: { title: 'Dune', originalReleaseYear: 1984 } } }];
  assert.equal(pickBestCandidate(remake, 'Dune', '2021', 'MOVIE'), null);
  assert.equal(pickBestCandidate(remake, 'Dune', '1984', 'SHOW'), null);
});
