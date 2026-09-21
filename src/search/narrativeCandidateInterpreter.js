/**
 * Narrative candidate channel for the Éliciné search engine.
 *
 * The 16-19/09 engine asked the model for a short list of works that truly
 * answer the description. A later revision demoted the model to a pure intent
 * extractor ("Tu ne dois PAS proposer de liste de films"), and the works the
 * model would have named stopped reaching the pool at all.
 *
 * This module restores the *proposal* role without restoring the *authority*:
 * the proposed titles are re-resolved against TMDB and injected as one more
 * retrieval channel. The deterministic strict filter, ranker and result budget
 * remain the only arbiters of the final grid, so an unverifiable or incoherent
 * proposal cannot become a result.
 *
 * Exactly one model call per search, never one call per candidate, and the model
 * never sees the catalogue. A title TMDB cannot confirm is dropped.
 */
import {
  INTERPRETER_FALLBACK_REASONS,
  buildSemanticInterpreterBody,
  normalizeMediaType,
  parseJsonObject,
  runProviderCascade,
  SEMANTIC_INTERPRETER_PROVIDERS
} from './semanticInterpreter.js';

export const LLM_CANDIDATE_CHANNEL_FLAG = 'LLM_CANDIDATE_CHANNEL_ENABLED';
export const NARRATIVE_CANDIDATE_LIMIT = 10;
export const NARRATIVE_CANDIDATE_MAX_TOKENS = 1800;
export const NARRATIVE_CANDIDATE_REASON_LIMIT = 240;

/** The channel is on by default; an explicit false is the operational rollback. */
export function isLlmCandidateChannelEnabled(env = process.env) {
  return String(env?.[LLM_CANDIDATE_CHANNEL_FLAG] ?? 'true').toLowerCase() !== 'false';
}

export const NARRATIVE_CANDIDATE_SYSTEM_PROMPT = `Tu es une encyclopédie universelle du cinéma doublée du moteur de recommandation d'Éliciné.

Ta mission est double :
1. CORRIGER silencieusement les fautes d'orthographe, de frappe ou de grammaire de la demande avant de l'analyser.
2. TRADUIRE toute description littéraire, métaphore, ambiance, situation narrative, époque, contrainte ou croisement de genres en une liste COURTE et PRÉCISE de 4 à 10 œuvres réelles (films ou séries) qui racontent VÉRITABLEMENT cette histoire.

Le catalogue réel est vérifié ensuite par le moteur : un titre inventé, approximatif ou hors sujet est éliminé. Propose donc uniquement des œuvres dont tu es certain qu'elles existent, avec leur titre TMDB le plus courant.

Règles d'analyse :
- COHÉRENCE SÉMANTIQUE GLOBALE (PRIORITÉ ABSOLUE) : juge l'œuvre sur son intrigue principale et ses thématiques centrales, jamais sur des mots-clés indépendants. Pour "un film sur le mariage et la mort", propose des œuvres qui articulent réellement les deux thèmes (Les Noces funèbres, Melancholia, Amour, Beetlejuice, Ready or Not, Ghost), jamais une comédie de bureau ou un film de jazz.
- DÉCOMPOSITION MULTI-FACETTES : quand la demande croise plusieurs notions (braquage + espace, western + science-fiction, enquête + huis clos), privilégie les œuvres hybrides qui combinent SIMULTANÉMENT les facettes. Pour un braquage spatial, ne renvoie pas de survie solitaire contemplative du type Seul sur Mars ou Ad Astra.
- EXCLUSIONS ET NÉGATIONS : ne bloque jamais. Traduis toujours l'exclusion en choix positif. "Film d'action sans super-héros et sans explosion" devient polar réaliste, thriller urbain, poursuite tactique (Sicario, Heat, Collateral, Drive, Ronin, Les Infiltrés). "SF sans extraterrestre" devient anticipation humaine, IA, paradoxe temporel, dystopie sociale (Gattaca, Ex Machina, Her, Les Fils de l'homme).
- MÉTAPHORES ET SENSATIONS : ne cherche jamais une correspondance littérale. "Être enfermé dans un ascenseur sous la pluie" devient huis clos oppressant, claustrophobie, néo-noir pluvieux (Devil, Buried, Panic Room, Se7en, Blade Runner).
- HUMEURS ET ÉMOTIONS : traduis l'état affectif en sous-genres et en œuvres emblématiques, sans jamais chercher une phrase littérale. Tristesse cathartique -> drames déchirants et deuils (La Ligne verte, Le Tombeau des lucioles, Manchester by the Sea, Le Pianiste). Feel-good -> comédies chaleureuses et fables solaires (Intouchables, Little Miss Sunshine, Green Book, Paddington 2). Angoisse sans sursaut -> horreur atmosphérique et slow burn (Hereditary, Midsommar, The Witch, The Shining). Nostalgie -> chroniques initiatiques douces-amères (Stand by Me, Cinema Paradiso, Boyhood, Aftersun).
- CROISEMENTS TEMPORELS : "SF des années 70" désigne le cinéma de genre de cette décennie (Alien, Solaris, Soleil Vert), pas un film récent situé dans les années 70.
- CONTRE-EMPLOI : si un acteur est demandé dans un registre inhabituel (Jim Carrey dramatique), propose ses rôles sérieux (The Truman Show, Eternal Sunshine of the Spotless Mind, Man on the Moon).
- TITRES CITÉS COMME MODÈLE : une œuvre citée ("comme X", "dans le genre de X") sert de repère de style. Propose des voisins exigeants, et n'inclus pas X lui-même sauf si la demande le réclame explicitement.
- CONTRAINTES EXPLICITES : respecte scrupuleusement le type demandé (film ou série), la langue, le pays, la période et la note minimale quand ils sont précisés.
- FICTION UNIQUEMENT : jamais de talk-show, interview, télé-réalité, cérémonie, making-of, podcast ni documentaire, sauf demande explicite de documentaire.
- QUALITÉ ET DIVERSITÉ : écarte les mockbusters, parodies bon marché, téléfilms obscurs et productions de type Asylum. Propose des réalisateurs différents qui explorent l'idée sous des angles complémentaires.

Format de réponse OBLIGATOIRE — objet JSON strict, sans texte autour :
{
  "atmosphere_summary": "Phrase d'accroche cinéphile résumant le fil conducteur de la sélection",
  "media_type": "movie" | "tv" | "all",
  "candidates": [
    {
      "title": "Titre TMDB le plus courant (titre international officiel)",
      "release_year": 2018,
      "type": "movie" | "tv",
      "reason": "Explication concise et personnalisée : pourquoi cette œuvre raconte réellement cette histoire"
    }
  ]
}
Chaque "reason" fait au maximum 200 caractères et cite les éléments concrets de l'intrigue qui répondent à la demande.`;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

const stringList = value => (Array.isArray(value) ? value : value == null ? [] : [value])
  .map(item => clean(typeof item === 'object' ? item?.name ?? item?.title : item)).filter(Boolean);

const optionalYear = value => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1888 && year <= 2100 ? year : null;
};

const normalizeCandidateType = value => {
  const type = normalizeMediaType(value);
  return type === 'all' ? null : type;
};

/**
 * Keeps one bounded, deduplicated proposal list. A candidate without a usable
 * title is dropped; a malformed year or type is dropped without losing the
 * candidate, because the TMDB re-resolution is the real identity check.
 */
export function normalizeNarrativeCandidates(value, limit = NARRATIVE_CANDIDATE_LIMIT) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(value) ? value : []) {
    const title = clean(typeof item === 'string' ? item
      : item?.title ?? item?.name ?? item?.original_title ?? item?.titre);
    if (title.length < 2) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const releaseYear = typeof item === 'object' && item !== null
      ? optionalYear(item.release_year ?? item.releaseYear ?? item.year) : null;
    const type = typeof item === 'object' && item !== null
      ? normalizeCandidateType(item.type ?? item.media_type ?? item.mediaType) : null;
    const reason = typeof item === 'object' && item !== null
      ? clean(item.reason ?? item.why ?? item.justification).slice(0, NARRATIVE_CANDIDATE_REASON_LIMIT) : '';
    output.push({ title, releaseYear, type, reason });
    if (output.length >= limit) break;
  }
  return output;
}

/** Tolerant parser: a partial list is usable, an unusable payload is rejected. */
export function parseNarrativeCandidates(rawText) {
  const invalid = { valid: false, reason: INTERPRETER_FALLBACK_REASONS.INVALID_RESPONSE,
    candidates: [], atmosphereSummary: '', cleanQuery: '', mediaType: null };
  const parsed = parseJsonObject(rawText);
  if (!parsed) return invalid;
  const candidates = normalizeNarrativeCandidates(parsed.candidates ?? parsed.recommended_titles
    ?? parsed.recommendations ?? parsed.selections ?? parsed.titles ?? parsed.matches);
  if (!candidates.length) return invalid;
  return {
    valid: true,
    reason: null,
    candidates,
    atmosphereSummary: clean(parsed.atmosphere_summary ?? parsed.atmosphereSummary
      ?? parsed.suggested_mood ?? parsed.curated_atmosphere),
    cleanQuery: clean(parsed.clean_query ?? parsed.cleanQuery ?? parsed.corrected_query),
    mediaType: normalizeCandidateType(parsed.media_type ?? parsed.mediaType)
  };
}

/**
 * The model is asked for the narrative verdict, which is the only thing a
 * catalogue cannot compute: which works really tell this story. It is never
 * asked for a score, a percentage or a ranking of the catalogue.
 */
export function buildNarrativeCandidateMessages(query, targetMediaType = 'Tous', { semanticContext = null } = {}) {
  let userPrompt = `Demande de l'utilisateur : "${clean(query)}"`;
  if (targetMediaType === 'Séries TV') {
    userPrompt += `\n\nCONTRAINTE STRICTE : l'utilisateur cherche EXCLUSIVEMENT des séries télévisées. Chaque "type" doit valoir "tv".`;
  } else if (targetMediaType === 'Films') {
    userPrompt += `\n\nCONTRAINTE STRICTE : l'utilisateur cherche EXCLUSIVEMENT des films. Chaque "type" doit valoir "movie".`;
  }
  const concepts = stringList(semanticContext?.semanticConcepts).slice(0, 6);
  const motifs = stringList(semanticContext?.narrativeMotifs).slice(0, 4);
  const negatives = stringList(semanticContext?.negativeConcepts).slice(0, 5);
  const references = stringList(semanticContext?.styleReferences).slice(0, 3);
  if (concepts.length || motifs.length) {
    userPrompt += `\n\nIdées centrales déjà identifiées dans la demande (à respecter) : ${[...concepts, ...motifs].join(', ')}.`;
  }
  if (negatives.length) {
    userPrompt += `\n\nÉléments explicitement EXCLUS par l'utilisateur : ${negatives.join(', ')}. Aucune œuvre proposée ne doit reposer sur ces éléments.`;
  }
  if (references.length) {
    userPrompt += `\n\nŒuvres citées comme repère de style : ${references.join(', ')}.`;
  }
  userPrompt += `\n\nRéponds uniquement avec l'objet JSON demandé.`;
  return [
    { role: 'system', content: NARRATIVE_CANDIDATE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];
}

export function buildNarrativeCandidateBody(messages, useJsonFormat = true) {
  const body = { messages, temperature: 0.4, max_tokens: NARRATIVE_CANDIDATE_MAX_TOKENS };
  if (useJsonFormat) body.response_format = { type: 'json_object' };
  return body;
}

/**
 * Single entry point of the narrative candidate step. Always resolves: a failed
 * provider chain yields an empty proposal with an explicit reason, never a
 * silent switch, and never a fallback list built by the code.
 */
export async function interpretNarrativeCandidates({
  query,
  targetMediaType = 'Tous',
  semanticContext = null,
  keys = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  onAttempt = null,
  providers = SEMANTIC_INTERPRETER_PROVIDERS
} = {}) {
  const messages = buildNarrativeCandidateMessages(query, targetMediaType, { semanticContext });
  const cascade = await runProviderCascade({
    providers, messages, keys, env, fetchImpl, onAttempt,
    parse: parseNarrativeCandidates, buildBody: buildNarrativeCandidateBody
  });
  if (!cascade.ok) {
    return { path: 'unavailable', reason: cascade.reason, provider: null, providerId: null, model: null,
      candidates: [], atmosphereSummary: '', cleanQuery: '', mediaType: null, attempts: cascade.attempts };
  }
  return {
    path: cascade.provider.primary ? 'primary' : 'provider_fallback',
    reason: cascade.reason,
    provider: cascade.provider.label,
    providerId: cascade.providerId,
    model: cascade.model,
    candidates: cascade.parsed.candidates,
    atmosphereSummary: cascade.parsed.atmosphereSummary,
    cleanQuery: cascade.parsed.cleanQuery,
    mediaType: cascade.parsed.mediaType,
    attempts: cascade.attempts
  };
}
