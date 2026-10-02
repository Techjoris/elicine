import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAndroidIntentUrl, getDirectStreamingUrl, getDirectPlatformSearchUrl,
  getPlatformDirectUrl, getPrimeVideoDeepLink, getNetflixDeepLink,
  redirectToStreamingProvider
} from '../../src/services/deepLinkHelper.ts';
import { deepLinkForProvider } from '../../src/services/watchLinkResolver.ts';
import { getMediaProviders, getVodStoreUrl, resolveStreamingAction } from '../../src/services/streamingResolver.ts';
import { pickOfferUrl, resolveTitleWatchLinks } from '../../api/_watchLink.js';
import watchLinkHandler from '../../api/watch-link.js';

const offer = (name, url, monetizationType = 'FLATRATE') => ({
  standardWebURL: url, monetizationType, package: { clearName: name }
});
const titlePayload = offers => ({
  data: { popularTitles: { edges: [{ node: {
    objectType: 'MOVIE', content: { title: 'Dune', originalReleaseYear: 2021 }, offers
  } }] } }
});
const okFetch = payload => async () => ({ ok: true, json: async () => payload });
const provider = (provider_id, provider_name) => ({ provider_id, provider_name, logo_path: null });

function mockGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

for (const [id, before] of [
  ['0FILM', 'https://www.primevideo.com/detail/0FILM'],
  ['amzn1.dv.gti.FILM', 'https://www.primevideo.com/detail?gti=amzn1.dv.gti.FILM']
]) {
  test(`catalogue ID ${id} keeps its title destination in all generators`, () => {
    const after = `${before}${before.includes('?') ? '&' : '?'}tag=elicine-21`;
    assert.equal(getPrimeVideoDeepLink('Dune', id), after);
    assert.equal(getDirectStreamingUrl('Amazon Prime Video', 'Dune', '2021', id), after);
    assert.equal(getPlatformDirectUrl({ providerName: 'Amazon Prime Video', movieTitle: 'Dune', primeId: id }), after);
  });
}

test('search fallback retains title encoding and does not become the trial homepage', () => {
  const after = 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Am%C3%A9lie%20Poulain&tag=elicine-21';
  assert.equal(getDirectPlatformSearchUrl('Amazon Prime Video', 'Amélie Poulain'), after);
  assert.equal(getPrimeVideoDeepLink('Amélie Poulain'), after);
  assert.equal(getDirectStreamingUrl('Amazon Video', 'Amélie Poulain'), after);
});

test('an upstream title URL keeps all parameters and its episode fragment', () => {
  const before = 'https://www.primevideo.com/detail/0SERIES?season=2&tag=old-21&ref_=atv_dp#episode-3';
  const after = 'https://www.primevideo.com/detail/0SERIES?season=2&tag=elicine-21&ref_=atv_dp#episode-3';
  assert.equal(getPrimeVideoDeepLink('Dune', null, before), after);
  assert.equal(getDirectStreamingUrl('Amazon Video', 'Dune', '2021', null, before), after);
  assert.equal(deepLinkForProvider({ prime: before }, 'Amazon Prime Video'), after);
  assert.equal(pickOfferUrl([offer('Amazon Video', before, 'RENT')], 'Amazon Video'), after);
});

test('server resolution affiliates Amazon without changing other providers', async () => {
  const links = await resolveTitleWatchLinks({
    title: 'Dune', year: '2021',
    fetchImpl: okFetch(titlePayload([
      offer('Amazon Prime Video', 'https://www.primevideo.com/detail/0FILM?ref=x&tag=old-21'),
      offer('Netflix', 'https://www.netflix.com/title/81157729?ref=original'),
      offer('Apple TV', 'https://tv.apple.com/fr/movie/dune?at=original'),
      offer('Disney Plus', 'https://www.disneyplus.com/video/film'),
      offer('Max', 'https://www.max.com/title/film')
    ]))
  });
  assert.deepEqual(links, {
    prime: 'https://www.primevideo.com/detail/0FILM?ref=x&tag=elicine-21',
    'prime:stream': 'https://www.primevideo.com/detail/0FILM?ref=x&tag=elicine-21',
    netflix: 'https://www.netflix.com/title/81157729?ref=original',
    'netflix:stream': 'https://www.netflix.com/title/81157729?ref=original',
    apple: 'https://tv.apple.com/fr/movie/dune?at=original',
    'apple:stream': 'https://tv.apple.com/fr/movie/dune?at=original',
    disney: 'https://www.disneyplus.com/video/film',
    'disney:stream': 'https://www.disneyplus.com/video/film',
    max: 'https://www.max.com/title/film',
    'max:stream': 'https://www.max.com/title/film'
  });
});

test('API returns tagged title URLs on both the fresh response and cache hit', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', okFetch(titlePayload([
    offer('Amazon Video', 'https://www.amazon.fr/gp/video/detail/B0FILM?ref=x')
  ])));
  const req = { method: 'GET', query: { title: 'Dune', year: '2021', country: 'FR' } };
  const response = () => ({
    headers: {}, code: null, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  });
  const first = response();
  await watchLinkHandler(req, first);
  const cached = response();
  await watchLinkHandler(req, cached);
  assert.equal(first.code, 200);
  assert.deepEqual(first.body, { links: { prime: 'https://www.amazon.fr/gp/video/detail/B0FILM?ref=x&tag=elicine-21',
    'prime:stream': 'https://www.amazon.fr/gp/video/detail/B0FILM?ref=x&tag=elicine-21' } });
  assert.deepEqual(cached.body, first.body);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('the actual streaming click opens the same title with the affiliate tag', t => {
  const open = t.mock.fn();
  const clipboard = t.mock.fn(async () => {});
  mockGlobal(t, 'window', { open });
  mockGlobal(t, 'navigator', { clipboard: { writeText: clipboard } });
  redirectToStreamingProvider({ title: 'Dune' }, 'Amazon Prime Video', undefined,
    'https://www.primevideo.com/detail/0FILM?ref=x&tag=old-21#details');
  assert.deepEqual(open.mock.calls[0].arguments, [
    'https://www.primevideo.com/detail/0FILM?ref=x&tag=elicine-21#details', '_blank', 'noopener,noreferrer'
  ]);
  assert.equal(clipboard.mock.callCount(), 0);
});

test('the streaming click tags its search fallback when no title offer exists', async t => {
  const replace = t.mock.fn();
  const open = t.mock.fn(() => ({ location: { replace }, closed: false }));
  mockGlobal(t, 'window', { open });
  t.mock.method(globalThis, 'fetch', okFetch({ links: {} }));
  await redirectToStreamingProvider({ title: 'Dune' }, 'Amazon Prime Video');
  assert.equal(replace.mock.calls[0].arguments[0], 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune&tag=elicine-21');
});

test('non-Amazon resolved clicks and generated links retain their exact URLs', t => {
  const open = t.mock.fn();
  mockGlobal(t, 'window', { open });
  for (const [name, url] of [
    ['Netflix', 'https://www.netflix.com/title/81157729?tag=original'],
    ['Apple TV', 'https://tv.apple.com/movie/film?at=original'],
    ['Disney+', 'https://www.disneyplus.com/video/film'],
    ['Max', 'https://www.max.com/title/film'],
    ['Canal+', 'https://www.canalplus.com/cinema/film']
  ]) {
    redirectToStreamingProvider({ title: 'Dune' }, name, undefined, url);
    assert.equal(open.mock.calls.at(-1).arguments[0], url);
    assert.equal(getDirectStreamingUrl(name, 'Dune', '', null, url), url);
    assert.equal(deepLinkForProvider({ [name === 'Apple TV' ? 'apple' : name === 'Disney+' ? 'disney' : name === 'Canal+' ? 'canal' : name.toLowerCase()]: url }, name), url);
  }
  assert.equal(getVodStoreUrl('Apple TV'), 'https://tv.apple.com');
  assert.equal(getVodStoreUrl('Google Play Movies'), 'https://play.google.com/store/movies');
});

test('Android Prime intent and browser fallback both carry the tag', t => {
  mockGlobal(t, 'navigator', { userAgent: 'Android' });
  const intent = getPrimeVideoDeepLink('Dune', '0FILM', null, true);
  assert.ok(intent.startsWith('intent://www.primevideo.com/detail/0FILM?tag=elicine-21#Intent;'));
  const fallback = decodeURIComponent(intent.match(/S\.browser_fallback_url=([^;]+)/)[1]);
  assert.equal(fallback, 'https://www.primevideo.com/detail/0FILM?tag=elicine-21');
  assert.equal(getNetflixDeepLink('Dune', '81157729', null, true),
    'intent://www.netflix.com/title/81157729#Intent;scheme=https;package=com.netflix.mediaclient;S.browser_fallback_url=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F81157729;end');
});

test('Android Amazon.fr preserves the path and existing query in its intent', () => {
  const url = 'https://www.amazon.fr/gp/video/detail/B0FILM?ref=x&tag=old-21';
  const intent = buildAndroidIntentUrl(url, 'com.amazon.avod.thirdpartyclient', url);
  assert.ok(intent.startsWith('intent://www.amazon.fr/gp/video/detail/B0FILM?ref=x&tag=elicine-21#Intent;'));
  assert.equal(decodeURIComponent(intent.match(/S\.browser_fallback_url=([^;]+)/)[1]),
    'https://www.amazon.fr/gp/video/detail/B0FILM?ref=x&tag=elicine-21');
});

test('Prime streaming, Amazon rental and Amazon purchase remain separate for a movie', async t => {
  mockGlobal(t, 'localStorage', { getItem: () => null });
  t.mock.method(globalThis, 'fetch', okFetch({ results: { FR: {
    flatrate: [provider(119, 'Amazon Prime Video'), provider(8, 'Netflix')],
    rent: [provider(10, 'Amazon Video'), provider(10, 'Amazon Video'), provider(2, 'Apple TV')],
    buy: [provider(10, 'Amazon Video'), provider(2, 'Apple TV')]
  } } }));
  const media = await getMediaProviders(991001, 'movie', 'FR', 'Dune', undefined, { prime_id: '0FILM' });
  assert.equal(media.svod.status, 'local');
  assert.equal(media.svod.providers[0].url, 'https://www.primevideo.com/detail/0FILM?tag=elicine-21');
  assert.equal(media.svod.providers[1].url, 'https://www.netflix.com/search?q=Dune');
  assert.deepEqual(media.vod, [
    { name: 'Amazon Video', logo: null, url: 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune&tag=elicine-21', amazonOfferType: 'rent', offerType: 'rent' },
    { name: 'Apple TV', logo: null, url: 'https://tv.apple.com/search?term=Dune', offerType: 'rent' },
    { name: 'Amazon Video', logo: null, url: 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune&tag=elicine-21', amazonOfferType: 'buy', offerType: 'buy' },
    { name: 'Apple TV', logo: null, url: 'https://tv.apple.com/search?term=Dune', offerType: 'buy' }
  ]);
  const action = await resolveStreamingAction(991001, 'movie', 'FR', 'Dune');
  assert.equal(action.type, 'DIRECT');
  assert.equal(action.providers[0].actionUrl, media.svod.providers[0].url);
});

test('series use the TV endpoint and retain their Prime catalogue destination', async t => {
  mockGlobal(t, 'localStorage', { getItem: () => null });
  const fetchMock = t.mock.method(globalThis, 'fetch', okFetch({ results: { FR: {
    flatrate: [provider(119, 'Amazon Prime Video')], rent: [], buy: [provider(10, 'Amazon Video')]
  } } }));
  const media = await getMediaProviders(991002, 'tv', 'FR', 'The Boys', undefined, { prime_id: '0SERIES' });
  assert.match(fetchMock.mock.calls[0].arguments[0], /tv%2F991002%2Fwatch%2Fproviders/);
  assert.equal(media.svod.providers[0].url, 'https://www.primevideo.com/detail/0SERIES?tag=elicine-21');
  assert.deepEqual(media.vod.map(item => item.amazonOfferType), ['buy']);
});

test('purchase availability alone does not imply Prime streaming or rental', async t => {
  mockGlobal(t, 'localStorage', { getItem: () => null });
  t.mock.method(globalThis, 'fetch', okFetch({ results: { FR: { buy: [provider(10, 'Amazon Video')] } } }));
  const media = await getMediaProviders(991003, 'movie', 'FR', 'Dune');
  assert.equal(media.svod.status, 'none');
  assert.deepEqual(media.svod.providers, []);
  assert.equal(media.vod.length, 1);
  assert.equal(media.vod[0].amazonOfferType, 'buy');
});
