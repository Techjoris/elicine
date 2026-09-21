import { checkRateLimit } from './_rateLimit.js';
import { orchestrateSearch, orchestrateCandidateRetrieval } from '../src/search/searchOrchestrator.js';
import { isHybridRetrievalEnabled } from '../src/search/hybridRetriever.js';
import { candidateMediaType, toLegacyRankingCandidate, toRetrievalCandidate } from '../src/search/retrievalCandidate.js';
import { createTmdbRetrievalClient, createSupabaseLexicalSource, retrieveLegacyHints } from '../src/search/retrievalServices.js';
import { createEmbeddingClient, createQueryEmbeddingService, createSupabaseVectorSource,
  isVectorRetrievalEnabled } from '../src/search/vectorRetrieval.js';
import { filterStrictCandidates } from '../src/search/strictConstraintFilter.js';
import { rankSearchCandidates, toElicineRankedResult } from '../src/search/searchRanker.js';
import { diversifyRankedCandidates } from '../src/search/resultDiversifier.js';
import { resolveKnownPeople, resolveKnownTitles } from '../src/search/entityResolver.js';
import { extractPersonQueries } from '../src/search/fallbackIntentSignals.js';
import { FALLBACK_REASONS, recordFallback } from '../src/search/fallbackPolicy.js';
import {
  addSearchTelemetryPath,
  createSearchTelemetry,
  finalizeSearchTelemetry,
  getSearchEngineMode,
  recordSearchCandidateCount,
  recordSearchLlmAttempt
} from './searchPhase0.js';
import { persistSearchTelemetry } from './searchTelemetryPersistence.js';
import { 
  searchQuotaQuerySchema, 
  verifyServerSession, 
  supabaseServer,
  getMemoryDailyQuota,
  incrementMemoryDailyQuota,
  sanitizeUserQuery
} from './_security.js';

// ============================================================================
// SYSTEM PROMPT — ÉTAPE 1 : Cerveau LLM (Extraction & Correction)
// Rôle : Corriger les fautes, interpréter les descriptions libres,
//        et renvoyer impérativement 3 à 5 titres de films pertinents.
// ============================================================================
// SYSTEM PROMPT — ÉTAPE 1 : Cerveau LLM (Extraction & Correction)
// Rôle : Corriger les fautes, interpréter les descriptions libres,
//        et renvoyer impérativement 5 à 8 films pertinents.
// ============================================================================
const LLM_SYSTEM_PROMPT = `Tu es une encyclopédie universelle du cinéma dotée d'une intelligence exceptionnelle.

Ta mission est double :
1. CORRIGER silencieusement toutes les fautes de frappe, d'orthographe ou de grammaire dans la requête de l'utilisateur avant de l'analyser.
2. TRANSFORMER toute description littéraire, métaphore sensorielle, ambiance poétique, situation narrative, époque ou mots-clés en une liste précise de 4 à 8 films cinématographiques qui correspondent VÉRITABLEMENT à cette intention.

Directives cinématographiques majeures :
- COHÉRENCE SÉMANTIQUE GLOBALE & PROFONDEUR THÉMATIQUE (PRIORITÉ ABSOLUE) :
  L'analyse doit porter sur la COHÉRENCE GLOBALE de l'œuvre (intrigue principale, enjeux dramatiques majeurs, thématiques centrales) et NON sur de simples mots-clés indépendants ou superficiels.
  Exemple critique : si l'utilisateur recherche "un film sur le mariage et la mort", les films recommandés DOIVENT articuler véritablement et simultanément ces deux thèmes au cœur de leur histoire (ex: Les Noces funèbres / Corpse Bride, Melancholia, Amour de Haneke, Beetlejuice, Quatre mariages et un enterrement, Ready or Not / Wedding Nightmare, Ghost, etc.).
  INTERDICTION FORMELLE de proposer des comédies de bureau, des films d'entreprise, des romances légères ordinaires ou des films de jazz qui n'ont aucun rapport avec la thématique conjointe demandée.
- GESTION PROPRE DU ZÉRO RÉSULTAT & INTERDICTION DU BLOCAGE SEC INJUSTIFIÉ :
  Le renvoi d'un tableau vide "matches": [] est STRICTEMENT RÉSERVÉ aux suites de caractères insensées (charabia incompréhensible, ex: "sjkdfhkjsdhf") ou aux requêtes véritablement impossibles.
  INTERDICTION FORMELLE DU BLOCAGE SEC sur une recherche formulée avec des négations ou des exclusions (ex: "un film d'action sans super-héros et sans explosion") : le modèle ne doit JAMAIS bloquer s'il existe dans le cinéma des œuvres du genre principal respectant ces critères d'éviction.
- EXPANSION SÉMANTIQUE & AMBIANCES SENSORIELLES :
  Si la requête contient une métaphore ou une sensation (ex: "un film qui donne l'impression d'être enfermé dans un ascenseur sous la pluie"), ne cherche JAMAIS une correspondance littérale mot-à-mot. Traduis l'intention en sous-genres cinématographiques : Huis clos oppressant, claustrophobie, tension psychologique, esthétique sombre/néo-noir ou polar pluvieux (ex: Devil, Buried, Panic Room, Se7en, Phone Game, Blade Runner).
- EXPANSION SÉMANTIQUE DES INTENTIONS ÉMOTIONNELLES & D'HUMEUR (RÈGLE OBLIGATOIRE) :
  Si la requête de l'utilisateur exprime une humeur, un état émotionnel, une sensation ou un besoin affectif (ex: "pour pleurer un bon coup", "qui fait pleurer", "qui remonte le moral", "qui fait peur sans sursaut", "film doudou", "film déchirant", "amour tragique", "adrénaline pure") :
  * INTERDICTION FORMELLE de faire une recherche littérale mot-à-mot (ex: ne cherche pas un film où un personnage dit "pleurer un bon coup").
  * TRADUIS IMMÉDIATEMENT CETTE ÉMOTION EN SOUS-GENRES ET CHEFS-D'ŒUVRE EMBLÉMATIQUES :
    - Tristesse / Larmes cathartiques ("pleurer un bon coup", "faire chialer", "triste à mourir") -> Drames poignants, tragédies humaines, romances dévastatrices, deuils (ex: La Ligne verte / The Green Mile, Le Tombeau des lucioles / Grave of the Fireflies, La Liste de Schindler, Nos étoiles contraires / The Fault in Our Stars, Manchester by the Sea, La vie est belle / Life Is Beautiful, Titanic, Le Pianiste).
    - Feel-good / Remonte le moral ("qui remonte le moral", "feel good", "baume au cœur", "réconfortant") -> Comédies chaleureuses, fables solaires, récits d'amitié réconfortants (ex: Intouchables, Le Fabuleux Destin d'Amélie Poulain, Little Miss Sunshine, Green Book, The Truman Show, Forrest Gump, Paddington 2, Good Will Hunting, Le Cercle des poètes disparus).
    - Horreur sans sursaut / Angoisse sourde ("qui fait peur sans sursaut", "sans jump scares") -> Horreur psychologique atmosphérique, malaise sourd, slow burn, tension lente (ex: Hereditary, Midsommar, The Witch, Shining / The Shining, Rosemary's Baby, The Lighthouse, It Follows, Get Out, Les Autres / The Others).
    - Nostalgie / Douce mélancolie ("nostalgique", "souvenirs d'enfance") -> Chroniques initiatiques, récits d'enfance, coming-of-age doux-amer (ex: Stand by Me, Cinema Paradiso, Les Goonies, Boyhood, Aftersun, Le Cercle des poètes disparus).
- TOLÉRANCE HISTORIQUE & CROISEMENTS TEMPORELS :
  Pour un croisement temporel (ex: "SF des années 70", "polar des années 80"), comprends qu'il s'agit du cinéma de ce genre sorti au cours de cette décennie (les dystopies et rétro-futurismes des années 70 comme Alien, Solaris, Soleil Vert / Soylent Green, Rencontres du troisième type, Rollerball, Orange Mécanique).
- CONTRE-EMPLOI & RÔLES SPÉCIFIQUES :
  Si un acteur est associé à un registre inhabituel (ex: "Jim Carrey dans un rôle dramatique"), sélectionne ses films sérieux et dramatiques (The Truman Show, Eternal Sunshine of the Spotless Mind, Man on the Moon, The Number 23).
- TRADUCTION SÉMANTIQUE POSITIVE DES TOURNURES NÉGATIVES & EXCLUSIONS (RÈGLE MAJEURE) :
  Lorsque l'utilisateur formule une recherche avec des exclusions ou des négations (ex: "sans super-héros", "sans explosion", "sans monstres", "sans fantastique"), le modèle NE DOIT JAMAIS se bloquer.
  Il DOIT TRADUIRE INTELLIGEMMENT CETTE EXCLUSION EN UN CHOIX ARTISTIQUE ET SÉMANTIQUE POSITIF :
  * "un film d'action sans super-héros et sans explosion" -> Traduire immédiatement par : Film d'action ancré dans le réel, polar réaliste, thriller urbain nerveux, poursuite tactique, espionnage réaliste, tension psychologique (ex: Sicario, Heat, Collateral, Drive, Le Fugitif / The Fugitive, Ronin, Jason Bourne / La Mémoire dans la peau, No Country for Old Men, Les Infiltrés / The Departed, Léon, Taken).
  * "SF sans extraterrestre" -> SF d'anticipation humaine, cybernétique, IA, paradoxe temporel ou dystopie sociale (Gattaca, Ex Machina, Blade Runner, Her, Les Fils de l'homme / Children of Men, Interstellar).
  * "Horreur sans jump scares" ->  Écarte simplement les sous-genres indésirables (exclure Marvel, DC Comics, blockbusters pyrotechniques Michael Bay) et renvoie les chefs-d'œuvre du genre principal qui satisfont l'intention. L'algorithme cherche TOUJOURS à satisfaire l'utilisateur avec la meilleure alternative sémantique possible dans le catalogue.
- DÉCOMPOSITION MULTI-FACETTES DES REQUÊTES CROISÉES (RÈGLE IMPÉRATIVE) :
  Quand une requête combine plusieurs notions distinctes (ex: [Action/Sous-genre: Braquage] + [Cadre/Décor: Espace], [Western] + [Science-Fiction], etc.) :
  * Le modèle DOIT décomposer l'intention en critères obligatoires dans l'objet "facets" :
    {
      "is_multi_facet": true,
      "core_action": "braquage / casse / vol / heist",
      "setting": "espace / science-fiction / station spatiale",
      "forbidden_mismatches": ["survie solitaire", "drame familial contemplatif", "exploration contemplative"]
    }
  * Prioriser IMPÉRATIVEMENT en tête de liste les œuvres hybrides réelles qui combinent SIMULTANÉMENT les deux facettes (ex: pour braquage dans l'espace : Lockout, Solo: A Star Wars Story, Cowboy Bebop: Le Film, Outland, Rogue One, Les Gardiens de la Galaxie).
  * INTERDICTION FORMELLE d'ignorer la facette action/braquage pour ne renvoyer que de la survie spatiale solitaire ou des drames contemplatifs (ex: Interstellar, Seul sur Mars, Ad Astra, First Man sont des mismatches interdits pour un braquage spatial !).
- DIVERSITÉ & QUALITÉ :
  Propose des films de réalisateurs différents qui explorent l'idée sous des angles riches. Fournis à la fois le titre français et le titre original international quand ils diffèrent (ex: "Soleil Vert / Soylent Green").
  Chaque film doit comporter une justification concise, authentique et personnalisée ("reason") expliquant exactement pourquoi et comment l'intrigue répond aux thèmes demandés.
- CONTRAINTES DE FORMAT ET EXCLUSION STRICTE DES NON-FICTIONS :
  Tu ne dois recommander QUE des œuvres cinématographiques / fictions narratives réelles.
  INTERDICTION FORMELLE ABSOLUE des émissions télévisées de discussion, talk-shows, interviews d'acteurs, télé-réalités, cérémonies de remise de prix, making-of, podcasts vidéo ou documentaires (ex: 'Actors on Actors', 'Inside the Actors Studio', émissions de variétés, talk-shows de fin de soirée), sauf si l'utilisateur demande explicitement un documentaire ou un talk-show.
  Si la requête demande des 'films', ne propose JAMAIS de séries télévisées ni d'émissions de discussion !
- INTERDICTION ABSOLUE des mockbusters, parodies bon marché, téléfilms obscurs ou films Asylum. Films reconnus ayant au moins 500 votes sur TMDB et note >= 5.5.

- RÔLE DE SEMANTIC QUERY EXPANDER (ÉTAPE 1) :
  Lorsque l'utilisateur formule une requête en langage naturel (ex: "comédie légère sans prise de tête", "histoire d'amour impossible mais réaliste", "film pour pleurer un bon coup", "film de braquage qui se passe dans l'espace", "avengers doomsday", "série d'enquête policière"), tu dois identifier 6 à 10 œuvres cinématographiques incontournables et formuler un résumé éditorial élégant.

Format de réponse OBLIGATOIRE — objet JSON strict, sans texte autour :
{
  "media_type": "movie" | "tv" | "all",
  "atmosphere_summary": "Phrase d'accroche cinéphile résumant la sélection et le fil conducteur",
  "recommended_titles": [
    {
      "title": "Titre international officiel TMDB",
      "release_year": 2018,
      "type": "movie" | "tv",
      "reason": "Explication cinématographique concise et personnalisée",
      "match_percentage": 98
    }
  ],
  "primary_genres": ["Action", "Science-Fiction"],
  "mood_tags": ["ambiance", "thème"],
  "facets": {
    "is_multi_facet": false,
    "core_action": "",
    "setting": "",
    "forbidden_mismatches": []
  },
  "reference_titles": ["Titre 1", "Titre 2"],
  "clean_query": "requête nettoyée",
  "suggested_mood": "Phrase d'accroche cinéphile résumant la sélection",
  "matches": [
    { "title": "Titre 1", "reason": "Explication cinématographique" }
  ]
}`;

// ============================================================================
// CACHE CONTEXTUEL DES JUSTIFICATIONS (movie_id + cluster_id)
// Clé obligatoire : `${movieId}:${clusterId}` (jamais movieId seul)
// ============================================================================
if (!globalThis.__elicine_justification_cache) {
  globalThis.__elicine_justification_cache = new Map();
}

export function buildJustificationCacheKey(movieId, clusterId) {
  if (movieId === undefined || movieId === null || clusterId === undefined || clusterId === null) {
    return null;
  }
  const cleanId = String(movieId).trim();
  const cleanCluster = String(clusterId).trim().toLowerCase();
  if (!cleanId || !cleanCluster) return null;
  return `${cleanId}:${cleanCluster}`;
}

export function getCachedJustification(movieId, clusterId) {
  const key = buildJustificationCacheKey(movieId, clusterId);
  if (!key) return null;
  return globalThis.__elicine_justification_cache.get(key) || null;
}

export function setCachedJustification(movieId, clusterId, justification) {
  const key = buildJustificationCacheKey(movieId, clusterId);
  if (!key || !justification) return;
  const cleanJustif = String(justification).trim();
  if (!cleanJustif) return;
  globalThis.__elicine_justification_cache.set(key, cleanJustif);
}

// ============================================================================
// Mots vides français & anglais pour l'extraction de mots-clés
// ============================================================================
const STOP_WORDS = new Set([
  'le','la','les','un','une','des','de','du','en','et','ou','où','qui','que',
  'quel','quelle','dans','sur','sous','avec','pour','par','sans','mais','donc',
  'or','ni','car','si','est','sont','être','avoir','faire','film','cinéma',
  'a','an','the','in','on','at','to','for','of','with','and','but',
  'this','that','is','are','was','were','have','has','had','be','been',
  'je','tu','il','elle','nous','vous','ils','elles','mon','ton','son','mes',
  'très','plus','trop','peu','bien','mal','pas','ne','se','me','te','lui',
  'qui','qu','dont','comme','après','avant','pendant','depuis','jusqu'
]);

/**
 * Extrait les mots-clés significatifs d'une requête utilisateur
 * pour la recherche textuelle élargie (Phase B)
 */
function extractKeywords(query) {
  if (!query || typeof query !== 'string') return [];
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 6);
}

/**
 * Helper fetch avec timeout pour éviter les blocages réseau
 */
async function fetchWithTimeout(url, options, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timeout dépassé (${timeoutMs}ms)`));
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Détection heuristique des requêtes multi-facettes (ex: [Braquage] + [Espace]).
 * Utilisé comme filet de sécurité infaillible si le LLM est indisponible ou n'a pas inclus `facets`.
 */
export function detectHeuristicFacets(text) {
  if (!text || typeof text !== 'string') {
    return {
      is_multi_facet: false,
      core_action: '',
      setting: '',
      forbidden_mismatches: []
    };
  }

  const lower = text.toLowerCase();

  const hasHeist = /\b(braquage|braquages|braquer|braqueur|braqueurs|casse|hold-up|holdup|cambriolage|cambrioleur|heist|voler|d[eé]rober)\b/i.test(lower);
  const hasSpace = /\b(espace|spatial|spatiale|spatiaux|station spatiale|orbite|orbital|orbitaire|vaisseau|galaxie|galactique|interstellaire|cosmos|cosmique)\b/i.test(lower);

  if (hasHeist && hasSpace) {
    return {
      is_multi_facet: true,
      core_action: 'braquage / casse / vol / heist',
      setting: 'espace / science-fiction / station spatiale',
      forbidden_mismatches: ['survie solitaire', 'drame familial contemplatif', 'exploration contemplative']
    };
  }

  const hasWestern = /\b(western|cowboy|cowboys|far west|saloon|chérif|sherif)\b/i.test(lower);
  const hasSciFi = /\b(sf|science-fiction|futuriste|cyberpunk|andro[iï]de|robot|aliens?|extraterrestre)\b/i.test(lower);
  if (hasWestern && hasSciFi) {
    return {
      is_multi_facet: true,
      core_action: 'western / duel / hors-la-loi',
      setting: 'science-fiction / futuriste / planétaire',
      forbidden_mismatches: ['drame intimiste', 'romance classique']
    };
  }

  return {
    is_multi_facet: false,
    core_action: '',
    setting: '',
    forbidden_mismatches: []
  };
}

/**
 * Extrait et parse l'objet JSON du LLM.
 * Supporte le champ optionnel `corrected_query` et la décomposition `facets`.
 * Robuste aux balises markdown et aux préfixes de texte.
 */
export function extractMatchesFromJson(rawText) {
  const emptyResult = {
    media_type: 'all',
    primary_genres: [],
    mood_tags: [],
    reference_titles: [],
    clean_query: '',
    suggested_mood: '',
    facets: detectHeuristicFacets(rawText),
    // Alias rétro-compatibles
    mediaType: 'all',
    primaryGenres: [],
    canonicalGenres: [],
    moodTags: [],
    themes: [],
    referenceTitles: [],
    similarReferenceTitles: [],
    cleanQuery: '',
    cleanSearchKeywords: [],
    correctedQuery: '',
    suggestedMood: '',
    atmosphere_summary: '',
    recommended_titles: [],
    matches: [],
    people: []
  };

  if (!rawText || typeof rawText !== 'string') {
    return emptyResult;
  }
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonSub = cleaned.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonSub);

      // 1. media_type ("movie" | "tv" | "all")
      let mediaType = 'all';
      const rawMediaType = String(parsed.media_type || parsed.mediaType || parsed.type || '').toLowerCase().trim();
      if (rawMediaType === 'movie' || rawMediaType === 'film' || rawMediaType === 'films') {
        mediaType = 'movie';
      } else if (rawMediaType === 'tv' || rawMediaType === 'serie' || rawMediaType === 'series' || rawMediaType === 'série' || rawMediaType === 'séries') {
        mediaType = 'tv';
      }

      // 2. primary_genres (Genres canoniques normalisés)
      const rawGenres = parsed.primary_genres || parsed.primaryGenres || parsed.canonical_genres || parsed.genres;
      const primaryGenres = Array.isArray(rawGenres)
        ? rawGenres.filter(g => typeof g === 'string' && g.trim().length > 0).map(g => g.trim())
        : [];

      // 3. mood_tags (Tags d'ambiance / Thèmes clés)
      const rawMoods = parsed.mood_tags || parsed.moodTags || parsed.themes || parsed.tags;
      const moodTags = Array.isArray(rawMoods)
        ? rawMoods.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
        : [];

      // 4. reference_titles (Titres de référence)
      const rawRefTitles = parsed.reference_titles || parsed.referenceTitles || parsed.similar_reference_titles || parsed.similar_titles;
      let referenceTitles = Array.isArray(rawRefTitles)
        ? rawRefTitles.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
        : [];

      // Optional structured people/actors. This is additive metadata used by
      // entity resolution; it never changes the provider prompt contract.
      const rawPeople = parsed.people || parsed.persons || parsed.actors || parsed.cast || parsed.criteria?.people || parsed.criteria?.actors;
      const people = Array.isArray(rawPeople)
        ? rawPeople.map(person => typeof person === 'string' ? person : person?.name || person?.person || '')
          .filter(name => String(name).trim().length > 1).map(name => String(name).trim()).slice(0, 2)
        : [];

      // 5. clean_query (Requête nettoyée des mots parasites)
      let cleanQueryStr = '';
      if (typeof parsed.clean_query === 'string' && parsed.clean_query.trim().length > 0) {
        cleanQueryStr = parsed.clean_query.trim();
      } else if (typeof parsed.corrected_query === 'string' && parsed.corrected_query.trim().length > 0) {
        cleanQueryStr = parsed.corrected_query.trim();
      } else if (Array.isArray(parsed.clean_search_keywords) && parsed.clean_search_keywords.length > 0) {
        cleanQueryStr = parsed.clean_search_keywords.join(' ').trim();
      } else if (typeof parsed.clean_search_keywords === 'string') {
        cleanQueryStr = parsed.clean_search_keywords.trim();
      }

      // 6. atmosphere_summary & suggested_mood (Accroche éditoriale cinéphile)
      let atmosphereSummary = '';
      const rawAtmosphere = parsed.atmosphere_summary || parsed.curated_atmosphere || parsed.editorial_vision || parsed.suggested_mood || parsed.suggested_atmosphere;
      if (typeof rawAtmosphere === 'string' && rawAtmosphere.trim().length > 0) {
        atmosphereSummary = rawAtmosphere.trim();
      } else if (primaryGenres.length > 0 && moodTags.length > 0) {
        atmosphereSummary = `${primaryGenres.slice(0, 2).join(' / ')} (${moodTags.slice(0, 2).join(', ')})`;
      } else if (primaryGenres.length > 0) {
        atmosphereSummary = primaryGenres.slice(0, 2).join(' / ');
      }
      const suggestedMoodStr = atmosphereSummary;

      // 7. recommended_titles (Objets structurés : titre, année, type, justification, score)
      const rawRecList = parsed.recommended_titles || parsed.recommendations || parsed.selections || parsed.matches || [];
      const recommendedTitles = [];
      if (Array.isArray(rawRecList)) {
        for (const item of rawRecList) {
          if (!item) continue;
          if (typeof item === 'string' && item.trim().length > 1) {
            recommendedTitles.push({
              title: item.trim(),
              release_year: null,
              type: mediaType === 'tv' ? 'tv' : 'movie',
              reason: `Recommandation cinématographique pour "${item.trim()}"`,
              match_percentage: 95
            });
          } else if (typeof item === 'object' && item.title) {
            const tType = String(item.type || mediaType || 'movie').toLowerCase();
            recommendedTitles.push({
              title: String(item.title).trim(),
              release_year: item.release_year || item.year ? Number(item.release_year || item.year) : null,
              type: tType === 'tv' || tType === 'série' || tType === 'series' ? 'tv' : 'movie',
              reason: String(item.reason || item.cinephile_hook || item.cinephile_insight || 'Œuvre clé pour votre recherche').trim(),
              match_percentage: Number(item.match_percentage || item.match_score || 95)
            });
          }
        }
      }

      // 8. Matches structurés simples
      let matches = Array.isArray(parsed.matches)
        ? parsed.matches
            .filter(m => m && typeof m.title === 'string' && m.title.trim().length > 0)
            .map(m => ({
              title: String(m.title).trim(),
              reason: String(m.reason || '').trim() || 'Recommandation cinématographique directe'
            }))
        : [];

      // Interconnexion intelligente entre recommended_titles, reference_titles et matches
      if (recommendedTitles.length === 0 && referenceTitles.length > 0) {
        for (const t of referenceTitles) {
          recommendedTitles.push({
            title: t,
            release_year: null,
            type: mediaType === 'tv' ? 'tv' : 'movie',
            reason: `Recommandation pour "${t}"`,
            match_percentage: 92
          });
        }
      }
      if (matches.length === 0 && recommendedTitles.length > 0) {
        matches = recommendedTitles.map(r => ({ title: r.title, reason: r.reason }));
      }
      if (referenceTitles.length === 0 && recommendedTitles.length > 0) {
        referenceTitles = recommendedTitles.map(r => r.title);
      }

      // 9. facets (Décomposition multi-facettes)
      let facets = null;
      if (parsed.facets && typeof parsed.facets === 'object') {
        facets = {
          is_multi_facet: Boolean(parsed.facets.is_multi_facet),
          core_action: String(parsed.facets.core_action || '').trim(),
          setting: String(parsed.facets.setting || '').trim(),
          forbidden_mismatches: Array.isArray(parsed.facets.forbidden_mismatches)
            ? parsed.facets.forbidden_mismatches.map(f => String(f).trim()).filter(Boolean)
            : []
        };
      }
      if (!facets || !facets.is_multi_facet) {
        facets = detectHeuristicFacets(cleanQueryStr || rawText);
      }

      return {
        // Preserve independently structured facts when supplied. No prompt change,
        // no inference of years/languages from the display locale or mood aliases.
        ...Object.fromEntries(['explicit_themes', 'keywords', 'excluded_titles', 'excluded_genres', 'semantic_exclusions',
          'year_min', 'year_max', 'languages', 'countries', 'runtime_min', 'runtime_max',
          'min_rating', 'adult', 'sort_preference'].filter(key => parsed[key] !== undefined)
          .map(key => [key, parsed[key]])),
        media_type: mediaType,
        primary_genres: primaryGenres,
        mood_tags: moodTags,
        reference_titles: referenceTitles,
        clean_query: cleanQueryStr,
        suggested_mood: suggestedMoodStr,
        atmosphere_summary: atmosphereSummary,
        recommended_titles: recommendedTitles,
        facets,
        // Alias rétro-compatibles
        mediaType,
        primaryGenres,
        canonicalGenres: primaryGenres,
        moodTags,
        themes: moodTags,
        referenceTitles,
        similarReferenceTitles: referenceTitles,
        cleanQuery: cleanQueryStr,
        cleanSearchKeywords: cleanQueryStr ? [cleanQueryStr] : [],
        correctedQuery: cleanQueryStr,
        suggestedMood: suggestedMoodStr,
        matches,
        people
      };
    }
  } catch (err) {
    console.warn('[API /api/search] Erreur parsing JSON LLM :', err?.message);
  }
  return emptyResult;
}

/**
 * Construit le body commun pour les appels LLM OpenAI-compatible.
 * Le paramètre useJsonFormat doit être false pour Gemini (non supporté).
 */
function buildChatBody(messages, useJsonFormat = true) {
  const body = { messages, temperature: 0.2, max_tokens: 512 };
  if (useJsonFormat) body.response_format = { type: 'json_object' };
  return body;
}

// ============================================================================
// ÉTAPE 1 : Cascade LLM — DeepSeek → Qwen → Groq → Gemini → OpenAI
// ============================================================================
async function queryLlmCandidates(cleanQuery, customKeys = {}, targetMediaType = 'Tous', telemetry = null) {
  let userPrompt = `Requête de l'utilisateur : "${cleanQuery}"`;
  if (targetMediaType === 'Séries TV') {
    userPrompt += `\n\nCONTRAINTE STRICTE DE FORMAT : L'utilisateur recherche EXCLUSIVEMENT des SÉRIES TÉLÉVISÉES (TV Shows / mini-séries). Tu dois recommander UNIQUEMENT des séries télévisées réelles, AUCUN film !`;
  } else if (targetMediaType === 'Films') {
    userPrompt += `\n\nCONTRAINTE STRICTE DE FORMAT : L'utilisateur recherche EXCLUSIVEMENT des FILMS de cinéma (longs métrages). Tu dois recommander UNIQUEMENT des films de cinéma, AUCUNE série télévisée !`;
  }
  userPrompt += `\n\nRéponds UNIQUEMENT avec l'objet JSON strict demandé.`;

  const messages = [
    { role: 'system', content: LLM_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  const deepseekKey = (process.env.DEEPSEEK_API_KEY || customKeys.deepseekApiKey || '').trim().replace(/^["']|["']$/g, '');
  const qwenKey     = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || customKeys.qwenApiKey || '').trim().replace(/^["']|["']$/g, '');
  const groqKey     = (process.env.GROQ_API_KEY || process.env.AI_API_KEY || customKeys.groqApiKey || '').trim().replace(/^["']|["']$/g, '');
  const geminiKey   = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || customKeys.geminiApiKey || '').trim().replace(/^["']|["']$/g, '');
  const openAiKey   = (process.env.OPENAI_API_KEY || customKeys.openAiApiKey || '').trim().replace(/^["']|["']$/g, '');

  // ── 1. Groq Cloud (llama-3.3-70b-versatile) — Ultra-rapide (~300ms sur LPU)
  if (groqKey) {
    try {
      recordSearchLlmAttempt(telemetry, 'groq', 'llama-3.3-70b-versatile');
      console.log('[API /api/search] [LLM] Groq (llama-3.3-70b-versatile)...');
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', ...buildChatBody(messages, true) })
      }, 4000);
      if (res.ok) {
        const data = await res.json();
        const extracted = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (extracted.matches.length > 0 || extracted.similarReferenceTitles.length > 0 || extracted.canonicalGenres.length > 0 || extracted.people?.length > 0) {
          return { ...extracted, provider: 'Groq (Llama 3.3 70B)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] Groq échoué → DeepSeek :', err?.message);
    }
  }

  // ── 2. DeepSeek (deepseek-chat) — Secondaire
  if (deepseekKey) {
    try {
      recordSearchLlmAttempt(telemetry, 'deepseek', 'deepseek-chat');
      console.log('[API /api/search] [LLM] DeepSeek (deepseek-chat)...');
      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', ...buildChatBody(messages, true) })
      }, 4000);
      if (res.ok) {
        const data = await res.json();
        const extracted = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (extracted.matches.length > 0 || extracted.similarReferenceTitles.length > 0 || extracted.canonicalGenres.length > 0 || extracted.people?.length > 0) {
          return { ...extracted, provider: 'DeepSeek (deepseek-chat)' };
        }
      } else {
        console.warn(`[API /api/search] DeepSeek HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[API /api/search] DeepSeek échoué → Qwen :', err?.message);
    }
  }

  // ── 3. Qwen (DashScope) — Tertiaire
  if (qwenKey) {
    const endpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    ];
    for (const endpoint of endpoints) {
      try {
        recordSearchLlmAttempt(telemetry, 'qwen', 'qwen-plus');
        console.log(`[API /api/search] [LLM] Qwen (qwen-plus) via ${endpoint}...`);
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qwenKey}` },
          body: JSON.stringify({ model: 'qwen-plus', ...buildChatBody(messages, true) })
        }, 4000);
        if (res.ok) {
          const data = await res.json();
          const extracted = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
          if (extracted.matches.length > 0 || extracted.similarReferenceTitles.length > 0 || extracted.canonicalGenres.length > 0 || extracted.people?.length > 0) {
            return { ...extracted, provider: 'Qwen (qwen-plus)' };
          }
        } else {
          console.warn(`[API /api/search] Qwen HTTP ${res.status} sur ${endpoint}`);
        }
      } catch (err) {
        console.warn('[API /api/search] Qwen endpoint échoué :', err?.message);
      }
    }
  }

  // ── 4. Google Gemini (gemini-2.0-flash) — SANS response_format (bug "empty output")
  if (geminiKey) {
    try {
      recordSearchLlmAttempt(telemetry, 'gemini', 'gemini-2.0-flash');
      console.log('[API /api/search] [LLM] Gemini (gemini-2.0-flash)...');
      const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({ model: 'gemini-2.0-flash', ...buildChatBody(messages, false) })
      }, 4500);
      if (res.ok) {
        const data = await res.json();
        const extracted = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (extracted.matches.length > 0 || extracted.similarReferenceTitles.length > 0 || extracted.canonicalGenres.length > 0 || extracted.people?.length > 0) {
          return { ...extracted, provider: 'Gemini (gemini-2.0-flash)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] Gemini échoué :', err?.message);
    }
  }

  // ── 5. OpenAI (gpt-4o-mini) — Dernier recours
  if (openAiKey) {
    try {
      recordSearchLlmAttempt(telemetry, 'openai', 'gpt-4o-mini');
      console.log('[API /api/search] [LLM] OpenAI (gpt-4o-mini)...');
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', ...buildChatBody(messages, true) })
      }, 4500);
      if (res.ok) {
        const data = await res.json();
        const extracted = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (extracted.matches.length > 0 || extracted.similarReferenceTitles.length > 0 || extracted.canonicalGenres.length > 0 || extracted.people?.length > 0) {
          return { ...extracted, provider: 'OpenAI (gpt-4o-mini)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] OpenAI échoué :', err?.message);
    }
  }

  const qLower = (cleanQuery || '').toLowerCase();
  const heuristicFacets = detectHeuristicFacets(cleanQuery);
  const heuristicPeople = extractPersonQueries(cleanQuery);
  let heuristicRecs = [];
  let heuristicGenres = [];
  let heuristicMoods = [];
  let heuristicSummary = '';
  let heuristicMediaType = 'all';

  if (/\b(?:avenger|avengers|doomsday|multivers|marvel|mcu)\b/i.test(qLower)) {
    heuristicMediaType = 'all';
    heuristicSummary = "Films et séries clés pour appréhender la saga du multivers et Avengers Doomsday";
    heuristicGenres = ['Action', 'Science-Fiction', 'Aventure'];
    heuristicMoods = ['multivers', 'marvel', 'super-héros'];
    heuristicRecs = [
      { title: "Avengers: Infinity War", release_year: 2018, type: "movie", reason: "Choc cinématographique inaugural confrontant les héros à Thanos.", match_percentage: 99 },
      { title: "Avengers: Endgame", release_year: 2019, type: "movie", reason: "Conclusion magistrale de la saga de l'Infini préparant la transition vers Doomsday.", match_percentage: 99 },
      { title: "Loki", release_year: 2021, type: "tv", reason: "Série pivot explorant les fondations des lignes temporelles et de la TVA.", match_percentage: 96 },
      { title: "Spider-Man: No Way Home", release_year: 2021, type: "movie", reason: "Première collision majeure des réalités alternatives du multivers.", match_percentage: 95 },
      { title: "Doctor Strange in the Multiverse of Madness", release_year: 2022, type: "movie", reason: "Exploration des incursions destructrices entre dimensions parallèles.", match_percentage: 93 },
      { title: "Deadpool & Wolverine", release_year: 2024, type: "movie", reason: "Connexion directe avec le Void et la surveillance multiverselle.", match_percentage: 92 }
    ];
  } else if (/\b(?:braquage|casse|heist|vol)\b/i.test(qLower) && /\b(?:espace|spatial|spatiale|galaxie|vaisseau)\b/i.test(qLower)) {
    heuristicMediaType = 'movie';
    heuristicSummary = "Braquages et casses de haute voltige dans l'espace";
    heuristicGenres = ['Action', 'Science-Fiction', 'Crime'];
    heuristicMoods = ['braquage spatial', 'casse', 'vaisseau spatial'];
    heuristicRecs = [
      { title: "Lockout", release_year: 2012, type: "movie", reason: "Infiltration d'une station spatiale pénitentiaire en orbite sous haute tension.", match_percentage: 97 },
      { title: "Solo: A Star Wars Story", release_year: 2018, type: "movie", reason: "Casse spatial audacieux pour dérober du coaxium hautement explosif.", match_percentage: 95 },
      { title: "Cowboy Bebop: Knockin' on Heaven's Door", release_year: 2001, type: "movie", reason: "Chasseurs de primes et braquages d'anthologie sur fond de jazz spatial.", match_percentage: 94 },
      { title: "Outland", release_year: 1981, type: "movie", reason: "Western spatial implacable au cœur d'une colonie minière corrompue.", match_percentage: 91 },
      { title: "Rogue One: A Star Wars Story", release_year: 2016, type: "movie", reason: "L'ultime opération commando pour dérober les plans de l'Étoile de la Mort.", match_percentage: 92 },
      { title: "Guardians of the Galaxy", release_year: 2014, type: "movie", reason: "Vol d'orbe cosmique et évasion de prison orbitale spectaculaire.", match_percentage: 90 }
    ];
  } else if (/\b(?:s[ée]rie|mini[\s-]?s[ée]rie)\b/i.test(qLower) && /\b(?:enqu[eê]te|polic|crime|meurtre|polar)\b/i.test(qLower)) {
    heuristicMediaType = 'tv';
    heuristicSummary = "Mini-séries d'enquête policière sous haute tension psychologique";
    heuristicGenres = ['Crime', 'Drame', 'Mystère'];
    heuristicMoods = ['enquête', 'polar', 'série policière'];
    heuristicRecs = [
      { title: "Mare of Easttown", release_year: 2021, type: "tv", reason: "Enquête provinciale poignante portée par une Kate Winslet impériale.", match_percentage: 98 },
      { title: "Broadchurch", release_year: 2013, type: "tv", reason: "Drame policier côtier bouleversant disséquant les secrets d'une communauté.", match_percentage: 97 },
      { title: "The Night Of", release_year: 2016, type: "tv", reason: "Plongée judiciaire asphyxiante dans les rouages du système carcéral new-yorkais.", match_percentage: 96 },
      { title: "Chernobyl", release_year: 2019, type: "tv", reason: "Enquête humaine et politique haletante sur la pire catastrophe nucléaire.", match_percentage: 95 },
      { title: "Sharp Objects", release_year: 2018, type: "tv", reason: "Thriller psychologique gothique et vénéneux dans le Sud américain.", match_percentage: 94 },
      { title: "Unbelievable", release_year: 2019, type: "tv", reason: "Traque rigoureuse et émouvante menée par deux inspectrices d'exception.", match_percentage: 94 }
    ];
  } else if (/\b(?:pleurer|larmes|triste|chialer|d[eé]chirant|bouleversant)\b/i.test(qLower)) {
    heuristicMediaType = 'movie';
    heuristicSummary = "Drames déchirants et récits d'émotion pure pour pleurer un bon coup";
    heuristicGenres = ['Drame', 'Romance'];
    heuristicMoods = ['larmes', 'émotion pure', 'deuil', 'tragédie'];
    heuristicRecs = [
      { title: "The Green Mile", release_year: 1999, type: "movie", reason: "L'un des récits les plus bouleversants et poignants de l'histoire du cinéma.", match_percentage: 99 },
      { title: "Grave of the Fireflies", release_year: 1988, type: "movie", reason: "Chef-d'œuvre absolu de l'animation, d'une tristesse viscérale et inoubliable.", match_percentage: 98 },
      { title: "The Fault in Our Stars", release_year: 2014, type: "movie", reason: "Romance adolescente solaire et tragique à la force émotionnelle dévastatrice.", match_percentage: 95 },
      { title: "Manchester by the Sea", release_year: 2016, type: "movie", reason: "Chronique intime d'un deuil impossible portée par une pudeur déchirante.", match_percentage: 96 },
      { title: "Schindler's List", release_year: 1993, type: "movie", reason: "Fresque historique humaniste d'une intensité émotionnelle monumentale.", match_percentage: 97 },
      { title: "La Vita è Bella", release_year: 1997, type: "movie", reason: "Fable bouleversante où l'amour d'un père sublime l'horreur absolue.", match_percentage: 96 }
    ];
  } else if (/\b(?:com[eé]die|rire|dr[oô]le|feel[\s-]?good|d[eé]tente|sans prise de t[eê]te)\b/i.test(qLower)) {
    heuristicMediaType = 'movie';
    heuristicSummary = "Comédies légères et feel-good sans prise de tête";
    heuristicGenres = ['Comédie'];
    heuristicMoods = ['humour', 'feel-good', 'détente'];
    heuristicRecs = [
      { title: "Le Dîner de Cons", release_year: 1998, type: "movie", reason: "Comédie culte aux dialogues légendaires et au rythme comique parfait.", match_percentage: 98 },
      { title: "Superbad", release_year: 2007, type: "movie", reason: "Comédie adolescente hilarante sur l'amitié indéfectible avant le départ à la fac.", match_percentage: 96 },
      { title: "La Cité de la Peur", release_year: 1994, type: "movie", reason: "Parodie policière jubilatoire des Nuls devenue un monument d'humour absurde.", match_percentage: 95 },
      { title: "Intouchables", release_year: 2011, type: "movie", reason: "Comédie humaine chaleureuse et lumineuse qui redonne le sourire à coup sûr.", match_percentage: 97 },
      { title: "The Nice Guys", release_year: 2016, type: "movie", reason: "Buddy-movie savoureux et déjanté dans le Los Angeles rétro des années 70.", match_percentage: 94 },
      { title: "Little Miss Sunshine", release_year: 2006, type: "movie", reason: "Road-trip familial irrésistible de tendresse, d'excentricité et d'optimisme.", match_percentage: 96 }
    ];
  } else if (heuristicFacets.is_multi_facet && (heuristicFacets.core_action.includes('braquage') || heuristicFacets.core_action.includes('heist'))) {
    heuristicMediaType = 'movie';
    heuristicGenres = ['Action', 'Science-Fiction', 'Crime'];
    heuristicMoods = ['braquage spatial', 'casse', 'vaisseau spatial'];
    heuristicRecs = [
      { title: 'Lockout', release_year: 2012, type: 'movie', reason: 'Braquage spatial', match_percentage: 97 },
      { title: 'Solo: A Star Wars Story', release_year: 2018, type: 'movie', reason: 'Braquage spatial', match_percentage: 95 },
      { title: 'Cowboy Bebop: Knockin\' on Heaven\'s Door', release_year: 2001, type: 'movie', reason: 'Braquage spatial', match_percentage: 94 },
      { title: 'Outland', release_year: 1981, type: 'movie', reason: 'Western spatial', match_percentage: 91 },
      { title: 'Rogue One: A Star Wars Story', release_year: 2016, type: 'movie', reason: 'Braquage spatial', match_percentage: 92 },
      { title: 'Guardians of the Galaxy', release_year: 2014, type: 'movie', reason: 'Braquage spatial', match_percentage: 90 }
    ];
    heuristicSummary = "Braquages et casses de haute voltige dans l'espace";
  }

  const heuristicRefs = heuristicRecs.map(r => r.title);

  return {
    matches: heuristicRecs.map(r => ({ title: r.title, reason: r.reason })),
    recommended_titles: heuristicRecs,
    atmosphere_summary: heuristicSummary,
    correctedQuery: cleanQuery,
    canonicalGenres: heuristicGenres,
    themes: heuristicMoods,
    primary_genres: heuristicGenres,
    mood_tags: heuristicMoods,
    reference_titles: heuristicRefs,
    similarReferenceTitles: heuristicRefs,
    cleanSearchKeywords: [cleanQuery],
    clean_query: cleanQuery,
    // The no-provider fallback has an array of moods, not a singular
    // heuristicMood variable. Keep the historical empty-summary behaviour.
    suggested_mood: heuristicSummary || heuristicMoods[0] || '',
    facets: heuristicFacets,
    people: heuristicPeople,
    provider: 'Algorithme Éliciné'
  };
}

// ============================================================================
// ÉTAPE 2 — Niveau 1 : Matching direct & vectoriel
// Exécute la recherche vectorielle / sémantique avec la `clean_query`.
// Interroge directement la base locale (movies et movies_embeddings).
// ============================================================================
export async function executeDirectAndVectorSearch(cleanQuery, mediaType = 'all', clusterId = null, facets = null) {
  if (!supabaseServer || !cleanQuery || typeof cleanQuery !== 'string') return [];

  const clean = cleanQuery.trim();
  if (clean.length < 2) return [];

  const keywords = extractKeywords(clean);
  const orClauses = [];

  // 1. Recherche directe sur titre et synopsis avec cleanQuery
  const sanitized = clean.replace(/[,()%"']/g, '').trim();
  if (sanitized.length >= 3) {
    orClauses.push(`title.ilike.%${sanitized}%`);
    orClauses.push(`original_title.ilike.%${sanitized}%`);
    orClauses.push(`overview.ilike.%${sanitized}%`);
  }

  // 2. Mots-clés discriminants
  for (const kw of keywords) {
    const cleanKw = kw.replace(/[,()%"']/g, '').trim();
    if (cleanKw.length >= 3 && !STOP_WORDS.has(cleanKw.toLowerCase())) {
      orClauses.push(`overview.ilike.%${cleanKw}%`);
      orClauses.push(`genres.ilike.%${cleanKw}%`);
      orClauses.push(`moods.ilike.%${cleanKw}%`);
      orClauses.push(`setting.ilike.%${cleanKw}%`);
    }
  }

  if (orClauses.length === 0) return [];

  const orFilter = orClauses.slice(0, 30).join(',');
  let hits = [];

  try {
    const { data, error } = await supabaseServer
      .from('movies')
      .select('*')
      .or(orFilter)
      .order('vote_average', { ascending: false })
      .limit(16);

    if (!error && Array.isArray(data) && data.length > 0) {
      hits = data;
    }
  } catch (err) {
    console.warn('[API /api/search] [Niveau 1 Direct] table movies :', err?.message);
  }

  if (hits.length === 0) {
    try {
      const { data, error } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .or(orFilter)
        .order('vote_average', { ascending: false })
        .limit(16);
      if (!error && Array.isArray(data) && data.length > 0) {
        hits = data;
      }
    } catch (err) {
      console.warn('[API /api/search] [Niveau 1 Direct] table movies_embeddings :', err?.message);
    }
  }

  if (hits.length === 0) return [];

  const cleaned = filterMockbusters(hits, clean);
  return enrichWithBadges(cleaned, [], 'Sélection Directe & Sémantique', clean, clusterId, facets);
}

// ============================================================================
// ÉTAPE 2 — Phase A : Résolution par titre (ilike souple, multi-parties)
// Ex: "Prisonniers / Prisoners" → cherche "Prisonniers" ET "Prisoners" séparément
// Sélectionne impérativement 1 seul film par recommandation LLM (anti-doublon)
// ============================================================================
async function resolveByTitles(extractedTitles, matches, queryText = '', clusterId = null, facets = null) {
  if (!supabaseServer || !Array.isArray(extractedTitles) || extractedTitles.length === 0) return [];

  const orClauses = [];
  for (const rawTitle of extractedTitles) {
    // Sépare sur '/', '|', ',' pour gérer "Titre FR / Original Title"
    const parts = String(rawTitle)
      .split(/[/|,]/)
      .map(p => p.trim().replace(/[(),%_]/g, '').trim())
      .filter(p => p.length > 2);
    for (const clean of parts) {
      orClauses.push(`title.ilike.%${clean}%`);
      orClauses.push(`original_title.ilike.%${clean}%`);
    }
  }
  if (orClauses.length === 0) return [];

  const orFilter = orClauses.join(',');
  let results = [];

  try {
    const { data, error } = await supabaseServer.from('movies').select('*').or(orFilter).limit(20);
    if (!error && Array.isArray(data) && data.length > 0) results = data;
  } catch (err) {
    console.warn('[API /api/search] [Phase A] table movies :', err?.message);
  }

  if (results.length === 0) {
    try {
      const { data, error } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .or(orFilter).limit(20);
      if (!error && Array.isArray(data) && data.length > 0) results = data;
    } catch (err) {
      console.warn('[API /api/search] [Phase A] table movies_embeddings :', err?.message);
    }
  }

  if (results.length === 0) return [];

  // Sélection rigoureuse 1-pour-1 : pour chaque titre LLM, ne garder QUE la meilleure correspondance
  const selectedResults = [];
  const seenIds = new Set();
  const seenBases = new Set();

  for (const rawTitle of extractedTitles) {
    const parts = String(rawTitle)
      .split(/[/|,]/)
      .map(p => p.trim().toLowerCase())
      .filter(p => p.length > 1);

    const hits = results.filter(c => {
      if (seenIds.has(c.id || c.tmdb_id)) return false;
      const cTitle = (c.title || '').toLowerCase().trim();
      const cOrig = (c.original_title || '').toLowerCase().trim();
      return parts.some(p => cTitle === p || cOrig === p || cTitle.startsWith(p) || cOrig.startsWith(p));
    });

    if (hits.length > 0) {
      hits.sort((a, b) => {
        const aTitle = (a.title || '').toLowerCase();
        const bTitle = (b.title || '').toLowerCase();
        const aExact = parts.some(p => aTitle === p || (a.original_title || '').toLowerCase() === p);
        const bExact = parts.some(p => bTitle === p || (b.original_title || '').toLowerCase() === p);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return Number(b.vote_count || 0) - Number(a.vote_count || 0);
      });

      const best = hits[0];
      const base = (best.title || best.original_title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
        .trim();

      if (!seenBases.has(base)) {
        seenBases.add(base);
        seenIds.add(best.id || best.tmdb_id);
        selectedResults.push(best);
      }
    }
  }

  return enrichWithBadges(selectedResults, matches, 'Sélection Éliciné', queryText, clusterId, facets);
}

// ============================================================================
// ÉTAPE 2 — Requête B : Récupération hybride par Genres + Thèmes avec opérateur OR
// Interroge la base locale (movies et movies_embeddings) avec les tags, genres et thèmes
// retournés par le LLM, reliés par un opérateur OR large pour élargir le filet.
// ============================================================================
export async function resolveByGenresAndThemes(canonicalGenres = [], themes = [], cleanSearchKeywords = [], matches = [], rawQuery = '', clusterId = null, facets = null) {
  if (!supabaseServer) return [];

  const orClauses = [];

  // 1. Genres canoniques (ex: Romance, Drama)
  for (const g of (canonicalGenres || [])) {
    const cleanG = String(g).replace(/[,()%"']/g, '').trim();
    if (cleanG.length >= 3) {
      orClauses.push(`genres.ilike.%${cleanG}%`);
    }
  }

  // 2. Thèmes spécifiques (ex: unrequited love, bittersweet romance, realistic relationship)
  for (const t of (themes || [])) {
    const cleanT = String(t).replace(/[,()%"']/g, '').trim();
    if (cleanT.length >= 3) {
      orClauses.push(`overview.ilike.%${cleanT}%`);
      orClauses.push(`genres.ilike.%${cleanT}%`);
      orClauses.push(`moods.ilike.%${cleanT}%`);
    }
  }

  // 3. Mots-clés de recherche nettoyés
  const kwList = Array.isArray(cleanSearchKeywords)
    ? cleanSearchKeywords.flatMap(k => String(k).split(/\s+/))
    : String(cleanSearchKeywords || '').split(/\s+/);

  for (const kw of kwList) {
    const cleanKw = String(kw).replace(/[,()%"']/g, '').trim();
    if (cleanKw.length >= 3 && !STOP_WORDS.has(cleanKw.toLowerCase())) {
      orClauses.push(`overview.ilike.%${cleanKw}%`);
      orClauses.push(`setting.ilike.%${cleanKw}%`);
    }
  }

  if (orClauses.length === 0) return [];

  // PostgREST utilise la virgule ',' pour l'opérateur OR strict entre les filtres
  const orFilter = orClauses.slice(0, 30).join(',');
  let results = [];

  try {
    const { data, error } = await supabaseServer
      .from('movies')
      .select('*')
      .or(orFilter)
      .order('vote_average', { ascending: false })
      .limit(20);
    if (!error && Array.isArray(data) && data.length > 0) {
      results = data;
    }
  } catch (err) {
    console.warn('[API /api/search] [Requête B] table movies :', err?.message);
  }

  if (results.length === 0) {
    try {
      const { data, error } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .or(orFilter)
        .order('vote_average', { ascending: false })
        .limit(20);
      if (!error && Array.isArray(data) && data.length > 0) {
        results = data;
      }
    } catch (err) {
      console.warn('[API /api/search] [Requête B] table movies_embeddings :', err?.message);
    }
  }

  if (results.length === 0) return [];

  // Filtrer les mockbusters et non-fictions
  const cleanResults = filterMockbusters(results, rawQuery);
  return enrichWithBadges(cleanResults, matches, 'Recherche par contexte Éliciné', rawQuery, clusterId, facets);
}

// ============================================================================
// PRIORITÉ 1 — Résolution directe et chirurgicale TMDB (Films et Séries)
// - Boucle sur chaque titre recommandé avec typage strict (movie vs tv)
// - Fallback automatique si l'année est absente ou trop restrictive
// - Requiert impérativement un poster_path valide
// ============================================================================
export async function searchTmdbCandidates(title, type = 'movie', year = null, tmdbKey = '', requestCache = null) {
  if (!title || typeof title !== 'string' || !tmdbKey) return [];

  const cacheKey = `${String(title).trim().toLocaleLowerCase()}|${type || 'multi'}|${year || ''}`;
  if (requestCache?.has(cacheKey)) return requestCache.get(cacheKey);

  const isBearer = tmdbKey.startsWith('eyJ');
  const headers = isBearer 
    ? { 'Authorization': `Bearer ${tmdbKey}`, 'Content-Type': 'application/json' } 
    : { 'Content-Type': 'application/json' };
  const authQuery = isBearer ? '' : `&api_key=${encodeURIComponent(tmdbKey)}`;

  const variants = title
    .split(/[/|]/)
    .map(p => p.trim())
    .filter(p => p.length > 1);

  const cleanYear = year && !isNaN(Number(year)) ? Number(year) : null;
  const isTv = type === 'tv' || type === 'series' || type === 'série';
  const isMovie = type === 'movie' || type === 'film' || type === 'films';

  const lookup = (async () => {
    for (const term of variants) {
    const q = encodeURIComponent(term);
    const urlsToTry = [];

    if (isTv) {
      if (cleanYear) {
        urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&first_air_date_year=${cleanYear}&language=fr-FR&include_adult=false${authQuery}`);
      }
      urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&language=en-US&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/multi?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
    } else if (isMovie) {
      if (cleanYear) {
        urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&primary_release_year=${cleanYear}&language=fr-FR&include_adult=false${authQuery}`);
      }
      urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&language=en-US&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/multi?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
    } else {
      urlsToTry.push(`https://api.themoviedb.org/3/search/multi?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
    }

    for (const url of urlsToTry) {
      try {
        const res = await fetchWithTimeout(url, { method: 'GET', headers }, 3500);
        if (!res.ok) continue;
        const data = await res.json();
        const hits = (data.results || []).filter(h => h && h.poster_path);
        if (hits.length > 0) return hits;
      } catch (_) {}
    }
    }
    return [];
  })();
  if (requestCache) requestCache.set(cacheKey, lookup);
  return lookup;
}

export async function fetchExactTmdbCandidate(title, type = 'movie', year = null, tmdbKey = '', requestCache = null) {
  const hits = await searchTmdbCandidates(title, type, year, tmdbKey, requestCache);
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const termLower = title.toLowerCase().trim();
  hits.sort((a, b) => {
    const aTitle = (a.title || a.name || '').toLowerCase().trim();
    const bTitle = (b.title || b.name || '').toLowerCase().trim();
    const aExact = aTitle === termLower || (a.original_title || a.original_name || '').toLowerCase().trim() === termLower;
    const bExact = bTitle === termLower || (b.original_title || b.original_name || '').toLowerCase().trim() === termLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return Number(b.vote_count || 0) - Number(a.vote_count || 0);
  });
  return hits[0] || null;
}

// ============================================================================
// ÉTAPE 2 — Phase B : Résolution TMDB 1-pour-1 et enrichissement scénaristique
// - Résout STRICTEMENT 1 SEUL film TMDB par recommandation LLM (évite les doublons de nom).
// - Enrichit si besoin par les recommandations TMDB basées sur le scénario et l'affinité.
// ============================================================================
async function resolveByKeywords(rawQuery, matches = [], tmdbApiKey = '', clusterId = null, facets = null) {
  const candidatesList = Array.isArray(matches) && matches.length > 0
    ? matches
    : [{ title: rawQuery }];

  const extractedTitles = candidatesList.map(m => typeof m === 'string' ? m : m?.title || '');

  // ── Phase B.1 : Recherche Supabase par mots-clés ────────────────────────
  const emotionalExpansion = detectEmotionalExpansion(rawQuery);
  if (supabaseServer) {
    const keywords = extractKeywords(rawQuery);
    if (emotionalExpansion && Array.isArray(emotionalExpansion.emotionalKeywords)) {
      for (const ek of emotionalExpansion.emotionalKeywords) {
        if (!keywords.includes(ek)) keywords.push(ek);
      }
    }
    for (const title of extractedTitles) {
      for (const w of extractKeywords(title)) {
        if (!keywords.includes(w)) keywords.push(w);
      }
    }
    const uniqueKeywords = [...new Set(keywords)].slice(0, 7);

    if (uniqueKeywords.length > 0) {
      console.log('[API /api/search] [Phase B.1] Mots-clés Supabase :', uniqueKeywords);

      const orClauses = [];
      for (const kw of uniqueKeywords) {
        orClauses.push(`overview.ilike.%${kw}%`);
        orClauses.push(`genres.ilike.%${kw}%`);
      }
      for (const kw of uniqueKeywords.slice(0, 3)) {
        orClauses.push(`moods.ilike.%${kw}%`);
        orClauses.push(`setting.ilike.%${kw}%`);
      }

      const orFilter = orClauses.join(',');
      let results = [];

      try {
        const { data, error } = await supabaseServer
          .from('movies').select('*').or(orFilter).order('vote_average', { ascending: false }).limit(12);
        if (!error && Array.isArray(data) && data.length > 0) results = data;
      } catch (err) {
        console.warn('[API /api/search] [Phase B.1] table movies :', err?.message);
      }

      if (results.length === 0) {
        try {
          const { data, error } = await supabaseServer
            .from('movies_embeddings')
            .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
            .or(orFilter).order('vote_average', { ascending: false }).limit(12);
          if (!error && Array.isArray(data) && data.length > 0) results = data;
        } catch (err) {
          console.warn('[API /api/search] [Phase B.1] table movies_embeddings :', err?.message);
        }
      }

      if (results.length > 0) {
        return enrichWithBadges(results, matches, 'Recherche par contexte Éliciné', rawQuery, clusterId, facets);
      }

      // Si recherche par mots-clés vide mais intention émotionnelle reconnue :
      if (emotionalExpansion) {
        console.log(`[API /api/search] [Phase B.1] Intention émotionnelle « ${emotionalExpansion.label} » → Résolution des chefs-d'œuvre`);
        const emotionalDb = await resolveEmotionalMasterpieces(emotionalExpansion, tmdbApiKey, clusterId);
        if (emotionalDb.length > 0) {
          return emotionalDb;
        }
      }
    }
  }

  // ── Phase B.2 : Résolution TMDB 1-pour-1 par recommandation LLM ─────────
  const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || tmdbApiKey || '').trim();
  if (!tmdbKey) {
    console.warn('[API /api/search] [Phase B.2] Clé TMDB absente.');
    return [];
  }

  const allTmdbResults = [];
  const seenTmdbIds = new Set();
  const seenTitleBases = new Set();

  // ── Résolution TMDB en parallèle 1-pour-1 par recommandation LLM ─────────
  const resolveCandidate = async (item) => {
    const rawTitle = typeof item === 'string' ? item : item?.title || '';
    const matchReason = typeof item === 'object' ? item?.reason : '';
    if (!rawTitle || rawTitle.length < 2) return null;

    const variants = rawTitle
      .split(/[/|]/)
      .map(p => p.trim())
      .filter(p => p.length > 1);

    for (const term of variants) {
      try {
        const tmdbRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(term)}&language=fr-FR&page=1&include_adult=false`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          3500
        );

        if (!tmdbRes.ok) continue;

        const tmdbData = await tmdbRes.json();
        const hits = (tmdbData.results || []).filter(m => !seenTmdbIds.has(m.id));
        if (hits.length === 0) continue;

        hits.sort((a, b) => {
          const aTitle = (a.title || '').toLowerCase().trim();
          const aOrig = (a.original_title || '').toLowerCase().trim();
          const bTitle = (b.title || '').toLowerCase().trim();
          const bOrig = (b.original_title || '').toLowerCase().trim();
          const termLower = term.toLowerCase().trim();

          const aExact = aTitle === termLower || aOrig === termLower;
          const bExact = bTitle === termLower || bOrig === termLower;

          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          return Number(b.vote_count || 0) - Number(a.vote_count || 0);
        });

        return { bestMatch: hits[0], item, rawTitle, matchReason };
      } catch (tmdbErr) {
        console.warn('[API /api/search] [Phase B.2] TMDB échoué pour', term, ':', tmdbErr?.message);
      }
    }
    return null;
  };

  const parallelResolutions = await Promise.all(
    candidatesList.slice(0, 8).map(resolveCandidate)
  );

  for (const resolved of parallelResolutions) {
    if (!resolved || !resolved.bestMatch) continue;
    const { bestMatch, item, rawTitle, matchReason } = resolved;
    if (seenTmdbIds.has(bestMatch.id)) continue;

    const titleBase = (bestMatch.title || bestMatch.original_title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
      .trim();

    if (!seenTitleBases.has(titleBase)) {
      seenTitleBases.add(titleBase);
      seenTmdbIds.add(bestMatch.id);

      const dynamicScore = calculateSemanticMatchScore(bestMatch, rawQuery, item, facets);
      // Rejet si score éliminatoire (hors-sujet formel comme Titanic pour un braquage)
      if (dynamicScore < 50) {
        console.log(`[API /api/search] Film disqualifié par cohérence thématique (${dynamicScore}%) : "${bestMatch.title}"`);
        continue;
      }

      const mId = bestMatch.id;
      let finalReason = matchReason;
      if (mId && clusterId) {
        const cached = getCachedJustification(mId, clusterId);
        if (cached) {
          finalReason = cached;
        } else if (finalReason) {
          setCachedJustification(mId, clusterId, finalReason);
        }
      }

      allTmdbResults.push({
        id: bestMatch.id,
        tmdb_id: bestMatch.id,
        title: bestMatch.title || bestMatch.name || '',
        original_title: bestMatch.original_title || bestMatch.original_name || '',
        overview: bestMatch.overview || '',
        poster_path: bestMatch.poster_path ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}` : null,
        backdrop_path: bestMatch.backdrop_path ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}` : null,
        release_date: bestMatch.release_date || bestMatch.first_air_date || '',
        vote_average: bestMatch.vote_average || 0,
        vote_count: bestMatch.vote_count || 0,
        genres: Array.isArray(bestMatch.genre_ids) ? bestMatch.genre_ids.join(',') : '',
        media_type: 'movie',
        ai_badge: 'Recommandation Éliciné',
        badge: 'Recommandation Éliciné',
        ai_match_reason: finalReason || matchReason || `Recommandé pour sa cohérence avec "${rawTitle}"`,
        match_rate: dynamicScore,
        is_hybrid_match: Boolean(bestMatch.is_hybrid_match)
      });
    }
  }

  // ── Complément scénaristique / thématique par recommandations TMDB ────────
  // Si le LLM a renvoyé peu d'œuvres et qu'on a moins de 8 films, on complète
  // UNIQUEMENT avec les recommandations basées sur l'affinité scénaristique
  // du film phare, JAMAIS par recherche textuelle de titre !
  if (allTmdbResults.length > 0 && allTmdbResults.length < 8 && tmdbKey) {
    const primaryMovie = allTmdbResults[0];
    try {
      console.log(`[API /api/search] [Phase B.2] Enrichissement scénaristique depuis "${primaryMovie.title}" (#${primaryMovie.id})...`);
      const recRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${primaryMovie.id}/recommendations?api_key=${encodeURIComponent(tmdbKey)}&language=fr-FR&page=1`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        3500
      );
      if (recRes.ok) {
        const recData = await recRes.json();
        const recHits = (recData.results || []).filter(m => {
          if (seenTmdbIds.has(m.id)) return false;
          const avg = Number(m.vote_average || 0);
          const cnt = Number(m.vote_count || 0);
          return cnt >= 500 && avg >= 5.5; // Qualité minimale
        });

        for (const m of recHits) {
          if (allTmdbResults.length >= 8) break;
          const titleBase = (m.title || m.original_title || '')
            .toLowerCase()
            .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
            .trim();
          if (seenTitleBases.has(titleBase)) continue;
          seenTitleBases.add(titleBase);
          seenTmdbIds.add(m.id);

          const dynamicScore = calculateSemanticMatchScore(m, rawQuery, null, facets);
          if (dynamicScore < 50) continue;

          allTmdbResults.push({
            id: m.id,
            tmdb_id: m.id,
            title: m.title || m.name || '',
            original_title: m.original_title || m.original_name || '',
            overview: m.overview || '',
            poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            backdrop_path: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
            release_date: m.release_date || m.first_air_date || '',
            vote_average: m.vote_average || 0,
            vote_count: m.vote_count || 0,
            genres: Array.isArray(m.genre_ids) ? m.genre_ids.join(',') : '',
            media_type: 'movie',
            ai_badge: 'Recommandation Thématique',
            badge: 'Recommandation Thématique',
            ai_match_reason: `Recommandation cinématographique proche de l'univers et du scénario de "${primaryMovie.title}"`,
            match_rate: dynamicScore,
            is_hybrid_match: Boolean(m.is_hybrid_match)
          });
        }
      }
    } catch (recErr) {
      console.warn('[API /api/search] Recommandations TMDB échouées :', recErr?.message);
    }
  }

  if (allTmdbResults.length > 0) {
    console.log(`[API /api/search] [Phase B.2] ${allTmdbResults.length} résultat(s) TMDB résolu(s).`);
    return allTmdbResults;
  }

  // Fallback Phase B : Si 0 résultat TMDB mais émotion détectée, garantir le Zéro Écran Vide
  if (emotionalExpansion) {
    console.log(`[API /api/search] [Phase B.2] Repli sur les chefs-d'œuvre émotionnels pour « ${emotionalExpansion.label} »`);
    const fallbackMasterpieces = await resolveEmotionalMasterpieces(emotionalExpansion, tmdbApiKey, clusterId);
    if (fallbackMasterpieces.length > 0) {
      return fallbackMasterpieces;
    }
  }

  return [];
}

// ============================================================================
// Helper : Démarche Scientifique de Scoring Sémantique Continu
// Modèle multi-critères : Personne (35%) + Thématique (45%) + Genres (20%) + Note Bayésienne
// Rejette strictement les faux-positifs hors-sujet (Titanic pour un braquage).
// ============================================================================
const THEMATIC_CLUSTERS_RAW = [
  {
    id: 'braquage_spatial',
    triggers: [
      'braquage dans l\'espace', 'braquage qui se passe dans l\'espace', 'braquage spatial', 'casse dans l\'espace',
      'casse spatial', 'vol dans l\'espace', 'heist dans l\'espace', 'heist in space', 'braqueurs de l\'espace',
      'braquage en apesanteur', 'casse de vaisseau'
    ],
    primaryKeywords: [
      'braquage', 'casse', 'vol', 'heist', 'vaisseau', 'espace', 'spatial', 'station spatiale', 'orbite', 'pirate', 'pirates'
    ],
    secondaryKeywords: [
      'dévaliser', 'butin', 'infiltration', 'sécurité', 'prison orbitale', 'coaxium', 'cargo', 'astéroïde', 'futuriste'
    ],
    expectedGenres: [878, 28, 80, 53, 12],
    conflictingGenres: [10749, 10402],
    archetypes: [
      'lockout', 'solo: a star wars story', 'solo', 'cowboy bebop', 'cowboy bebop: le film', 'cowboy bebop: knockin\' on heaven\'s door',
      'outland', 'outland ...loin de la terre', 'rogue one: a star wars story', 'rogue one', 'les gardiens de la galaxie', 'guardians of the galaxy',
      'les gardiens de la galaxie vol. 2', 'guardians of the galaxy vol. 2', 'la planète au trésor', 'treasure planet', 'titan a.e.', 'titan ae', 'serenity', 'space sweepers'
    ],
    disqualified: [
      'interstellar', 'seul sur mars', 'the martian', 'gravity', 'ad astra', 'first man', 'solaris', '2001 : l\'odyssée de l\'espace', '2001 a space odyssey',
      'titanic', 'la la land', 'notting hill'
    ]
  },
  {
    id: 'guerre',
    triggers: [
      'guerre', 'guerres', 'soldat', 'soldats', 'combat', 'combats', 'front', 'tranchée', 'tranchées',
      'tranchee', 'tranchees', 'survie au combat', 'bataille', 'batailles', 'militaire', 'militaires',
      'armée', 'armee', 'débarquement', 'debarquement', 'seconde guerre', 'première guerre',
      'guerre mondiale', 'vietnam', 'sniper', 'tireur d\'élite', 'tireur d elite', 'peloton',
      'régiment', 'regiment', 'bataillon', 'escadron'
    ],
    primaryKeywords: [
      'guerre', 'guerres', 'soldat', 'soldats', 'combat', 'combats', 'bataille', 'batailles',
      'front', 'tranchée', 'tranchées', 'tranchee', 'tranchees', 'militaire', 'militaires',
      'armée', 'armee', 'débarquement', 'debarquement', 'ennemi', 'ennemis', 'régiment',
      'bataillon', 'peloton', 'officier', 'capitaine', 'sergent', 'lieutenant', 'colonel',
      'général', 'veteran', 'vétéran', 'tir', 'tireur', 'tireurs'
    ],
    secondaryKeywords: [
      'survie au combat', 'survie', 'survivre', 'mission', 'tireur d\'élite', 'sniper', 'fusil',
      'obus', 'bombardement', 'char', 'chars', 'tank', 'tanks', 'bunker', 'héroïque', 'heroique',
      'sacrifice', 'prisonnier de guerre', 'sauvetage', 'sauver', 'frères d\'armes', 'freres d armes',
      'assaut', 'offensive', 'conflit', 'artillerie', 'normandie', 'irak', 'afghanistan', 'pacifique',
      'aviation', 'pilote de chasse', 'patrie'
    ],
    expectedGenres: [10752, 36, 28],
    conflictingGenres: [10749, 35, 10751, 10402],
    archetypes: [
      '1917', 'il faut sauver le soldat ryan', 'saving private ryan', 'american sniper',
      'dunkerque', 'dunkirk', 'tu ne tueras point', 'hacksaw ridge', 'fury',
      'platoon', 'full metal jacket', 'apocalypse now', 'la ligne rouge', 'the thin red line',
      'les sentiers de la gloire', 'paths of glory', 'lettres d\'iwo jima', 'letters from iwo jima',
      'enemy at the gates', 'stalingrad', 'black hawk down', 'la chute du faucon noir',
      'all quiet on the western front', 'à l\'ouest rien de nouveau', 'a l\'ouest rien de nouveau',
      'le pont de la rivière kwaï', 'inglourious basterds', 'voyage au bout de l\'enfer', 'the deer hunter'
    ],
    disqualified: [
      'la la land', 'notting hill', 'coup de foudre à notting hill', 'pretty woman',
      'clueless', 'le fabuleux destin d\'amélie poulain', 'bridget jones', 'le journal de bridget jones',
      'mamma mia', 'love actually'
    ]
  },
  {
    id: 'braquage',
    triggers: ['braquage', 'braquer', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'heist'],
    primaryKeywords: ['braquage', 'braquages', 'braquer', 'braqueurs', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'cambrioleur', 'dévaliser', 'coffre-fort', 'butin'],
    secondaryKeywords: ['vol', 'voleur', 'voleurs', 'dérober', 'extraction', 'infiltration', 'escroc', 'escroquerie', 'faussaire', 'arnaque', 'gang', 'gangsters', 'pègre', 'lingots', 'diamants'],
    expectedGenres: [80, 53, 28, 9648],
    conflictingGenres: [10749, 10751, 10402],
    archetypes: ['inception', 'heat', "ocean's eleven", 'oceans eleven', 'the town', 'inside man', 'baby driver', 'reservoir dogs', 'snatch', 'the italian job', 'point break', 'arrête-moi si tu peux', 'arrete-moi si tu peux', 'catch me if you can', 'les infiltrés', 'the departed'],
    disqualified: ['titanic', 'romeo + juliet', 'roméo + juliette', 'gatsby le magnifique', 'the great gatsby', 'revolutionary road', 'les noces rebelles', 'la la land', 'notting hill']
  },
  {
    id: 'twist_narratif',
    triggers: [
      'twist', 'twists', 'twist final', 'twist_narratif', 'twist narratif',
      'twist final surprenant', 'retournement', 'retournements', 'dénouement',
      'denouement', 'fin surprenante', 'chute finale', 'chute', 'mindfuck',
      'revelation finale', 'révélation finale'
    ],
    primaryKeywords: ['twist', 'retournement', 'dénouement', 'chute', 'révélation', 'illusion', 'hallucination', 'psychiatrique', 'asile', 'schizophr'],
    secondaryKeywords: ['secret', 'vérité', 'double jeu', 'mensonge', 'machination', 'paranoïa', 'complot', 'infiltr'],
    expectedGenres: [53, 9648, 878, 27, 80],
    conflictingGenres: [10749, 35, 10751],
    archetypes: ['shutter island', 'inception', 'fight club', 'sixième sens', 'les autres', 'usual suspects', 'memento', 'le prestige', 'seven', 'gone girl', 'oldboy', 'prisoners'],
    disqualified: ['titanic', 'le loup de wall street', 'django unchained', 'the revenant', 'gatsby le magnifique']
  },
  {
    id: 'consumerisme',
    triggers: [
      'consumerisme', 'consumérisme', 'societe de consommation', 'société de consommation',
      'capitalisme', 'aliénation', 'alienation', 'matérialisme', 'materialisme',
      'critique sociale', 'satire sociale'
    ],
    primaryKeywords: ['consommation', 'société', 'capitalisme', 'système', 'aliénation', 'argent', 'publicité', 'matérialisme'],
    secondaryKeywords: ['banlieue', 'bureau', 'conformisme', 'rébellion', 'révolte', 'vide existentiel', 'dystopie'],
    expectedGenres: [18, 53, 35, 878],
    conflictingGenres: [10751, 10749],
    archetypes: ['fight club', 'american psycho', 'they live', 'invasion los angeles', 'the truman show', 'truman show', 'network'],
    disqualified: ['titanic', 'notting hill', 'pretty woman']
  },
  {
    id: 'espionnage',
    triggers: [
      'espion', 'espions', 'espionne', 'espionnes', 'espionnage', 'agent secret', 'agents secrets',
      'cia', 'mi6', 'kgb', 'fsb', 'mossad', 'dgse', 'infiltration', 'infiltré', 'infiltree', 'infiltrer',
      'mission secrète', 'mission secrete', 'recrutement', 'recrutée', 'recrutee', 'recruté',
      'formée comme espionne', 'formee comme espionne', 'formation d\'agent', 'formation d agent',
      'formé comme espion', 'forme comme espion', 'agent de la cia', 'agente de la cia', 'taupe',
      'double jeu', 'spy', 'spies', 'secret agent', 'espionage'
    ],
    primaryKeywords: [
      'espion', 'espionne', 'espions', 'espionnes', 'espionnage', 'agent secret', 'cia', 'mi6', 'kgb',
      'taupe', 'infiltration', 'infiltré', 'infiltree', 'mission secrète', 'secret agent', 'spy', 'spies',
      'recrutement', 'recrutée', 'recrutee', 'recruté', 'formation', 'agent'
    ],
    secondaryKeywords: [
      'complot', 'conspiration', 'trahison', 'double jeu', 'tueur à gages', 'assassin',
      'renseignement', 'contre-espionnage', 'filature', 'surveillance', 'identité secrète',
      'opération secrète', 'black ops', 'gouvernement', 'fbi', 'mission', 'arme', 'armes'
    ],
    expectedGenres: [28, 53, 9648, 80, 12],
    conflictingGenres: [16, 10751, 10402, 10749],
    archetypes: [
      'salt', 'mr. & mrs. smith', 'mr. and mrs. smith', 'mr and mrs smith', 'mr & mrs smith',
      'red sparrow', 'atomic blonde', 'la mémoire dans la peau', 'the bourne identity',
      'jason bourne', 'mission: impossible', 'mission impossible', 'skyfall', 'casino royale',
      'la taupe', 'tinker tailor soldier spy', 'le pont des espions', 'bridge of spies',
      'spy game', 'munich', 'kingsman', 'anna', 'raison d\'état', 'the good shepherd', 'alias'
    ],
    disqualified: [
      'kung fu panda', 'kung fu panda 2', 'kung fu panda 3', 'kung fu panda 4',
      'gang de requins', 'shark tale', 'maléfique', 'maleficent', 'titanic', 'la la land', 'notting hill'
    ]
  },
  {
    id: 'tueur_en_serie',
    triggers: [
      'tueur en série', 'tueurs en série', 'tueur en serie', 'tueurs en serie',
      'serial killer', 'serial killers', 'psychopathe', 'psychopathes',
      'meurtres en série', 'meurtres en serie', 'meurtre en série', 'meurtre en serie',
      'tueur psychopathe', 'tueurs psychopathes', 'profiler', 'profilers',
      'chasse au tueur', 'traque du tueur', 'tueur sanguinaire'
    ],
    primaryKeywords: [
      'tueur', 'tueurs', 'série', 'serie', 'serial killer', 'psychopathe', 'psychopathes',
      'meurtre', 'meurtres', 'victime', 'victimes', 'profiler', 'enquête', 'enquete',
      'enquêtes', 'enquetes', 'inspecteur', 'inspecteurs', 'cadavre', 'cadavres',
      'criminel', 'criminels', 'assassin', 'assassins', 'police', 'fbi', 'mode opératoire', 'traque'
    ],
    secondaryKeywords: [
      'macabre', 'sanglant', 'folie', 'obsession', 'mystère', 'mystere', 'rituel',
      'sadique', 'indice', 'indices', 'chasseur', 'autopsie', 'recherche', 'arrestation',
      'terreur', 'angoisse', 'suspense'
    ],
    expectedGenres: [80, 53, 27, 9648, 18],
    conflictingGenres: [10751, 10402, 10767, 10764, 10763, 10749],
    archetypes: [
      'se7en', 'seven', 'le silence des agneaux', 'the silence of the lambs',
      'zodiac', 'memories of murder', 'monster', 'american psycho',
      'the house that jack built', 'le parfum', 'saw', 'psychose', 'psycho',
      'm le maudit', 'henry, portrait d\'un serial killer', 'henry: portrait of a serial killer',
      'mr. brooks', 'mr brooks', 'copycat', 'le diable tout le temps', 'prisoners',
      'chasing the dragon', 'cure', 'manhunter', 'red dragon', 'dragon rouge'
    ],
    disqualified: [
      'actors on actors', 'variety studio: actors on actors', 'inside the actors studio',
      'the graham norton show', 'the tonight show', 'the late show', 'jimmy kimmel live',
      'titanic', 'la la land', 'notting hill', 'pretty woman', 'mamma mia', 'clueless',
      'le fabuleux destin d\'amélie poulain', 'kung fu panda', 'gang de requins'
    ]
  },
  {
    id: 'mariage_mort',
    triggers: [
      'mariage et la mort', 'mariage et mort', 'mariage mort', 'mort et mariage',
      'mariage', 'noces', 'marier', 'épousailles', 'deuil', 'enterrement', 'funérailles',
      'veuf', 'veuve', 'noces funèbres', 'noces funebres'
    ],
    primaryKeywords: [
      'mariage', 'mari', 'mariée', 'mariee', 'époux', 'epoux', 'épouse', 'epouse',
      'noces', 'mort', 'mourir', 'décès', 'deces', 'deuil', 'funérailles', 'funerailles',
      'enterrement', 'cadavre', 'défunt', 'defunt', 'veuf', 'veuve', 'tombe', 'cimetière'
    ],
    secondaryKeywords: [
      'cérémonie', 'alliance', 'fiançailles', 'romance macabre', 'fantôme', 'suicide',
      'tragédie', 'fatal', 'perte', 'disparition', 'héritage', 'testament', 'agonie'
    ],
    expectedGenres: [18, 10749, 14, 35, 27, 9648],
    conflictingGenres: [10402],
    archetypes: [
      'les noces funèbres', 'corpse bride', 'melancholia', 'amour',
      'quatre mariages et un enterrement', 'four weddings and a funeral',
      'beetlejuice', 'ready or not', 'wedding nightmare', 'phantom thread',
      'ghost', 'les noces rebelles', 'revolutionary road'
    ],
    disqualified: [
      'la la land', 'whiplash', 'notting hill', 'coup de foudre à notting hill',
      'pretty woman', 'le diable s\'habille en prada', 'the devil wears prada',
      'clueless', 'mamma mia', 'love actually', 'dirty dancing', 'kung fu panda',
      'gang de requins', 'actors on actors'
    ]
  },
  {
    id: 'tearjerker',
    triggers: [
      'pleurer', 'chialer', 'larmes', 'mouchoirs', 'tire-larmes', 'tire larmes',
      'tearjerker', 'triste', 'tristesse', 'bouleversant', 'bouleversante',
      'émouvant', 'emouvant', 'émouvante', 'emouvante', 'déchirant', 'dechirant',
      'poignant', 'poignante', 'dévastateur', 'devastateur', 'heartbreaking',
      'mourir d\'amour', 'amour tragique', 'fin tragique', 'faire pleurer',
      'verser une larme', 'fend le coeur', 'fend le cœur', 'pour pleurer',
      'film triste', 'film pour pleurer', 'histoire triste', 'drame déchirant',
      'drame émouvant', 'film qui fait pleurer', 'pleurer un bon coup'
    ],
    primaryKeywords: [
      'pleurer', 'larmes', 'émouvant', 'bouleversant', 'tristesse', 'deuil',
      'tragédie', 'drame', 'poignant', 'déchirant', 'mélodrame', 'maladie',
      'mort', 'sacrifice', 'amour tragique'
    ],
    secondaryKeywords: [
      'séparation', 'adieu', 'souffrance', 'chagrin', 'injustice', 'poignante',
      'cœur brisé', 'perte'
    ],
    expectedGenres: [18, 10749],
    conflictingGenres: [10767, 10764, 10763],
    archetypes: [
      'la ligne verte', 'the green mile', 'le tombeau des lucioles', 'grave of the fireflies',
      'la liste de schindler', 'schindler\'s list', 'nos étoiles contraires', 'the fault in our stars',
      'titanic', 'manchester by the sea', 'la vie est belle', 'life is beautiful',
      'interstellar', 'le pianiste', 'the pianist', 'forrest gump', 'lion', 'brokeback mountain'
    ],
    disqualified: [
      'kung fu panda', 'gang de requins', 'actors on actors', 'the tonight show', 'scary movie'
    ]
  },
  {
    id: 'feel_good',
    triggers: [
      'remonte le moral', 'remonter le moral', 'feel good', 'feel-good', 'feelgood',
      'baume au coeur', 'baume au cœur', 'réconfortant', 'reconfortant', 'chaleureux',
      'fait du bien', 'pour se sentir bien', 'bonne humeur', 'envie de vivre', 'sourire',
      'optimiste', 'bienveillant', 'lumineux', 'film doudou', 'uplifting', 'heartwarming',
      'redonner le sourire', 'réconfort', 'reconfort'
    ],
    primaryKeywords: [
      'chaleureux', 'réconfortant', 'bonne humeur', 'sourire', 'tendresse', 'optimisme',
      'amitié', 'bonheur', 'bienveillance', 'comédie', 'solaire', 'feel good'
    ],
    secondaryKeywords: [
      'générosité', 'entraide', 'famille', 'joie', 'rires', 'espérance', 'légèreté', 'renaissance'
    ],
    expectedGenres: [35, 18, 10751],
    conflictingGenres: [27, 53, 10767, 10764],
    archetypes: [
      'intouchables', 'le fabuleux destin d\'amélie poulain', 'little miss sunshine', 'green book',
      'the truman show', 'la la land', 'forrest gump', 'paddington 2', 'good will hunting',
      'le cercle des poètes disparus', 'dead poets society', 'about time', 'il était temps'
    ],
    disqualified: [
      'saw', 'hostel', 'hereditary', 'the human centipede', 'actors on actors'
    ]
  },
  {
    id: 'horreur_sans_jumpscare',
    triggers: [
      'peur sans sursaut', 'sans sursaut', 'sans sursauts', 'sans jump scare',
      'sans jump-scare', 'sans jumpscare', 'sans jumpscares', 'angoisse sans sursaut',
      'angoisse sourde', 'horreur psychologique', 'peur psychologique',
      'oppressant sans sursaut', 'atmosphère dérangeante', 'atmosphere derangeante',
      'ambiance dérangeante', 'slow burn', 'dread', 'malaise', 'horreur lente', 'frisson psychologique'
    ],
    primaryKeywords: [
      'psychologique', 'angoisse', 'oppressant', 'malaise', 'paranoïa', 'folie',
      'atmosphère', 'isolement', 'dérangeant', 'tension', 'terreur sourde'
    ],
    secondaryKeywords: [
      'mystère', 'huis clos', 'hallucinations', 'cauchemar', 'secte', 'occulte', 'suspense'
    ],
    expectedGenres: [27, 9648, 53],
    conflictingGenres: [35, 10751, 10402, 10767, 10764],
    archetypes: [
      'hereditary', 'midsommar', 'the witch', 'shining', 'the shining', 'rosemary\'s baby',
      'the lighthouse', 'it follows', 'get out', 'les autres', 'the others',
      'sixième sens', 'the sixth sense', 'black swan', 'the babadook'
    ],
    disqualified: [
      'scary movie', 'paranormal activity', 'conjuring', 'annabelle', 'actors on actors'
    ]
  }
];

export function detectThematicClusterId(queryText) {
  if (!queryText) return null;
  const qLower = queryText.toLowerCase();
  for (const cluster of THEMATIC_CLUSTERS_RAW) {
    if (cluster.triggers.some(t => qLower.includes(t))) {
      return cluster.id;
    }
  }
  return null;
}

/**
 * Analyse approfondie de l'intention émotionnelle (Query Expansion & Semantic Translation).
 * Rôle : traduire toute description de sensation, humeur ou état d'esprit en intention cinématographique.
 */
export function detectEmotionalExpansion(queryText) {
  if (!queryText || typeof queryText !== 'string') return null;
  const lower = queryText.toLowerCase().trim();

  // 1. Tristesse / Pleurs / Catharsis
  const isTearjerker = 
    /\b(pleurer|chialer|larmes|mouchoirs|tire-larmes|tire larmes|tearjerker|triste|tristesse|bouleversant|bouleversante|émouvant|emouvant|émouvante|emouvante|déchirant|dechirant|poignant|poignante|dévastateur|devastateur|heartbreaking|mourir d'amour|amour tragique|fin tragique|faire pleurer|verser une larme|fend le coeur|fend le cœur)\b/i.test(lower) ||
    /\b(pour pleurer|film triste|film pour pleurer|histoire triste|drame déchirant|drame émouvant|film qui fait pleurer|pleurer un bon coup)\b/i.test(lower);

  if (isTearjerker) {
    return {
      category: 'tearjerker',
      label: 'Émotion intense & Drames poignants',
      genres: ['Drama', 'Romance'],
      genreIds: [18, 10749],
      emotionalKeywords: ['émouvant', 'larmes', 'bouleversant', 'deuil', 'amour tragique', 'heartbreaking', 'tearjerker', 'tragédie', 'poignant', 'mélodrame'],
      enrichedSemanticQuery: 'drame bouleversant et émouvant histoire tragique et poignante larmes et grand amour triste',
      archetypeTitles: [
        'La Ligne verte / The Green Mile', 'Le Tombeau des lucioles / Grave of the Fireflies',
        'La Liste de Schindler / Schindler\'s List', 'Nos étoiles contraires / The Fault in Our Stars',
        'Titanic', 'Manchester by the Sea', 'La vie est belle / Life Is Beautiful', 'Interstellar',
        'Le Pianiste / The Pianist', 'Forrest Gump', 'Lion', 'Brokeback Mountain'
      ]
    };
  }

  // 2. Joie / Réconfort / Feel Good
  const isFeelGood = 
    /\b(remonte le moral|remonter le moral|feel[\s-]?good|baume au c[oœ]ur|r[eé]confortant|chaleureux|fait du bien|pour se sentir bien|bonne humeur|envie de vivre|sourire|optimiste|bienveillant|lumineux|film doudou|uplifting|heartwarming|mettre du baume|redonner le sourire|r[eé]confort)\b/i.test(lower);

  if (isFeelGood) {
    return {
      category: 'feel_good',
      label: 'Feel-Good & Réconfort chaleureux',
      genres: ['Comedy', 'Drama', 'Family'],
      genreIds: [35, 18, 10751],
      emotionalKeywords: ['feel-good', 'réconfortant', 'chaleureux', 'bonne humeur', 'tendresse', 'espoir', 'heartwarming', 'optimisme', 'bienveillance', 'amitié'],
      enrichedSemanticQuery: 'comédie dramatique chaleureuse et réconfortante feel good film qui fait du bien plein d\'espoir et de tendresse',
      archetypeTitles: [
        'Intouchables', 'Le Fabuleux Destin d\'Amélie Poulain', 'Little Miss Sunshine', 'Green Book',
        'The Truman Show', 'La La Land', 'Forrest Gump', 'Paddington 2', 'Good Will Hunting',
        'Le Cercle des poètes disparus / Dead Poets Society', 'About Time / Il était temps'
      ]
    };
  }

  // 3. Peur sans sursaut / Horreur atmosphérique
  const isAtmosphericHorror = 
    /\b(peur sans sursaut|sans sursaut|sans sursauts|sans jump[\s-]?scare|sans jump[\s-]?scares|angoisse sans sursaut|angoisse sourde|horreur psychologique|peur psychologique|oppressant sans sursaut|atmosphère d[eé]rangeante|ambiance d[eé]rangeante|slow burn|dread|malaise|horreur lente|frisson psychologique)\b/i.test(lower);

  if (isAtmosphericHorror) {
    return {
      category: 'atmospheric_horror',
      label: 'Angoisse sourde & Horreur psychologique sans sursaut',
      genres: ['Horror', 'Mystery', 'Thriller'],
      genreIds: [27, 9648, 53],
      emotionalKeywords: ['horreur psychologique', 'angoisse sourde', 'atmosphère dérangeante', 'oppressant', 'malaise', 'slow burn', 'tension lente', 'paranoïa', 'dread', 'sans jump scare'],
      enrichedSemanticQuery: 'horreur psychologique et angoisse sourde atmosphère dérangeante et oppressante sans jump scare lente montée de tension',
      archetypeTitles: [
        'Hereditary', 'Midsommar', 'The Witch', 'Shining / The Shining', 'Rosemary\'s Baby',
        'The Lighthouse', 'It Follows', 'Get Out', 'Les Autres / The Others', 'Sixième Sens / The Sixth Sense',
        'Black Swan', 'The Babadook'
      ]
    };
  }

  // 4. Nostalgie / Douce mélancolie
  const isNostalgia = 
    /\b(nostalgique|nostalgie|m[eé]lancolie douce|douce m[eé]lancolie|souvenirs d['’]enfance|enfance perdue|coming[\s-]?of[\s-]?age|passage [aà] l['’][aâ]ge adulte|souvenir d['’]enfance|années 80 nostalgie)\b/i.test(lower);

  if (isNostalgia) {
    return {
      category: 'nostalgia',
      label: 'Nostalgie & Douce mélancolie',
      genres: ['Drama', 'Adventure', 'Comedy'],
      genreIds: [18, 12, 35],
      emotionalKeywords: ['nostalgie', 'enfance', 'amitié', 'souvenirs', 'mélancolie douce', 'coming of age', 'passage à l\'âge adulte'],
      enrichedSemanticQuery: 'chronique nostalgique et émouvante enfance amitié souvenirs doux-amers passage à l\'âge adulte',
      archetypeTitles: [
        'Stand by Me', 'Cinema Paradiso', 'Les Goonies / The Goonies', 'Boyhood',
        'Aftersun', 'Le Cercle des poètes disparus', 'Super 8', 'Moonrise Kingdom', 'Lady Bird'
      ]
    };
  }

  // 5. Adrénaline pure / Tension extrême
  const isAdrenaline = 
    /\b(adr[eé]naline|au bord du si[eè]ge|coupe le souffle|prend aux tripes|tension extr[eê]me|pression maximale|cardiaque|ultra tendu|haletant|suspense insoutenable|palpitant)\b/i.test(lower);

  if (isAdrenaline) {
    return {
      category: 'adrenaline',
      label: 'Adrénaline pure & Tension extrême',
      genres: ['Thriller', 'Action', 'Crime'],
      genreIds: [53, 28, 80],
      emotionalKeywords: ['suspense haletant', 'tension extrême', 'adrénaline', 'course contre la montre', 'oppressant', 'palpitant', 'nerveux'],
      enrichedSemanticQuery: 'thriller ultra tendu et haletant tension maximale course contre la montre suspense suffocant',
      archetypeTitles: [
        'Sicario', 'Whiplash', 'Uncut Gems', 'Prisoners', 'Mad Max: Fury Road', 'Heat', 'No Country for Old Men', 'Dunkirk'
      ]
    };
  }

  // 6. Grand amour passionnel
  const isDeepRomance = 
    /\b(coup de foudre|grand amour|amour passionnel|passion romantique|qui fait r[eê]ver d['’]amour|papillons dans le ventre|alchimie incroyable|romance intense|amour fusionnel)\b/i.test(lower);

  if (isDeepRomance) {
    return {
      category: 'deep_romance',
      label: 'Passion amoureuse & Romance envoûtante',
      genres: ['Romance', 'Drama'],
      genreIds: [10749, 18],
      emotionalKeywords: ['romance passionnée', 'amour fusionnel', 'coup de foudre', 'alchimie', 'passion', 'émotion amoureuse', 'poésie'],
      enrichedSemanticQuery: 'grande romance passionnée et poétique alchimie intense amour bouleversant',
      archetypeTitles: [
        'Before Sunrise', 'In the Mood for Love', 'Portrait de la jeune fille en feu',
        'Orgueil et Préjugés / Pride and Prejudice', 'La La Land', 'Eternal Sunshine of the Spotless Mind', 'About Time', 'N\'oublie jamais / The Notebook'
      ]
    };
  }

  // 7. Inspirant / Dépassement de soi
  const isInspiring = 
    /\b(qui motive|donne envie de se battre|d[eé]passement de soi|inspirant|donne de la force|ne jamais abandonner|courage et d[eé]termination|triomphe de l['’]esprit)\b/i.test(lower);

  if (isInspiring) {
    return {
      category: 'inspiring',
      label: 'Inspiration, Courage & Dépassement de soi',
      genres: ['Drama', 'Biography', 'Sport'],
      genreIds: [18, 36],
      emotionalKeywords: ['dépassement de soi', 'courage', 'détermination', 'triomphe', 'inspiration', 'persévérance', 'espoir'],
      enrichedSemanticQuery: 'drame biographique inspirant dépassement de soi courage persévérance triomphe de la volonté',
      archetypeTitles: [
        'À la recherche du bonheur / The Pursuit of Happyness', 'Whiplash', 'Billy Elliot', 'Rocky',
        'Les Figures de l\'ombre / Hidden Figures', 'Le Discours d\'un roi / The King\'s Speech', 'Invictus', 'Gattaca'
      ]
    };
  }

  return null;
}

/**
 * Règle contractuelle "Zéro Écran Vide" :
 * Résout les chefs-d'œuvre incontournables correspondant à l'intention émotionnelle.
 */
export async function resolveEmotionalMasterpieces(expansion, tmdbApiKey = '', clusterId = null) {
  if (!expansion || !Array.isArray(expansion.archetypeTitles) || expansion.archetypeTitles.length === 0) return [];

  // 1. Essai de résolution par titre dans la base Supabase
  if (supabaseServer) {
    try {
      const dbMovies = await resolveByTitles(expansion.archetypeTitles, [], expansion.enrichedSemanticQuery, clusterId || expansion.category);
      if (Array.isArray(dbMovies) && dbMovies.length >= 4) {
        return dbMovies.slice(0, 8).map((m, idx) => ({
          ...m,
          badge: 'Sélection Éliciné',
          match_rate: Math.max(75, 96 - idx * 2),
          ai_match_reason: `✨ Chef-d'œuvre incontournable : ${expansion.label}`
        }));
      }
    } catch (err) {
      console.warn('[API /api/search] Erreur resolveByTitles pour archetypes :', err?.message);
    }
  }

  // 2. Résolution TMDB 1-pour-1
  const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || tmdbApiKey || '').trim();
  if (tmdbKey) {
    const tmdbResults = [];
    const seenIds = new Set();

    for (const rawTitle of expansion.archetypeTitles.slice(0, 8)) {
      const cleanTitle = rawTitle.split(/[/|]/)[0].trim();
      try {
        const res = await fetchWithTimeout(
          `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR&page=1&include_adult=false`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          3000
        );
        if (res.ok) {
          const data = await res.json();
          const first = (data.results || []).find(m => !seenIds.has(m.id));
          if (first) {
            seenIds.add(first.id);
            tmdbResults.push({
              ...first,
              badge: 'Sélection Éliciné',
              match_rate: Math.max(75, 96 - tmdbResults.length * 2),
              ai_match_reason: `✨ Chef-d'œuvre incontournable : ${expansion.label}`
            });
          }
        }
      } catch (_) {}
    }

    if (tmdbResults.length >= 3) {
      return tmdbResults;
    }

    // Fallback supplémentaire : discover TMDB par genres dominants
    if (expansion.genreIds && expansion.genreIds.length > 0) {
      try {
        const discRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/discover/movie?api_key=${encodeURIComponent(tmdbKey)}&with_genres=${expansion.genreIds.join(',')}&sort_by=vote_average.desc&vote_count.gte=800&language=fr-FR&page=1&include_adult=false`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          3500
        );
        if (discRes.ok) {
          const discData = await discRes.json();
          for (const m of (discData.results || [])) {
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id);
              tmdbResults.push({
                ...m,
                badge: 'Sélection Éliciné',
                match_rate: Math.max(75, 96 - tmdbResults.length * 2),
                ai_match_reason: `✨ Chef-d'œuvre incontournable : ${expansion.label}`
              });
              if (tmdbResults.length >= 8) break;
            }
          }
        }
      } catch (_) {}
    }

    if (tmdbResults.length > 0) {
      return tmdbResults;
    }
  }

  return [];
}

// ============================================================================
// ÉTAPE 3 — Règle impérative de Fallback : Recommandations Éliciné pour votre atmosphère
// Règle absolue : Il est formellement INTERDIT de renvoyer le composant "Aucun film
// ne correspond précisément..." si la requête est identifiable sur un plan émotionnel
// ou thématique. Affiche les films du genre dominant les mieux notés avec le label
// d'accompagnement : "Recommandations Éliciné pour votre atmosphère".
// ============================================================================
const TMDB_GENRE_NAME_TO_ID = {
  'romance': 10749, 'amour': 10749,
  'drama': 18, 'drame': 18,
  'comedy': 35, 'comédie': 35, 'comedie': 35,
  'thriller': 53, 'suspense': 53,
  'action': 28,
  'science-fiction': 878, 'sci-fi': 878, 'sf': 878,
  'horror': 27, 'horreur': 27,
  'mystery': 9648, 'mystère': 9648, 'mystere': 9648,
  'crime': 80, 'policier': 80,
  'adventure': 12, 'aventure': 12,
  'family': 10751, 'famille': 10751,
  'fantasy': 14, 'fantastique': 14,
  'animation': 16
};

export async function resolveDominantGenreAtmosphere(primaryGenres = [], moodTags = [], cleanQuery = '', tmdbApiKey = '', clusterId = null, offline = false) {
  // 1. Identification du genre principal (primary_genres[0])
  let primaryGenre = null;
  if (Array.isArray(primaryGenres) && primaryGenres.length > 0 && typeof primaryGenres[0] === 'string' && primaryGenres[0].trim().length > 0) {
    primaryGenre = primaryGenres[0].trim();
  }

  let dominantGenres = Array.isArray(primaryGenres) ? [...primaryGenres] : [];
  const emotionalExpansion = detectEmotionalExpansion(cleanQuery);
  if (!primaryGenre && emotionalExpansion && Array.isArray(emotionalExpansion.genres) && emotionalExpansion.genres.length > 0) {
    primaryGenre = emotionalExpansion.genres[0];
    dominantGenres = emotionalExpansion.genres;
  }

  if (!primaryGenre) {
    const qLower = (cleanQuery || '').toLowerCase();
    if (/\b(?:amour|romance|amoureux|amoureuse|cœur|coeur|sentiment|couple|passion)\b/i.test(qLower)) {
      primaryGenre = 'Romance';
      dominantGenres = ['Romance', 'Drame'];
    } else if (/\b(?:peur|angoisse|horreur|terrifi|sombre|d[eé]mon|frisson)\b/i.test(qLower)) {
      primaryGenre = 'Horreur';
      dominantGenres = ['Horreur', 'Thriller'];
    } else if (/\b(?:espace|robot|futur|dystop|ia|alien|science-fiction|sf|voyage temporel)\b/i.test(qLower)) {
      primaryGenre = 'Science-Fiction';
      dominantGenres = ['Science-Fiction', 'Drame'];
    } else if (/\b(?:rire|drole|drôle|humour|com[eé]die|amiti[eé]|feel[\s-]?good|l[eé]g[eè]re)\b/i.test(qLower)) {
      primaryGenre = 'Comédie';
      dominantGenres = ['Comédie', 'Drame'];
    } else if (/\b(?:enqu[eê]te|meurtre|tueur|police|fbi|braquage|crime|polar)\b/i.test(qLower)) {
      primaryGenre = 'Thriller';
      dominantGenres = ['Thriller', 'Crime'];
    } else {
      primaryGenre = 'Drame';
      dominantGenres = ['Drame', 'Romance'];
    }
  }

  const dominantLabel = primaryGenre || 'Cinéma';
  console.log(`[API /api/search] [Étape 3 Fallback] Sélection des 6 meilleurs films du genre principal : "${dominantLabel}"`);

  // 2. Recherche prioritaire dans le catalogue Supabase local pour primary_genres[0]
  if (supabaseServer && !offline) {
    const cleanG = primaryGenre.replace(/[,()%"']/g, '').trim();
    if (cleanG.length >= 3) {
      try {
        const { data, error } = await supabaseServer
          .from('movies')
          .select('*')
          .ilike('genres', `%${cleanG}%`)
          .gte('vote_count', 250)
          .order('vote_average', { ascending: false })
          .limit(6);
        if (!error && Array.isArray(data) && data.length > 0) {
          const filtered = filterMockbusters(data, cleanQuery);
          if (filtered.length > 0) {
            return filtered.slice(0, 6).map((m, idx) => ({
              ...m,
              badge: 'Recommandations Éliciné pour votre atmosphère',
              ai_badge: 'Recommandations Éliciné pour votre atmosphère',
              match_rate: Math.max(78, 96 - idx * 2),
              ai_match_reason: m.ai_match_reason || `Top sélection du genre ${dominantLabel} pour votre atmosphère`
            }));
          }
        }
      } catch (err) {
        console.warn('[API /api/search] [Étape 3 Fallback] Supabase movies :', err?.message);
      }
    }
  }

  // 3. Fallback sur archetypes de l'intention émotionnelle si disponibles
  if (!offline && emotionalExpansion && Array.isArray(emotionalExpansion.archetypeTitles) && emotionalExpansion.archetypeTitles.length > 0) {
    const emotionalMovies = await resolveEmotionalMasterpieces(emotionalExpansion, tmdbApiKey, clusterId);
    if (emotionalMovies.length > 0) {
      return emotionalMovies.slice(0, 6).map((m, idx) => ({
        ...m,
        badge: 'Recommandations Éliciné pour votre atmosphère',
        ai_badge: 'Recommandations Éliciné pour votre atmosphère',
        ai_match_reason: `Recommandation Éliciné pour votre atmosphère (${dominantLabel})`,
        match_rate: Math.max(78, 96 - idx * 2)
      }));
    }
  }

  // 4. Découverte TMDB des 6 chefs-d'œuvre les mieux notés du genre principal
  const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || tmdbApiKey || '').trim();
  if (tmdbKey && !offline) {
    const genreIds = [];
    const gKey = primaryGenre.toLowerCase().trim();
    if (TMDB_GENRE_NAME_TO_ID[gKey]) {
      genreIds.push(TMDB_GENRE_NAME_TO_ID[gKey]);
    }
    for (const g of dominantGenres) {
      const k = g.toLowerCase().trim();
      if (TMDB_GENRE_NAME_TO_ID[k] && !genreIds.includes(TMDB_GENRE_NAME_TO_ID[k])) {
        genreIds.push(TMDB_GENRE_NAME_TO_ID[k]);
      }
    }
    if (genreIds.length === 0) genreIds.push(18, 10749); // Romance & Drame par défaut

    try {
      const discRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/discover/movie?api_key=${encodeURIComponent(tmdbKey)}&with_genres=${genreIds.join(',')}&sort_by=vote_average.desc&vote_count.gte=800&language=fr-FR&page=1&include_adult=false`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        3500
      );
      if (discRes.ok) {
        const discData = await discRes.json();
        const hits = (discData.results || []).slice(0, 6);
        if (hits.length > 0) {
          return hits.map((m, idx) => ({
            id: m.id,
            tmdb_id: m.id,
            title: m.title || m.name || '',
            original_title: m.original_title || m.original_name || '',
            overview: m.overview || '',
            poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            backdrop_path: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
            release_date: m.release_date || m.first_air_date || '',
            vote_average: m.vote_average || 0,
            vote_count: m.vote_count || 0,
            genres: Array.isArray(m.genre_ids) ? m.genre_ids.join(',') : '',
            media_type: 'movie',
            badge: 'Recommandations Éliciné pour votre atmosphère',
            ai_badge: 'Recommandations Éliciné pour votre atmosphère',
            match_rate: Math.max(78, 96 - idx * 2),
            ai_match_reason: `Recommandation Éliciné pour votre atmosphère (${dominantLabel})`
          }));
        }
      }
    } catch (discErr) {
      console.warn('[API /api/search] [Étape 3 Fallback] TMDB discover :', discErr?.message);
    }
  }

  // Never fabricate catalogue entries. Exhausted real sources produce a clean
  // empty result so explicit constraints remain authoritative.
  return [];
}

/**
 * Détermine formellement si une œuvre doit être disqualifiée car il s'agit d'un contenu
 * non-fictionnel (talk-show, interview d'acteurs, émission de divertissement, télé-réalité)
 * alors que l'utilisateur recherche une œuvre cinématographique / fiction.
 */
export function isDisqualifiedNonFiction(queryText, movie) {
  if (!movie) return false;
  const qLower = (queryText || '').toLowerCase();
  const isNonFictionExplicitlyRequested = /\b(documentaire|documentaires|docu|docus|reportage|reportages|talk-show|talk show|interview|interviews|télé-réalité|tele-realite|biographie réelle)\b/i.test(qLower);

  const titleLower = (movie.title || movie.name || '').toLowerCase().trim();
  const origLower = (movie.original_title || movie.original_name || '').toLowerCase().trim();

  // 1. Titres blacklistés formels (émissions de discussion, interviews, remises de prix, talk-shows)
  const blacklistedShowTitles = [
    'actors on actors',
    'variety studio: actors on actors',
    'inside the actors studio',
    'the graham norton show',
    'the tonight show',
    'the late show',
    'jimmy kimmel live',
    'the late late show',
    'conan',
    'hot ones',
    'oscars',
    'golden globes',
    'cesar',
    'césar'
  ];
  if (blacklistedShowTitles.some(bt => titleLower.includes(bt) || origLower.includes(bt))) {
    return true;
  }

  // 2. Genres TMDB :
  // 10767 = Talk Show (TV)
  // 10764 = Reality (TV)
  // 10763 = News (TV)
  // 10766 = Soap (TV)
  // 99 = Documentary
  const rawGenreIds = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
    : (typeof movie.genres === 'string'
        ? movie.genres.split(',').map(Number).filter(Boolean)
        : (Array.isArray(movie.genres) ? movie.genres.map(g => typeof g === 'number' ? g : g?.id) : []));
  const genreIds = rawGenreIds.map(Number).filter(Boolean);

  if (!isNonFictionExplicitlyRequested) {
    if (genreIds.includes(10767) || genreIds.includes(10764) || genreIds.includes(10763)) {
      return true;
    }
    if (genreIds.includes(99)) {
      const fictionGenres = [28, 12, 16, 35, 80, 18, 14, 27, 9648, 878, 53, 10752, 37];
      const hasFiction = genreIds.some(id => fictionGenres.includes(id));
      if (!hasFiction) {
        return true;
      }
    }
  }

  return false;
}

export function calculateSemanticMatchScore(movie, queryText, llmMatch, facets = null) {
  // 0. Disqualification immédiate des talk-shows, interviews, docu non demandés
  if (isDisqualifiedNonFiction(queryText, movie)) {
    return 15;
  }

  const titleLower = (movie.title || movie.name || '').toLowerCase().trim();
  const origLower = (movie.original_title || movie.original_name || '').toLowerCase().trim();
  const overviewLower = (movie.overview || '').toLowerCase();
  const voteCount = Number(movie.vote_count || 0);
  const voteAvg = Number(movie.vote_average || 0);
  const rawGenreIds = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
    : (typeof movie.genres === 'string' ? movie.genres.split(',').map(Number).filter(Boolean) : []);
  const genreIds = rawGenreIds.map(Number);
  const queryLower = (queryText || '').toLowerCase();

  // 1. Détection du cluster thématique actif
  let activeCluster = null;
  for (const cluster of THEMATIC_CLUSTERS_RAW) {
    if (cluster.triggers.some(t => queryLower.includes(t))) {
      activeCluster = cluster;
      break;
    }
  }

  // 2. Disqualification stricte si le film est formellement incompatible
  if (activeCluster) {
    if (activeCluster.disqualified.includes(titleLower) || activeCluster.disqualified.includes(origLower)) {
      return 25; // Rejet formel immédiat
    }

    let lexicalHits = 0;
    for (const kw of activeCluster.primaryKeywords) {
      if (overviewLower.includes(kw) || titleLower.includes(kw)) lexicalHits += 3;
    }
    for (const kw of activeCluster.secondaryKeywords) {
      if (overviewLower.includes(kw)) lexicalHits += 1.5;
    }

    const isArchetype = activeCluster.archetypes.some(a => titleLower === a || origLower === a || titleLower.includes(a));
    // Cas spécifique mariage et mort : rejeter systématiquement les films musicaux / comédies sans rapport
    if (activeCluster.id === 'mariage_mort' && !isArchetype) {
      if (genreIds.includes(10402)) return 20;
      if (lexicalHits === 0 && (genreIds.includes(35) || genreIds.includes(10749))) return 25;
    }

    const isAnimationOrFamily = genreIds.includes(16) || genreIds.includes(10751);

    // Rejet catégorique si film d'animation / famille sans aucun mot-clé du thème
    if (!isArchetype && isAnimationOrFamily && lexicalHits === 0) {
      return 20;
    }

    const hasExpectedGenre = activeCluster.expectedGenres.some(id => genreIds.includes(id));
    const isPureConflicting = genreIds.length > 0 && genreIds.every(id => activeCluster.conflictingGenres.includes(id));

    if (!isArchetype && lexicalHits === 0 && (isPureConflicting || !hasExpectedGenre)) {
      return 30; // Rejet catégorique : ni mot clé, ni genre compatible
    }
  }

  // 3. Calcul continu multi-critères
  // A. Sous-score Personne / Acteur (si mentionné dans la requête)
  let hasPersonInQuery = false;
  let personScore = 100;
  const personKeywords = ['dicaprio', 'leonardo', 'nolan', 'tarantino', 'pitt', 'cruise', 'scorsese', 'denzel', 'jolie', 'angelina', 'damon', 'hanks', 'depp', 'bale'];
  for (const pk of personKeywords) {
    if (queryLower.includes(pk)) {
      hasPersonInQuery = true;
      const inOverview = overviewLower.includes(pk);
      const inTitle = titleLower.includes(pk);
      // Les films proposés par le LLM pour un acteur ont déjà l'acteur validé
      personScore = (inOverview || inTitle || llmMatch) ? 100 : 50;
      break;
    }
  }

  // B. Sous-score Thématique / Narratif
  const queryWords = queryLower.split(/[\s,.'’"-]+/).filter(w => w.length > 2);
  const stopWords = ['film', 'films', 'serie', 'series', 'avec', 'dans', 'pour', 'les', 'des', 'une', 'qui', 'par', 'sur', 'lequel', 'laquelle', 'elle', 'lui', 'est', 'sont', 'ete', 'été'];
  const nonPersonWords = queryWords.filter(w => !personKeywords.some(pk => pk.includes(w) || w.includes(pk)) && !stopWords.includes(w));
  const hasNarrativeIntent = Boolean(activeCluster) || nonPersonWords.length >= 2;

  const movieYear = parseInt((movie.release_date || movie.first_air_date || '').slice(0, 4), 10);
  const is70s = (queryLower.includes('70') || queryLower.includes('seventies')) && movieYear >= 1968 && movieYear <= 1981;
  const is80s = (queryLower.includes('80') || queryLower.includes('eighties')) && movieYear >= 1978 && movieYear <= 1991;
  const is90s = (queryLower.includes('90') || queryLower.includes('nineties')) && movieYear >= 1988 && movieYear <= 2001;
  const isEraMatch = is70s || is80s || is90s;

  const isDramaticActorIntent = hasPersonInQuery && /dramatique|drame|serieux|sérieux|sombre/i.test(queryLower);
  const isExclusionIntent = queryLower.includes('sans ') || queryLower.includes('pas de ') || queryLower.includes("pas d'");

  let narrativeScore = 50;
  if (activeCluster) {
    const isArchetype = activeCluster.archetypes.some(a => titleLower === a || origLower === a || titleLower.includes(a));
    if (isArchetype) {
      narrativeScore = 98;
    } else {
      let hits = 0;
      for (const kw of activeCluster.primaryKeywords) {
        if (overviewLower.includes(kw) || titleLower.includes(kw)) hits += 3;
      }
      for (const kw of activeCluster.secondaryKeywords) {
        if (overviewLower.includes(kw)) hits += 1.5;
      }
      if (hits > 0) {
        narrativeScore = Math.min(100, Math.max(50, 60 + hits * 8));
      } else if (llmMatch && llmMatch.reason && llmMatch.reason.length > 15) {
        narrativeScore = Math.min(85, Math.max(70, llmMatch.match_rate || 75));
      } else {
        const isAnimationOrFamily = genreIds.includes(16) || genreIds.includes(10751);
        narrativeScore = isAnimationOrFamily ? 10 : 25;
      }
    }
  } else if (isEraMatch) {
    narrativeScore = (genreIds.includes(878) || genreIds.includes(53) || genreIds.includes(18)) ? 94 : 85;
  } else if (isDramaticActorIntent && genreIds.includes(18)) {
    narrativeScore = 95;
  } else if (isExclusionIntent) {
    const sansMatch = queryLower.match(/(?:sans|pas d['e])\s+([a-zà-ÿ0-9'-]+)/i);
    const excludedWord = sansMatch ? sansMatch[1].toLowerCase() : '';
    if (excludedWord && (overviewLower.includes(excludedWord) || titleLower.includes(excludedWord))) {
      narrativeScore = 25; // Contient l'élément interdit
    } else {
      narrativeScore = llmMatch ? 90 : 80;
    }
  } else if (/\b(impression d['e]|comme si|sensation d['e]|ambiance de|atmosphère de|donne l'impression|sentiment d['e])\b/i.test(queryLower) || ((queryLower.includes('ascenseur') || queryLower.includes('enferm')) && (queryLower.includes('pluie') || queryLower.includes('sombre')))) {
    const isAtmospheric = genreIds.some(id => [53, 27, 9648, 80, 18, 878].includes(id)) || llmMatch;
    narrativeScore = isAtmospheric ? (llmMatch ? Math.max(88, llmMatch.match_rate || 88) : 90) : 60;
  } else if (nonPersonWords.length >= 2) {
    let hits = 0;
    for (const w of nonPersonWords) {
      if (overviewLower.includes(w) || titleLower.includes(w)) hits++;
    }
    if (hits >= 2) {
      narrativeScore = 94;
    } else if (hits === 1) {
      narrativeScore = (llmMatch && llmMatch.reason && llmMatch.reason.length > 15)
        ? Math.min(88, Math.max(75, llmMatch.match_rate || 80))
        : 48;
    } else {
      narrativeScore = (llmMatch && llmMatch.reason && llmMatch.reason.length > 20)
        ? Math.min(82, Math.max(70, llmMatch.match_rate || 75))
        : 20;
    }
  } else if (nonPersonWords.length === 1) {
    const w = nonPersonWords[0];
    const hit = overviewLower.includes(w) || titleLower.includes(w);
    narrativeScore = hit ? 90 : ((llmMatch && llmMatch.reason && llmMatch.reason.length > 15) ? 75 : 25);
  } else if (llmMatch) {
    narrativeScore = Math.max(70, (llmMatch.match_rate || 75));
  }

  // C. Sous-score Genre
  let genreScore = 75;
  if (isDramaticActorIntent && genreIds.includes(18)) {
    genreScore = 95;
  } else if (queryLower.includes('sf') || queryLower.includes('science-fiction')) {
    genreScore = genreIds.includes(878) ? 95 : 60;
  } else if (activeCluster) {
    const isAnimationOrFamily = genreIds.includes(16) || genreIds.includes(10751);
    if (isAnimationOrFamily) {
      genreScore = 20;
    } else if (activeCluster.expectedGenres.some(id => genreIds.includes(id))) {
      genreScore = 95;
    } else if (genreIds.includes(18)) { // Drame
      genreScore = 70;
    } else {
      genreScore = 40;
    }
  }

  // D. Composante Bayésienne de Qualité
  const bayesRating = voteCount > 0
    ? (voteCount * voteAvg + 1000 * 6.5) / (voteCount + 1000)
    : 6.5;
  const qualityDelta = (bayesRating - 7.0) * 2.5; // [-4, +4]

  // E. Synthèse pondérée continue
  const composite = hasPersonInQuery
    ? (personScore * 0.35) + (narrativeScore * 0.45) + (genreScore * 0.20) + qualityDelta
    : (narrativeScore * 0.70) + (genreScore * 0.30) + qualityDelta;

  // RÈGLE CARDINALE : Si la requête contient une description narrative explicite
  // et que le score narratif/thématique est insuffisant (< 50) sans validation LLM détaillée,
  // disqualification immédiate.
  if (hasNarrativeIntent && narrativeScore < 50 && (!llmMatch || !llmMatch.reason || llmMatch.reason.length < 15)) {
    return Math.min(30, Math.round(narrativeScore));
  }

  let finalScore = Math.min(99, Math.max(25, Math.round(composite)));

  // ==========================================================================
  // RÈGLE CARDINALE DE VALIDATION CROISÉE MULTI-FACETTES
  // Instruction 2 : Un film NE PEUT PAS dépasser 70% de match s'il ne valide
  //                 qu'une seule des deux composantes.
  // Prioriser les œuvres hybrides réelles (Lockout, Solo, Cowboy Bebop, Outland, Rogue One, etc.)
  // Pénaliser sévèrement les mismatches interdits (survie solitaire, drame contemplatif).
  // ==========================================================================
  const activeFacets = (facets && facets.is_multi_facet) ? facets : detectHeuristicFacets(queryText);

  if (activeFacets && activeFacets.is_multi_facet) {
    const isHeistAction = (activeFacets.core_action.includes('braquage') || activeFacets.core_action.includes('heist') || activeFacets.core_action.includes('casse'));
    const isSpaceSetting = (activeFacets.setting.includes('espace') || activeFacets.setting.includes('spatial') || activeFacets.setting.includes('station'));

    if (isHeistAction && isSpaceSetting) {
      const SPACE_HEIST_HYBRIDS = [
        'lockout', 'solo: a star wars story', 'solo', 'cowboy bebop', 'cowboy bebop: le film',
        'cowboy bebop: knockin\' on heaven\'s door', 'outland', 'outland ...loin de la terre',
        'rogue one: a star wars story', 'rogue one', 'les gardiens de la galaxie', 'guardians of the galaxy',
        'les gardiens de la galaxie vol. 2', 'guardians of the galaxy vol. 2', 'la planète au trésor',
        'treasure planet', 'titan a.e.', 'titan ae', 'serenity', 'space sweepers', 'le cinquième élément', 'the fifth element'
      ];
      const isKnownHybrid = SPACE_HEIST_HYBRIDS.some(h => titleLower === h || origLower === h || titleLower.includes(h));

      const hasActionFacet = (genreIds.includes(80) || genreIds.includes(28) || genreIds.includes(53)) ||
        /\b(braquage|braquages|braquer|braqueur|braqueurs|casse|hold-up|cambriolage|heist|vol|voler|d[eé]rober|coffre-fort|butin|pillage|piraterie|pirate|contrebande|contrebandier)\b/i.test(overviewLower + ' ' + titleLower);

      const hasSettingFacet = (genreIds.includes(878) || genreIds.includes(12)) ||
        /\b(espace|spatial|spatiale|vaisseau|station spatiale|orbite|orbital|galaxie|plan[eè]te|cosmos|cosmique|interstellaire|stellaire|alien|aliens)\b/i.test(overviewLower + ' ' + titleLower);

      const isStrictHybrid = isKnownHybrid || (hasActionFacet && hasSettingFacet);

      // Vérification des mismatches interdits (ex: survie solitaire ou drame familial contemplatif)
      const isForbiddenMismatch =
        ['interstellar', 'seul sur mars', 'the martian', 'gravity', 'ad astra', 'first man', 'solaris', "2001 : l'odyssée de l'espace", "2001: a space odyssey"]
          .some(bad => titleLower === bad || origLower === bad || titleLower.includes(bad)) ||
        (/\b(survie solitaire|survie|trou noir|trous noirs|trou de ver|relativit[eé]|seul sur|solitude|drame familial|retrouver sa fille|voyage contemplatif)\b/i.test(overviewLower) && !hasActionFacet);

      if (isForbiddenMismatch) {
        // Disqualification / pénalisation sévère immédiate : max 35%
        return Math.min(35, finalScore);
      }

      if (isStrictHybrid) {
        movie.is_hybrid_match = true;
        // Priorité maximale en tête de liste : 88% à 98%
        return Math.min(98, Math.max(88, finalScore));
      }

      // Le film ne valide qu'une seule composante (soit espace seul, soit braquage seul)
      // RÈGLE STRICTE : UN FILM NE PEUT PAS DÉPASSER 70% DE MATCH S'IL NE VALIDE QU'UNE SEULE COMPOSANTE
      return Math.min(68, Math.max(30, finalScore));
    } else {
      // Cas générique multi-facettes
      const hasAction = /\b(action|combat|braquage|duel|espion|enquête|course|vol)\b/i.test(overviewLower + ' ' + titleLower);
      const hasSetting = /\b(espace|spatial|western|époque|cyberpunk|futur|désert|mer)\b/i.test(overviewLower + ' ' + titleLower);
      const isBoth = hasAction && hasSetting;
      if (!isBoth) {
        return Math.min(68, finalScore); // Plafonné à 68% (<= 70%)
      }
    }
  }

  return finalScore;
}

// ============================================================================
// Helper : Filtre Anti-Mockbuster & Anti-Titres Parasites
// Alignement strict sur les directives LLM (> 500 votes, note > 5.5).
// Deux axes de rejet indépendants :
//   1. Qualité insuffisante (seuil minimal de notoriété et de note)
//   2. Titre parasite : le film partage un seul mot avec la requête en y ajoutant
//      des termes parasites, sans lien scénaristique réel dans son synopsis.
//      Ce motif de rejet est TOTALEMENT INDÉPENDANT de la note du film.
// ============================================================================
function filterMockbusters(movies, queryText) {
  if (!Array.isArray(movies) || movies.length === 0) return [];

  // Mots significatifs de la requête (longueur >= 4, hors mots vides)
  const queryTokens = (queryText || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

  const filtered = movies.filter(m => {
    // Rejet catégorique immédiat des talk-shows, interviews d'acteurs et contenus non-fictionnels
    if (isDisqualifiedNonFiction(queryText, m)) return false;

    const avg = Number(m.vote_average || 0);
    const cnt = Number(m.vote_count || 0);
    const titleLower = (m.title || m.original_title || '').toLowerCase();
    const overviewLower = (m.overview || '').toLowerCase();

    // 0. Bénéfice du doute si aucune donnée de vote disponible (film non encore coté)
    if (avg === 0 && cnt === 0) return true;

    // ── AXE 1 : Seuils de qualité alignés sur les directives LLM ──────────
    // Directive : "au moins 500 votes ET note > 5.5"
    // Protection : les grands classiques / blockbusters établis (cnt >= 5000)
    if (cnt >= 5000) {
      if (avg > 0 && avg < 4.0) return false; // Vraiment mauvais malgré la notoriété
    } else if (cnt > 0 && cnt < 500 && avg < 5.5) {
      // Échec aux critères minimaux de qualité TMDB (> 500 votes et > 5.5/10)
      return false;
    } else if (avg > 0 && avg < 4.0 && cnt >= 20) {
      // Franchement mauvais confirmé
      return false;
    }

    // ── AXE 2 : Titre parasite (REJET INDÉPENDANT DU SCORE DE NOTES) ──────
    // Détection : le nom du film ne partage qu'un mot avec la requête tout en
    // ajoutant des termes externes (ex: "Bikini Inception" pour "Inception"),
    // sans qu'aucun lien scénaristique réel ne soit présent dans le synopsis.
    // Protection : films très populaires (cnt >= 5000) protégés.
    if (queryTokens.length > 0 && cnt < 5000) {
      const titleWords = titleLower
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

      // Mots du titre empruntés à la requête
      const sharedQueryWords = queryTokens.filter(qt =>
        titleWords.some(tw => tw === qt || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
      );

      // Mots du titre n'appartenant pas à la requête (= ajouts opportunistes)
      const extraWords = titleWords.filter(tw =>
        !queryTokens.some(qt => qt === tw || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
      );

      // Le film partage un seul mot clé avec la requête et contient des mots additionnels
      const isParasiteTitle = sharedQueryWords.length === 1 && extraWords.length > 0;

      if (isParasiteTitle) {
        // Vérification de lien scénaristique réel dans le synopsis
        const narrativeConfirmed = queryTokens.some(qt => overviewLower.includes(qt));
        // Sans confirmation scénaristique réelle → rejet IMMÉDIAT et INDÉPENDANT de la note
        if (!narrativeConfirmed) {
          return false;
        }
      }
    }

    return true;
  });

  // Déduplication par base de titre (évite les suites non officielles en doublons)
  const seenTitleBases = new Set();
  const deduplicated = filtered.filter(m => {
    const titleBase = (m.title || m.original_title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
      .replace(/\s*(2|3|4|5|ii|iii|iv|v|part 2|part two|suite|sequel)\s*$/i, '')
      .trim();
    if (titleBase.length < 2) return true;
    if (seenTitleBases.has(titleBase)) return false;
    seenTitleBases.add(titleBase);
    return true;
  });

  return deduplicated;
}


// ============================================================================
// Helper : Déduplication + enrichissement badge Éliciné
// ============================================================================
export function enrichWithBadges(rawMovies, matches = [], badgeLabel = 'Sélection Éliciné', queryText = '', clusterId = null, facets = null, identity = movie => movie.id || movie.tmdb_id || movie.title) {
  if (!Array.isArray(rawMovies) || rawMovies.length === 0) return [];

  const seenIds = new Set();
  const unique = [];
  for (const movie of rawMovies) {
    const key = identity(movie);
    if (!seenIds.has(key)) { seenIds.add(key); unique.push(movie); }
  }

  const effectiveClusterId = clusterId || detectThematicClusterId(queryText);

  return unique.map(movie => {
    const movieTitleLower = (movie.title || '').toLowerCase().trim();
    const movieOrigLower  = (movie.original_title || '').toLowerCase().trim();

    let matchingLLM = matches.find(m => {
      const ml = (m.title || '').toLowerCase().trim();
      return ml === movieTitleLower || (movieOrigLower && ml === movieOrigLower);
    });
    if (!matchingLLM) {
      matchingLLM = matches.find(m => {
        const ml = (m.title || '').toLowerCase().trim();
        return movieTitleLower.includes(ml) || ml.includes(movieTitleLower) ||
               (movieOrigLower && (movieOrigLower.includes(ml) || ml.includes(movieOrigLower)));
      });
    }

    // Score dynamique basé sur la sémantique et la qualité du film
    const dynamicScore = calculateSemanticMatchScore(movie, queryText, matchingLLM, facets);

    const mId = movie.id || movie.tmdb_id;
    let justification = matchingLLM?.reason || null;

    if (mId && effectiveClusterId) {
      const cached = getCachedJustification(mId, effectiveClusterId);
      if (cached) {
        justification = cached;
      } else if (justification) {
        setCachedJustification(mId, effectiveClusterId, justification);
      }
    }

    return {
      ...movie,
      ai_badge: badgeLabel,
      badge: badgeLabel,
      ai_match_reason: justification || "Sélectionné par l'algorithme Éliciné",
      match_rate: dynamicScore,
      is_hybrid_match: Boolean(movie.is_hybrid_match)
    };
  });
}

export default async function handler(req, res) {
  // Phase 12: one request-scoped correlation ID follows the complete pipeline.
  // Only the POST search route is persisted; quota/TMDB/legacy vector proxy
  // responses keep their existing behaviour and are not search summaries.
  const telemetry = createSearchTelemetry({
    rawQuery: req.body?.query || req.body?.searchQuery || req.body?.prompt || '',
    locale: req.body?.locale || req.headers?.['accept-language'] || null
  });
  res.setHeader('x-elicine-search-query-id', telemetry.queryId);
  res.setHeader('x-elicine-search-id', telemetry.searchId);
  res.setHeader('x-elicine-search-engine', getSearchEngineMode());
  const originalJson = res.json.bind(res);
  const requestAction = req.query?.action || req.body?.action;
  const shouldPersistTelemetry = req.method === 'POST' &&
    (!requestAction || requestAction === 'search');
  res.json = async (payload) => {
    try {
      finalizeSearchTelemetry(telemetry, payload, res.statusCode || 200);
    } catch (_) {
      // Observability must never affect the current engine.
    }
    if (shouldPersistTelemetry) {
      const persistence = await persistSearchTelemetry({
        client: supabaseServer,
        telemetry,
        payload,
        statusCode: res.statusCode || 200
      });
      if (persistence?.error && String(process.env.SEARCH_OBSERVABILITY_LOGS || '').toLowerCase() === 'true') {
        console.warn('[Éliciné SearchTelemetry] persistence unavailable');
      }
    }
    return originalJson(payload);
  };

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    addSearchTelemetryPath(telemetry, 'handler_started');
    // Limiteur de requêtes : 20 requêtes par minute par IP
    const limiter = checkRateLimit(req, res, { max: 20, windowMs: 60 * 1000 });
    if (!limiter.allowed) {
      return;
    }

    const sessionInfo = await verifyServerSession(req);
    const isPro = sessionInfo.isPro || sessionInfo.isBypassQuotas;
    const effectiveUserKey = sessionInfo.effectiveUserId;
    const ipHash = sessionInfo.ipHash;
    const ipStorageKey = `ip_${ipHash}`;
    const todayDate = new Date().toISOString().split('T')[0];

    const action = req.query?.action || req.body?.action;

    // ─── Action : Proxy TMDB officiel (/api/tmdb ou action=tmdb) ───────────────
    if (action === 'tmdb' || (req.method === 'GET' && req.query?.endpoint)) {
      const apiKey = req.query.api_key || process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Service de données cinématographiques indisponible' });
      }

      const { endpoint, action: _act, api_key: _k, ...params } = req.query;
      if (!endpoint) {
        return res.status(400).json({ error: 'Paramètre endpoint manquant' });
      }

      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (k !== 'endpoint' && k !== 'api_key' && k !== 'action' && v !== undefined && v !== null && v !== '') {
          searchParams.set(k, String(v));
        }
      }

      searchParams.set('api_key', apiKey);
      if (!searchParams.has('language') && !searchParams.has('include_video_language')) {
        searchParams.set('language', params.language || 'fr-FR');
      }

      try {
        const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${searchParams.toString()}`;
        const countryHeader = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'];
        if (countryHeader) {
          res.setHeader('x-user-country', String(countryHeader).toUpperCase().trim());
        }

        const response = await fetch(tmdbUrl);
        const data = await response.json();
        return res.status(response.status).json(data);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ─── Action : Consultation du quota quotidien ──────────────────────────────
    if (action === 'quota' || (req.method === 'GET' && !action)) {
      if (isPro) {
        return res.status(200).json({
          remaining: 999,
          max: 3,
          searchCount: 0,
          today: todayDate,
          isPro: true,
          isAdmin: Boolean(sessionInfo.isAdmin)
        });
      }

      let count = getMemoryDailyQuota(ipHash, todayDate);

      if (supabaseServer) {
        try {
          const { data: ipData } = await supabaseServer
            .from('user_searches')
            .select('search_count')
            .eq('user_id', ipStorageKey)
            .eq('search_date', todayDate)
            .maybeSingle();

          if (ipData && typeof ipData.search_count === 'number') {
            count = Math.max(count, ipData.search_count);
          }

          if (effectiveUserKey && effectiveUserKey !== ipStorageKey) {
            const { data: userData } = await supabaseServer
              .from('user_searches')
              .select('search_count')
              .eq('user_id', effectiveUserKey)
              .eq('search_date', todayDate)
              .maybeSingle();

            if (userData && typeof userData.search_count === 'number') {
              count = Math.max(count, userData.search_count);
            }
          }
        } catch (err) {
          console.warn('[API /api/search] Erreur lecture quota Supabase :', err?.message);
        }
      }

      const remaining = Math.max(0, 3 - count);
      return res.status(200).json({
        remaining,
        max: 3,
        searchCount: count,
        today: todayDate,
        isPro: false
      });
    }

    // ─── Action : Recherche vectorielle directe Supabase (Compatibilité existante) ──
    if (req.method === 'POST' && action === 'vector') {
      const { queryEmbedding, matchThreshold = 0.40, matchCount = 10 } = req.body || {};
      
      if (supabaseServer && Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
        try {
          let currentThreshold = Number(matchThreshold) || 0.40;
          let { data, error } = await supabaseServer.rpc('match_movies', {
            query_embedding: queryEmbedding,
            match_threshold: currentThreshold,
            match_count: Number(matchCount) || 10
          });

          // Instruction 2 : Abaissement dynamique du seuil si moins de 3 résultats (Relaxed Similarity Fallback)
          if ((!data || data.length < 3) && currentThreshold > 0.20) {
            const relaxedThreshold = Math.max(0.20, currentThreshold - 0.20);
            recordFallback(telemetry, {
              reason: FALLBACK_REASONS.FALLBACK_USED,
              source: 'legacy_vector_threshold',
              relaxationApplied: true
            });
            console.log(`[API /api/search] [Vector] Moins de 3 résultats (${data?.length || 0}) → Abaissement dynamique du seuil de ${currentThreshold} à ${relaxedThreshold}`);
            const relaxedRes = await supabaseServer.rpc('match_movies', {
              query_embedding: queryEmbedding,
              match_threshold: relaxedThreshold,
              match_count: Number(matchCount) || 10
            });
            if (!relaxedRes.error && Array.isArray(relaxedRes.data) && relaxedRes.data.length > (data?.length || 0)) {
              data = relaxedRes.data;
              currentThreshold = relaxedThreshold;
              telemetry.fallbackUsed = true;
            }
          }

          if (!error && Array.isArray(data) && data.length > 0) {
            const topScore = data[0]?.similarity || 0;
            return res.status(200).json({
              success: true,
              movies: data,
              similarityScore: topScore,
              isLowSimilarity: topScore < (Number(matchThreshold) || 0.40)
            });
          }
        } catch (rpcErr) {
          console.warn('[API /api/search] RPC match_movies non disponible :', rpcErr?.message);
        }
      }

      return res.status(200).json({
        success: true,
        movies: [],
        similarityScore: 0,
        isLowSimilarity: true,
        message: "Aucun résultat correspondant aux critères dans notre catalogue"
      });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // ARCHITECTURE "LLM-FIRST" (Routage par IA & Supabase)
    // ════════════════════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const rawQuery = req.body?.query || req.body?.searchQuery || req.body?.prompt || '';
      const cleanQuery = sanitizeUserQuery(rawQuery);

      if (!cleanQuery) {
        return res.status(400).json({
          error: "Requête de recherche vide ou invalide après assainissement.",
          success: false
        });
      }

      // Vérification des filtres avancés réservés aux membres Pro
      const filters = req.body?.filters;
      const hasActiveFilters = Boolean(
        filters && (
          (filters.platform && filters.platform !== 'all') ||
          (filters.minRating && Number(filters.minRating) > 0) ||
          (filters.mediaType && filters.mediaType !== 'Tous')
        )
      );

      if (hasActiveFilters && !isPro) {
        return res.status(403).json({
          success: false,
          code: "PRO_REQUIRED",
          error: "Les filtres de recherche avancés (note minimale, plateformes de streaming) sont réservés aux abonnés Pass Pro. Activez votre Pass Pro pour débloquer ces options."
        });
      }

      // Contrôle du quota journalier (3 recherches / jour pour les utilisateurs gratuits)
      if (!isPro) {
        const memoryCount = getMemoryDailyQuota(ipHash, todayDate);
        if (memoryCount >= 3) {
          return res.status(403).json({
            error: "Quota journalier atteint (3/3 recherches gratuites pour cette adresse IP). Passez au compte Pro pour un accès illimité.",
            code: "QUOTA_EXCEEDED",
            quotaExceeded: true,
            remaining: 0,
            max: 3
          });
        }
      }

      // 1. Parsing sémantique des intentions de format :
      let requestedMediaType = filters?.mediaType || 'Tous';
      if (requestedMediaType === 'Tous') {
        const queryToParse = (req.body?.rawQuery || cleanQuery || '').toLowerCase();
        const shielded = queryToParse
          .replace(/tueur(?:s)?\s+en\s+s[ée]rie(?:s)?/gi, '__TK__')
          .replace(/meurtre(?:s)?\s+en\s+s[ée]rie(?:s)?/gi, '__MK__')
          .replace(/serial\s+killer(?:s)?/gi, '__SK__');
        if (/\b(?:s[ée]rie(?:s)?|saison(?:s)?|[ée]pisode(?:s)?|feuilleton(?:s)?|tv\s*show(?:s)?)\b/i.test(shielded)) {
          requestedMediaType = 'Séries TV';
        } else if (/\b(?:film(?:s)?|movie(?:s)?|long\s*m[ée]trage(?:s)?|cin[ée]ma)\b/i.test(shielded)) {
          requestedMediaType = 'Films';
        }
      }

      console.log(`[API /api/search] [LLM-First] Lancement pipeline pour : "${cleanQuery}" (format: ${requestedMediaType})`);

      // ─── ÉTAPE 1 : Interprétation sémantique systématique (LLM Semantic Expansion) ──
      const llmResult = await queryLlmCandidates(cleanQuery, {
        groqApiKey:     req.body?.groqApiKey,
        deepseekApiKey: req.body?.deepseekApiKey,
        qwenApiKey:     req.body?.qwenApiKey,
        geminiApiKey:   req.body?.geminiApiKey,
        openAiApiKey:   req.body?.openAiApiKey || req.body?.openaiApiKey
      }, requestedMediaType, telemetry);

      const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || req.body?.tmdbApiKey || '').trim();
      const tmdbResolutionCache = new Map();
      const hybridEnabled = isHybridRetrievalEnabled();
      const retrievalClient = createTmdbRetrievalClient({ apiKey: tmdbKey, cache: tmdbResolutionCache, telemetry });
      const vectorEnabled = isVectorRetrievalEnabled();
      const queryEmbedding = vectorEnabled ? createQueryEmbeddingService({
        client: createEmbeddingClient(), telemetry
      }) : null;
      const orchestration = await orchestrateSearch({
        interpreted: llmResult,
        cleanQuery: req.body?.rawQuery || cleanQuery,
        requestedMediaType,
        enforceRequestedMediaType: hybridEnabled,
        recoverFallbackSignals: hybridEnabled,
        telemetry,
        resolveEntities: async (canonicalIntent) => {
          const titleContext = await resolveKnownTitles(canonicalIntent, {
            searchCandidates: (title, type) => hybridEnabled ? retrievalClient.search(title, type) : searchTmdbCandidates(
              title, type, null, tmdbKey, tmdbResolutionCache
            )
          });
          const personContext = hybridEnabled
            ? await resolveKnownPeople(llmResult.people || [], {
              searchPeople: name => retrievalClient.person(name)
            })
            : { resolvedPeople: [], unresolvedPeople: [], metrics: {} };
          return {
            ...titleContext,
            resolvedPeople: personContext.resolvedPeople,
            unresolvedPeople: personContext.unresolvedPeople,
            metrics: { ...titleContext.metrics, ...personContext.metrics }
          };
        }
      });
      const orchestratedLlmResult = orchestration.interpreted;

      const {
        media_type: extractedMediaType = 'all',
        primary_genres: primaryGenres = [],
        mood_tags: moodTags = [],
        reference_titles: referenceTitles = [],
        clean_query: llmCleanQuery = '',
        suggested_mood: rawSuggestedMood = '',
        atmosphere_summary: rawAtmosphereSummary = '',
        recommended_titles: rawRecommendedTitles = [],
        matches = [],
        facets: extractedFacets = null,
        provider = 'Algorithme Éliciné'
      } = orchestratedLlmResult;

      // Consolidation du format recherché
      if (extractedMediaType && extractedMediaType !== 'all') {
        if (extractedMediaType === 'tv' && requestedMediaType === 'Tous') requestedMediaType = 'Séries TV';
        if (extractedMediaType === 'movie' && requestedMediaType === 'Tous') requestedMediaType = 'Films';
      }
      telemetry.detectedConstraints = {
        requestedMediaType,
        primaryGenres: Array.isArray(primaryGenres) ? primaryGenres : [],
        moods: Array.isArray(moodTags) ? moodTags : [],
        references: Array.isArray(referenceTitles) ? referenceTitles.length : 0
      };
      addSearchTelemetryPath(telemetry, 'llm_completed', { provider });

      // Requête nettoyée prioritaire
      const effectiveCleanQuery = llmCleanQuery || cleanQuery;

      // Libellé d'ambiance reformulé proprement
      const emotionalExpansion = detectEmotionalExpansion(cleanQuery);
      let suggestedMood = rawAtmosphereSummary || rawSuggestedMood;
      if (!suggestedMood) {
        if (primaryGenres.length > 0 && moodTags.length > 0) {
          suggestedMood = `${primaryGenres.slice(0, 2).join(' / ')} (${moodTags.slice(0, 2).join(', ')})`;
        } else if (emotionalExpansion?.label) {
          suggestedMood = emotionalExpansion.label;
        } else if (primaryGenres.length > 0) {
          suggestedMood = primaryGenres.slice(0, 2).join(' / ');
        } else {
          suggestedMood = cleanQuery;
        }
      }

      console.log(`[API /api/search] [Étape 1 LLM] Provider: ${provider} | Ambiance: "${suggestedMood}" | Genres: [${primaryGenres.join(', ')}] | Moods: [${moodTags.join(', ')}] | Références: [${referenceTitles.join(', ')}] | clean_query: "${effectiveCleanQuery}"`);

      // ─── PRIORITÉ 1 — Résolution directe des titres recommandés par le LLM ──
      // Lorsque le LLM renvoie une liste de titres conseillés (ex: pour "Avengers Doomsday" -> [Infinity War, Endgame, Loki...]) :
      // - Boucler sur chaque titre et appeler TMDB (/3/search/tv si tv, /3/search/movie si movie)
      // - Extraire la première fiche TMDB avec une affiche valide (poster_path)
      // - SI au moins 1 ou 2 titres sont validés par TMDB :
      //   * Ces films constituent la réponse FINALE à renvoyer au frontend
      //   * DÉSACTIVER IMMÉDIATEMENT tout appel au fallback de genre
      //   * Conserver les badges exacts ("FILM" ou "SÉRIE")
      const candidateList = (Array.isArray(rawRecommendedTitles) && rawRecommendedTitles.length > 0)
        ? rawRecommendedTitles
        : (Array.isArray(matches) && matches.length > 0)
          ? matches.map(m => ({ title: m.title, type: extractedMediaType === 'tv' ? 'tv' : 'movie', reason: m.reason }))
          : referenceTitles.map(t => ({ title: t, type: extractedMediaType === 'tv' ? 'tv' : 'movie' }));

      const hybridPool = await orchestrateCandidateRetrieval({
        orchestration,
        services: {
          ...retrievalClient,
          lexical: createSupabaseLexicalSource(supabaseServer),
          vector: vectorEnabled ? createSupabaseVectorSource({ client: supabaseServer, queryEmbedding, telemetry }) : null,
          legacy: options => retrieveLegacyHints(candidateList, orchestration.resolvedIntentContext, retrievalClient, options)
        },
        context: { telemetry, tmdbResolutionCache }
      });
      const useHybrid = hybridPool !== null;
      const usingElicineRanking = useHybrid && telemetry.rankingAttempted;

      let directTmdbMovies = [];
      const seenTmdbIds = new Set();
      const seenTitles = new Set();

      if (!useHybrid && tmdbKey && candidateList.length > 0) {
        addSearchTelemetryPath(telemetry, 'tmdb_direct_resolution_started', { titleCount: candidateList.length });
        console.log(`[API /api/search] [Priorité 1 Direct TMDB] Résolution chirurgicale de ${candidateList.length} titre(s) LLM...`);
        const resolvedList = await Promise.all(
          candidateList.slice(0, 10).map(async (item) => {
            const hit = await fetchExactTmdbCandidate(item.title, item.type, item.release_year, tmdbKey, tmdbResolutionCache);
            if (!hit || !hit.poster_path) return null;

            const isActuallyTv = item.type === 'tv' || hit.media_type === 'tv' || Boolean(hit.first_air_date) || Boolean(hit.name && !hit.title);
            const resolvedType = isActuallyTv ? 'tv' : 'movie';
            const badge = isActuallyTv ? 'SÉRIE' : 'FILM';

            return {
              id: hit.id,
              tmdb_id: hit.id,
              title: hit.title || hit.name || item.title,
              original_title: hit.original_title || hit.original_name || item.title,
              overview: hit.overview || item.reason || '',
              poster_path: `https://image.tmdb.org/t/p/w500${hit.poster_path}`,
              backdrop_path: hit.backdrop_path ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}` : null,
              release_date: hit.release_date || hit.first_air_date || (item.release_year ? `${item.release_year}-01-01` : ''),
              vote_average: hit.vote_average || 7.5,
              vote_count: hit.vote_count || 500,
              genres: Array.isArray(hit.genre_ids) ? hit.genre_ids.join(',') : '',
              genre_ids: hit.genre_ids || [],
              media_type: resolvedType,
              badge: badge,
              ai_badge: badge,
              ai_match_reason: item.reason || `Sélectionné pour sa cohérence parfaite avec "${item.title}"`,
              match_rate: item.match_percentage || 95
            };
          })
        );

        for (const m of resolvedList) {
          if (m && !seenTmdbIds.has(m.id)) {
            const normTitle = (m.title || m.original_title || '').toLowerCase().trim();
            if (!seenTitles.has(normTitle)) {
              seenTitles.add(normTitle);
              seenTmdbIds.add(m.id);
              directTmdbMovies.push(m);
            }
          }
        }
        recordSearchCandidateCount(telemetry, 'tmdbDirect', directTmdbMovies.length);
      }

      // SI au moins 1 ou 2 titres sont validés par TMDB :
      // Réponse finale immédiate, blocage absolu du fallback de genre
      if (directTmdbMovies.length >= 1) {
        console.log(`[API /api/search] [Priorité 1 Succès] ${directTmdbMovies.length} titre(s) validé(s) par TMDB. Blocage absolu du fallback.`);

        if (requestedMediaType && requestedMediaType !== 'Tous') {
          if (requestedMediaType === 'Séries TV') {
            const seriesOnly = directTmdbMovies.filter(m => m.media_type === 'tv' || m.badge === 'SÉRIE');
            directTmdbMovies = seriesOnly;
          } else if (requestedMediaType === 'Films') {
            const filmsOnly = directTmdbMovies.filter(m => m.media_type === 'movie' || m.badge === 'FILM');
            directTmdbMovies = filmsOnly;
          }
        }

        if (directTmdbMovies.length === 0) {
          recordFallback(telemetry, {
            reason: FALLBACK_REASONS.NO_RELEVANT_RESULTS,
            source: 'direct_tmdb_media_type'
          });
        }

        if (directTmdbMovies.length > 0 && !isPro && ipHash) {
          incrementMemoryDailyQuota(ipHash, todayDate);
        }

        const editorialSummary = rawAtmosphereSummary || orchestratedLlmResult.atmosphere_summary || suggestedMood || cleanQuery;
        const thoughtMsg = editorialSummary.toLowerCase().startsWith('vision') || editorialSummary.toLowerCase().startsWith('atmosphère')
          ? editorialSummary
          : `Vision & Recommandation Éliciné — ${editorialSummary}`;

        if (directTmdbMovies.length > 0) return res.status(200).json({
          success: true,
          results: directTmdbMovies,
          movies: directTmdbMovies,
          count: directTmdbMovies.length,
          fallback_triggered: false,
          isFallbackMode: false,
          suggested_mood: editorialSummary,
          badge: 'Sélection Éliciné',
          thought: thoughtMsg,
          transparency_notice: null,
          is_transparency_mode: false,
          extractedTitles: candidateList.map(t => typeof t === 'string' ? t : t.title),
          providerUsed: provider || 'Algorithme Éliciné',
          suggestedPrompts: [
            'Une série policière sombre et addictive',
            'Un film de science-fiction dystopique',
            'Une comédie feel-good et touchante'
          ]
        });
      }

      // Résolution du cluster thématique (hérité du scoring client ou détecté)
      const explicitThematicCluster = req.body?.thematicCluster || null;
      const detectedThematicCluster = detectThematicClusterId(cleanQuery);
      const activeClusterId = explicitThematicCluster || detectedThematicCluster;
      const activeFacets = extractedFacets || detectHeuristicFacets(cleanQuery);

      // Exactly the historical scoring function, with only its redundant ID
      // deduplication adapted to TMDB's separate movie/TV ID namespaces.
      let resolvedMovies = useHybrid ? (usingElicineRanking
        ? hybridPool.map(candidate => toElicineRankedResult(candidate, 'Sélection Éliciné'))
        : enrichWithBadges(hybridPool.map(toLegacyRankingCandidate),
          matches, 'Sélection Éliciné', effectiveCleanQuery, activeClusterId, activeFacets,
          movie => `${movie.media_type}:${movie.tmdb_id}`)) : [];
      let fallbackTriggered = false;

      // ─── ÉTAPE 2 : Stratégie de récupération hybride multi-niveaux ─────────

      // Niveau 1 (Matching direct & vectoriel) : Exécuter la recherche vectorielle / sémantique avec la `clean_query`
      console.log(`[API /api/search] [Niveau 1] Matching direct & vectoriel sur : "${effectiveCleanQuery}"`);
      const directVectorHits = useHybrid ? [] : await executeDirectAndVectorSearch(effectiveCleanQuery, requestedMediaType, activeClusterId, activeFacets);
      recordSearchCandidateCount(telemetry, 'supabaseDirect', directVectorHits.length);
      if (directVectorHits.length > 0) {
        resolvedMovies.push(...directVectorHits);
        console.log(`[API /api/search] [Niveau 1] ${resolvedMovies.length} film(s) trouvé(s) via matching direct/vectoriel.`);
      }

      // Niveau 2 (Matching par références & genres) : Si le Niveau 1 renvoie moins de 4 films, élargir automatiquement
      if (!useHybrid && resolvedMovies.length < 4) {
        console.log(`[API /api/search] [Niveau 2] Niveau 1 renvoie ${resolvedMovies.length} (< 4) film(s) → Élargissement par références & genres`);
        const seenIds = new Set(resolvedMovies.map(m => m.id || m.tmdb_id));

        // 1. Les titres de reference_titles présents dans la base
        const allRefTitles = Array.from(new Set([
          ...(referenceTitles || []),
          ...matches.map(m => m.title)
        ])).filter(Boolean);

        if (allRefTitles.length > 0) {
          const refHits = await resolveByTitles(allRefTitles, matches, effectiveCleanQuery, activeClusterId, activeFacets);
          recordSearchCandidateCount(telemetry, 'supabaseTitles', refHits.length);
          console.log(`[API /api/search] [Niveau 2 - Références] ${refHits.length} film(s) de référence trouvé(s) dans la base.`);
          for (const rm of refHits) {
            const mId = rm.id || rm.tmdb_id;
            if (!seenIds.has(mId)) {
              seenIds.add(mId);
              resolvedMovies.push(rm);
            }
          }
        }

        // 2. Les films tagués avec primary_genres et mood_tags, triés par popularité / note critique décroissante
        if (resolvedMovies.length < 8 && (primaryGenres.length > 0 || moodTags.length > 0)) {
          console.log(`[API /api/search] [Niveau 2 - Genres & Tags] Interrogation OR sur genres [${primaryGenres.join(', ')}] et mood_tags [${moodTags.join(', ')}]`);
          const genreMoodHits = await resolveByGenresAndThemes(
            primaryGenres,
            moodTags,
            effectiveCleanQuery,
            matches,
            effectiveCleanQuery,
            activeClusterId,
            activeFacets
          );
          recordSearchCandidateCount(telemetry, 'supabaseGenresThemes', genreMoodHits.length);
          console.log(`[API /api/search] [Niveau 2 - Genres & Tags] ${genreMoodHits.length} film(s) correspondant(s).`);
          for (const gm of genreMoodHits) {
            const mId = gm.id || gm.tmdb_id;
            if (!seenIds.has(mId)) {
              seenIds.add(mId);
              resolvedMovies.push(gm);
              if (resolvedMovies.length >= 12) break;
            }
          }
        }

        // 3. Complément TMDB si toujours < 4 films dans Supabase
        if (resolvedMovies.length < 4) {
          console.log(`[API /api/search] [Niveau 2 - TMDB] Complément de recherche TMDB 1-pour-1...`);
          const tmdbKey = req.body?.tmdbApiKey || '';
          const tmdbHits = await resolveByKeywords(
            effectiveCleanQuery,
            matches.length > 0 ? matches : allRefTitles.map(t => ({ title: t })),
            tmdbKey,
            activeClusterId,
            activeFacets
          );
          for (const th of tmdbHits) {
            const mId = th.id || th.tmdb_id;
            if (!seenIds.has(mId)) {
              seenIds.add(mId);
              resolvedMovies.push(th);
              if (resolvedMovies.length >= 12) break;
            }
          }
        }
      }

      // Filtre anti-mockbuster
      if (resolvedMovies.length > 0) {
        const beforeCount = resolvedMovies.length;
        resolvedMovies = filterMockbusters(resolvedMovies, effectiveCleanQuery);
        console.log(`[API /api/search] [Anti-Mockbuster] ${beforeCount} → ${resolvedMovies.length} film(s) de qualité.`);
      }

      // Application des filtres Pro (ex: note minimale) si demandés
      if (filters?.minRating && Number(filters.minRating) > 0 && resolvedMovies.length > 0) {
        const minVal = Number(filters.minRating);
        resolvedMovies = resolvedMovies.filter(m => {
          const rating = Number(m.vote_average || m.rating || 0);
          return rating >= minVal;
        });
      }

      // Application du filtre strict de format (Films vs Séries TV)
      if (!useHybrid && requestedMediaType && requestedMediaType !== 'Tous' && resolvedMovies.length > 0) {
        if (requestedMediaType === 'Séries TV') {
          resolvedMovies = resolvedMovies.filter(m => m.media_type === 'SÉRIE' || m.media_type === 'tv');
        } else if (requestedMediaType === 'Films') {
          resolvedMovies = resolvedMovies.filter(m => m.media_type === 'FILM' || m.media_type === 'movie');
        }
      }

      // ─── ÉTAPE 3 : Règle absolue "Zéro Écran Vide" (Smart Fallback) ────────
      // ─── PRIORITÉ 2 : Blocage du Fallback Aveugle ──────────────────────────
      // Le bloc de code qui va chercher le top d'un genre (ex: with_genres=Drame/Thriller) ne doit s'exécuter QUE SI :
      // - L'appel LLM plante (erreur réseau / quota).
      // - OU le LLM n'a retourné aucun titre exploitable.
      // - Ne JAMAIS écraser la liste des titres précis trouvés par ce fallback.
      const hasIdentifiableIntent =
        primaryGenres.length > 0 ||
        moodTags.length > 0 ||
        referenceTitles.length > 0 ||
        Boolean(emotionalExpansion) ||
        Boolean(detectedThematicCluster) ||
        cleanQuery.trim().length >= 3;

      const llmHasNoUsableTitles = (!candidateList || candidateList.length === 0);

      if (!useHybrid && resolvedMovies.length === 0 && llmHasNoUsableTitles && hasIdentifiableIntent) {
        recordFallback(telemetry, {
          reason: FALLBACK_REASONS.FALLBACK_USED,
          source: 'legacy_genre_atmosphere'
        });
        console.log(`[API /api/search] [Priorité 2 Fallback] 0 résultat et 0 titre LLM exploitable → Déclenchement Smart Fallback sur genre principal "${primaryGenres[0] || 'Drame'}"`);
        const fallbackMovies = await resolveDominantGenreAtmosphere(
          primaryGenres,
          moodTags,
          effectiveCleanQuery,
          req.body?.tmdbApiKey || '',
          activeClusterId,
          // Sources were already attempted. Use the existing final offline safety
          // net, not a second network cascade (nor another LLM/quota charge).
          useHybrid
        );
        const admissibleFallback = orchestration.canonicalIntent ? filterStrictCandidates(
          fallbackMovies, orchestration.canonicalIntent, { telemetry }
        ).candidates : fallbackMovies;
        if (admissibleFallback.length > 0) {
          if (useHybrid && usingElicineRanking) {
            const fallbackCandidates = admissibleFallback
              .map(movie => toRetrievalCandidate(movie, 'fallback')).filter(Boolean);
            const rankedFallback = rankSearchCandidates(fallbackCandidates, orchestration.canonicalIntent,
              orchestration.resolvedIntentContext, { telemetry });
            resolvedMovies = diversifyRankedCandidates(rankedFallback, orchestration.canonicalIntent,
              orchestration.resolvedIntentContext, { telemetry }).slice(0, 6).map(candidate =>
              toElicineRankedResult(candidate, 'Recommandations Éliciné pour votre atmosphère'));
          } else {
            resolvedMovies = admissibleFallback.slice(0, 6);
          }
          fallbackTriggered = true;
          telemetry.fallbackUsed = true;
        }
      }

      if (orchestration.canonicalIntent?.mediaType) {
        resolvedMovies = resolvedMovies.filter(movie => candidateMediaType(movie) === orchestration.canonicalIntent.mediaType);
      }

      if (useHybrid && resolvedMovies.length === 0 &&
          ![FALLBACK_REASONS.PROVIDER_ERROR, FALLBACK_REASONS.TIMEOUT, FALLBACK_REASONS.RANKING_ERROR]
            .includes(telemetry.fallbackReason)) {
        recordFallback(telemetry, {
          reason: FALLBACK_REASONS.NO_RELEVANT_RESULTS,
          source: 'canonical_pipeline'
        });
      }

      // Incrémentation du quota pour les recherches exécutées (si non-pro)
      if (!isPro && ipHash) {
        incrementMemoryDailyQuota(ipHash, todayDate);
        if (supabaseServer) {
          try {
            const { data: existingIp } = await supabaseServer
              .from('user_searches')
              .select('id, search_count')
              .eq('user_id', ipStorageKey)
              .eq('search_date', todayDate)
              .maybeSingle();

            if (existingIp?.id) {
              await supabaseServer
                .from('user_searches')
                .update({
                  search_count: (existingIp.search_count || 0) + 1,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingIp.id);
            } else {
              await supabaseServer
                .from('user_searches')
                .insert({
                  user_id: ipStorageKey,
                  ip_address: ipHash,
                  search_date: todayDate,
                  search_count: 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
            }
          } catch (qErr) {
            console.warn('[API /api/search] Erreur enregistrement quota :', qErr?.message);
          }
        }
      }

      // ─── Transparence IA & Validation Croisée Multi-Facettes ───────────────
      let transparencyNotice = null;
      if (!usingElicineRanking && activeFacets?.is_multi_facet && resolvedMovies.length > 0) {
        // Est-ce qu'au moins un film résolu est un vrai hybride validé ?
        const hasStrictHybrid = resolvedMovies.some(m => m.is_hybrid_match || Number(m.match_rate || 0) >= 80);

        if (hasStrictHybrid) {
          // Si le catalogue contient des œuvres hybrides réelles (ex: "Lockout", "Solo", "Cowboy Bebop", "Outland", "Rogue One"), les prioriser en tête de liste
          resolvedMovies.sort((a, b) => {
            const aHybrid = a.is_hybrid_match ? 1 : 0;
            const bHybrid = b.is_hybrid_match ? 1 : 0;
            if (aHybrid !== bHybrid) return bHybrid - aHybrid;
            return (Number(b.match_rate) || 0) - (Number(a.match_rate) || 0);
          });
        } else {
          // Gestion honnête du catalogue restreint (Transparence IA)
          console.log('[API /api/search] [Transparence IA] Aucun film combinant rigoureusement les 2 facettes. Activation bandeau honnête et séparation.');

          if (activeFacets.core_action.includes('braquage') || activeFacets.core_action.includes('heist')) {
            transparencyNotice = "Aucun film de braquage spatial strict dans le catalogue. Voici les meilleurs films de braquage classiques OU des aventures spatiales orientées action :";
          } else {
            transparencyNotice = `Aucun film combinant strictement "${activeFacets.core_action}" et "${activeFacets.setting}" dans le catalogue. Voici les meilleures œuvres par composante :`;
          }

          // Un film NE PEUT PAS dépasser 70% de match s'il ne valide qu'une seule des deux composantes.
          // Assigner des tags distincts pour conserver la confiance de l'utilisateur.
          resolvedMovies = resolvedMovies.map(m => {
            const overviewLower = (m.overview || '').toLowerCase();
            const titleLower = (m.title || '').toLowerCase();
            const fullText = overviewLower + ' ' + titleLower;

            const isAction = /\b(braquage|braquages|braquer|braqueur|braqueurs|casse|hold-up|cambriolage|heist|vol|voler|d[eé]rober|coffre-fort|butin|arnaque|mafia|gangster|police|enquête)\b/i.test(fullText);
            const isSpace = /\b(espace|spatial|spatiale|galaxie|vaisseau|station spatiale|plan[eè]te|scifi|science-fiction|orbite|orbital|cosmos|cosmique|interstellaire|extraterrestre|alien)\b/i.test(fullText);

            let facetTag = 'Sélection Éliciné';
            if (activeFacets.core_action.includes('braquage') || activeFacets.core_action.includes('heist')) {
              if (isAction && !isSpace) {
                facetTag = 'Facette : Braquage';
              } else if (isSpace && !isAction) {
                facetTag = 'Facette : Aventure Spatiale';
              } else {
                facetTag = 'Sélection Thématique';
              }
            } else {
              if (isAction && !isSpace) facetTag = `Facette : ${activeFacets.core_action.split('/')[0].trim()}`;
              else if (isSpace && !isAction) facetTag = `Facette : ${activeFacets.setting.split('/')[0].trim()}`;
            }

            const cappedScore = Math.min(68, Number(m.match_rate || 65));
            return {
              ...m,
              ai_badge: facetTag,
              badge: facetTag,
              match_rate: cappedScore
            };
          });

          // Équilibrer la présentation entre les deux facettes
          const actionGroup = resolvedMovies.filter(m => m.ai_badge.includes('Braquage') || m.ai_badge.includes('Action'));
          const spaceGroup = resolvedMovies.filter(m => m.ai_badge.includes('Spatiale') || m.ai_badge.includes('Aventure'));
          const otherGroup = resolvedMovies.filter(m => !actionGroup.includes(m) && !spaceGroup.includes(m));

          if (actionGroup.length > 0 && spaceGroup.length > 0) {
            const balanced = [];
            const maxLen = Math.max(actionGroup.length, spaceGroup.length);
            for (let i = 0; i < maxLen; i++) {
              if (i < actionGroup.length) balanced.push(actionGroup[i]);
              if (i < spaceGroup.length) balanced.push(spaceGroup[i]);
            }
            balanced.push(...otherGroup);
            resolvedMovies = balanced;
          }
        }
      }

      // ─── Renvoyer la réponse JSON ──────────────────────────────────────────
      if (resolvedMovies.length > 0) {
        const isPhaseB = resolvedMovies.some(m => m.badge === 'Recherche par contexte Éliciné' || m.badge === 'Recherche par contexte & mots-clés');
        const badgeLabel = transparencyNotice
          ? 'Exploration Multi-Facettes'
          : (fallbackTriggered
              ? 'Recommandations Éliciné pour votre atmosphère'
              : (isPhaseB ? 'Recherche par contexte Éliciné' : 'Sélection Éliciné'));
        const editorialSummary = rawAtmosphereSummary || suggestedMood || cleanQuery;
        const thoughtMsg = transparencyNotice
          ? transparencyNotice
          : (fallbackTriggered
              ? `Vision & Recommandation Éliciné — ${editorialSummary}`
              : (isPhaseB
                  ? `🔍 Recherche élargie : ${resolvedMovies.length} film(s) correspondant à l'ambiance et au contexte`
                  : `Vision & Recommandation Éliciné — ${editorialSummary}`));

        return res.status(200).json({
          success: true,
          results: resolvedMovies,
          movies: resolvedMovies,
          count: resolvedMovies.length,
          fallback_triggered: fallbackTriggered,
          isFallbackMode: fallbackTriggered,
          suggested_mood: suggestedMood,
          badge: badgeLabel,
          providerUsed: provider || 'Algorithme Éliciné',
          correctedQuery: effectiveCleanQuery !== cleanQuery ? effectiveCleanQuery : null,
          thought: thoughtMsg,
          transparency_notice: transparencyNotice,
          is_transparency_mode: Boolean(transparencyNotice),
          extractedTitles: referenceTitles,
          suggestedPrompts: [
            'Un film de science-fiction dystopique sombre',
            'Un thriller psychologique avec un twist final',
            'Une comédie feel-good et touchante'
          ]
        });
      }

      // Atteint UNIQUEMENT si la requête est du charabia aléatoire non identifiable.
      // INTERDIT ABSOLU : aucun film aléatoire ou blockbuster hors-sujet.
      console.log('[API /api/search] [Étape 3] Requête non-thématique sans résultat. Retour [] strict.');
      return res.status(200).json({
        success: true,
        movies: [],
        isEmpty: true,
        badge: 'Sélection Éliciné',
        providerUsed: 'Algorithme Éliciné',
        correctedQuery: effectiveCleanQuery !== cleanQuery ? effectiveCleanQuery : null,
        message: "L'algorithme Éliciné a cherché, mais cette description est trop mystérieuse pour notre catalogue actuel...",
        extractedTitles: referenceTitles,
        suggestedPrompts: [
          "Un voyage dans l'espace avec des trous noirs",
          "Un film de braquage qui tourne mal",
          "Un film angoissant où des personnages sont coincés sous terre",
          "Un thriller psychologique avec un twist final"
        ]
      });
    }

    return res.status(200).json({ success: true, message: "Service de recherche actif" });
  } catch (err) {
    console.error('[API /api/search] Erreur non gérée :', err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Une erreur interne est survenue lors du traitement de la recherche.",
      movies: [],
      isEmpty: true
    });
  }
}
