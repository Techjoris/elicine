import { toLegacyRankingCandidate } from './retrievalCandidate.js';
import { normalizeTerm, tmdbGenreIds } from './tmdbRetrievalParams.js';
import { expandSemanticTerms } from './semanticExpansion.js';

export const ELICINE_RANKING_FLAG = 'ELICINE_RANKING_ENABLED';

export const ELICINE_RANKING_CONFIG = Object.freeze({
  weights: Object.freeze({
    semanticScore: 0.18, genreScore: 0.13, themeScore: 0.09, moodScore: 0.07,
    keywordScore: 0.09, referenceScore: 0.12, entityScore: 0.12, titleScore: 0.04,
    yearScore: 0.035, languageScore: 0.025, countryScore: 0.015, qualityScore: 0.05,
    popularityScore: 0.01, sourceConfidenceScore: 0.025
  }),
  quality: Object.freeze({ priorMean: 6.5, priorVotes: 500, normalizedFloor: 4, normalizedRange: 5 }),
  popularityScale: 1000,
  tieEpsilon: 0.005,
  sourceConfidence: Object.freeze({
    tmdb_person_credits: 1, tmdb_similar: 0.97, tmdb_recommendations: 0.95,
    supabase_vector: 0.86, tmdb_discover: 0.74, supabase_lexical: 0.62,
    tmdb_search: 0.58, fallback: 0.45, legacy: 0.40
  }),
  sourceMultiBonus: 0.05,
  sourceMultiBonusCap: 0.15,
  // Multi-signal convergence: a bounded share of the final score reserved for
  // candidates supported by several independent strong signals instead of a
  // single generic genre or keyword.
  convergenceWeight: 0.095,
  convergence: Object.freeze({ strongSignalThreshold: 0.6, targetSignalCount: 4, breadthShare: 0.2 }),
  // Public match curve. The displayed percentage must be credible: a clearly
  // stronger match displays a clearly stronger score. Pure calibration of the
  // computed score, never a per-title value.
  publicMatch: Object.freeze({ floor: 22, spread: 78, saturation: 0.8, gamma: 1.15 })
});

export function isElicineRankingEnabled(env = process.env) {
  return String(env?.[ELICINE_RANKING_FLAG] ?? 'true').toLowerCase() !== 'false';
}

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const round = value => Number(clamp(value).toFixed(6));
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const normalized = values => [...new Set(array(values).map(value =>
  normalizeTerm(typeof value === 'object' ? value?.name ?? value?.id : value)).filter(Boolean))];
const tokens = value => new Set(normalizeTerm(value).split(' ').filter(token => token.length > 1));
const containsPhrase = (text, phrase) => (` ${text} `).includes(` ${phrase} `);

function termCoverage(requested, structured, freeText) {
  const wanted = normalized(requested);
  if (!wanted.length) return 0;
  const facts = normalized(structured);
  const text = normalizeTerm(freeText);
  const scores = wanted.map(term => {
    if (facts.includes(term) || containsPhrase(text, term)) return 1;
    const wantedTokens = tokens(term);
    if (!wantedTokens.size) return 0;
    const available = new Set([...facts.flatMap(value => [...tokens(value)]), ...tokens(text)]);
    return clamp([...wantedTokens].filter(token => available.has(token)).length / wantedTokens.size) * 0.8;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function candidateText(candidate) {
  const data = candidate.constraintData || {};
  const metadata = candidate.metadata || {};
  return [candidate.title, candidate.originalTitle, metadata.overview, metadata.setting,
    data.overview, ...array(data.genres), ...array(data.keywords), ...array(data.themes),
    ...array(data.moods)].filter(Boolean).join(' ');
}

function candidateYear(candidate) {
  const value = candidate.releaseDate || candidate.firstAirDate;
  const year = Number.parseInt(String(value || '').slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function sourceSimilarity(candidate) {
  return Math.max(0, ...array(candidate.retrievalSignals).map(signal =>
    signal?.source === 'supabase_vector' ? clamp(signal.sourceScore) : 0));
}

function genreOverlap(candidate, intent) {
  const expected = tmdbGenreIds(intent.genres || [], candidate.mediaType);
  if (!expected.length) {
    return termCoverage(intent.genres, candidate.constraintData?.genres, candidate.metadata?.genres || '');
  }
  return expected.filter(id => candidate.genreIds.includes(id)).length / expected.length;
}

function qualityScore(candidate) {
  const average = Math.max(0, Math.min(10, Number(candidate.metadata?.vote_average) || 0));
  const votes = Math.max(0, Number(candidate.metadata?.vote_count) || 0);
  const { priorMean, priorVotes, normalizedFloor, normalizedRange } = ELICINE_RANKING_CONFIG.quality;
  const bayesian = (votes * average + priorVotes * priorMean) / (votes + priorVotes);
  return clamp((bayesian - normalizedFloor) / normalizedRange);
}

function popularityScore(candidate) {
  const popularity = Math.max(0, Number(candidate.metadata?.popularity) || 0);
  return clamp(Math.log1p(popularity) / Math.log1p(ELICINE_RANKING_CONFIG.popularityScale));
}

function sourceConfidenceScore(candidate) {
  const sources = [...new Set(candidate.sources || [])];
  const base = Math.max(0, ...sources.map(source => ELICINE_RANKING_CONFIG.sourceConfidence[source] || 0));
  const bonus = Math.min(ELICINE_RANKING_CONFIG.sourceMultiBonusCap,
    Math.max(0, sources.length - 1) * ELICINE_RANKING_CONFIG.sourceMultiBonus);
  return clamp(base * 0.85 + bonus);
}

/**
 * Convergence: how many independent strong signals agree on this candidate,
 * plus how many distinct retrieval sources surfaced it. Two candidates with
 * comparable coverage but different convergence must not display the same
 * match, otherwise the grid shows an unexplained plateau.
 */
function convergenceScore(components, candidate) {
  const { strongSignalThreshold, targetSignalCount, breadthShare } = ELICINE_RANKING_CONFIG.convergence;
  const evidence = [components.entityScore, components.referenceScore, components.titleScore,
    components.themeScore, components.keywordScore, components.moodScore, components.genreScore,
    components.semanticScore];
  const satisfied = evidence.filter(value => value >= strongSignalThreshold).length;
  const breadth = clamp(Math.max(0, (candidate.sources || []).length - 1) / 2);
  return clamp(clamp(satisfied / targetSignalCount) * (1 - breadthShare) + breadth * breadthShare);
}

/**
 * Credible 0-100 public score for one candidate. Monotone in the computed
 * score, so the displayed grid never contradicts the ranking order, and
 * purely calibrated: no per-title value is ever hardcoded.
 */
export function publicMatchScore(finalScore) {
  const { floor, spread, saturation, gamma } = ELICINE_RANKING_CONFIG.publicMatch;
  const normalized = clamp(clamp(finalScore) / saturation) ** gamma;
  return Math.round(Math.min(100, Math.max(0, floor + spread * normalized)));
}

function referenceScore(candidate, resolvedContext, semanticScore) {
  const references = resolvedContext?.resolvedTitles || [];
  if (!references.length) return 0;
  if (references.some(reference => reference.mediaType === candidate.mediaType && reference.tmdbId === candidate.tmdbId)) return 0;
  const referenceIds = new Set(references.map(reference => `${reference.mediaType}:${reference.tmdbId}`));
  const signals = candidate.retrievalSignals || [];
  const recommended = signals.some(signal => signal.source === 'tmdb_recommendations' &&
    (!signal.seedTmdbId || referenceIds.has(`${candidate.mediaType}:${signal.seedTmdbId}`)));
  const similar = signals.some(signal => signal.source === 'tmdb_similar' &&
    (!signal.seedTmdbId || referenceIds.has(`${candidate.mediaType}:${signal.seedTmdbId}`)));
  const sharedGenres = Math.max(0, ...references.map(reference => {
    const ids = reference.genreIds || [];
    return ids.length ? ids.filter(id => candidate.genreIds.includes(id)).length / ids.length : 0;
  }));
  const sharedReferenceTerms = Math.max(0, ...references.map(reference => termCoverage(
    [...array(reference.keywords), ...array(reference.themes)],
    [...array(candidate.constraintData?.keywords), ...array(candidate.constraintData?.themes)],
    candidateText(candidate)
  )));
  return clamp(Math.max(recommended ? 1 : 0, similar ? 0.92 : 0,
    sourceSimilarity(candidate) * 0.85, sharedGenres * 0.75,
    sharedReferenceTerms * 0.8, semanticScore * 0.65));
}

function entityScore(candidate, intent, resolvedContext, semanticScore) {
  const people = array(resolvedContext?.resolvedPeople).filter(person =>
    Number.isSafeInteger(Number(person?.tmdbId)) && Number(person.tmdbId) > 0);
  if (!people.length) return 0;
  const signals = array(candidate.retrievalSignals);
  const matchedPeople = people.filter(person => signals.some(signal =>
    signal?.source === 'tmdb_person_credits' && Number(signal.personTmdbId) === Number(person.tmdbId)));
  if (!matchedPeople.length) return 0;
  const confidence = Math.max(...matchedPeople.map(person => clamp(person.resolutionConfidence ?? 1)));

  // A person-credit hit is useful on its own. When the query also carries a
  // distinct concept (dreams, war, memory...), reward the conjunction rather
  // than every credit for the same performer equally.
  const personTokens = new Set(matchedPeople.flatMap(person => [person.inputName, person.name]
    .flatMap(value => [...tokens(value)])));
  const semanticTerms = normalized([...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]);
  const hasIndependentSemantics = semanticTerms.some(term =>
    [...tokens(term)].some(token => !personTokens.has(token)));
  return hasIndependentSemantics
    ? clamp(confidence * (0.4 + semanticScore * 0.6))
    : confidence;
}

function titleScore(candidate, intent, resolvedContext) {
  const known = normalized(intent.knownTitles);
  if (!known.length) return 0;
  const self = (resolvedContext?.resolvedTitles || []).some(reference =>
    reference.mediaType === candidate.mediaType && reference.tmdbId === candidate.tmdbId);
  if (self) return 0;
  const titles = normalized([candidate.title, candidate.originalTitle]);
  if (known.some(value => titles.includes(value))) return 1;
  return Math.max(0, ...known.flatMap(reference => titles.map(title => {
    const referenceTokens = tokens(reference);
    const titleTokens = tokens(title);
    if (!referenceTokens.size || !titleTokens.size) return 0;
    const intersection = [...referenceTokens].filter(token => titleTokens.has(token)).length;
    return (intersection / new Set([...referenceTokens, ...titleTokens]).size) * 0.7;
  })));
}

function boundedYearScore(candidate, intent) {
  const year = candidateYear(candidate);
  if (year == null) return 0.5;
  if (intent.yearMin != null && intent.yearMax == null) {
    return clamp(0.5 + Math.max(0, year - intent.yearMin) / 20);
  }
  if (intent.yearMin == null && intent.yearMax != null) return year <= intent.yearMax ? 1 : 0;
  return year >= intent.yearMin && year <= intent.yearMax ? 1 : 0;
}

export function scoreSearchCandidate(candidate, intent = {}, resolvedContext = {}) {
  const data = candidate.constraintData || {};
  const text = candidateText(candidate);
  const semanticTerms = [...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)];
  const expansion = expandSemanticTerms(intent);
  const lexicalSemantic = termCoverage(semanticTerms,
    [...array(data.themes), ...array(data.moods), ...array(data.keywords)], text);
  const expandedSemantic = termCoverage(expansion.addedTerms,
    [...array(data.themes), ...array(data.moods), ...array(data.keywords)], text);
  const semanticScore = Math.max(sourceSimilarity(candidate), lexicalSemantic, expandedSemantic);
  const components = {
    semanticScore: round(semanticScore), genreScore: round(genreOverlap(candidate, intent)),
    themeScore: round(termCoverage(intent.themes, data.themes, text)),
    moodScore: round(termCoverage(intent.moods, data.moods, text)),
    keywordScore: round(termCoverage(intent.keywords, data.keywords, text)),
    referenceScore: 0, entityScore: 0,
    titleScore: round(titleScore(candidate, intent, resolvedContext)),
    yearScore: round(boundedYearScore(candidate, intent)),
    languageScore: intent.languages?.length ? (candidate.originalLanguage ?
      Number(intent.languages.includes(candidate.originalLanguage.toLowerCase())) : 0.5) : 0,
    countryScore: intent.countries?.length ? (data.countries?.length ?
      Number(data.countries.some(country => intent.countries.includes(country))) : 0.5) : 0,
    qualityScore: round(qualityScore(candidate)), popularityScore: round(popularityScore(candidate)),
    sourceConfidenceScore: round(sourceConfidenceScore(candidate))
  };
  components.referenceScore = round(referenceScore(candidate, resolvedContext, components.semanticScore));
  components.entityScore = round(entityScore(candidate, intent, resolvedContext, components.semanticScore));
  components.convergenceScore = round(convergenceScore(components, candidate));

  const active = {
    semanticScore: semanticTerms.length > 0 || (resolvedContext?.resolvedTitles || []).length > 0,
    genreScore: (intent.genres || []).length > 0,
    themeScore: (intent.themes || []).length > 0,
    moodScore: (intent.moods || []).length > 0,
    keywordScore: (intent.keywords || []).length > 0,
    referenceScore: (resolvedContext?.resolvedTitles || []).length > 0,
    entityScore: (resolvedContext?.resolvedPeople || []).length > 0,
    titleScore: (intent.knownTitles || []).length > 0,
    yearScore: intent.yearMin != null || intent.yearMax != null,
    languageScore: (intent.languages || []).length > 0,
    countryScore: (intent.countries || []).length > 0,
    qualityScore: true, popularityScore: true, sourceConfidenceScore: true
  };
  const weighted = Object.entries(ELICINE_RANKING_CONFIG.weights).filter(([name]) => active[name]);
  const weightTotal = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  const coverageScore = weightTotal
    ? weighted.reduce((sum, [name, weight]) => sum + components[name] * weight, 0) / weightTotal : 0;
  // The documented weights stay untouched (they sum to 1): convergence is
  // blended in as an explicit share so the historical signal proportions are
  // preserved while genuine multi-signal agreement is rewarded.
  const finalScore = clamp(coverageScore * (1 - ELICINE_RANKING_CONFIG.convergenceWeight) +
    components.convergenceScore * ELICINE_RANKING_CONFIG.convergenceWeight);
  const intentNames = ['semanticScore', 'genreScore', 'themeScore', 'moodScore', 'keywordScore',
    'referenceScore', 'entityScore', 'titleScore', 'yearScore', 'languageScore', 'countryScore'];
  const intentWeighted = weighted.filter(([name]) => intentNames.includes(name));
  const intentWeight = intentWeighted.reduce((sum, [, weight]) => sum + weight, 0);
  const intentScore = intentWeight ? intentWeighted.reduce((sum, [name, weight]) =>
    sum + components[name] * weight, 0) / intentWeight : 0;
  return { ...components, intentScore: round(intentScore), finalScore: round(finalScore),
    matchScore: publicMatchScore(finalScore) };
}

function compareRanked(left, right) {
  const a = left.ranking;
  const b = right.ranking;
  if (Math.abs(b.finalScore - a.finalScore) > ELICINE_RANKING_CONFIG.tieEpsilon) return b.finalScore - a.finalScore;
  for (const field of ['intentScore', 'entityScore', 'referenceScore', 'semanticScore', 'qualityScore']) {
    if (b[field] !== a[field]) return b[field] - a[field];
  }
  const voteDifference = Number(right.metadata?.vote_count || 0) - Number(left.metadata?.vote_count || 0);
  if (voteDifference) return voteDifference;
  const popularityDifference = Number(right.metadata?.popularity || 0) - Number(left.metadata?.popularity || 0);
  if (popularityDifference) return popularityDifference;
  return left.tmdbId - right.tmdbId;
}

export function rankSearchCandidates(candidates, intent, resolvedContext, {
  telemetry = {}, env = process.env, enabled = isElicineRankingEnabled(env), accumulate = true
} = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (!enabled) return input;
  const startedAt = Date.now();
  const ranked = input.map(candidate => ({ ...candidate,
    ranking: scoreSearchCandidate(candidate, intent, resolvedContext) })).sort(compareRanked);
  const priorCount = accumulate && telemetry.rankingAttempted ? Number(telemetry.rankingCandidateCount || 0) : 0;
  const priorTotal = priorCount * Number(telemetry.rankingAverageScore || 0);
  const currentTotal = ranked.reduce((sum, candidate) => sum + candidate.ranking.finalScore, 0);
  const count = priorCount + ranked.length;
  Object.assign(telemetry, {
    rankingAttempted: true,
    rankingCandidateCount: count,
    rankingDurationMs: (accumulate ? Number(telemetry.rankingDurationMs || 0) : 0) + (Date.now() - startedAt),
    rankingTopScore: round(Math.max(Number(telemetry.rankingTopScore || 0), ranked[0]?.ranking.finalScore || 0)),
    rankingAverageScore: round(count ? (priorTotal + currentTotal) / count : 0)
  });
  return ranked;
}

/** Public compatibility adapter: only the real 0–100 match is exposed. */
export function toElicineRankedResult(candidate, badgeLabel = 'Sélection Éliciné') {
  const movie = toLegacyRankingCandidate(candidate);
  return {
    ...movie, ai_badge: badgeLabel, badge: badgeLabel,
    ai_match_reason: "Correspondance calculée par le ranking Éliciné",
    match_rate: candidate.ranking?.matchScore ?? 0,
    is_hybrid_match: (candidate.sources || []).length > 1
  };
}
