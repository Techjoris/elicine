import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle, pickBestCandidate, pickOfferUrl, providerKeyFor,
  resolveTitleWatchLinks, scoreCandidate, titleSimilarity
} from '../../api/_watchLink.js';
import { deepLinkForProvider } from '../../src/services/watchLinkResolver.ts';
import { isIntermediaryWatchLink, isPlatformSearchUrl } from '../../src/services/deepLinkHelper.ts';

const offer = (clearName, url, monetizationType = 'FLATRATE') => ({
  standardWebURL: url, monetizationType, package: { clearName }
});

const edge = (title, year, objectType, offers) => ({
  node: { objectType, content: { title, originalReleaseYear: year }, offers }
});

const payload = edges => ({ data: { popularTitles: { edges } } });

const stubFetch = response => async () => response;
const okFetch = body => stubFetch({ ok: true, json: async () => body });

test('TMDB and JustWatch spellings of the same provider share one key', () => {
  assert.equal(providerKeyFor('Amazon Prime Video'), providerKeyFor('Amazon Video'));
  assert.equal(providerKeyFor('Canal+'), providerKeyFor('Canal VOD'));
  assert.equal(providerKeyFor('Disney+'), providerKeyFor('Disney Plus'));
  assert.equal(providerKeyFor('Apple TV+'), providerKeyFor('Apple TV Store'));
  assert.equal(providerKeyFor('Netflix'), 'netflix');
});

test('a lender whose name merely contains Max is not HBO Max', () => {
  assert.equal(providerKeyFor('Max'), 'max');
  assert.equal(providerKeyFor('HBO Max'), 'max');
  assert.equal(providerKeyFor('Premiere Max'), null);
  assert.equal(providerKeyFor('Google Play Movies'), null);
});

test('titles compare across accents, casing and punctuation', () => {
  assert.equal(normalizeTitle("Le Fabuleux Destin d'Amélie Poulain"), 'le fabuleux destin d amelie poulain');
  assert.equal(titleSimilarity('Dune : Deuxième Partie', 'Dune deuxieme partie'), 1);
  assert.equal(titleSimilarity('Dune', 'Dune : Deuxième partie'), 0.85);
  assert.ok(titleSimilarity('Dune', 'Vaiana') === 0);
});

test('the release year breaks ties between homonyms instead of excluding the film', () => {
  const editions = [
    edge('Dune', 1984, 'MOVIE', [offer('Netflix', 'https://www.netflix.com/title/1984')]),
    edge('Dune : Deuxième partie', 2024, 'MOVIE', [offer('Netflix', 'https://www.netflix.com/title/2024')])
  ];
  const best = pickBestCandidate(editions, 'Dune : Deuxième Partie', '2024', 'MOVIE');
  assert.equal(best.content.originalReleaseYear, 2024);
  assert.ok(scoreCandidate(editions[1].node, 'Dune : Deuxième Partie', '2024') > scoreCandidate(editions[0].node, 'Dune : Deuxième Partie', '2024'));
});

test('a result that only shares a keyword is rejected', () => {
  assert.equal(pickBestCandidate([edge('Vaiana, la légende du bout du monde', 2026, 'MOVIE', [])], 'Dune', '2024', 'MOVIE'), null);
});

test('an offer is only kept when its provider matches', () => {
  const offers = [
    offer('Premiere Max', 'https://vod.premieremax.com/x'),
    offer('Netflix', 'https://www.netflix.com/title/70143836')
  ];
  assert.equal(pickOfferUrl(offers, 'Netflix'), 'https://www.netflix.com/title/70143836');
  assert.equal(pickOfferUrl(offers, 'Max'), null);
  assert.equal(pickOfferUrl(offers, 'Disney Plus'), null);
});

test('the resolver returns the exact title pages and ignores unknown providers', async () => {
  const links = await resolveTitleWatchLinks({
    title: 'Dune : Deuxième Partie',
    year: '2024',
    country: 'FR',
    mediaType: 'movie',
    fetchImpl: okFetch(payload([edge('Dune : Deuxième partie', 2024, 'MOVIE', [
      offer('Netflix', 'https://www.netflix.com/title/81157729'),
      offer('Disney Plus', 'https://www.disneyplus.com/browse/entity-abc'),
      offer('Premiere Max', 'https://vod.premieremax.com/premiere')
    ])]))
  });

  assert.deepEqual(links, {
    netflix: 'https://www.netflix.com/title/81157729',
    disney: 'https://www.disneyplus.com/browse/entity-abc'
  });
});

test('a failed or unusable upstream response leaves the caller on its fallback', async () => {
  const broken = await resolveTitleWatchLinks({
    title: 'Dune', year: '2024', fetchImpl: stubFetch({ ok: false, json: async () => ({}) })
  });
  assert.deepEqual(broken, {});

  const empty = await resolveTitleWatchLinks({
    title: 'Dune', year: '2024', fetchImpl: okFetch(payload([]))
  });
  assert.deepEqual(empty, {});

  const throwing = await resolveTitleWatchLinks({
    title: 'Dune', year: '2024', fetchImpl: async () => { throw new Error('reseau'); }
  });
  assert.deepEqual(throwing, {});

  assert.deepEqual(await resolveTitleWatchLinks({ title: '', fetchImpl: okFetch(payload([])) }), {});
});

test('the client only trusts a resolved link for the provider actually asked', () => {
  const links = { netflix: 'https://www.netflix.com/title/81157729', canal: 'https://www.canalplus.com/cinema/x/h/1_2' };
  assert.equal(deepLinkForProvider(links, 'Netflix'), 'https://www.netflix.com/title/81157729');
  assert.equal(deepLinkForProvider(links, 'Canal+'), 'https://www.canalplus.com/cinema/x/h/1_2');
  assert.equal(deepLinkForProvider(links, 'Amazon Prime Video'), null);
  assert.equal(deepLinkForProvider(null, 'Netflix'), null);
  assert.equal(deepLinkForProvider({ netflix: 'pas-une-url' }, 'Netflix'), null);
});

test('a search page is a fallback, never the film, and TMDB pages stay rejected', () => {
  assert.equal(isPlatformSearchUrl('https://www.netflix.com/search?q=Dune'), true);
  assert.equal(isPlatformSearchUrl('https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune'), true);
  assert.equal(isPlatformSearchUrl('https://www.canalplus.com/recherche/Dune'), true);
  assert.equal(isPlatformSearchUrl('https://www.netflix.com/title/81157729'), false);
  assert.equal(isPlatformSearchUrl('https://www.disneyplus.com/browse/entity-abc'), false);
  assert.equal(isIntermediaryWatchLink('https://www.themoviedb.org/movie/693134-dune-part-two/watch?locale=FR'), true);
  assert.equal(isIntermediaryWatchLink('https://www.netflix.com/title/81157729'), false);
});
