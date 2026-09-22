/**
 * Media badge regression: the catalogue emits both the canonical provider
 * values ("movie"/"tv") and the historical display labels ("FILM"/"SÉRIE").
 * A series must never be labelled FILM, whatever channel carries it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { isSeriesMedia, mediaTypeBadge, mediaTypeEndpoint } from '../../src/lib/mediaType.ts';

test('every series representation displays the series badge', () => {
  for (const value of ['tv', 'SÉRIE', 'series']) {
    assert.equal(isSeriesMedia(value), true, String(value));
    assert.equal(mediaTypeEndpoint(value), 'tv', String(value));
    assert.equal(mediaTypeBadge(value, { series: 'SÉRIE', film: 'FILM' }), 'SÉRIE', String(value));
  }
});

test('films keep the film badge and endpoint', () => {
  for (const value of ['movie', 'FILM', undefined, null]) {
    assert.equal(isSeriesMedia(value), false, String(value));
    assert.equal(mediaTypeEndpoint(value), 'movie', String(value));
    assert.equal(mediaTypeBadge(value, { series: 'SÉRIE', film: 'FILM' }), 'FILM', String(value));
  }
});

test('a title containing the word série never changes the media type', () => {
  assert.equal(mediaTypeBadge('movie', { series: 'SÉRIE', film: 'FILM' }), 'FILM');
  assert.equal(mediaTypeBadge('tv', { series: 'SÉRIE', film: 'FILM' }), 'SÉRIE');
});
