import { candidateMediaType } from './retrievalCandidate.js';
import { tmdbGenreIds } from './tmdbRetrievalParams.js';
import { CONCEPT_PARTIAL_CREDIT, conceptMatch } from './semanticLexicon.js';

export const STRICT_CONSTRAINT_FILTER_FLAG = 'STRICT_CONSTRAINT_FILTER_ENABLED';

export function isStrictConstraintFilterEnabled(env = process.env) {
  // Phase 7 is the validated default; explicit false is the operational rollback.
  return String(env?.[STRICT_CONSTRAINT_FILTER_FLAG] ?? 'true').toLowerCase() !== 'false';
}

const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘`´]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const SEMANTIC_EXCLUSIONS = Object.freeze({
  murder: {
    aliases: ['murder', 'murders', 'killing', 'homicide', 'meurtre', 'meurtres', 'assassinat', 'assassinats',
      'tuerie', 'tueur', 'tueurs', 'meurtrier', 'serial killer', 'serial killers', 'tueur en serie',
      'tueurs en serie', 'cadavre', 'cadavres', 'corpse', 'corpses'],
    terms: ['murder', 'murders', 'murdered', 'murderer', 'murderers', 'murderous', 'murder investigation',
      'murdering', 'killing', 'killings', 'killed', 'slain', 'slaying', 'homicide', 'homicides',
      'massacre', 'massacres', 'cadavre', 'cadavres', 'corpse', 'corpses',
      'meurtre', 'meurtres', 'meurtrier', 'meurtriere', 'meurtriers', 'meurtrieres', 'assassin', 'assassins',
      'assassinat', 'assassinats', 'assassiner', 'assassine', 'assassinee', 'assassines', 'assassinees',
      'tuer', 'tue', 'tues', 'tuee', 'tuees', 'tuerie', 'tueries',
      'tueur', 'tueurs', 'tueuse', 'tueuses', 'serial killer', 'serial killers', 'tueur en serie',
      'tueurs en serie']
  },
  police_investigation: {
    aliases: ['police investigation', 'police enquiry', 'police inquiry', 'enquete policiere', 'enquete criminelle',
      'investigation policiere', 'murder investigation', 'detective story', 'police procedural', 'whodunit',
      'enquete', 'enqueteur', 'investigation', 'detective', 'inspecteur',
      'interrogatoire', 'interrogatoires', 'interrogation', 'interrogations', 'suspect', 'suspects'],
    terms: ['police investigation', 'police enquiry', 'police inquiry', 'police detective', 'police procedural',
      'detective investigation', 'criminal investigation', 'detective', 'detectives', 'detective story',
      'murder investigation', 'whodunit', 'enquete policiere', 'enquete criminelle', 'investigation policiere',
      'enquete', 'enquetes', 'enqueter', 'enqueteur', 'enqueteurs', 'enqueteuse', 'inspecteur', 'inspectrice',
      'interrogatoire', 'interrogatoires', 'interrogation', 'interrogations', 'suspect', 'suspects',
      'crime scene', 'scene de crime']
  },
  romance: { aliases: ['romance', 'romantique'], terms: ['romance', 'romantic', 'romantique'], genres: ['Romance'] },
  relationship: { aliases: ['relationship', 'couple story', 'histoire de couple', 'couple'], terms: ['relationship', 'couple', 'histoire de couple', 'marriage', 'mariage'] },
  supernatural: { aliases: ['supernatural', 'surnaturel'], terms: ['supernatural', 'surnaturel', 'paranormal'] },
  aliens: { aliases: ['aliens', 'alien', 'extraterrestres', 'extraterrestre'], terms: ['alien', 'aliens', 'extraterrestre', 'extraterrestres'] },
  space_travel: { aliases: ['space travel', 'voyage spatial'], terms: ['space travel', 'voyage spatial', 'interstellar travel', 'voyage interstellaire'] },
  magic: { aliases: ['magic', 'magie', 'sorcellerie'], terms: ['magic', 'magie', 'sorcellerie', 'sorcery'] },
  fantasy_creatures: { aliases: ['fantasy creatures', 'creatures fantastiques'], terms: ['fantasy creature', 'fantasy creatures', 'creature fantastique', 'creatures fantastiques'] },
  monsters: { aliases: ['monsters', 'monster', 'monstres', 'monstre'], terms: ['monster', 'monsters', 'monstre', 'monstres'] },
  ghosts: { aliases: ['ghosts', 'ghost', 'fantomes', 'fantome'], terms: ['ghost', 'ghosts', 'fantome', 'fantomes'] },
  science_fiction: { aliases: ['science fiction', 'sci fi'], terms: ['science fiction', 'sci fi'], genres: ['Science Fiction'] },
  comedy: { aliases: ['comedy', 'comedie'], terms: ['comedy', 'comedie'], genres: ['Comedy'] },
  space: { aliases: ['space', 'espace'], terms: ['space', 'espace', 'outer space', 'deep space', 'dans l espace', 'spatial', 'spatiale', 'orbite', 'cosmos'] },
  robots: { aliases: ['robots', 'robot'], terms: ['robot', 'robots', 'android', 'androide'] },
  time_travel: { aliases: ['time travel', 'voyage dans le temps'], terms: ['time travel', 'voyage dans le temps', 'voyage temporel'] }
});

const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasTerm = (text, term) => new RegExp(`(?:^| )${escaped(normalize(term))}(?: |$)`, 'u').test(text);

/**
 * A negative concept is never silently discarded: it is either mapped onto a
 * known exclusion family or kept as its own bounded wording, to be confirmed
 * later against the candidate metadata. An exclusion that vanishes is a wrong
 * answer, not a neutral one.
 */
export const MAX_EXCLUSION_WORDS = 4;

export function normalizeSemanticExclusions(values = []) {
  const items = Array.isArray(values) ? values : [];
  const resolved = [];
  for (const item of items) {
    const value = normalize(item);
    if (!value) continue;
    const concept = Object.entries(SEMANTIC_EXCLUSIONS).find(([key, definition]) =>
      normalize(key) === value || definition.aliases.some(alias => normalize(alias) === value))?.[0];
    if (concept) {
      if (!resolved.includes(concept)) resolved.push(concept);
    } else if (value.split(' ').length <= MAX_EXCLUSION_WORDS && !resolved.includes(value)) {
      resolved.push(value);
    }
  }
  return resolved;
}

/** Conservative extraction: only an allowlisted concept inside an explicit negative clause. */
export function extractReliableSemanticExclusions(query = '') {
  const text = normalize(query);
  const match = text.match(/(?:^| )(?:sans|without|excluding|exclude|pas de|pas d|aucun|aucune|no) (.+)$/u);
  if (!match) return [];
  const negativeClause = match[1].split(/ (?:mais|but|cependant|however) /u, 1)[0];
  return Object.entries(SEMANTIC_EXCLUSIONS).filter(([, definition]) =>
    definition.aliases.some(alias => hasTerm(negativeClause, alias))).map(([concept]) => concept);
}

const unique = values => [...new Set(values.filter(Boolean))];
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const strings = value => array(value).map(item => typeof item === 'object'
  ? item?.name ?? item?.iso_3166_1 ?? '' : item).map(normalize).filter(Boolean);
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;

function candidateFacts(candidate = {}) {
  const internal = candidate.constraintData || {};
  const metadata = candidate.metadata || {};
  const mediaType = candidateMediaType(candidate, candidate.mediaType);
  const genreValues = candidate.genreIds || candidate.genre_ids || internal.genreIds || [];
  const genreIds = array(genreValues).map(item => Number(typeof item === 'object' ? item?.id : item))
    .filter(value => Number.isInteger(value) && value > 0);
  const release = candidate.releaseDate || candidate.firstAirDate || candidate.release_date || candidate.first_air_date || internal.releaseDate;
  const year = Number.parseInt(String(release || candidate.release_year || internal.releaseYear || '').slice(0, 4), 10);
  const rawRuntime = candidate.runtime ?? internal.runtime ?? metadata.runtime ?? array(candidate.episode_run_time)[0];
  const runtime = number(rawRuntime);
  const countryValues = internal.countries?.length ? internal.countries
    : [...array(candidate.origin_country), ...array(candidate.production_countries)];
  const originalLanguage = candidate.originalLanguage || candidate.original_language || internal.originalLanguage || null;
  const adult = typeof (candidate.adult ?? internal.adult) === 'boolean' ? candidate.adult ?? internal.adult : null;
  const semanticParts = [metadata.overview, candidate.overview, internal.overview,
    ...array(internal.keywords), ...array(internal.themes), ...array(internal.moods),
    ...array(candidate.keywords), ...array(candidate.themes), ...array(candidate.moods)];
  return {
    tmdbId: number(candidate.tmdbId ?? candidate.tmdb_id ?? candidate.id), mediaType,
    titles: unique([candidate.title, candidate.name, candidate.originalTitle, candidate.original_title,
      candidate.original_name].map(normalize)),
    genreIds: unique(genreIds), genreNames: unique([...strings(internal.genres), ...strings(candidate.genres)]),
    year: Number.isInteger(year) ? year : null, runtime,
    originalLanguage: originalLanguage ? String(originalLanguage).toLowerCase() : null,
    countries: unique(strings(countryValues).map(value => value.toUpperCase())), adult,
    semanticText: normalize(semanticParts.filter(Boolean).join(' '))
  };
}

const add = (list, value) => { if (!list.includes(value)) list.push(value); };

/**
 * Bilingual confirmation of one exclusion from the candidate's own metadata.
 * `conceptMatch` knows the wordings the catalogue actually uses (French
 * overviews, English keywords) without ever widening a concept to a broader
 * one, and every content word of the concept must be present. A concept that
 * nothing confirms is left alone: missing information never invents a
 * violation, and no provider call is made per candidate.
 */
function confirmsConcept(semanticText, concept) {
  if (!semanticText) return false;
  return conceptMatch(semanticText, String(concept).replace(/_/g, ' ')) >= CONCEPT_PARTIAL_CREDIT;
}

/** Pure per-candidate decision. It performs no I/O and never mutates the candidate. */
export function evaluateStrictConstraints(candidate, intent = {}, { resolvedExcludedTitles = [] } = {}) {
  const facts = candidateFacts(candidate);
  const rejectedBy = [];
  const unknownConstraints = [];

  if (intent.mediaType && facts.mediaType !== intent.mediaType) add(rejectedBy, 'mediaType');

  const excludedTitleItems = [...array(intent.excludedTitles), ...array(resolvedExcludedTitles)];
  const excludedIds = excludedTitleItems.map(item => typeof item === 'object' ? number(item.tmdbId ?? item.tmdb_id ?? item.id) : null).filter(Boolean);
  const excludedNames = excludedTitleItems.flatMap(item => typeof item === 'object'
    ? [item.title, item.canonicalTitle, item.originalTitle] : [item]).map(normalize).filter(Boolean);
  if ((facts.tmdbId && excludedIds.includes(facts.tmdbId)) || facts.titles.some(title => excludedNames.includes(title))) {
    add(rejectedBy, 'excludedTitle');
  }

  for (const excludedGenre of array(intent.excludedGenres)) {
    const mappedIds = facts.mediaType ? tmdbGenreIds([excludedGenre], facts.mediaType) : [];
    const genreName = normalize(excludedGenre);
    if ((mappedIds.length && mappedIds.some(id => facts.genreIds.includes(id))) || facts.genreNames.includes(genreName)) {
      add(rejectedBy, 'excludedGenre');
    } else if (!(mappedIds.length && facts.genreIds.length) && !facts.genreNames.length) {
      add(unknownConstraints, 'excludedGenre');
    }
  }

  if (intent.yearMin != null || intent.yearMax != null) {
    if (facts.year == null) add(unknownConstraints, 'yearRange');
    else if ((intent.yearMin != null && facts.year < intent.yearMin) ||
      (intent.yearMax != null && facts.year > intent.yearMax)) add(rejectedBy, 'yearRange');
  }
  if (intent.runtimeMin != null || intent.runtimeMax != null) {
    if (facts.runtime == null) add(unknownConstraints, 'runtimeRange');
    else if ((intent.runtimeMin != null && facts.runtime < intent.runtimeMin) ||
      (intent.runtimeMax != null && facts.runtime > intent.runtimeMax)) add(rejectedBy, 'runtimeRange');
  }
  if (array(intent.languages).length) {
    if (!facts.originalLanguage) add(unknownConstraints, 'language');
    else if (!intent.languages.map(value => String(value).toLowerCase()).includes(facts.originalLanguage)) add(rejectedBy, 'language');
  }
  if (array(intent.countries).length) {
    if (!facts.countries.length) add(unknownConstraints, 'country');
    else if (!facts.countries.some(country => intent.countries.includes(country))) add(rejectedBy, 'country');
  }
  if (intent.adult !== null && intent.adult !== undefined) {
    if (facts.adult == null) add(unknownConstraints, 'adult');
    else if (facts.adult !== intent.adult) add(rejectedBy, 'adult');
  }

  for (const concept of normalizeSemanticExclusions(intent.semanticExclusions)) {
    const definition = SEMANTIC_EXCLUSIONS[concept];
    const genreMatch = facts.mediaType && definition?.genres?.length
      ? tmdbGenreIds(definition.genres, facts.mediaType).some(id => facts.genreIds.includes(id)) : false;
    const termMatch = Boolean(definition?.terms?.some(term => hasTerm(facts.semanticText, term)));
    if (genreMatch || termMatch || confirmsConcept(facts.semanticText, concept)) {
      add(rejectedBy, 'semanticExclusion');
    } else if (!facts.semanticText && !(definition?.genres?.length && facts.genreIds.length)) {
      add(unknownConstraints, 'semanticExclusion');
    }
  }

  return { eligible: rejectedBy.length === 0, rejectedBy, unknownConstraints };
}

const causeCounters = Object.freeze({
  mediaType: 'rejectedMediaType', yearRange: 'rejectedYear', excludedGenre: 'rejectedGenre',
  excludedTitle: 'rejectedTitle', semanticExclusion: 'rejectedSemanticExclusion'
});

/** Filter a pool without changing order or scores. Decisions stay server-internal. */
export function filterStrictCandidates(candidates, intent, {
  telemetry = {}, env = process.env, enabled = isStrictConstraintFilterEnabled(env),
  resolvedExcludedTitles = [], accumulate = true
} = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (!enabled) return { candidates: input, decisions: input.map(candidate => ({ candidate,
    decision: { eligible: true, rejectedBy: [], unknownConstraints: [] } })) };
  const decisions = input.map(candidate => ({ candidate,
    decision: evaluateStrictConstraints(candidate, intent, { resolvedExcludedTitles }) }));
  const output = decisions.filter(item => item.decision.eligible).map(item => item.candidate);
  const previous = accumulate && telemetry.strictFilterAttempted ? telemetry : {};
  Object.assign(telemetry, {
    strictFilterAttempted: true,
    strictFilterInputCount: Number(previous.strictFilterInputCount || 0) + input.length,
    strictFilterOutputCount: Number(previous.strictFilterOutputCount || 0) + output.length,
    strictFilterRejectedCount: Number(previous.strictFilterRejectedCount || 0) + input.length - output.length,
    strictFilterUnknownCount: Number(previous.strictFilterUnknownCount || 0) +
      decisions.filter(item => item.decision.unknownConstraints.length > 0).length
  });
  for (const [cause, counter] of Object.entries(causeCounters)) {
    telemetry[counter] = Number(previous[counter] || 0) +
      decisions.filter(item => item.decision.rejectedBy.includes(cause)).length;
  }
  return { candidates: output, decisions };
}
