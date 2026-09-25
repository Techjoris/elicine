import { toLegacyRankingCandidate } from './retrievalCandidate.js';
import { normalizeTerm, tmdbGenreIds } from './tmdbRetrievalParams.js';
import { expandSemanticTerms } from './semanticExpansion.js';
import { characterSimilarity } from './requestedWork.js';
import { CONCEPT_WEIGHTS, conceptMatch, conceptSpecificity } from './semanticLexicon.js';
import { scoreRankingPreferences } from './rankingPreferences.js';
import { buildSignalLedger } from './signalLedger.js';
import { personalizationBonus, personalizationScore } from './preferenceProfile.js';

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
  // Multi-signal convergence carries two bounded effects: its share of the
  // blend and a floor reserved for candidates whose evidence really converges.
  // The floor is gated by how much the request describes, so a bare category
  // can never reach an exceptional match through provenance alone.
  convergenceWeight: 0.18,
  convergence: Object.freeze({ strongSignalThreshold: 0.6, targetSignalCount: 4,
    breadthShare: 0.15, floorWeight: 1 }),
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
  narrativeCandidateWeight: 0.32,
  narrativeCandidate: Object.freeze({ rankSpan: 10, reasonFloor: 0.5 }),
  // Public match curve - the ladder the product had before the unified engine.
  //
  // The historical engine read a work on two axes - how much of the request its
  // description answered (`narrativeScore`) and how strong a choice it was
  // (`genreScore`, Bayesian quality) - and displayed
  // `min(99, max(25, round(0.70 * narrative + 0.30 * genre + qualityDelta)))`.
  // That put a solid answer in the high 80s, an exceptional one at 95-99, and
  // never left a real answer below ~25. The unified engine keeps a stricter,
  // better spread internal score, which is why the same films dropped to the
  // 45-70 band once the display became a saturating curve of `finalScore`.
  //
  // The ladder is therefore restored as an explicit calibration of the computed
  // score: anchor points, linear in between, monotone and bounded. Nothing is
  // per-title, a work answering nothing still stays under the partial band, and
  // the top is only reached by a genuinely converged answer.
  publicMatch: Object.freeze({
    points: Object.freeze([
      [0, 0], [0.15, 25], [0.25, 48], [0.35, 64], [0.45, 76], [0.55, 84],
      [0.65, 90], [0.75, 94], [0.85, 96], [0.92, 98], [0.98, 99], [1, 99]
    ])
  }),
  // An answer is only as good as the two things it combines: how much of the
  // request it really answers (the intent coverage) and how strong a choice it
  // is (rating, notoriety, provenance). The two multiply, so a work carried by
  // a bare genre tag can never display an excellent match on its own, and a
  // described request keeps its own works in front whatever their fame.
  // `floor` is the share of the score a work keeps when its strength is nil: it
  // is high for a request that describes its content, low for a bare category,
  // where the strength of the work IS the answer. The floor is derived from the
  // request itself, never from a title, a year or a genre.
  answerStrength: Object.freeze({
    weights: Object.freeze({ qualityScore: 0.65, voteConfidenceScore: 0.15,
      popularityScore: 0.10, sourceConfidenceScore: 0.10 }),
    floor: Object.freeze({ bare: 0.15, described: 0.85 }),
    describedDimensions: 2,
    voteReference: 5000
  }),
  // A temporal word in the request ("moderne", "récent", "contemporain") says
  // WHEN the described work belongs, and it is a graded preference rather than
  // a filter: the whole catalogue stays admissible, a contemporary work is
  // pushed up and a very old one down by the same bounded amount, and nothing
  // moves when the request states no period. The preference is calibrated on
  // the computed score only - no year, no decade and no title is ever hardcoded.
  temporalPreference: Object.freeze({ weight: 0.12, horizonYears: 45 })
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
    ...array(data.moods),
    // The model's justification is already a bounded ranking signal. When the
    // catalogue confirms the work, the reason it gives is read with the same
    // concept primitive as the metadata: a coherent reason fills a sparse
    // overview, an incoherent one still earns almost nothing.
    ...array(candidate.retrievalSignals).map(signal => signal?.narrativeCandidateReason)]
    .filter(Boolean).join(' ');
}

function candidateYear(candidate) {
  const value = candidate.releaseDate || candidate.firstAirDate;
  const year = Number.parseInt(String(value || '').slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/**
 * Vocabulary that places a request in the present. Bilingual on purpose: the
 * interpreter writes its concepts in English while the user writes in French,
 * and the ranking reads both channels with the same bounded list. It carries no
 * title and no identifier, and it never filters a candidate.
 */
const RECENCY_TERMS = Object.freeze([
  'moderne', 'modernes', 'modern',
  'contemporain', 'contemporaine', 'contemporains', 'contemporaines', 'contemporary',
  'recent', 'recente', 'recents', 'recentes',
  'actuel', 'actuelle', 'actuels', 'actuelles', 'current',
  'aujourd hui', 'de nos jours', 'modern day', 'present day',
  'nouvelle generation', 'new generation',
  '21st century', '21e siecle', 'xxie siecle', 'post 2000', 'apres 2000'
]);

/** A listed wording is matched as a whole token or phrase, never as a prefix. */
function statesContemporaryRequest(text) {
  const normalized = normalizeTerm(text);
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  return RECENCY_TERMS.some(term => padded.includes(` ${term} `));
}

/**
 * Wordings that pull the request towards older works. Symmetric to the
 * contemporary vocabulary: "ancien", "d'époque" or "classique" is a period
 * direction just as "moderne" is, and it must move the ranking by its meaning
 * instead of being ignored because only recency was modelled.
 */
const VINTAGE_TERMS = Object.freeze([
  'ancien', 'ancienne', 'anciens', 'anciennes', 'vieux', 'vieille', 'vieilles',
  'd epoque', 'epoque', 'classique', 'classiques', 'retro', 'old school', 'oldschool',
  'vintage', 'd antan', 'annees 70', 'annees 80', 'annees 90', '20e siecle', 'xxe siecle'
]);

/** A listed vintage wording is matched as a whole token or phrase, never as a prefix. */
function statesVintageRequest(text) {
  const normalized = normalizeTerm(text);
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  return VINTAGE_TERMS.some(term => padded.includes(` ${term} `));
}

/**
 * Affinity of the request for contemporary works, in 0..1. Explicit year bounds
 * always win: a request that names its decade already carries the period, so the
 * derived preference stays inert and an era search keeps its own works.
 */
export function contemporaryAffinity(intent = {}, queryText = '') {
  if (intent.yearMin != null || intent.yearMax != null) return 0;
  if (statesContemporaryRequest(queryText)) return 1;
  const concepts = [...array(intent.genres), ...array(intent.moods),
    ...array(intent.themes), ...array(intent.keywords)];
  return concepts.some(concept => statesContemporaryRequest(concept)) ? 1 : 0;
}

/**
 * Graded recency of one work: 1 for a work released this year, 0 at the horizon
 * and below. An unknown year is neutral, so a candidate the catalogue does not
 * date is never penalised.
 */
export function recencyFit(year, { horizonYears, referenceYear } = {}) {
  const configured = ELICINE_RANKING_CONFIG.temporalPreference.horizonYears;
  const horizon = Number.isFinite(Number(horizonYears)) ? Number(horizonYears) : configured;
  const reference = Number.isFinite(Number(referenceYear)) ? Number(referenceYear)
    : new Date().getFullYear();
  if (!Number.isInteger(year) || !(horizon > 0)) return null;
  return clamp(1 - Math.max(0, reference - year) / horizon);
}

/**
 * Period direction of the request: +1 towards contemporary works, -1 towards
 * older ones, 0 when no period is stated. Explicit year bounds always win,
 * because a request that names its decade already carries its own period.
 */
export function temporalDirection(intent = {}, queryText = '') {
  if (intent.yearMin != null || intent.yearMax != null) return 0;
  if (contemporaryAffinity(intent, queryText) > 0) return 1;
  const concepts = [...array(intent.genres), ...array(intent.moods),
    ...array(intent.themes), ...array(intent.keywords)];
  if (statesVintageRequest(queryText) || concepts.some(concept => statesVintageRequest(concept))) return -1;
  return 0;
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

/**
 * How much a work is vouched for by the audience: a 7.3 average over a handful
 * of votes and the same average over twenty thousand votes are not the same
 * answer, and the Bayesian quality alone cannot say so strongly enough on a
 * request that only names a category.
 */
function voteConfidenceScore(candidate) {
  const votes = Math.max(0, Number(candidate.metadata?.vote_count) || 0);
  return clamp(Math.log1p(votes) / Math.log1p(ELICINE_RANKING_CONFIG.answerStrength.voteReference));
}

function sourceConfidenceScore(candidate) {
  const sources = [...new Set(candidate.sources || [])];
  const base = Math.max(0, ...sources.map(source => ELICINE_RANKING_CONFIG.sourceConfidence[source] || 0));
  const bonus = Math.min(ELICINE_RANKING_CONFIG.sourceMultiBonusCap,
    Math.max(0, sources.length - 1) * ELICINE_RANKING_CONFIG.sourceMultiBonus);
  return clamp(base * 0.85 + bonus);
}

/**
 * How much the request describes, in independent dimensions. A bare category
 * ("un film d'horreur") describes nothing: any horror work answers it and the
 * strength of the work is the only thing left to rank. Concepts, hard
 * constraints, a named reference, a person or an exclusion are what make a
 * request answerable by content.
 */
export function intentSpecificity(intent = {}) {
  const described = [
    array(intent.themes).length + array(intent.moods).length > 0,
    array(intent.keywords).length > 0,
    intent.yearMin != null || intent.yearMax != null || intent.runtimeMin != null || intent.runtimeMax != null ||
      intent.minRating != null || array(intent.languages).length > 0 || array(intent.countries).length > 0 ||
      array(intent.semanticExclusions).length > 0,
    array(intent.knownTitles).length > 0 || array(intent.excludedTitles).length > 0
  ].filter(Boolean).length;
  return clamp(described / ELICINE_RANKING_CONFIG.answerStrength.describedDimensions);
}

/**
 * Bounded strength of one candidate as an answer: how well rated it is, how
 * many people vouch for it, how visible it is and where it comes from. Weights
 * are relative and sum to one; the floor that turns this strength into a score
 * factor belongs to the request, not to the candidate.
 */
function answerStrengthScore(components) {
  const { weights } = ELICINE_RANKING_CONFIG.answerStrength;
  return clamp(Object.entries(weights)
    .reduce((sum, [name, weight]) => sum + clamp(components[name]) * weight, 0));
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
    components.semanticScore, components.identifiedWorkScore, components.narrativeCandidateScore,
    components.relationScore, components.preferenceScore, components.temporalScore];
  // Graded convergence: four signals that are merely above the floor are not
  // the same evidence as four signals that answer the request almost fully.
  const strength = value => value <= strongSignalThreshold ? 0
    : clamp((value - strongSignalThreshold) / (1 - strongSignalThreshold));
  const satisfied = evidence.reduce((sum, value) => sum + strength(value), 0);
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
 * purely calibrated: no per-title value is ever hardcoded. The curve is the
 * historical ladder, read between its anchor points.
 */
export function publicMatchScore(finalScore) {
  const points = ELICINE_RANKING_CONFIG.publicMatch.points;
  const score = clamp(finalScore);
  const last = points[points.length - 1];
  if (score >= last[0]) return last[1];

  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = points[index];
    if (score > x) continue;
    const [previousX, previousY] = points[index - 1];
    const ratio = x === previousX ? 1 : (score - previousX) / (x - previousX);
    return Math.round(Math.min(99, Math.max(0, previousY + (y - previousY) * ratio)));
  }

  return last[1];
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

/**
 * Explicit constraints are still bounded preferences inside the ranking, not a
 * second filter: a work outside a stated period, runtime, language or country
 * keeps a real but reduced score instead of disappearing silently. This keeps
 * the ranker honest when it is exercised directly, and is idempotent with the
 * strict filter when that stage already ran.
 */
function explicitConstraintFactor(candidate, intent, data = {}) {
  let factor = 1;
  const year = candidateYear(candidate);
  if (intent.yearMin != null || intent.yearMax != null) {
    if (year == null) factor *= 0.9;
    else if ((intent.yearMin != null && year < intent.yearMin) ||
      (intent.yearMax != null && year > intent.yearMax)) factor *= 0.55;
  }
  const runtime = Number(data.runtime);
  if (intent.runtimeMin != null || intent.runtimeMax != null) {
    if (!Number.isFinite(runtime) || runtime <= 0) factor *= 0.9;
    else if ((intent.runtimeMin != null && runtime < intent.runtimeMin) ||
      (intent.runtimeMax != null && runtime > intent.runtimeMax)) factor *= 0.7;
  }
  if (array(intent.languages).length) {
    if (!candidate.originalLanguage) factor *= 0.9;
    else if (!intent.languages.map(value => String(value).toLowerCase())
      .includes(String(candidate.originalLanguage).toLowerCase())) factor *= 0.7;
  }
  if (array(intent.countries).length) {
    if (!data.countries?.length) factor *= 0.9;
    else if (!data.countries.some(country => intent.countries.includes(country))) factor *= 0.7;
  }
  return clamp(factor);
}

export function scoreSearchCandidate(candidate, intent = {}, resolvedContext = {}, { queryText = '', userProfile = null } = {}) {
  const data = candidate.constraintData || {};
  const text = candidateText(candidate);
  const preferences = scoreRankingPreferences(candidate, intent, resolvedContext, { queryText });
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
  // A temporal word in the request ("moderne", "récent") describes the period of
  // the work, not its content: it never enters the coverage average, which would
  // reward every candidate of that period equally, and instead moves the computed
  // score by a bounded, graded amount. Nothing is filtered out of the catalogue.
  // The direction is symmetric: "ancien" or "d'époque" pulls the other way by
  // the same bounded amount, so both period words are handled by their meaning.
  const periodDirection = temporalDirection(intent, queryText);
  const temporalFit = periodDirection !== 0 ? recencyFit(candidateYear(candidate)) : null;
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
    voteConfidenceScore: round(voteConfidenceScore(candidate)),
    sourceConfidenceScore: round(sourceConfidenceScore(candidate)),
    narrativeCandidateScore: round(narrativeCandidateScore(candidate, semanticTerms, conceptGenres)),
    relationScore: round(preferences.relationScore ?? 0),
    preferenceScore: round(preferences.preferenceScore ?? 0),
    // Unsigned by construction: 0 means "no temporal preference, or a work too
    // old to count as contemporary", 1 a work released this year.
    temporalScore: round(temporalFit ?? 0)
  };
  components.referenceScore = round(referenceScore(candidate, resolvedContext, components.semanticScore));
  // A person credit is narrative evidence when the model's verified proposal
  // also answers the described concepts: the two independent signals reinforce
  // each other instead of the credit being discounted to its metadata-only
  // coverage.
  components.entityScore = round(entityScore(candidate, intent, resolvedContext,
    Math.max(components.discriminatingScore, components.narrativeCandidateScore)));
  // The work the query names is the answer: it must not be pushed under its own
  // recommendations by the anti-monopoly rule that keeps a style seed out of the
  // grid. A comparison seed keeps its zero, a requested work earns the title.
  components.identifiedWorkScore = identifiedWorkScore(candidate, resolvedContext);
  if (components.identifiedWorkScore > 0) components.titleScore = 1;
  // Composition: the intersection of the independent dimensions the request
  // describes, read from the evidence that has just been measured. The ledger
  // returns one family per described dimension, so a bare category keeps a
  // single family and its ranking is unchanged.
  const ledger = buildSignalLedger({
    intent, resolvedContext, candidate, components, text,
    structured: structuredConcepts, temporalActive: temporalFit != null,
    relationRequired: preferences.relationRequired === true,
    preferenceApplied: preferences.preferenceApplied === true
  });
  components.compositionScore = round(ledger.compositionScore);
  components.compositionIntersection = round(ledger.intersection);
  components.compositionCoverage = round(ledger.coverage);
  // Normalised breadth so every exposed component stays a 0..1 score.
  components.compositionBreadth = round(clamp(ledger.familyCount / 4));
  components.compositionSatisfiedShare = round(ledger.satisfiedShare);
  components.partialPenalty = round(ledger.partialPenalty);
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
  // Coverage: how much of what the request describes the work answers, as the
  // documented weighted average over the intent components the request makes
  // meaningful. Strength components are excluded on purpose - they say how good
  // a choice the work is, not whether it answers the request - and are combined
  // with it as a bounded factor, in their own relative proportions.
  const intentNames = ['semanticScore', 'genreScore', 'themeScore', 'moodScore', 'keywordScore',
    'referenceScore', 'entityScore', 'titleScore', 'yearScore', 'languageScore', 'countryScore'];
  const intentWeighted = weighted.filter(([name]) => intentNames.includes(name));
  const intentWeight = intentWeighted.reduce((sum, [, weight]) => sum + weight, 0);
  const intentScore = intentWeight ? intentWeighted.reduce((sum, [name, weight]) =>
    sum + components[name] * weight, 0) / intentWeight : 0;
  const { floor: floorConfig } = ELICINE_RANKING_CONFIG.answerStrength;
  const strengthFloor = floorConfig.bare + (floorConfig.described - floorConfig.bare) * intentSpecificity(intent);
  const strengthFactor = strengthFloor + (1 - strengthFloor) * answerStrengthScore(components);
  // Relation and comparative preferences are soft: they move the ranking by a
  // bounded factor, never by a hard filter. A work that answers both connected
  // concepts keeps its full answer score; one that only matched a loose word
  // loses a fraction of it.
  const relationFactor = preferences.relationRequired && preferences.relationScore != null
    ? 0.85 + 0.15 * preferences.relationScore : 1;
  const preferenceFactor = preferences.preferenceApplied && preferences.preferenceScore != null
    ? 0.9 + 0.1 * preferences.preferenceScore : 1;
  // Composition replaces part of the plain coverage average by the intersection
  // of the described dimensions: satisfying four independent criteria must score
  // clearly above satisfying one of them very well. The partial-match penalty
  // stays bounded and only applies when the request really describes several
  // families, so a simple category keeps exactly its historical behaviour.
  const composedIntentScore = intentScore * (1 - ledger.compositionWeight) +
    ledger.compositionScore * ledger.compositionWeight;
  const partialFactor = 1 - ledger.partialPenalty;
  const answerScore = composedIntentScore * strengthFactor * relationFactor * preferenceFactor * partialFactor;
  // The documented weights stay untouched (they sum to 1): convergence is
  // blended in as an explicit share so the historical signal proportions are
  // preserved while genuine multi-signal agreement is rewarded.
  // The named work earns a bounded bonus on top of the answer: its other signals
  // are never discounted, so an identification cannot be pushed below a
  // recommendation that merely matches the same concepts. With no identified
  // work the formula is exactly the historical one.
  const identifiedBonus = components.identifiedWorkScore * ELICINE_RANKING_CONFIG.identifiedWorkWeight;
  const narrativeBonus = components.narrativeCandidateScore * ELICINE_RANKING_CONFIG.narrativeCandidateWeight;
  // Symmetric and bounded: a contemporary work gains what a very old one loses,
  // so the request keeps discriminating without any hard cut on the period.
  const temporalAdjustment = temporalFit == null ? 0
    : (2 * temporalFit - 1) * ELICINE_RANKING_CONFIG.temporalPreference.weight * periodDirection;
  const blendedScore = answerScore * (1 - ELICINE_RANKING_CONFIG.convergenceWeight) +
    components.convergenceScore * ELICINE_RANKING_CONFIG.convergenceWeight;
  // Several independent strong signals agreeing on the same work is itself
  // evidence: the bounded floor lets such a candidate reach the exceptional
  // band even when one metadata channel is sparse. A thin request cannot use
  // it, because the floor is gated by how much the request actually describes.
  const describedEvidence = clamp(intentSpecificity(intent) * 2);
  const convergenceFloor = components.convergenceScore *
    ELICINE_RANKING_CONFIG.convergence.floorWeight * describedEvidence;
  const constraintFactor = explicitConstraintFactor(candidate, intent, data);
  // Personalisation is the last, deliberately bounded, layer: it only weighs a
  // candidate that already answers the current request, and it can never lift a
  // work above what its relevance earned. With no profile it is exactly zero and
  // the score is byte-for-byte the historical one.
  const tasteScore = personalizationScore(candidate, userProfile);
  const tasteBonus = personalizationBonus(candidate, userProfile);
  const finalScore = clamp(Math.max(blendedScore, convergenceFloor) * constraintFactor + identifiedBonus +
    narrativeBonus + temporalAdjustment + tasteBonus);
  return { ...components, intentScore: round(intentScore),
    composedIntentScore: round(composedIntentScore), partialFactor: round(partialFactor),
    answerStrengthScore: round(answerStrengthScore(components)),
    relationFactor: round(relationFactor), preferenceFactor: round(preferenceFactor),
    convergenceFloor: round(convergenceFloor), constraintFactor: round(constraintFactor),
    personalizationScore: round(tasteScore), personalizationBonus: round(tasteBonus),
    answerScore: round(answerScore), finalScore: round(finalScore), matchScore: publicMatchScore(finalScore) };
}

function compareRanked(left, right) {
  const a = left.ranking;
  const b = right.ranking;
  if (Math.abs(b.finalScore - a.finalScore) > ELICINE_RANKING_CONFIG.tieEpsilon) return b.finalScore - a.finalScore;
  for (const field of ['intentScore', 'identifiedWorkScore', 'temporalScore', 'narrativeCandidateScore', 'entityScore',
    'referenceScore', 'semanticScore', 'qualityScore']) {
    if (b[field] !== a[field]) return b[field] - a[field];
  }
  const voteDifference = Number(right.metadata?.vote_count || 0) - Number(left.metadata?.vote_count || 0);
  if (voteDifference) return voteDifference;
  const popularityDifference = Number(right.metadata?.popularity || 0) - Number(left.metadata?.popularity || 0);
  if (popularityDifference) return popularityDifference;
  return left.tmdbId - right.tmdbId;
}

export function rankSearchCandidates(candidates, intent, resolvedContext, {
  telemetry = {}, env = process.env, enabled = isElicineRankingEnabled(env), accumulate = true,
  queryText = '', userProfile = null
} = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (!enabled) return input;
  const startedAt = Date.now();
  const ranked = input.map(candidate => ({ ...candidate,
    ranking: scoreSearchCandidate(candidate, intent, resolvedContext, { queryText, userProfile }) })).sort(compareRanked);
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
