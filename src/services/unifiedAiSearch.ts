import { Movie, ApiSettings } from '../types';
import { searchMoviesTmdb, getWatchProviders, GENRE_MAP } from './tmdb';
import { analyzeSearchIntent } from './searchRouterService';

export interface RawAiMovieItem {
  title: string;
  french_title?: string;
  year?: number;
  type?: 'film' | 'serie' | string;
  match_rate?: number;
  synopsis?: string;
  reason?: string;
}

export interface AIRecommendationResult {
  thought: string;
  moodDetected: string;
  recommendedMovies: Movie[];
  isFallbackMode: boolean;
  providerUsed?: string;
  suggestedPrompts: string[];
}

/**
 * MODÈLES QWEN ACTIFS — Moteur principal de recommandation
 */
export const ACTIVE_QWEN_MODELS = [
  'qwen2.5-72b-instruct',
  'qwen-plus',
];

/**
 * MODÈLES GROQ — Fallback ultra-rapide (< 500ms)
 */
export const ACTIVE_GROQ_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
];

export const GROQ_MODELS = ACTIVE_GROQ_MODELS;

/**
 * RÉCUPÉRATION SÉCURISÉE DE LA CLÉ GROQ
 */
export const getGroqKey = (apiSettings?: ApiSettings): string => {
  return (
    localStorage.getItem('groq_api_key') ||
    localStorage.getItem('elicine_groq_key') ||
    localStorage.getItem('elicine_groq_api_key') ||
    localStorage.getItem('cinora_groq_api_key') ||
    localStorage.getItem('cinéia_groq_api_key') ||
    localStorage.getItem('cinéia_groq_key') ||
    localStorage.getItem('cinéia_ai_key') ||
    apiSettings?.groqApiKey ||
    ""
  ).trim();
};

export const getApiKey = (provider: 'qwen' | 'groq' | 'tmdb', apiSettings?: ApiSettings): string => {
  if (provider === 'groq') return getGroqKey(apiSettings);
  if (provider === 'tmdb') {
    return (
      localStorage.getItem('tmdb_api_key') ||
      localStorage.getItem('elicine_tmdb_key') ||
      localStorage.getItem('cinora_tmdb_key') ||
      localStorage.getItem('cinéia_tmdb_key') ||
      localStorage.getItem('cineia_tmdb_key') ||
      apiSettings?.tmdbApiKey ||
      ''
    ).trim();
  }
  return (
    localStorage.getItem('dashscope_api_key') ||
    localStorage.getItem('elicine_qwen_api_key') ||
    localStorage.getItem('cinora_qwen_api_key') ||
    localStorage.getItem('cinéia_qwen_api_key') ||
    localStorage.getItem('qwen_api_key') ||
    apiSettings?.qwenApiKey ||
    ''
  ).trim();
};

/**
 * 1. NOUVEAU SYSTEM PROMPT AVEC DÉTECTION D'INTENTION (Films vs Séries)
 */
export async function queryGroq(
  userQuery: string, 
  apiKey?: string,
  aiPromptLang?: string
): Promise<RawAiMovieItem[]> {
  const currentLang = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_lang') : 'fr';
  const resolvedAiPromptLang = aiPromptLang || (
    currentLang === 'en' 
      ? 'Respond STRICTLY in English for movie summaries and reasons.' 
      : currentLang === 'es' 
        ? 'Responde ESTRICTAMENTE en español para los resúmenes y motivos.' 
        : 'Réponds STRICTEMENT en français pour les descriptions et raisons.'
  );

  const aiTone = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_ai_curation') : null;
  let curationInstruction = '';
  if (aiTone === 'popular') {
    curationInstruction = '\nDIRECTIVE DE CURATION :\nPrivilégie les films et séries acclamés par le grand public et très connus.';
  } else if (aiTone === 'auteur') {
    curationInstruction = "\nDIRECTIVE DE CURATION :\nPrivilégie les pépites méconnues, le cinéma d'auteur et les œuvres cultes indépendantes.";
  }

  const safeSearch = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_safe_search') === 'true' : false;
  const safeInstruction = safeSearch ? '\nCONTRÔLE PARENTAL ACTIF :\nExclus impérativement tout contenu classé pour adultes, explicite ou ultra-violent.' : '';

  const systemPrompt = `Tu es le moteur de recherche cinématographique Éliciné.
MISSION STRICTE :
1. Tu dois retourner UNIQUEMENT des VRAIS films et séries existants et vérifiables dans le catalogue mondial / TMDB.
2. Il est TOTALEMENT INTERDIT d'inventer des films, des titres fictifs ou des histoires imaginées.
3. Si l'utilisateur décrit une intrigue connue (ex: "film couloir de la mort pouvoir de guérison"), identifie obligatoirement l'œuvre exacte ("La Ligne Verte" / "The Green Mile") et des films réellement similaires (ex: "La Vie de David Gale", "Les Évadés").
4. Réponds UNIQUEMENT sous forme d'un objet JSON strict contenant les titres originaux et français réels.

RÈGLE LINGUISTIQUE IMPÉRATIVE :
${resolvedAiPromptLang}
${curationInstruction}${safeInstruction}

RÈGLES D'INTENTION (6 à 8 résultats au total) :
1. SI LA DEMANDE CIBLE UN FILM (mots-clés : "film", "long-métrage", "ce soir devant un film", etc.) :
   -> Renvoie UNIQUEMENT des films (type: "film"). Aucune série.
2. SI LA DEMANDE CIBLE UNE SÉRIE (mots-clés : "série", "saison", "mini-série", "épisodes", etc.) :
   -> Renvoie UNIQUEMENT des séries (type: "serie"). Aucun film.
3. SI AUCUNE PRÉCISION N'EST DONNÉE (ex: ambiance, concept, citation, thématique globale) :
   -> Propose les meilleures recommandations sans forcer d'équilibre artificiel.

FORMAT DE RÉPONSE OBLIGATOIRE (JSON pur sans markdown) :
{
  "movies": [
    {
      "title": "Titre original / international",
      "french_title": "Titre en français",
      "year": 2024,
      "type": "film",
      "match_rate": 95,
      "synopsis": "Un résumé captivant de 2 à 3 phrases détaillant l'intrigue principale, les enjeux et le ton sans spoiler.",
      "reason": "Correspondance exacte..."
    }
  ]
}`;

  let lastError: Error | null = null;

  for (const model of ACTIVE_GROQ_MODELS) {
    try {
      console.log(`[Éliciné] Requête IA via proxy serveur /api/ai : ${model}`);
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {})
        },
        body: JSON.stringify({
          provider: 'groq',
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 600
        })
      });

      // Si le modèle est obsolète (400) ou introuvable (404), passer au suivant
      if (response.status === 400 || response.status === 404) {
        const warnText = await response.text();
        console.warn(`[Éliciné] Modèle ${model} indisponible (${response.status}), passage au suivant...`, warnText);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const cleanJson = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      const movies = parsed.movies || parsed.results || [];
      if (Array.isArray(movies) && movies.length > 0) {
        return movies.map((m: any, index: number) => ({
          title: String(m.title || m.titre || '').trim(),
          french_title: m.french_title ? String(m.french_title).trim() : undefined,
          year: m.year ? Number(m.year) : undefined,
          type: (m.type === 'serie' || m.type === 'series' || m.type === 'tv') ? 'serie' : 'film',
          match_rate: Number(m.match_rate) || Math.max(78, 98 - index * 3),
          synopsis: String(m.synopsis || m.overview || m.summary || '').trim(),
          reason: String(m.reason || m.justification || m.pitch || '').trim()
        })).filter((m: RawAiMovieItem) => m.title.length > 0);
      }

    } catch (err: any) {
      console.warn(`[Éliciné] Échec sur ${model} :`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Échec de connexion à Groq.");
}

export function parseAIResponse(rawText: string): RawAiMovieItem[] {
  const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Format JSON non détecté");
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.movies || parsed.results || [];
}

/**
 * 2. MOTEUR QWEN — Requête principale (qwen2.5-72b-instruct avec fallback qwen-plus)
 * Itère sur ACTIVE_QWEN_MODELS et transmet via le proxy /api/ai (provider='qwen').
 */
export async function queryQwen(
  userQuery: string,
  apiKey?: string,
  aiPromptLang?: string
): Promise<RawAiMovieItem[]> {
  const currentLang = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_lang') : 'fr';
  const resolvedAiPromptLang = aiPromptLang || (
    currentLang === 'en'
      ? 'Respond STRICTLY in English for movie summaries and reasons.'
      : currentLang === 'es'
        ? 'Responde ESTRICTAMENTE en español para los resúmenes y motivos.'
        : 'Réponds STRICTEMENT en français pour les descriptions et raisons.'
  );

  const aiTone = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_ai_curation') : null;
  let curationInstruction = '';
  if (aiTone === 'popular') {
    curationInstruction = '\nDIRECTIVE DE CURATION :\nPrivilégie les films et séries acclamés par le grand public et très connus.';
  } else if (aiTone === 'auteur') {
    curationInstruction = "\nDIRECTIVE DE CURATION :\nPrivilégie les pépites méconnues, le cinéma d'auteur et les œuvres cultes indépendantes.";
  }

  const safeSearch = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_safe_search') === 'true' : false;
  const safeInstruction = safeSearch ? '\nCONTRÔLE PARENTAL ACTIF :\nExclus impérativement tout contenu classé pour adultes, explicite ou ultra-violent.' : '';

  const systemPrompt = `Tu es le moteur de recherche cinématographique Éliciné propulsé par Qwen.
MISSION STRICTE :
1. Tu dois retourner UNIQUEMENT des VRAIS films et séries existants et vérifiables dans le catalogue mondial / TMDB.
2. Il est TOTALEMENT INTERDIT d'inventer des films, des titres fictifs ou des histoires imaginées.
3. Si l'utilisateur décrit une intrigue connue (ex: "film couloir de la mort pouvoir de guérison"), identifie obligatoirement l'œuvre exacte ("La Ligne Verte" / "The Green Mile") et des films réellement similaires (ex: "La Vie de David Gale", "Les Évadés").
4. Réponds UNIQUEMENT sous forme d'un objet JSON strict contenant les titres originaux et français réels.

RÈGLE LINGUISTIQUE IMPÉRATIVE :
${resolvedAiPromptLang}
${curationInstruction}${safeInstruction}

RÈGLES D'INTENTION (6 à 8 résultats au total) :
1. SI LA DEMANDE CIBLE UN FILM (mots-clés : "film", "long-métrage", "ce soir devant un film", etc.) :
   -> Renvoie UNIQUEMENT des films (type: "film"). Aucune série.
2. SI LA DEMANDE CIBLE UNE SÉRIE (mots-clés : "série", "saison", "mini-série", "épisodes", etc.) :
   -> Renvoie UNIQUEMENT des séries (type: "serie"). Aucun film.
3. SI AUCUNE PRÉCISION N'EST DONNÉE (ex: ambiance, concept, citation, thématique globale) :
   -> Propose les meilleures recommandations sans forcer d'équilibre artificiel.

FORMAT DE RÉPONSE OBLIGATOIRE (JSON pur sans markdown) :
{
  "movies": [
    {
      "title": "Titre original / international",
      "french_title": "Titre en français",
      "year": 2024,
      "type": "film",
      "match_rate": 95,
      "synopsis": "Un résumé captivant de 2 à 3 phrases détaillant l'intrigue principale, les enjeux et le ton sans spoiler.",
      "reason": "Correspondance exacte..."
    }
  ]
}`;

  let lastError: Error | null = null;

  for (const model of ACTIVE_QWEN_MODELS) {
    try {
      console.log(`[Éliciné] Requête IA Qwen via proxy /api/ai : ${model}`);
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {})
        },
        body: JSON.stringify({
          provider: 'qwen',
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 600
        })
      });

      if (response.status === 400 || response.status === 404) {
        const warnText = await response.text();
        console.warn(`[Éliciné] Modèle Qwen ${model} indisponible (${response.status}), passage au suivant...`, warnText);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const cleanJson = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const movies = parsed.movies || parsed.results || [];
      if (Array.isArray(movies) && movies.length > 0) {
        return movies.map((m: any, index: number) => ({
          title: String(m.title || m.titre || '').trim(),
          french_title: m.french_title ? String(m.french_title).trim() : undefined,
          year: m.year ? Number(m.year) : undefined,
          type: (m.type === 'serie' || m.type === 'series' || m.type === 'tv') ? 'serie' : 'film',
          match_rate: Number(m.match_rate) || Math.max(78, 98 - index * 3),
          synopsis: String(m.synopsis || m.overview || m.summary || '').trim(),
          reason: String(m.reason || m.justification || m.pitch || '').trim()
        })).filter((m: RawAiMovieItem) => m.title.length > 0);
      }

    } catch (err: any) {
      console.warn(`[Éliciné] Échec sur Qwen ${model} :`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Échec de connexion à Qwen.');
}

/**
 * 2. CIBLAGE PRÉCIS DANS L'ENRICHISSEMENT TMDB (/tv ou /movie)
 * Interroge l'endpoint spécifique en fonction du type retourné par l'IA.
 */
export async function fetchTmdbDetails(
  item: RawAiMovieItem, 
  tmdbKey: string,
  fallbackIndex = 0,
  tmdbLang?: string
): Promise<Movie | null> {
  try {
    const currentLang = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_lang') : 'fr';
    const resolvedTmdbLang = tmdbLang || (currentLang === 'en' ? 'en-US' : currentLang === 'es' ? 'es-ES' : 'fr-FR');
    const isTv = item.type === 'serie';
    // Si l'IA indique une série -> endpoint /tv, sinon -> endpoint /movie
    const endpoint = isTv ? 'tv' : 'movie';
    let match: any = null;

    // 1. Recherche ciblée sur l'endpoint dédié via proxy serveur /api/tmdb
    try {
      const searchEndpoint = `search/${endpoint}`;
      const searchUrl = `/api/tmdb?endpoint=${encodeURIComponent(searchEndpoint)}&query=${encodeURIComponent(item.title)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        match = data.results?.[0] || null;
      }

      // 2. Fallback multi au cas où le titre original est en anglais ou typé différemment
      if (!match) {
        const fallbackUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(item.title)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          match = fallbackData.results?.[0] || null;
        }
      }

      // 3. Fallback sur le titre français si fourni par l'IA (anti-hallucination)
      if (!match && item.french_title) {
        const frenchUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(item.french_title)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const frenchRes = await fetch(frenchUrl);
        if (frenchRes.ok) {
          const frenchData = await frenchRes.json();
          match = frenchData.results?.[0] || null;
        }
      }
    } catch (e) {
      console.warn('[Éliciné] Erreur enrichissement TMDB :', e);
    }

    const mediaType: 'FILM' | 'SÉRIE' = (match?.media_type === 'tv' || isTv) ? 'SÉRIE' : 'FILM';
    const computedMatchRate = item.match_rate || Math.max(78, 98 - fallbackIndex * 3);

    if (!match) {
      const fallbackOverview = (item.synopsis && item.synopsis.trim().length > 20)
        ? item.synopsis.trim()
        : (item.reason || `Recommandation officielle Éliciné.`);

      // Fiche propre locale si non trouvé sur TMDB
      return {
        id: 990000 + fallbackIndex,
        media_type: mediaType,
        title: item.title,
        original_title: item.title,
        release_date: item.year ? `${item.year}-01-01` : '2024-01-01',
        poster_path: null,
        backdrop_path: null,
        vote_average: 8.0,
        vote_count: 500,
        overview: fallbackOverview,
        synopsis: item.synopsis,
        is_ai_overview: true,
        match_rate: computedMatchRate,
        ai_match_reason: item.reason,
        genres: [{ id: 18, name: mediaType === 'SÉRIE' ? 'Drame' : 'Cinéma' }],
        primary_platform: 'Cinéma / VOD'
      };
    }

    const title = match.title || match.name || item.title;
    const originalTitle = match.original_title || match.original_name || title;
    const releaseDate = match.release_date || match.first_air_date || (item.year ? `${item.year}-01-01` : '2024-01-01');
    const poster = match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null;
    const backdrop = match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : poster;

    // Récupération de TOUTES les plateformes de streaming disponibles (sans restriction / .slice)
    const providers = match.id 
      ? await getWatchProviders(match.id, isTv ? 'tv' : 'movie', 'FR', tmdbKey)
      : [];

    // B. Enrichissement automatique des synopsis trop courts ou absents via l'IA
    const finalOverview = (match.overview && match.overview.trim().length > 60)
      ? match.overview.trim()
      : (item.synopsis || item.reason || "Synopsis en cours de synchronisation...");

    const isAiOverview = !match.overview || match.overview.trim().length <= 60;

    return {
      id: match.id,
      media_type: mediaType,
      title: title,
      original_title: originalTitle,
      release_date: releaseDate,
      poster_path: poster,
      backdrop_path: backdrop,
      vote_average: Number(match.vote_average ? match.vote_average.toFixed(1) : 8.0),
      vote_count: match.vote_count || 500,
      overview: finalOverview,
      synopsis: item.synopsis,
      is_ai_overview: isAiOverview,
      match_rate: computedMatchRate,
      ai_match_reason: item.reason,
      genres: (match.genre_ids && match.genre_ids.length > 0)
        ? match.genre_ids.map((gid: number) => ({ id: gid, name: GENRE_MAP[gid] || (mediaType === 'SÉRIE' ? 'Drame' : 'Cinéma') }))
        : [{ id: 18, name: mediaType === 'SÉRIE' ? 'Drame' : 'Cinéma' }],
      providers: providers,
      primary_platform: 'Cinéma / VOD'
    };
  } catch (err) {
    console.warn("[Éliciné TMDB] Erreur enrichissement :", item.title, err);
    return null;
  }
}

/**
 * 3. ROUTEUR ET EXÉCUTION DE RECHERCHE PRINCIPALE
 */
export async function executeCinoraSearch(
  query: string, 
  apiSettings?: ApiSettings,
  tmdbLang?: string,
  aiPromptLang?: string
): Promise<AIRecommendationResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error("Veuillez saisir une recherche.");
  }

  const currentLang = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_lang') : 'fr';
  const resolvedTmdbLang = tmdbLang || (currentLang === 'en' ? 'en-US' : currentLang === 'es' ? 'es-ES' : 'fr-FR');
  const resolvedAiPromptLang = aiPromptLang || (
    currentLang === 'en' 
      ? 'Respond STRICTLY in English for movie summaries and reasons.' 
      : currentLang === 'es' 
        ? 'Responde ESTRICTAMENTE en español para los resúmenes y motivos.' 
        : 'Réponds STRICTEMENT en français pour les descriptions et raisons.'
  );

  const tmdbKey = getApiKey('tmdb', apiSettings);

  // Vérifier si c'est un Titre Direct court (1 à 3 mots sans description sémantique)
  const route = analyzeSearchIntent(cleanQuery);
  if (route.intent === 'direct_tmdb') {
    console.log(`[Éliciné AI] Recherche directe TMDB pour "${cleanQuery}".`);
    const results = await searchMoviesTmdb(cleanQuery, tmdbKey, resolvedTmdbLang);
    const movies = (results || []).slice(0, 8).map((m, idx) => ({
      ...m,
      match_rate: Math.max(78, 98 - idx * 3),
      ai_match_reason: `Recherche directe titre : "${m.title}"`
    }));

    return {
      thought: `🎬 Recherche directe TMDB : ${movies.length} résultats trouvés`,
      moodDetected: cleanQuery,
      recommendedMovies: movies,
      isFallbackMode: false,
      providerUsed: 'TMDB Direct',
      suggestedPrompts: [
        'Un film de braquage drôle et haletant',
        'Une série policière sombre et addictive',
        'Une fresque spatiale émouvante',
        'Un film néo-noir avec ambiance pluvieuse'
      ]
    };
  }

  // Clés API client (le proxy /api/ai utilise les env vars côté serveur en priorité)
  const qwenKey = getApiKey('qwen', apiSettings);
  const groqKey = getGroqKey(apiSettings);

  // 1. Tentative Qwen (moteur principal — qwen2.5-72b-instruct)
  console.log(`[Éliciné AI] Exécution recherche sémantique Qwen pour : "${cleanQuery}" (${resolvedAiPromptLang})`);
  let aiMovies: RawAiMovieItem[] = [];
  let providerLabel = 'Qwen 2.5 72B';

  try {
    aiMovies = await queryQwen(cleanQuery, qwenKey, resolvedAiPromptLang);
  } catch (qwenErr: any) {
    console.warn(`[Éliciné AI] Qwen indisponible (${qwenErr.message}), repli vers Groq/Llama...`);
    // 2. Fallback Groq (Llama 3.3 70B) si Qwen échoue
    try {
      aiMovies = await queryGroq(cleanQuery, groqKey, resolvedAiPromptLang);
      providerLabel = 'Llama 3.3 70B (Groq)';
    } catch (groqErr: any) {
      console.error('[Éliciné AI] Tous les moteurs IA ont échoué.', groqErr.message);
      throw groqErr;
    }
  }

  if (!aiMovies || aiMovies.length === 0) {
    return {
      thought: "Aucune œuvre correspondante trouvée pour cette recherche.",
      moodDetected: cleanQuery,
      recommendedMovies: [],
      isFallbackMode: false,
      providerUsed: providerLabel,
      suggestedPrompts: [
        'Un film de braquage drôle et haletant',
        "Une série d'enquête sombre sous la pluie",
        'Une fresque spatiale émouvante'
      ]
    };
  }

  // 3. Mappage ciblé sur l'endpoint TMDB (/tv ou /movie) pour chaque résultat
  const enrichedResults = (
    await Promise.all(
      aiMovies.map((item, idx) => fetchTmdbDetails(item, tmdbKey, idx, resolvedTmdbLang))
    )
  ).filter((m): m is Movie => m !== null);

  // 4. Compteur dynamique exact reflétant l'ensemble des résultats
  return {
    thought: `✨ Analyse Éliciné AI en direct : ${enrichedResults.length} résultats trouvés`,
    moodDetected: cleanQuery,
    recommendedMovies: enrichedResults,
    isFallbackMode: false,
    providerUsed: providerLabel,
    suggestedPrompts: [
      'Un film de braquage haletant avec twist',
      'Une série policière scandinave sous la neige',
      "Un chef-d'œuvre de science-fiction dystopique",
      'Une comédie française feel-good et touchante'
    ]
  };
}

export const executeElicineSearch = executeCinoraSearch;
export const unifiedAiSearch = executeElicineSearch;
export const AI_PROVIDERS = [
  {
    name: 'Qwen 2.5 72B',
    type: 'qwen' as const,
    endpoint: '/api/ai',
    model: 'qwen2.5-72b-instruct',
    keyStorage: 'cinéia_qwen_api_key'
  },
  {
    name: 'Llama 3.3 70B (Groq — Fallback)',
    type: 'groq' as const,
    endpoint: '/api/ai',
    model: 'llama-3.3-70b-versatile',
    keyStorage: 'elicine_groq_api_key'
  }
];

export default executeCinoraSearch;

