import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDiscoverPage, fetchTopRatedPage } from '../../src/services/tmdb.ts';
import { GENRES, genreIdFor, resolveGenreFilter } from '../../src/utils/catalogGenres.ts';

/**
 * `/discover/tv` et `/tv/top_rated` ne renvoient aucun champ `media_type`.
 * Sans repere, une serie etait etiquetee FILM : le badge affichait FILM et le
 * filtre genre du Catalogue cherchait l'identifiant cote film (Action = 28)
 * alors que la serie porte l'identifiant tele (Action & Aventure = 10759),
 * ce qui vidait la page ("0 titres").
 */
function stubTmdb(payload, captured = []) {
  const previous = globalThis.fetch;
  globalThis.fetch = async url => {
    captured.push(String(url));
    return { ok: true, status: 200, json: async () => payload };
  };
  return { captured, restore: () => { globalThis.fetch = previous; } };
}

const series = (id, name, genreIds) => ({ id, name, genre_ids: genreIds, vote_average: 8, vote_count: 500, overview: '' });

/** Regle de genre du filet de securite client de la vue Catalogue. */
function genreKeeps(movie, selectedKeys) {
  const itemType = movie.media_type === 'SÉRIE' || movie.media_type === 'tv' ? 'tv' : 'movie';
  const wanted = GENRES.filter(genre => selectedKeys.includes(genre.key))
    .map(genre => genreIdFor(genre, itemType))
    .filter(id => Number.isSafeInteger(id));
  const itemGenres = (Array.isArray(movie.genres) ? movie.genres : []).map(genre => Number(genre?.id));
  return !wanted.length || !itemGenres.length || wanted.some(id => itemGenres.includes(id));
}

test('a series coming from discover/tv is labelled as a series even when TMDB omits media_type', async () => {
  const stub = stubTmdb({ results: [series(1, 'Reacher', [10759, 80])], total_pages: 4 });
  try {
    const { results } = await fetchDiscoverPage(1, { mediaType: 'tv', genreIds: [10759] });
    assert.equal(results[0].media_type, 'SÉRIE');
    assert.ok(genreKeeps(results[0], ['action']), "la serie doit survivre au filtre Action");
  } finally {
    stub.restore();
  }
});

test('a series mislabelled as a film is what used to empty the page', async () => {
  const stub = stubTmdb({ results: [series(1, 'Reacher', [10759, 80])], total_pages: 4 });
  try {
    const { results } = await fetchDiscoverPage(1, { mediaType: 'tv', genreIds: [10759] });
    const beforeFix = { ...results[0], media_type: 'FILM' };
    assert.equal(genreKeeps(beforeFix, ['action']), false, 'etiquetee FILM, la serie etait rejetee et la page vide');
  } finally {
    stub.restore();
  }
});

test('the series filter keeps the TV genre identifier in the request', async () => {
  const stub = stubTmdb({ results: [], total_pages: 1 });
  try {
    const { ids } = resolveGenreFilter(['action'], 'tv');
    await fetchDiscoverPage(1, { mediaType: 'tv', genreIds: ids });
    assert.match(decodeURIComponent(stub.captured[0]), /with_genres=10759/);
  } finally {
    stub.restore();
  }
});

test('tv top rated results are labelled as series too', async () => {
  const stub = stubTmdb({ results: [series(2, 'Severance', [18, 9648])], total_pages: 2 });
  try {
    const { results } = await fetchTopRatedPage(1, 'tv');
    assert.equal(results[0].media_type, 'SÉRIE');
    assert.ok(genreKeeps(results[0], ['drama']), 'Drame partage le meme identifiant en film et en serie');
  } finally {
    stub.restore();
  }
});

test('movie results keep their film label', async () => {
  const stub = stubTmdb({ results: [{ id: 9, title: 'Heat', genre_ids: [80, 53], vote_average: 8, vote_count: 900 }], total_pages: 1 });
  try {
    const { results } = await fetchDiscoverPage(1, { mediaType: 'movie', genreIds: [80] });
    assert.equal(results[0].media_type, 'FILM');
    assert.ok(genreKeeps(results[0], ['crime']));
    assert.equal(genreKeeps(results[0], ['action']), false, 'un film policier ne doit pas passer pour un film d action');
  } finally {
    stub.restore();
  }
});
