/**
 * @typedef {Object} RetrievalCandidate
 * @property {number} tmdbId
 * @property {'movie'|'tv'} mediaType
 * @property {string} title
 * @property {string} originalTitle
 * @property {string|null} releaseDate
 * @property {string|null} firstAirDate
 * @property {number[]} genreIds
 * @property {string|null} originalLanguage
 * @property {string[]} sources
 * @property {Object[]} retrievalSignals Internal provenance, NOT final scores.
 * @property {Object} metadata Allowlisted display/ranking fields, never raw provider data.
 */
export function candidateMediaType(row, hint = null) {
  if (row?.media_type === 'person') return null;
  const explicit = row?.mediaType || row?.media_type;
  if (['tv', 'SÉRIE', 'series'].includes(explicit)) return 'tv';
  if (['movie', 'FILM', 'film'].includes(explicit)) return 'movie';
  if (row?.first_air_date || (row?.name && !row?.title)) return 'tv';
  if (row?.release_date && row?.title) return 'movie';
  if (hint === 'movie' || hint === 'tv') return hint;
  return null;
}

export function toRetrievalCandidate(row, source, { mediaType: hint = null, ...signal } = {}) {
  const tmdbId = Number(row?.tmdbId ?? row?.tmdb_id ?? row?.id);
  const mediaType = candidateMediaType(row, hint);
  const title = row?.title || row?.name || row?.original_title || '';
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return null;
  const genres = row.genreIds || row.genre_ids || row.genres || [];
  const genreIds = (Array.isArray(genres) ? genres : String(genres).split(','))
    .map(g => Number(typeof g === 'object' ? g?.id : g)).filter(n => Number.isInteger(n) && n > 0);
  return {
    tmdbId, mediaType, title,
    originalTitle: row.originalTitle || row.original_title || row.original_name || title,
    releaseDate: mediaType === 'movie' ? row.releaseDate || row.release_date || null : null,
    firstAirDate: mediaType === 'tv' ? row.firstAirDate || row.first_air_date || row.release_date || null : null,
    genreIds: [...new Set(genreIds)], originalLanguage: row.originalLanguage || row.original_language || null,
    sources: [source], retrievalSignals: [{ source, ...signal }],
    metadata: {
      overview: row.overview || '', poster_path: row.poster_path || null,
      backdrop_path: row.backdrop_path || null, vote_average: Number(row.vote_average) || 0,
      vote_count: Number(row.vote_count) || 0, popularity: Number(row.popularity) || 0,
      // Historical scoring can consume these lexical fields as well as TMDB IDs.
      genres: row.genres ?? genreIds.join(','), moods: row.moods || '', setting: row.setting || ''
    }
  };
}

const strength = { tmdb_recommendations: 5, tmdb_similar: 4, tmdb_discover: 3, tmdb_search: 2, supabase_lexical: 1, legacy: 0 };
export function mergeCandidates(candidates, limit = 50) {
  const byIdentity = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.mediaType}:${candidate.tmdbId}`;
    const previous = byIdentity.get(key);
    if (!previous) {
      byIdentity.set(key, { ...candidate, metadata: { ...candidate.metadata }, sources: [...candidate.sources], retrievalSignals: [...candidate.retrievalSignals] });
    } else {
      previous.sources = [...new Set([...previous.sources, ...candidate.sources])];
      previous.retrievalSignals.push(...candidate.retrievalSignals);
      previous.genreIds = [...new Set([...previous.genreIds, ...candidate.genreIds])];
      for (const field of ['releaseDate', 'firstAirDate', 'originalLanguage']) previous[field] ||= candidate[field];
      for (const [field, value] of Object.entries(candidate.metadata)) previous.metadata[field] ||= value;
    }
  }
  // Lexicographic priority only; no semantic/popularity/rating score is computed.
  const merged = [...byIdentity.values()].sort((a, b) =>
    b.sources.length - a.sources.length ||
    Math.max(...b.sources.map(s => strength[s] ?? 0)) - Math.max(...a.sources.map(s => strength[s] ?? 0)) ||
    Math.min(...a.retrievalSignals.map(s => s.sourceRank ?? 0)) - Math.min(...b.retrievalSignals.map(s => s.sourceRank ?? 0)) ||
    `${a.mediaType}:${a.tmdbId}`.localeCompare(`${b.mediaType}:${b.tmdbId}`));
  return { afterDedup: merged.length, candidates: merged.slice(0, Math.max(0, Math.min(50, limit))) };
}

/** Explicit allowlist: provenance and retrieval priority cannot leak to HTTP. */
export function toLegacyRankingCandidate(candidate) {
  const image = (path, size) => path && !/^https?:\/\//.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : path;
  return {
    ...candidate.metadata, id: candidate.tmdbId, tmdb_id: candidate.tmdbId,
    title: candidate.title, original_title: candidate.originalTitle,
    release_date: candidate.releaseDate || candidate.firstAirDate || '',
    original_language: candidate.originalLanguage, genre_ids: candidate.genreIds,
    media_type: candidate.mediaType,
    poster_path: image(candidate.metadata.poster_path, 'w500'),
    backdrop_path: image(candidate.metadata.backdrop_path, 'w1280')
  };
}
