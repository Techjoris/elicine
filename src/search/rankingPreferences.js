import { normalizeTerm } from './tmdbRetrievalParams.js';
import { conceptMatch, conceptSpecificity, conceptVariants } from './semanticLexicon.js';

const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const clamp = value => Math.max(0, Math.min(1, value));
const rounded = value => value == null ? null : Number(clamp(value).toFixed(6));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const names = values => array(values).map(value => typeof value === 'object' ? value?.name : value).filter(Boolean);
const phrase = (text, term) => (` ${normalizeTerm(text)} `).includes(` ${normalizeTerm(term)} `);
const contentWords = term => normalizeTerm(term).split(' ').filter(word =>
  word.length > 1 && !['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'the', 'of', 'and', 'in', 'with'].includes(word));
const RELATION_MARKERS = /\b(qui|ou|dont|pour|entre|apres|avant|pendant|lorsque|et|where|who|whose|between|after|before|while|and)\b/;

function facts(candidate = {}) {
  const data = candidate.constraintData || {};
  const metadata = candidate.metadata || {};
  // Titles are not narrative evidence. A verified model proposal's explanation
  // is included because it is read with the same deterministic concept matcher
  // as the metadata; an incoherent explanation earns no relation credit.
  const overviews = [...new Set([metadata.overview, data.overview, candidate.overview].filter(Boolean))];
  const structured = [...names(data.themes), ...names(data.keywords), ...names(data.moods),
    ...names(candidate.themes), ...names(candidate.keywords), ...names(candidate.moods),
    ...names(metadata.moods),
    ...array(candidate.retrievalSignals).map(signal => signal?.narrativeCandidateReason)];
  return { overviews, structured,
    text: [...overviews, ...structured, metadata.setting].filter(Boolean).join(' '),
    genreIds: array(candidate.genreIds), genres: names(data.genres) };
}

/**
 * Joint narrative support, rather than a second bag-of-words average. A pair
 * only becomes a relation when the user's sentence connects both concepts.
 * Unknown translations remain neutral; this bounded lexicon cannot infer that
 * a French paraphrase contradicts an unfamiliar English concept.
 */
function relationFit(candidate, intent, queryText) {
  const evidence = facts(candidate);
  if (!evidence.text) return null;
  const concepts = [...new Set([...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]
    .map(normalizeTerm).filter(Boolean))]
    .filter(term => conceptSpecificity(term, { genres: intent.genres }) >= 0.6);
  const scores = [];

  // Recognised compound concepts must remain compounds: broad "dreams" is
  // useful evidence but cannot certify the relation in "shared dreams".
  for (const concept of concepts) {
    if (contentWords(concept).length < 2 || conceptVariants(concept).length < 2) continue;
    const support = conceptMatch(evidence.text, concept);
    if (support > 0) scores.push(support === 1 ? 1 : support * 0.5);
  }

  const query = normalizeTerm(queryText);
  if (RELATION_MARKERS.test(query)) {
    const connected = concepts.filter(term => conceptVariants(term).length > 1 && conceptMatch(query, term) >= 0.8);
    // Keep sentences separate, but permit a local window across sentence
    // boundaries: short catalogue summaries often split one plot over two.
    const passages = evidence.overviews.flatMap(text => {
      const sentences = String(text).split(/[.!?;\n]+/u).map(normalizeTerm).filter(Boolean);
      const words = normalizeTerm(text).split(' ');
      return [...sentences, ...words.map((_, index) => words.slice(index, index + 24).join(' '))];
    });
    passages.push(...evidence.structured);
    for (let left = 0; left < connected.length; left += 1) {
      for (let right = left + 1; right < connected.length; right += 1) {
        const first = connected[left];
        const second = connected[right];
        // Synonymous / nested concepts are one signal, never convergence.
        if (conceptMatch(first, second) >= 0.8 || conceptMatch(second, first) >= 0.8) continue;
        const firstFit = conceptMatch(evidence.text, first);
        const secondFit = conceptMatch(evidence.text, second);
        if (!firstFit && !secondFit) continue;
        const joint = Math.max(0, ...passages.map(passage =>
          Math.min(conceptMatch(passage, first), conceptMatch(passage, second))));
        scores.push(joint || Math.min(firstFit, secondFit) * 0.35);
      }
    }
  }
  return mean(scores);
}

function yearOf(candidate = {}) {
  const direct = candidate.releaseYear ?? candidate.year;
  const year = direct == null ? Number.parseInt(String(candidate.releaseDate || candidate.firstAirDate || '').slice(0, 4), 10)
    : Number(direct);
  return Number.isInteger(year) && year > 0 ? year : null;
}

const DARK = ['dark', 'bleak', 'grim', 'oppressive', 'sinister', 'sombre', 'angoissant', 'angoissante', 'noirceur'];
const LIGHT = ['lighthearted', 'light hearted', 'feel good', 'joyful', 'joyeux', 'joyeuse', 'lumineux', 'optimiste'];
const ACTION = ['action packed', 'non stop action', 'explosive action', 'poursuite', 'poursuites', 'fusillade', 'fusillades',
  'combat', 'bataille', 'chase', 'shootout'];
const VIOLENT = ['graphic violence', 'extreme violence', 'ultraviolent', 'ultra violent', 'gore', 'torture', 'massacre',
  'brutal', 'brutale', 'brutalite', 'violent', 'violente', 'violents', 'violence'];
const GENTLE = ['nonviolent', 'non violent', 'non violente', 'sans violence', 'peu violent', 'peu violente',
  'non graphic', 'gentle', 'doux', 'paisible', 'pacifique', 'family friendly', 'tout public', 'tous publics'];
const REALISTIC = ['based on a true story', 'true story', 'true events', 'biopic', 'biographical', 'documentary',
  'documentaire', 'historical', 'historique', 'realistic', 'realiste', 'realisme', 'authentique', 'credible',
  'procedural', 'procedural drama', 'faits reels', 'inspire de faits reels', 'tire de faits reels', 'ancré dans le réel',
  'histoire vraie'];
const DREAMLIKE = ['surreal', 'surrealistic', 'surreel', 'surreelle', 'fantastique', 'fantasy', 'dreamlike',
  'onirique', 'stylise', 'stylisee', 'stylized', 'stylised', 'hallucinatoire', 'hallucinatory'];
const anyPhrase = (text, terms) => terms.some(term => phrase(text, term));

function moodLevel(candidate) {
  const text = facts(candidate).text;
  if (!text) return null;
  const dark = DARK.some(term => conceptMatch(text, term) === 1);
  const light = anyPhrase(text, LIGHT);
  if (!dark && !light) return null;
  return dark && light ? 0.5 : dark ? 0.95 : 0.1;
}

function actionLevel(candidate) {
  const evidence = facts(candidate);
  const actionGenre = evidence.genreIds.some(id => [28, 10759].includes(Number(id))) ||
    evidence.genres.some(name => phrase(name, 'action'));
  if (anyPhrase(evidence.text, ACTION)) return 0.95;
  if (actionGenre) return 0.8;
  // Known genres without Action provide modest contrary evidence; absent
  // metadata does not establish a quiet film.
  return evidence.genreIds.length || evidence.genres.length ? 0.25 : null;
}

function violenceLevel(candidate) {
  let text = normalizeTerm(facts(candidate).text);
  if (!text) return null;
  const gentle = anyPhrase(text, GENTLE);
  // Remove explicit negation before looking for positive violence evidence.
  for (const term of GENTLE) text = ` ${text} `.replaceAll(` ${normalizeTerm(term)} `, ' ').trim();
  const violent = anyPhrase(text, VIOLENT);
  if (!gentle && !violent) return null;
  return gentle && violent ? 0.5 : violent ? 0.95 : 0.1;
}

/**
 * How anchored in reality a work reads. Built from its own metadata, exactly
 * like the mood and violence levels: only explicit markers count, and silence
 * never certifies realism, so a sparse overview stays neutral.
 */
function realismLevel(candidate) {
  const text = facts(candidate).text;
  if (!text) return null;
  const realistic = anyPhrase(text, REALISTIC);
  const dreamlike = anyPhrase(text, DREAMLIKE);
  if (!realistic && !dreamlike) return null;
  return realistic && dreamlike ? 0.5 : realistic ? 0.95 : 0.15;
}

/**
 * Narrative pace, read as the opposite of the action level the engine already
 * measures. "Lent" and "rythmé" are the same dimension read from both ends, so
 * one bounded measure serves both without any query-specific rule.
 */
function paceLevel(candidate) {
  const level = actionLevel(candidate);
  return level == null ? null : 1 - level;
}

function relativeFit(level, references, measure, direction = 1) {
  if (level == null) return null;
  const baseline = mean(references.map(measure).filter(value => value != null));
  return baseline == null ? (direction > 0 ? level : 1 - level)
    : clamp(0.5 + direction * (level - baseline) * 0.6);
}

/**
 * Extra ranking evidence only. No candidate is excluded and no provider call
 * is made. Scores are 0..1, centred on 0.5; null means unknown/inapplicable.
 * Reference metadata can be sparse, so mood/violence never use an invented
 * baseline and silence about violence never certifies a gentle work.
 */
export function scoreRankingPreferences(candidate, intent = {}, resolvedContext = {}, { queryText = '' } = {}) {
  const query = normalizeTerm(queryText);
  const descriptors = [...array(intent.moods), ...array(intent.themes), ...array(intent.keywords)].map(normalizeTerm).join(' ');
  const text = `${query} ${descriptors}`;
  const references = array(resolvedContext.resolvedTitles);
  const preferences = [];
  const narrativeConcepts = [...new Set([...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]
    .map(normalizeTerm).filter(Boolean))]
    .filter(term => conceptSpecificity(term, { genres: intent.genres }) >= 0.6);
  const relationRequired = narrativeConcepts.length >= 2 && RELATION_MARKERS.test(query);

  if (/\b(plus recent\w*|plus nouveau\w*|plus moderne\w*|more recent|newer)\b/.test(text)) {
    const years = references.map(yearOf).filter(year => year != null);
    const year = yearOf(candidate);
    if (years.length && year != null) {
      preferences.push(0.5 + Math.tanh((year - Math.max(...years)) / 12) * 0.5);
    }
  }
  if (/\b(plus sombre\w*|davantage sombre\w*|plutot sombre\w*|assez sombre\w*|darker|more dark)\b/.test(text)) {
    preferences.push(relativeFit(moodLevel(candidate), references, moodLevel));
  }
  if (/\b((plus|davantage) (d )?action|more action|action packed|plutot (oriente )?action)\b/.test(text)) {
    preferences.push(relativeFit(actionLevel(candidate), references, actionLevel));
  }
  if (/\b((moins|peu|pas trop) violent\w*|(moins|peu|pas trop) (de )?violence|less violen\w*|mild violence)\b/.test(text)) {
    preferences.push(relativeFit(violenceLevel(candidate), references, violenceLevel, -1));
  }
  if (/\b((plus|davantage) (de )?violence|more violen\w*|plus violent\w*|gorier|plus gore)\b/.test(text)) {
    preferences.push(relativeFit(violenceLevel(candidate), references, violenceLevel));
  }
  // Rhythm: a slow, contemplative request and a fast-paced one are the two ends
  // of the same measured dimension.
  if (/\b(lent\w*|pose\w*|contemplati\w*|calme|tranquille\w*|meditati\w*|slow burn|slow paced|slow burn)\b/.test(text)) {
    preferences.push(relativeFit(paceLevel(candidate), references, paceLevel));
  }
  if (/\b(rythm\w*|rapide\w*|nerveu\w*|frénéti\w*|freneti\w*|haletant\w*|fast paced|fast-paced|up tempo)\b/.test(text)) {
    preferences.push(relativeFit(paceLevel(candidate), references, paceLevel, -1));
  }
  // Anchoring in reality: "réaliste" and "moins réaliste / plus onirique" are
  // the same measure read in opposite directions.
  if (/\b(realiste\w*|realism\w*|credible\w*|authentique\w*|ancr\w* dans le reel|realistic|realism|true story|faits reels|biopic)\b/.test(text)) {
    preferences.push(relativeFit(realismLevel(candidate), references, realismLevel));
  }
  if (/\b(moins realiste\w*|plus onirique\w*|plus surrealiste\w*|plus fantastique\w*|dreamlike|surreal|less realistic)\b/.test(text)) {
    preferences.push(relativeFit(realismLevel(candidate), references, realismLevel, -1));
  }

  return {
    relationScore: rounded(relationFit(candidate, intent, queryText)),
    relationRequired,
    preferenceScore: rounded(mean(preferences.filter(value => value != null))),
    preferenceApplied: preferences.length > 0
  };
}
