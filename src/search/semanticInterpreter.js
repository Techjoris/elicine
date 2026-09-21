/**
 * LLM-first semantic interpretation for the Éliciné search engine.
 *
 * The runtime interpreter is the primary way a user query becomes an intent:
 *   raw query -> one LLM call -> structureder semantic intent -> CanonicalIntent
 *
 * The no-LLM path is a strict fallback used only when no provider is usable:
 * timeout, provider error, invalid/unusable response, provider unavailable.
 * A valid interpretation is never completed by heuristic signals.
 *
 * Exactly one interpretation call per provider attempt, never one call per
 * candidate. This module performs no retrieval, no ranking and no persistence.
 */
import { adaptLegacySearchIntent } from './legacyIntentAdapter.js';
import { normalizeSearchIntent } from './normalizeSearchIntent.js';
import {
  EMPTY_SEMANTIC_INTENT_CONTEXT,
  collectSemanticPeople,
  createSemanticIntentContext
} from './semanticIntentContext.js';

export const SEMANTIC_INTERPRETER_PATHS = Object.freeze({
  DEEPSEEK: 'deepseek',
  PROVIDER_FALLBACK: 'provider_fallback',
  HEURISTIC_FALLBACK: 'heuristic_fallback'
});

/** Explicit, fixed fallback reasons. Never free text, never provider output. */
export const INTERPRETER_FALLBACK_REASONS = Object.freeze({
  TIMEOUT: 'timeout',
  PROVIDER_ERROR: 'provider_error',
  INVALID_RESPONSE: 'invalid_response',
  UNAVAILABLE: 'unavailable'
});

export const SEMANTIC_INTERPRETER_MAX_TOKENS = 1200;
export const DEEPSEEK_INTERPRETER_TIMEOUT_MS = 6000;
export const PROVIDER_INTERPRETER_TIMEOUT_MS = 4000;

export const SEMANTIC_INTERPRETER_SYSTEM_PROMPT = `Tu es le moteur d'interprétation sémantique d'Éliciné, un moteur de recherche de films et de séries.

Ta mission est de COMPRENDRE la demande de l'utilisateur et de la traduire en intention structurée pour le moteur de retrieval.
Tu ne dois PAS proposer de liste de films ou de séries : le moteur de retrieval trouve les œuvres.
Réponds UNIQUEMENT avec un objet JSON compact, sans texte autour et sans clé vide.

Règles de compréhension :
1. media_type vaut "movie" ou "tv" quand la demande l'indique, sinon null.
2. intent_type vaut : specific_title_description, similar_to_title, thematic_search, mood_search, person_search, constraint_search ou mixed.
3. Sépare les PERSONNES (people, actors, directors) des CONCEPTS (semantic_concepts). Une personne nommée ne devient jamais un concept.
4. Un verbe de déplacement ou d'action ("voyage", "part", "cherche", "veut") n'est jamais un concept : garde l'idée centrale.
   Exemple : "film de leonardo dicaprio ou il voyage dans les rêves des autres" donne people=["Leonardo DiCaprio"], semantic_concepts=["dreams","shared dreams","subconscious"], intent_type=specific_title_description.
5. Une œuvre citée comme modèle ("comme X", "même style que X", "similaire à X", "dans le genre de X") va dans known_titles ET style_references, avec intent_type=similar_to_title.
6. Une exclusion ("sans meurtre", "ni enquête policière", "pas de magie") va dans negative_concepts et jamais dans les concepts positifs.
7. Une préférence comparative devient une contrainte : "plus récent" donne year_min, "davantage d'action" donne genres/moods/keywords, "plus sombre" donne moods.
8. semantic_concepts, themes et narrative_motifs s'écrivent en anglais, en 1 à 3 mots : "shared dreams", "modern warfare", "military aviation", "fighter aircraft", "air force", "aerial combat", "psychological thriller".
9. genres utilise les genres normalisés (Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, Thriller, War, Western). moods décrit l'ambiance (dark, tense, melancholic, feel-good, cold, oppressive).
10. keywords ne contient que les mots porteurs de sens, sans mot vide.

Format JSON attendu (omets les clés vides ou nulles) :
{
  "media_type": "movie" | "tv" | null,
  "intent_type": "specific_title_description" | "similar_to_title" | "thematic_search" | "mood_search" | "person_search" | "constraint_search" | "mixed",
  "genres": [], "moods": [], "themes": [], "keywords": [],
  "known_titles": [], "style_references": [], "excluded_titles": [], "excluded_genres": [],
  "people": [], "actors": [], "directors": [],
  "semantic_concepts": [], "negative_concepts": [], "narrative_motifs": [],
  "year_min": null, "year_max": null, "min_rating": null,
  "languages": [], "countries": [], "runtime_min": null, "runtime_max": null,
  "adult": null, "sort_preference": "relevance" | "popularity" | "rating" | "release_date" | null,
  "clean_query": "requête corrigée et nettoyée, sans changer le sens"
}`;

const MEDIA_TYPE_ALIASES = Object.freeze({
  movie: 'movie', movies: 'movie', film: 'movie', films: 'movie',
  tv: 'tv', serie: 'tv', series: 'tv', show: 'tv', shows: 'tv', television: 'tv'
});

const SORT_PREFERENCES = Object.freeze(['relevance', 'popularity', 'rating', 'release_date']);

const LANGUAGE_ALIASES = Object.freeze({
  francais: 'fr', french: 'fr', anglais: 'en', english: 'en', espagnol: 'es', spanish: 'es',
  allemand: 'de', german: 'de', italien: 'it', italian: 'it', japonais: 'ja', japanese: 'ja',
  coreen: 'ko', korean: 'ko', chinois: 'zh', chinese: 'zh', russe: 'ru', russian: 'ru',
  portugais: 'pt', portuguese: 'pt', suedois: 'sv', swedish: 'sv', danois: 'da', danish: 'da',
  norvegien: 'no', norwegian: 'no', neerlandais: 'nl', dutch: 'nl', turc: 'tr', turkish: 'tr'
});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const stripQuotes = value => clean(value).replace(/^["']|["']$/g, '').trim();

const normalizeKey = value => clean(value).normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function stringList(value, limit) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(items
    .map(item => clean(typeof item === 'object' ? item?.name ?? item?.title : item))
    .filter(Boolean))].slice(0, limit);
}

/** Tolerates a scalar, an array or a missing provider field. */
const asArray = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

function optionalNumber(value, { min, max, integer = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (integer && !Number.isInteger(numeric)) return null;
  if (min !== undefined && numeric < min) return null;
  if (max !== undefined && numeric > max) return null;
  return numeric;
}

function optionalBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function languageCodes(value, limit = 4) {
  return [...new Set(stringList(value, limit * 2).map(item => {
    const key = normalizeKey(item);
    if (LANGUAGE_ALIASES[key]) return LANGUAGE_ALIASES[key];
    return /^[a-z]{2,3}$/i.test(item) ? item.toLowerCase() : null;
  }).filter(Boolean))].slice(0, limit);
}

function countryCodes(value, limit = 4) {
  return [...new Set(stringList(value, limit * 2)
    .map(item => item.toUpperCase())
    .filter(item => /^[A-Z]{2}$/.test(item)))].slice(0, limit);
}

function normalizeMediaType(value) {
  const key = normalizeKey(value);
  if (!key) return 'all';
  return MEDIA_TYPE_ALIASES[key] || 'all';
}

function parseJsonObject(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.substring(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRecommendedTitles(value) {
  const items = Array.isArray(value) ? value : [];
  const output = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim().length > 1) {
      output.push({ title: item.trim(), release_year: null, type: 'movie', reason: '', match_percentage: null });
    } else if (item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim().length > 1) {
      const year = optionalNumber(item.release_year ?? item.year, { min: 1888, max: 2100, integer: true });
      const type = normalizeMediaType(item.type);
      output.push({
        title: item.title.trim(),
        release_year: year,
        type: type === 'all' ? null : type,
        reason: clean(item.reason),
        match_percentage: optionalNumber(item.match_percentage ?? item.match_score, { min: 0, max: 100 })
      });
    }
  }
  return output.slice(0, 12);
}

/**
 * Maps one raw provider object onto the legacy interpreted shape consumed by
 * `adaptLegacySearchIntent` and the existing handler, plus the semantic context.
 * Individual malformed fields are dropped; the reliable ones are kept.
 */
export function buildLegacyInterpretation(parsed = {}, { provider = null, coreOnly = false } = {}) {
  const mediaType = normalizeMediaType(parsed.media_type ?? parsed.mediaType ?? parsed.type);
  const genres = stringList(parsed.genres ?? parsed.primary_genres ?? parsed.primaryGenres ?? parsed.canonical_genres, 8);
  const moods = stringList(parsed.moods ?? parsed.mood_tags ?? parsed.moodTags, 8);
  // Semantic concepts and narrative motifs are the interpreter's central ideas:
  // they must reach CanonicalIntent.themes instead of staying context-only.
  const themes = stringList([
    ...asArray(parsed.themes ?? parsed.explicit_themes),
    ...asArray(parsed.semantic_concepts ?? parsed.semanticConcepts ?? parsed.concepts),
    ...asArray(parsed.narrative_motifs ?? parsed.narrativeMotifs ?? parsed.motifs)
  ], 10);
  const keywords = stringList(parsed.keywords, 12);
  const knownTitles = stringList(parsed.known_titles ?? parsed.knownTitles ?? parsed.reference_titles ?? parsed.referenceTitles ?? parsed.similar_reference_titles, 6);
  const styleReferences = stringList(parsed.style_references ?? parsed.styleReferences, 5);
  const semanticContext = createSemanticIntentContext({
    people: parsed.people ?? parsed.persons,
    actors: parsed.actors ?? parsed.cast,
    directors: parsed.directors ?? parsed.director,
    semanticConcepts: parsed.semantic_concepts ?? parsed.semanticConcepts ?? parsed.concepts,
    narrativeMotifs: parsed.narrative_motifs ?? parsed.narrativeMotifs ?? parsed.motifs,
    styleReferences,
    negativeConcepts: parsed.negative_concepts ?? parsed.negativeConcepts ?? parsed.semantic_exclusions,
    intentType: parsed.intent_type ?? parsed.intentType ?? parsed.intent
  });
  const recommendedTitles = normalizeRecommendedTitles(parsed.recommended_titles ?? parsed.recommendations ?? parsed.selections);
  const cleanQuery = clean(parsed.clean_query ?? parsed.cleanQuery ?? parsed.corrected_query);
  const atmosphere = clean(parsed.atmosphere_summary ?? parsed.suggested_mood ?? parsed.curated_atmosphere);
  const referenceTitles = [...new Set([...knownTitles, ...styleReferences])].slice(0, 6);
  const optional = coreOnly ? {} : {
    excluded_titles: stringList(parsed.excluded_titles ?? parsed.excludedTitles, 6),
    excluded_genres: stringList(parsed.excluded_genres ?? parsed.excludedGenres, 6),
    year_min: optionalNumber(parsed.year_min ?? parsed.yearMin, { min: 1888, max: 2100, integer: true }),
    year_max: optionalNumber(parsed.year_max ?? parsed.yearMax, { min: 1888, max: 2100, integer: true }),
    languages: languageCodes(parsed.languages),
    countries: countryCodes(parsed.countries),
    runtime_min: optionalNumber(parsed.runtime_min ?? parsed.runtimeMin, { min: 0, max: 1000 }),
    runtime_max: optionalNumber(parsed.runtime_max ?? parsed.runtimeMax, { min: 0, max: 1000 }),
    min_rating: optionalNumber(parsed.min_rating ?? parsed.minRating, { min: 0, max: 10 }),
    adult: optionalBoolean(parsed.adult),
    sort_preference: SORT_PREFERENCES.includes(clean(parsed.sort_preference ?? parsed.sortPreference))
      ? clean(parsed.sort_preference ?? parsed.sortPreference) : null
  };
  if (optional.year_min != null && optional.year_max != null && optional.year_min > optional.year_max) {
    const swap = optional.year_min;
    optional.year_min = optional.year_max;
    optional.year_max = swap;
  }
  if (optional.runtime_min != null && optional.runtime_max != null && optional.runtime_min > optional.runtime_max) {
    optional.runtime_max = optional.runtime_min;
  }
  const facets = parsed.facets && typeof parsed.facets === 'object' && !Array.isArray(parsed.facets) ? {
    is_multi_facet: Boolean(parsed.facets.is_multi_facet),
    core_action: clean(parsed.facets.core_action),
    setting: clean(parsed.facets.setting),
    forbidden_mismatches: stringList(parsed.facets.forbidden_mismatches, 6)
  } : undefined;

  return {
    ...optional,
    media_type: mediaType,
    primary_genres: genres, primaryGenres: genres, canonicalGenres: genres,
    mood_tags: moods, moodTags: moods,
    explicit_themes: themes, themes,
    keywords,
    reference_titles: referenceTitles, referenceTitles,
    similarReferenceTitles: referenceTitles,
    known_titles: knownTitles,
    clean_query: cleanQuery, cleanQuery,
    cleanSearchKeywords: cleanQuery ? [cleanQuery] : [],
    correctedQuery: cleanQuery,
    atmosphere_summary: atmosphere, suggested_mood: atmosphere, suggestedMood: atmosphere,
    recommended_titles: recommendedTitles,
    matches: recommendedTitles.map(item => ({ title: item.title, reason: item.reason || 'Recommandation cinématographique directe' })),
    people: collectSemanticPeople(semanticContext, 4),
    semantic_exclusions: semanticContext.negativeConcepts,
    semantic_intent_context: semanticContext,
    ...(facets ? { facets } : {}),
    ...(provider ? { provider } : {})
  };
}

function hasReliableSignal(legacy) {
  if (!legacy) return false;
  if (legacy.media_type === 'movie' || legacy.media_type === 'tv') return true;
  return [['primary_genres', legacy.primary_genres], ['mood_tags', legacy.mood_tags],
    ['explicit_themes', legacy.explicit_themes], ['keywords', legacy.keywords],
    ['reference_titles', legacy.reference_titles], ['semantic_exclusions', legacy.semantic_exclusions],
    ['people', legacy.people], ['styleReferences', legacy.semantic_intent_context?.styleReferences],
    ['semanticConcepts', legacy.semantic_intent_context?.semanticConcepts]]
    .some(([, value]) => Array.isArray(value) && value.length > 0);
}

/**
 * Server-side validation gate. The canonical adapter and its Zod contract are
 * the existing validation mechanism: if the sanitized interpretation cannot
 * produce a valid CanonicalIntent, the response is unusable.
 */
function canonicalGate(legacy) {
  normalizeSearchIntent(adaptLegacySearchIntent(legacy, { userQuery: '', recoverFallbackSignals: false }));
}

/** Tolerant parser: partial output keeps its reliable fields, unusable output is rejected. */
export function parseSemanticInterpretation(rawText) {
  const parsed = parseJsonObject(rawText);
  if (!parsed) {
    return { valid: false, reason: INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE, legacy: null };
  }
  const legacy = buildLegacyInterpretation(parsed);
  if (hasReliableSignal(legacy)) {
    try {
      canonicalGate(legacy);
      return { valid: true, reason: null, legacy, semanticContext: legacy.semantic_intent_context, partial: false };
    } catch {
      // Fall through: keep only the reliable core below.
    }
  }
  const core = buildLegacyInterpretation(parsed, { coreOnly: true });
  if (hasReliableSignal(core)) {
    try {
      canonicalGate(core);
      return { valid: true, reason: null, legacy: core, semanticContext: core.semantic_intent_context, partial: true };
    } catch {
      return { valid: false, reason: INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE, legacy: null };
    }
  }
  return { valid: false, reason: INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE, legacy: null };
}

/** The LLM must never be asked for a long film list; only the structured intent. */
export function buildSemanticInterpreterMessages(query, targetMediaType = 'Tous') {
  let userPrompt = `Requête de l'utilisateur : "${clean(query)}"`;
  if (targetMediaType === 'Séries TV') {
    userPrompt += `\n\nCONTRAINTE STRICTE : l'utilisateur cherche EXCLUSIVEMENT des séries télévisées. media_type doit valoir "tv".`;
  } else if (targetMediaType === 'Films') {
    userPrompt += `\n\nCONTRAINTE STRICTE : l'utilisateur cherche EXCLUSIVEMENT des films. media_type doit valoir "movie".`;
  }
  userPrompt += `\n\nRéponds uniquement avec l'objet JSON d'intention. N'inclus aucune liste de films à regarder.`;
  return [
    { role: 'system', content: SEMANTIC_INTERPRETER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];
}

export function buildSemanticInterpreterBody(messages, useJsonFormat = true) {
  const body = { messages, temperature: 0.2, max_tokens: SEMANTIC_INTERPRETER_MAX_TOKENS };
  if (useJsonFormat) body.response_format = { type: 'json_object' };
  return body;
}

/**
 * Provider cascade. DeepSeek is the primary interpreter; the remaining OpenAI
 * compatible providers keep the historical order and act as provider fallback
 * only when DeepSeek is unavailable or fails.
 */
export const SEMANTIC_INTERPRETER_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'deepseek', label: 'DeepSeek (deepseek-chat)', primary: true,
    endpoints: Object.freeze(['https://api.deepseek.com/chat/completions']),
    model: 'deepseek-chat', envModel: 'DEEPSEEK_MODEL',
    envKeys: Object.freeze(['DEEPSEEK_API_KEY']), requestKey: 'deepseekApiKey',
    jsonFormat: true, timeoutMs: DEEPSEEK_INTERPRETER_TIMEOUT_MS
  }),
  Object.freeze({
    id: 'groq', label: 'Groq (Llama 3.3 70B)', primary: false,
    endpoints: Object.freeze(['https://api.groq.com/openai/v1/chat/completions']),
    model: 'llama-3.3-70b-versatile', envModel: 'GROQ_MODEL',
    envKeys: Object.freeze(['GROQ_API_KEY', 'AI_API_KEY']), requestKey: 'groqApiKey',
    jsonFormat: true, timeoutMs: PROVIDER_INTERPRETER_TIMEOUT_MS
  }),
  Object.freeze({
    id: 'qwen', label: 'Qwen (qwen-plus)', primary: false,
    endpoints: Object.freeze([
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    ]),
    model: 'qwen-plus', envModel: 'QWEN_MODEL',
    envKeys: Object.freeze(['DASHSCOPE_API_KEY', 'QWEN_API_KEY']), requestKey: 'qwenApiKey',
    jsonFormat: true, timeoutMs: PROVIDER_INTERPRETER_TIMEOUT_MS
  }),
  Object.freeze({
    id: 'gemini', label: 'Gemini (gemini-2.0-flash)', primary: false,
    endpoints: Object.freeze(['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions']),
    model: 'gemini-2.0-flash', envModel: 'GEMINI_MODEL',
    envKeys: Object.freeze(['GEMINI_API_KEY', 'GOOGLE_API_KEY']), requestKey: 'geminiApiKey',
    jsonFormat: false, timeoutMs: 4500
  }),
  Object.freeze({
    id: 'openai', label: 'OpenAI (gpt-4o-mini)', primary: false,
    endpoints: Object.freeze(['https://api.openai.com/v1/chat/completions']),
    model: 'gpt-4o-mini', envModel: 'OPENAI_MODEL',
    envKeys: Object.freeze(['OPENAI_API_KEY']), requestKey: 'openAiApiKey',
    jsonFormat: true, timeoutMs: 4500
  })
]);

export function resolveProviderKey(provider, keys = {}, env = process.env) {
  const candidates = [keys?.[provider.requestKey], ...(provider.envKeys || []).map(name => env?.[name])];
  for (const candidate of candidates) {
    const value = stripQuotes(candidate);
    if (value) return value;
  }
  return null;
}

async function requestWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    return { response, timedOut };
  } catch (error) {
    return { response: null, timedOut, error };
  } finally {
    clearTimeout(timer);
  }
}

async function requestInterpreter(provider, { messages, model, key, fetchImpl }) {
  let reason = INTERPRETER_FALLBACK_REASONS.PROVIDER_ERROR;
  for (const endpoint of provider.endpoints) {
    const { response, timedOut, error } = await requestWithTimeout(fetchImpl, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, ...buildSemanticInterpreterBody(messages, provider.jsonFormat) })
    }, provider.timeoutMs);
    if (timedOut) { reason = INTERPRETER_FALLBACK_REASONS.TIMEOUT; continue; }
    if (error || !response) { reason = INTERPRETER_FALLBACK_REASONS.PROVIDER_ERROR; continue; }
    if (!response.ok) { reason = INTERPRETER_FALLBACK_REASONS.PROVIDER_ERROR; continue; }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      reason = INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE;
      continue;
    }
    const parsed = parseSemanticInterpretation(payload?.choices?.[0]?.message?.content ?? '');
    if (parsed.valid) return { ok: true, parsed };
    reason = INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE;
  }
  return { ok: false, reason };
}

/**
 * Single entry point of the interpretation step.
 * Always resolves: an unusable provider chain yields the injected no-LLM
 * heuristic interpretation with an explicit reason, never a silent switch.
 */
export async function interpretSearchQuery({
  query,
  targetMediaType = 'Tous',
  keys = {},
  telemetry = null,
  fetchImpl = globalThis.fetch,
  env = process.env,
  heuristicInterpretation = null,
  onAttempt = null,
  providers = SEMANTIC_INTERPRETER_PROVIDERS
} = {}) {
  const messages = buildSemanticInterpreterMessages(query, targetMediaType);
  const attempts = [];
  let firstFailure = null;
  for (const provider of providers) {
    const configuredModel = provider.envModel ? clean(env?.[provider.envModel]) : '';
    const model = configuredModel || provider.model;
    const key = resolveProviderKey(provider, keys, env);
    if (!key) {
      attempts.push({ provider: provider.id, reason: INTERPRETER_FALLBACK_REASONS.UNAVAILABLE });
      continue;
    }
    if (typeof onAttempt === 'function') onAttempt(provider.id, model);
    const attempt = await requestInterpreter(provider, { messages, model, key, fetchImpl });
    if (attempt.ok) {
      return {
        interpreted: { ...attempt.parsed.legacy, provider: provider.label, semanticProviderId: provider.id },
        semanticContext: attempt.parsed.semanticContext,
        people: collectSemanticPeople(attempt.parsed.semanticContext, 4),
        provider: provider.label,
        providerId: provider.id,
        model,
        path: provider.primary ? SEMANTIC_INTERPRETER_PATHS.DEEPSEEK : SEMANTIC_INTERPRETER_PATHS.PROVIDER_FALLBACK,
        reason: firstFailure,
        partial: attempt.parsed.partial,
        attempts
      };
    }
    attempts.push({ provider: provider.id, reason: attempt.reason });
    firstFailure = firstFailure || attempt.reason;
  }

  // The most explicit failure wins: a real provider error, timeout or invalid
  // response is more actionable than a provider that simply had no key.
  const failureReason = attempts.find(item => item.reason !== INTERPRETER_FALLBACK_REASONS.UNAVAILABLE)?.reason
    || INTERPRETER_FALLBACK_REASONS.UNAVAILABLE;
  const heuristic = typeof heuristicInterpretation === 'function'
    ? heuristicInterpretation(query)
    : { media_type: 'all', primary_genres: [], mood_tags: [], reference_titles: [],
        recommended_titles: [], matches: [], people: [], provider: 'Algorithme Éliciné' };
  const people = Array.isArray(heuristic?.people) ? heuristic.people : [];
  return {
    interpreted: { ...heuristic, semantic_intent_context: EMPTY_SEMANTIC_INTENT_CONTEXT },
    semanticContext: EMPTY_SEMANTIC_INTENT_CONTEXT,
    people,
    provider: heuristic?.provider || 'Algorithme Éliciné',
    providerId: null,
    model: null,
    path: SEMANTIC_INTERPRETER_PATHS.HEURISTIC_FALLBACK,
    reason: failureReason,
    partial: false,
    attempts
  };
}
