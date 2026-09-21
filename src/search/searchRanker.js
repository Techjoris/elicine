import { toLegacyRankingCandidate } from './retrievalCandidate.js';
import { normalizeTerm, tmdbGenreIds } from './tmdbRetrievalParams.js';
import { expandSemanticTerms } from './semanticExpansion.js';
import { characterSimilarity } from './requestedWork.js';
import { CONCEPT_WEIGHTS, conceptMatch, conceptSpecificity } from './semanticLexicon.js';

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
    llm_candidates: 0.90, supabase_vector: 0.86, tmdb_discover: 0.74, supabase_lexical: 0.62,
    tmdb_search: 0.58, fallback: 0.45, legacy: 0.40
  }),
  sourceMultiBonus: 0.05,
  sourceMultiBonusCap: 0.15,
  // A person credit is recall, not relevance: when the query also describes the
  // film, the credit only earns the floor and the narrative decides the rest.
  entity: Object.freeze({ narrativeFloor: 0.15 }),
  // Multi-signal convergence: a bounded share of the final score reserved for
  // candidates supported by several independent strong signals instead of a
  // single generic genre or keyword.
  convergenceWeight: 0.095,
  convergence: Object.freeze({ strongSignalThreshold: 0.6, targetSignalCount: 4, breadthShare: 0.2 }),
  // A work the query names is not a weighted component among others: it is the
  // answer. It earns an explicit share of the final score, activated only when
  // the query really requests that work ("Inception") and never when it merely
  // compares to it ("comme Inception", where the seed must not monopolise the
  // grid). Empty of requested works, the blend is exactly the historical one.
  identifiedWorkWeight: 0.35,
  // The model's proposal is retrieval evidence, not a verdict. It earns an
  // explicit, bounded share of the final score, outside the documented weight
  // table, and only for a work TMDB confirmed. Its own justification is read
  // with the same concept primitive as the rest of the engine: an unexplained
  // proposal earns half the share, a coherent one earns all of it. With no
  // proposal the blend is exactly the historical one.
  narrativeCandidateWeight: 0.28,
  narrativeCandidate: Object.freeze({ rankSpan: 10, reasonFloor: 0.5 }),
  // Public match curve. The displayed percentage must be credible: a clearly
  // stronger match displays a clearly stronger score. Pure calibration of the
  // computed score, never a per-title value.
  // Saturation sits at the top of the computed range: the displayed percentage
  // keeps discriminating inside the whole useful band instead of flattening
  // every strong candidate at 100%.
  publicMatch: Object.freeze({ floor: 22, spread: 78, saturation: 1, gamma: 1.15 })
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

/**
 * Tokens of the people the query resolved. A person's own name is an entity,
 * not a narrative concept: it must never count as evidence that a candidate
 * answers the described story.
 */
function resolvedPersonTokens(resolvedContext) {
  return new Set(array(resolvedContext?.resolvedPeople)
    .filter(person => Number.isSafeInteger(Number(person?.tmdbId)) && Number(person.tmdbId) > 0)
    .flatMap(person => [person.inputName, person.name].flatMap(value => [...tokens(value)])));
}

/**
 * Coverage of a requested concept list by one candidate, weighted by how much
 * each concept discriminates. The interpreter writes concepts in English while
 * the catalogue answers in French, so the wording equivalence lives in
 * semanticLexicon, together with the matching primitive the offline metrics
 * reuse: a concept is measured the same way everywhere.
 *
 * The weights are relative, so a single-concept intent is unchanged while a
 * rich one stops counting a broad word as much as a described element.
 */
function termCoverage(requested, structured, freeText, { genres = [] } = {}) {
  const wanted = normalized(requested);
  if (!wanted.length) return 0;
  const facts = normalized(structured);
  const text = normalizeTerm(freeText);
  const haystack = [...facts, text].filter(Boolean).join(' ');
  let weighted = 0;
  let total = 0;
  for (const term of wanted) {
    const weight = conceptSpecificity(term, { genres });
    weighted += conceptMatch(haystack, term) * weight;
    total += weight;
  }
  return total ? clamp(weighted / total) : 0;
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
    components.semanticScore, components.identifiedWorkScore, components.narrativeCandidateScore];
  const satisfied = evidence.filter(value => value >= strongSignalThreshold).length;
  const breadth = clamp(Math.max(0, (candidate.sources || []).length - 1) / 2);
  return clamp(clamp(satisfied / targetSignalCount) * (1 - breadthShare) + breadth * breadthShare);
}

/**
 * How strongly the model's own proposal supports this candidate. Two bounded
 * facts: where the model ranked the work it proposed, and whether its stated
 * justification really carries the concepts the query describes - read with the
 * same bilingual concept primitive as every other score, so a proposal whose
 * reason answers nothing earns only the floor.
 */
function narrativeCandidateScore(candidate, semanticTerms, genres) {
  const signals = array(candidate.retrievalSignals).filter(signal => signal?.source === 'llm_candidates');
  if (!signals.length) return 0;
  const { rankSpan, reasonFloor } = ELICINE_RANKING_CONFIG.narrativeCandidate;
  const rankScore = Math.max(...signals.map(signal => {
    const rank = Number(signal.narrativeCandidateRank);
    return Number.isFinite(rank) && rank > 0 ? clamp(1 - (rank - 1) / rankSpan) : reasonFloor;
  }));
  const reason = signals.map(signal => String(signal.narrativeCandidateReason || '')).filter(Boolean).join(' ');
  const reasonCoverage = reason && semanticTerms.length
    ? termCoverage(semanticTerms, [], reason, { genres }) : 1;
  return clamp(rankScore * (reasonFloor + (1 - reasonFloor) * reasonCoverage));
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

function entityScore(candidate, intent, resolvedContext, narrativeScore) {
  const people = array(resolvedContext?.resolvedPeople).filter(person =>
    Number.isSafeInteger(Number(person?.tmdbId)) && Number(person.tmdbId) > 0);
  if (!people.length) return 0;
  const signals = array(candidate.retrievalSignals);
  const matchedPeople = people.filter(person => signals.some(signal =>
    signal?.source === 'tmdb_person_credits' && Number(signal.personTmdbId) === Number(person.tmdbId)));
  if (!matchedPeople.length) return 0;
  const confidence = Math.max(...matchedPeople.map(person => clamp(person.resolutionConfidence ?? 1)));

  // A person credit is recall, not relevance. When the query only names the
  // performer, the credit is the whole answer and keeps its confidence. When
  // the query also describes the work (dreams, war, memory...), the credit is
  // worth no more than a floor and the narrative evidence decides the rest: a
  // bare filmography entry must not outrank the work that actually matches.
  const personTokens = resolvedPersonTokens(resolvedContext);
  const semanticTerms = normalized([...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]);
  const hasIndependentSemantics = semanticTerms.some(term =>
    [...tokens(term)].some(token => !personTokens.has(token)));
  return hasIndependentSemantics
    ? clamp(confidence * (ELICINE_RANKING_CONFIG.entity.narrativeFloor +
        (1 - ELICINE_RANKING_CONFIG.entity.narrativeFloor) * clamp(narrativeScore)))
    : confidence;
}

/**
 * The work the user names as the answer itself, as opposed to a work used as a
 * style seed. Only resolver-confirmed requested works qualify, so the signal
 * stays at zero for a comparison query and behaves identically for films and
 * series.
 */
function identifiedWorkScore(candidate, resolvedContext) {
  const requested = array(resolvedContext?.requestedTitles);
  if (!requested.length) return 0;
  return requested.some(entry => entry?.mediaType === candidate.mediaType &&
    Number(entry.tmdbId) === Number(candidate.tmdbId)) ? 1 : 0;
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
    // Token proximity ("silence agneaux") and character proximity ("shutter
    // iland") are complementary: a repaired or mistyped title misses whole
    // tokens while staying close as a string. The character ramp starts at 60%
    // similarity and only for long enough titles, so short words cannot collide.
    const overlapScore = (!referenceTokens.size || !titleTokens.size) ? 0
      : ([...referenceTokens].filter(token => titleTokens.has(token)).length /
        new Set([...referenceTokens, ...titleTokens]).size) * 0.7;
    const characterScore = Math.min(reference.length, title.length) >= 5
      ? clamp((characterSimilarity(reference, title) - 0.6) / 0.4) * 0.85 : 0;
    return Math.max(overlapScore, characterScore);
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
  const conceptGenres = array(intent.genres);
  const expansion = expandSemanticTerms(intent);
  const structuredConcepts = [...array(data.themes), ...array(data.moods), ...array(data.keywords)];
  const personTokens = resolvedPersonTokens(resolvedContext);
  const narrativeTerms = personTokens.size ? semanticTerms.filter(term =>
    [...tokens(term)].some(token => !personTokens.has(token))) : semanticTerms;
  const lexicalSemantic = termCoverage(semanticTerms, structuredConcepts, text, { genres: conceptGenres });
  const expandedSemantic = termCoverage(expansion.addedTerms, structuredConcepts, text);
  const semanticScore = Math.max(sourceSimilarity(candidate), lexicalSemantic, expandedSemantic);
  const discriminatingScore = termCoverage(narrativeTerms, structuredConcepts, text, { genres: conceptGenres });
  // A declared genre is context, not proof: it names the family the user asked
  // about, never the work itself. When the query describes the work, a
  // candidate carried only by that broad family - and by none of the described
  // elements - must not rival the candidate that answers them, so the generic
  // credit is earned in proportion to the discriminating coverage. A query that
  // only restates its own genre, or carries no narrative concept at all, keeps
  // the historical behaviour exactly.
  const describesNarrative = narrativeTerms.some(term =>
    conceptSpecificity(term, { genres: conceptGenres }) > CONCEPT_WEIGHTS.genreRestatement);
  const genericCredit = describesNarrative ? discriminatingScore : 1;
  const components = {
    semanticScore: round(semanticScore),
    genreScore: round(genreOverlap(candidate, intent) * genericCredit),
    themeScore: round(termCoverage(intent.themes, data.themes, text, { genres: conceptGenres })),
    moodScore: round(termCoverage(intent.moods, data.moods, text, { genres: conceptGenres })),
    keywordScore: round(termCoverage(intent.keywords, data.keywords, text, { genres: conceptGenres })),
    // How much of the described intent the candidate really answers, from its own
    // metadata only: no retrieval source, no one-hop expansion, and never the
    // person's own name, which is an entity rather than narrative evidence. A
    // credit for the person is combined with this evidence, not with the raw
    // retrieval score.
    discriminatingScore: round(discriminatingScore),
    referenceScore: 0, entityScore: 0,
    titleScore: round(titleScore(candidate, intent, resolvedContext)),
    yearScore: round(boundedYearScore(candidate, intent)),
    languageScore: intent.languages?.length ? (candidate.originalLanguage ?
      Number(intent.languages.includes(candidate.originalLanguage.toLowerCase())) : 0.5) : 0,
    countryScore: intent.countries?.length ? (data.countries?.length ?
      Number(data.countries.some(country => intent.countries.includes(country))) : 0.5) : 0,
    qualityScore: round(qualityScore(candidate)), popularityScore: round(popularityScore(candidate)),
    sourceConfidenceScore: round(sourceConfidenceScore(candidate)),
    narrativeCandidateScore: round(narrativeCandidateScore(candidate, semanticTerms, conceptGenres))
  };
  components.referenceScore = round(referenceScore(candidate, resolvedContext, components.semanticScore));
  components.entityScore = round(entityScore(candidate, intent, resolvedContext, components.discriminatingScore));
  // The work the query names is the answer: it must not be pushed under its own
  // recommendations by the anti-monopoly rule that keeps a style seed out of the
  // grid. A comparison seed keeps its zero, a requested work earns the title.
  components.identifiedWorkScore = identifiedWorkScore(candidate, resolvedContext);
  if (components.identifiedWorkScore > 0) components.titleScore = 1;
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
  // The named work earns a bounded bonus on top of the historical blend: its
  // other signals are never discounted, so an identification cannot be pushed
  // below a recommendation that merely matches the same concepts. With no
  // identified work the formula is exactly the historical one.
  const identifiedBonus = components.identifiedWorkScore * ELICINE_RANKING_CONFIG.identifiedWorkWeight;
  const narrativeBonus = components.narrativeCandidateScore * ELICINE_RANKING_CONFIG.narrativeCandidateWeight;
  const finalScore = clamp(coverageScore * (1 - ELICINE_RANKING_CONFIG.convergenceWeight) +
    components.convergenceScore * ELICINE_RANKING_CONFIG.convergenceWeight + identifiedBonus + narrativeBonus);
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
  for (const field of ['intentScore', 'identifiedWorkScore', 'narrativeCandidateScore', 'entityScore', 'referenceScore',
    'semanticScore', 'qualityScore']) {
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
