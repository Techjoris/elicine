import test from 'node:test';
import assert from 'node:assert/strict';
import { withAmazonAffiliateTag, PRIME_VIDEO_TRIAL_URL } from '../../src/lib/amazonAffiliate.js';

const cases = [
  ['Amazon title without query', 'https://www.amazon.fr/gp/video/detail/amzn1.dv.gti.film', 'https://www.amazon.fr/gp/video/detail/amzn1.dv.gti.film?tag=elicine-21'],
  ['Prime title without query', 'https://www.primevideo.com/detail/0FILM', 'https://www.primevideo.com/detail/0FILM?tag=elicine-21'],
  ['query kept', 'https://www.amazon.fr/dp/B0FILM?ref_=atv_dp&language=fr_FR', 'https://www.amazon.fr/dp/B0FILM?ref_=atv_dp&language=fr_FR&tag=elicine-21'],
  ['existing tag replaced', 'https://www.amazon.fr/dp/B0FILM?ref=x&tag=old-21&language=fr', 'https://www.amazon.fr/dp/B0FILM?ref=x&tag=elicine-21&language=fr'],
  ['Prime existing tag replaced', 'https://www.primevideo.com/detail/0SERIES?tag=old-21', 'https://www.primevideo.com/detail/0SERIES?tag=elicine-21'],
  ['duplicate tags collapsed', 'https://www.amazon.fr/dp/B0FILM?tag=old&x=1&tag=other&x=2', 'https://www.amazon.fr/dp/B0FILM?tag=elicine-21&x=1&x=2'],
  ['encoded tag replaced', 'https://www.primevideo.com/detail/0FILM?%74ag=old&x=1', 'https://www.primevideo.com/detail/0FILM?tag=elicine-21&x=1'],
  ['empty tag replaced', 'https://amazon.fr/dp/B0FILM?tag&x=1', 'https://amazon.fr/dp/B0FILM?tag=elicine-21&x=1'],
  ['fragment kept', 'https://www.primevideo.com/detail/0SERIES?season=2#episode-3', 'https://www.primevideo.com/detail/0SERIES?season=2&tag=elicine-21#episode-3'],
  ['fragment resembling tag kept', 'https://amazon.fr/dp/B0FILM#tag=old?x=1', 'https://amazon.fr/dp/B0FILM?tag=elicine-21#tag=old?x=1'],
  ['encoding and repeated params kept byte for byte', 'https://www.primevideo.com/search?phrase=Am%C3%A9lie%20Poulain&ref=a%2fb&x=1&x=2&redirect=https%3A%2F%2Fexample.com%3Ftag%3Dold', 'https://www.primevideo.com/search?phrase=Am%C3%A9lie%20Poulain&ref=a%2fb&x=1&x=2&redirect=https%3A%2F%2Fexample.com%3Ftag%3Dold&tag=elicine-21'],
  ['trailing query separator', 'https://amazon.fr/dp/B0FILM?ref=x&', 'https://amazon.fr/dp/B0FILM?ref=x&tag=elicine-21'],
  ['empty query', 'https://primevideo.com/?', 'https://primevideo.com/?tag=elicine-21'],
  ['subdomain and port', 'https://video.amazon.fr:443/dp/B0FILM', 'https://video.amazon.fr:443/dp/B0FILM?tag=elicine-21'],
  ['hostname casing preserved', 'https://WWW.PRIMEVIDEO.COM/detail/0FILM', 'https://WWW.PRIMEVIDEO.COM/detail/0FILM?tag=elicine-21'],
  ['protocol-relative URL', '//www.amazon.fr/dp/B0FILM', '//www.amazon.fr/dp/B0FILM?tag=elicine-21'],
  ['http retained', 'http://www.amazon.fr/dp/B0FILM', 'http://www.amazon.fr/dp/B0FILM?tag=elicine-21'],
];

for (const [name, before, after] of cases) {
  test(name, () => {
    assert.equal(withAmazonAffiliateTag(before), after);
    assert.equal(withAmazonAffiliateTag(after), after, 'tagging is idempotent');
    const original = new URL(before.startsWith('//') ? `https:${before}` : before);
    const tagged = new URL(after.startsWith('//') ? `https:${after}` : after);
    assert.equal(tagged.origin, original.origin);
    assert.equal(tagged.pathname, original.pathname);
    assert.equal(tagged.hash, original.hash);
    assert.deepEqual([...tagged.searchParams].filter(([key]) => key !== 'tag'), [...original.searchParams].filter(([key]) => key !== 'tag'));
    assert.deepEqual(tagged.searchParams.getAll('tag'), ['elicine-21']);
  });
}

for (const url of [
  'https://www.netflix.com/title/81157729?tag=existing',
  'https://tv.apple.com/fr/movie/dune?at=partner',
  'https://www.disneyplus.com/video/film',
  'https://www.max.com/title/film',
  'https://www.canalplus.com/cinema/film',
  'https://www.amazon.com/dp/B0FILM',
  'https://amazon.fr.example.com/film',
  'https://notamazon.fr/film',
  'https://evilprimevideo.com/film',
  'https://primevideo.com.evil.test/film',
  'https://example.com/?url=https://amazon.fr/',
  'https://amazon.fr@example.com/film',
  'ftp://www.amazon.fr/film',
  '/film?amazon.fr',
  'not a URL', '', null, undefined
]) {
  test(`leaves other URLs unchanged: ${url}`, () => assert.equal(withAmazonAffiliateTag(url), url));
}

test('trial uses the dedicated homepage URL', () => {
  assert.equal(PRIME_VIDEO_TRIAL_URL, 'https://www.primevideo.com/?tag=elicine-21');
});
