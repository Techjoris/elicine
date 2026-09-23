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
 * @property {Object} constraintData Internal structured facts, never exposed to HTTP.
 * @property {Object} diversityData Internal collection/director facts, never exposed to HTTP.
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
  const names = value => (Array.isArray(value) ? value : value == null ? [] : [value])
    .flatMap(item => typeof item === 'object' ? [item?.name] : String(item).split(','))
    .map(item => String(item || '').trim())
    .filter(item => item && !/^\d+$/.test(item));
  const countries = [...(Array.isArray(row.origin_country) ? row.origin_country : []),
    ...(Array.isArray(row.production_countries) ? row.production_countries.map(country => country?.iso_3166_1) : [])]
    .filter(Boolean).map(country => String(country).toUpperCase());
  const runtime = Number(row.runtime ?? (Array.isArray(row.episode_run_time) ? row.episode_run_time[0] : null));
  const collection = row.belongs_to_collection || row.collection || null;
  const directorEntries = [row.director, ...(Array.isArray(row.directors) ? row.directors : []),
    ...(Array.isArray(row.crew) ? row.crew.filter(person => person?.job === 'Director') : [])].filter(Boolean);
  const directorIds = directorEntries.map(person => Number(typeof person === 'object' ? person?.id : null))
    .filter(id => Number.isSafeInteger(id) && id > 0);
  return {
    tmdbId, mediaType, title,
    originalTitle: row.originalTitle || row.original_title || row.original_name || title,
    releaseDate: mediaType === 'movie' ? row.releaseDate || row.release_date || null : null,
    firstAirDate: mediaType === 'tv' ? row.firstAirDate || row.first_air_date || row.release_date || null : null,
    genreIds: [...new Set(genreIds)], originalLanguage: row.originalLanguage || row.original_language || null,
    sources: [source], retrievalSignals: [{ source, ...signal }],
    constraintData: {
      runtime: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
      countries: [...new Set(countries)], adult: typeof row.adult === 'boolean' ? row.adult : null,
      genres: names(row.genres), keywords: names(row.keywords), themes: names(row.themes), moods: names(row.moods),
      overview: row.overview || ''
    },
    diversityData: {
      collectionId: row.collectionId ?? row.collection_id ?? collection?.id ?? null,
      collectionName: row.collectionName || row.collection_name || collection?.name || null,
      directorIds: [...new Set(directorIds)], directorNames: names(directorEntries)
    },
    metadata: {
      overview: row.overview || '', poster_path: row.poster_path || null,
      backdrop_path: row.backdrop_path || null, vote_average: Number(row.vote_average) || 0,
      vote_count: Number(row.vote_count) || 0, popularity: Number(row.popularity) || 0,
      // Historical scoring can consume these lexical fields as well as TMDB IDs.
      genres: row.genres ?? genreIds.join(','), moods: row.moods || '', setting: row.setting || ''
    }
  };
}

const strength = { tmdb_recommendations: 5, tmdb_similar: 4, llm_candidates: 3.5,
  tmdb_discover: 3, supabase_vector: 3, tmdb_search: 2, tmdb_person_credits: 0.5,
  supabase_lexical: 1, legacy: 0 };
export function mergeCandidates(candidates, limit = 50, { narrative = false } = {}) {
  const byIdentity = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.mediaType}:${candidate.tmdbId}`;
    const previous = byIdentity.get(key);
    if (!previous) {
      byIdentity.set(key, { ...candidate, metadata: { ...candidate.metadata },
        constraintData: { ...candidate.constraintData, countries: [...candidate.constraintData.countries],
          genres: [...candidate.constraintData.genres], keywords: [...candidate.constraintData.keywords],
          themes: [...candidate.constraintData.themes], moods: [...candidate.constraintData.moods] },
        diversityData: { ...candidate.diversityData,
          directorIds: [...(candidate.diversityData?.directorIds || [])],
          directorNames: [...(candidate.diversityData?.directorNames || [])] },
        sources: [...candidate.sources], retrievalSignals: [...candidate.retrievalSignals] });
    } else {
      previous.sources = [...new Set([...previous.sources, ...candidate.sources])];
      previous.retrievalSignals.push(...candidate.retrievalSignals);
      previous.genreIds = [...new Set([...previous.genreIds, ...candidate.genreIds])];
      for (const field of ['releaseDate', 'firstAirDate', 'originalLanguage']) previous[field] ||= candidate[field];
      for (const [field, value] of Object.entries(candidate.metadata)) previous.metadata[field] ||= value;
      for (const field of ['countries', 'genres', 'keywords', 'themes', 'moods']) {
        previous.constraintData[field] = [...new Set([...previous.constraintData[field], ...candidate.constraintData[field]])];
      }
      for (const field of ['runtime', 'adult']) previous.constraintData[field] ??= candidate.constraintData[field];
      previous.constraintData.overview ||= candidate.constraintData.overview;
      previous.diversityData.collectionId ??= candidate.diversityData?.collectionId;
      previous.diversityData.collectionName ||= candidate.diversityData?.collectionName;
      for (const field of ['directorIds', 'directorNames']) {
        previous.diversityData[field] = [...new Set([
          ...(previous.diversityData[field] || []), ...(candidate.diversityData?.[field] || [])
        ])];
      }
    }
  }
  // Retrieval admission only. The final ranking and its public scores are unchanged.
  const evidence = (candidate, field) => Math.max(0, ...candidate.retrievalSignals.map(signal => signal[field] || 0));
  /**
   * How specifically a candidate was retrieved, as opposed to how popular it is.
   * A work surfaced by a keyword-restricted Discover, a person credit, a vector
   * neighbour or the narrative channel carries a described concept; a work that
   * merely sits high in a popularity-ordered list does not. Used only to break
   * admission ties, so a relevant but less popular title is not crowded out of
   * the bounded pool by broad sources.
   */
  const specificEvidence = candidate => Math.max(0, ...candidate.retrievalSignals.map(signal => {
    const keywordWidth = Array.isArray(signal.keywordIds) ? signal.keywordIds.length : 0;
    return Math.max(
      Number(signal.narrativeMatched) || 0,
      Number(signal.narrativeCoverage) || 0,
      Number(signal.keywordConjunctionSize) > 0 ? 1 : 0,
      keywordWidth > 0 ? 0.6 : 0,
      signal.source === 'tmdb_person_credits' ? 0.6 : 0,
      signal.source === 'supabase_vector' ? Number(signal.sourceScore) || 0 : 0
    );
  }));
  /**
   * A complementary angle (extra concept pair, release-date ordering, genre-free
   * disjunction) is *additive recall*: it must never displace the candidates the
   * historical angles already brought. Complementary candidates therefore fill
   * the seats the historical ones leave, and the ranking - not the admission
   * order - decides their final place.
   */
  const complementaryOnly = candidate =>
    candidate.retrievalSignals.some(signal => signal.complementary !== true) ? 0 : 1;
  /**
   * Admission rank read from the historical angles only, when the candidate has
   * any: a work that the broad angle already placed at rank 15 must not jump to
   * rank 2 of the admission queue just because an additive angle also listed it.
   */
  const historicalRank = candidate => {
    const ranked = candidate.retrievalSignals.filter(signal => Number.isFinite(Number(signal.sourceRank)));
    const historical = ranked.filter(signal => signal.complementary !== true);
    const used = historical.length ? historical : ranked;
    return used.length ? Math.min(...used.map(signal => Number(signal.sourceRank))) : Number.MAX_SAFE_INTEGER;
  };
  const merged = [...byIdentity.values()].sort((a, b) =>
    // Additive angles fill the seats the historical ones leave, in their own
    // order: the recorded pool composition (and the pre-ranking positions it
    // documents) is therefore untouched, while the extra candidates still
    // reach the ranking.
    complementaryOnly(a) - complementaryOnly(b) ||
    (narrative ? evidence(b, 'narrativeMatched') - evidence(a, 'narrativeMatched') ||
      evidence(b, 'narrativeCoverage') - evidence(a, 'narrativeCoverage') : 0) ||
    b.sources.length - a.sources.length ||
    Math.max(...b.sources.map(s => strength[s] ?? 0)) - Math.max(...a.sources.map(s => strength[s] ?? 0)) ||
    specificEvidence(b) - specificEvidence(a) ||
    historicalRank(a) - historicalRank(b) ||
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
