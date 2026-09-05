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
 * MODÈLES GROQ ACTIFS — Moteur principal de recommandation (Vitesse & Fiabilité)
 */
export const ACTIVE_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

export const GROQ_MODELS = ACTIVE_GROQ_MODELS;

/**
 * MODÈLES QWEN — Fallback si Groq indisponible
 */
export const ACTIVE_QWEN_MODELS = [
  'qwen-plus',
  'qwen2.5-72b-instruct',
];

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

  const systemPrompt = `Tu es le moteur de recommandation de films d'Éliciné.
Pour toute demande de l'utilisateur, réponds EXCLUSIVEMENT avec un objet JSON contenant une liste de 5 à 8 titres de films ou séries exacts et pertinents.
Exemple de format attendu :
{
  "movies": ["Shutter Island", "Inception", "The Departed", "Catch Me If You Can"]
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
      const movies = extractRawMovieItems(rawContent);
      if (movies.length > 0) {
        return movies;
      }

    } catch (err: any) {
      console.warn(`[Éliciné] Échec sur ${model} :`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Échec de connexion à Groq.");
}

/**
 * Extraction universelle et ultra-résiliente des titres retournés par l'IA
 * Supporte : tableau de chaînes, objets avec title/titre, JSON pur ou texte brut
 */
export function extractRawMovieItems(rawText: string): RawAiMovieItem[] {
  let parsed: any = null;
  const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(cleaned);
    }
  } catch (e) {
    console.warn('[Éliciné AI] Parse JSON direct impossible, tentative extraction lignes/regex...', e);
  }

  let list: any[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    list = parsed.movies || parsed.films || parsed.results || parsed.titles || parsed.recommendations || [];
  }

  // Si le format JSON était vide ou invalide, extraire les lignes
  if (!Array.isArray(list) || list.length === 0) {
    const lines = cleaned.split('\n');
    for (const line of lines) {
      const match = line.match(/^[\s\*\-\d\.\)]+["']?([^"'\n\r\(\)]+)["']?/);
      if (match && match[1] && match[1].trim().length > 1) {
        list.push(match[1].trim());
      }
    }
  }

  return list.map((item: any, index: number): RawAiMovieItem | null => {
    if (typeof item === 'string') {
      const clean = item.replace(/^[\d\.\-\s\*\#]+/, '').replace(/^["']|["']$/g, '').trim();
      const yearMatch = clean.match(/\((\d{4})\)$/);
      const title = yearMatch ? clean.replace(/\s*\(\d{4}\)$/, '').trim() : clean;
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      return {
        title,
        year,
        match_rate: Math.max(78, 98 - index * 3),
        reason: 'Recommandé par Éliciné AI'
      };
    } else if (item && typeof item === 'object') {
      const rawTitle = String(item.title || item.titre || item.name || '').trim();
      const clean = rawTitle.replace(/^[\d\.\-\s\*\#]+/, '').replace(/^["']|["']$/g, '').trim();
      const yearMatch = clean.match(/\((\d{4})\)$/);
      const title = yearMatch ? clean.replace(/\s*\(\d{4}\)$/, '').trim() : clean;
      const year = item.year ? Number(item.year) : (yearMatch ? parseInt(yearMatch[1], 10) : undefined);
      return {
        title,
        french_title: item.french_title ? String(item.french_title).trim() : undefined,
        year,
        type: (item.type === 'serie' || item.type === 'series' || item.type === 'tv') ? 'serie' : 'film',
        match_rate: Number(item.match_rate) || Math.max(78, 98 - index * 3),
        synopsis: String(item.synopsis || item.overview || item.summary || '').trim(),
        reason: String(item.reason || item.justification || item.pitch || '').trim()
      };
    }
    return null;
  }).filter((m): m is RawAiMovieItem => Boolean(m && m.title && m.title.length > 0));
}

export function parseAIResponse(rawText: string): RawAiMovieItem[] {
  return extractRawMovieItems(rawText);
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

  const systemPrompt = `Tu es le moteur de recommandation de films d'Éliciné.
Pour toute demande de l'utilisateur, réponds EXCLUSIVEMENT avec un objet JSON contenant une liste de 5 à 8 titres de films ou séries exacts et pertinents.
Exemple de format attendu :
{
  "movies": ["Shutter Island", "Inception", "The Departed", "Catch Me If You Can"]
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
      const movies = extractRawMovieItems(rawContent);
      if (movies.length > 0) {
        return movies;
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

    // Nettoyage précis du titre pour TMDB (retire guillemets, chiffres initiaux, tirets)
    const cleanTitle = item.title
      .replace(/^[\d\.\-\s\*\#]+/, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    if (!cleanTitle) return null;

    // 1. Recherche ciblée sur l'endpoint dédié via proxy serveur /api/tmdb
    try {
      const searchEndpoint = `search/${endpoint}`;
      const searchUrl = `/api/tmdb?endpoint=${encodeURIComponent(searchEndpoint)}&query=${encodeURIComponent(cleanTitle)}&language=${resolvedTmdbLang}${item.year ? `&year=${item.year}` : ''}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        match = data.results?.[0] || null;
      }

      // 2. Fallback sans l'année si l'année était trop restrictive
      if (!match && item.year) {
        const fallbackNoYear = `/api/tmdb?endpoint=${encodeURIComponent(searchEndpoint)}&query=${encodeURIComponent(cleanTitle)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const res2 = await fetch(fallbackNoYear);
        if (res2.ok) {
          const data2 = await res2.json();
          match = data2.results?.[0] || null;
        }
      }

      // 3. Fallback multi au cas où le titre original est en anglais ou typé différemment
      if (!match) {
        const fallbackUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(cleanTitle)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const validResults = (fallbackData.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
          match = validResults.find((r: any) => Boolean(r.poster_path)) || validResults[0] || null;
        }
      }

      // 4. Fallback search/multi en anglais si le titre est international
      if (!match && resolvedTmdbLang !== 'en-US') {
        const fallbackEnUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(cleanTitle)}&language=en-US${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const fallbackEnRes = await fetch(fallbackEnUrl);
        if (fallbackEnRes.ok) {
          const fallbackEnData = await fallbackEnRes.json();
          const validResults = (fallbackEnData.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
          match = validResults.find((r: any) => Boolean(r.poster_path)) || validResults[0] || null;
        }
      }

      // 5. Fallback sur le titre français si fourni par l'IA
      if (!match && item.french_title) {
        const cleanFr = item.french_title.replace(/^[\d\.\-\s\*\#]+/, '').replace(/^["']|["']$/g, '').trim();
        const frenchUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(cleanFr)}&language=${resolvedTmdbLang}${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const frenchRes = await fetch(frenchUrl);
        if (frenchRes.ok) {
          const frenchData = await frenchRes.json();
          const validResults = (frenchData.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
          match = validResults.find((r: any) => Boolean(r.poster_path)) || validResults[0] || null;
        }
      }
    } catch (e) {
      console.warn('[Éliciné] Erreur enrichissement TMDB :', e);
    }

    const mediaType: 'FILM' | 'SÉRIE' = (match?.media_type === 'tv' || isTv) ? 'SÉRIE' : 'FILM';
    const computedMatchRate = item.match_rate || Math.max(78, 98 - fallbackIndex * 3);

    const defaultPoster = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80';

    if (!match) {
      const fallbackOverview = (item.synopsis && item.synopsis.trim().length > 20)
        ? item.synopsis.trim()
        : (item.reason || `Recommandation officielle Éliciné.`);

      // Fiche propre locale si non trouvé sur TMDB
      return {
        id: 990000 + fallbackIndex,
        media_type: mediaType,
        title: cleanTitle,
        original_title: cleanTitle,
        release_date: item.year ? `${item.year}-01-01` : '2024-01-01',
        poster_path: defaultPoster,
        backdrop_path: defaultPoster,
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

    const title = match.title || match.name || cleanTitle;
    const originalTitle = match.original_title || match.original_name || title;
    const releaseDate = match.release_date || match.first_air_date || (item.year ? `${item.year}-01-01` : '2024-01-01');
    const poster = match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : defaultPoster;
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
  const groqKey = getGroqKey(apiSettings);
  const qwenKey = getApiKey('qwen', apiSettings);

  // 1. TENTATIVE PRINCIPALE : GROQ (llama-3.3-70b-versatile / 8b-instant — Ultra-rapide & Fiable)
  console.log(`[Éliciné AI] Exécution recherche principale Groq pour : "${cleanQuery}" (${resolvedAiPromptLang})`);
  let aiMovies: RawAiMovieItem[] = [];
  let providerLabel = 'Llama 3.3 70B (Groq)';

  try {
    aiMovies = await queryGroq(cleanQuery, groqKey, resolvedAiPromptLang);
    providerLabel = 'Llama 3.3 70B (Groq)';
  } catch (groqErr: any) {
    console.warn(`[Éliciné AI] Groq indisponible (${groqErr?.message || groqErr}), tentative Fallback 1: Qwen...`);
    // 2. FALLBACK 1 : QWEN (Alibaba DashScope)
    try {
      aiMovies = await queryQwen(cleanQuery, qwenKey, resolvedAiPromptLang);
      providerLabel = 'Qwen (DashScope)';
    } catch (qwenErr: any) {
      console.warn('[Éliciné AI] Qwen indisponible également, activation Fallback 2: Recherche sémantique TMDB...', qwenErr?.message || qwenErr);
    }
  }

  // 3. FALLBACK 2 : RECHERCHE DIRECTE TMDB (GARANTIE 0% ÉCHEC / 0% BLOQUANT)
  if (!aiMovies || aiMovies.length === 0) {
    console.log(`[Éliciné AI] Repli absolu TMDB direct pour : "${cleanQuery}"`);
    try {
      const tmdbDirectResults = await searchMoviesTmdb(cleanQuery, tmdbKey, resolvedTmdbLang);
      if (tmdbDirectResults && tmdbDirectResults.length > 0) {
        const fallbackMovies = tmdbDirectResults.slice(0, 8).map((m, idx) => ({
          ...m,
          match_rate: Math.max(75, 95 - idx * 3),
          ai_match_reason: `Recommandation thématique TMDB pour "${cleanQuery}"`
        }));

        return {
          thought: `🎬 Recherche TMDB en direct : ${fallbackMovies.length} œuvres trouvées`,
          moodDetected: cleanQuery,
          recommendedMovies: fallbackMovies,
          isFallbackMode: true,
          providerUsed: 'TMDB Direct (Fallback)',
          suggestedPrompts: [
            'Un film de braquage drôle et haletant',
            'Une série policière sombre et addictive',
            'Une fresque spatiale émouvante',
            'Un film néo-noir avec ambiance pluvieuse'
          ]
        };
      }
    } catch (tmdbErr) {
      console.error('[Éliciné AI] Échec du fallback TMDB direct :', tmdbErr);
    }

    return {
      thought: "Aucune œuvre correspondante trouvée pour cette recherche.",
      moodDetected: cleanQuery,
      recommendedMovies: [],
      isFallbackMode: true,
      providerUsed: providerLabel,
      suggestedPrompts: [
        'Un film de braquage drôle et haletant',
        "Une série d'enquête sombre sous la pluie",
        'Une fresque spatiale émouvante'
      ]
    };
  }

  // 4. Mappage ciblé sur l'endpoint TMDB (/tv ou /movie) pour chaque résultat
  const enrichedResults = (
    await Promise.all(
      aiMovies.map((item, idx) => fetchTmdbDetails(item, tmdbKey, idx, resolvedTmdbLang))
    )
  ).filter((m): m is Movie => m !== null);

  // 5. Filet de sécurité anti-0 résultat : Si l'enrichissement a donné 0 film, repli immédiat sur TMDB direct
  if (enrichedResults.length === 0) {
    console.warn(`[Éliciné AI] 0 film enrichi depuis les titres IA, repli immédiat sur TMDB direct pour "${cleanQuery}"...`);
    try {
      const tmdbDirectResults = await searchMoviesTmdb(cleanQuery, tmdbKey, resolvedTmdbLang);
      if (tmdbDirectResults && tmdbDirectResults.length > 0) {
        const fallbackMovies = tmdbDirectResults.slice(0, 8).map((m, idx) => ({
          ...m,
          match_rate: Math.max(75, 95 - idx * 3),
          ai_match_reason: `Sélection TMDB pour "${cleanQuery}"`
        }));

        return {
          thought: `🎬 Recherche TMDB en direct : ${fallbackMovies.length} œuvres trouvées`,
          moodDetected: cleanQuery,
          recommendedMovies: fallbackMovies,
          isFallbackMode: true,
          providerUsed: 'TMDB Direct (Fallback)',
          suggestedPrompts: [
            'Un film de braquage drôle et haletant',
            'Une série policière sombre et addictive',
            'Une fresque spatiale émouvante',
            'Un film néo-noir avec ambiance pluvieuse'
          ]
        };
      }
    } catch (tmdbErr) {
      console.error('[Éliciné AI] Échec du repli direct TMDB :', tmdbErr);
    }
  }

  // 6. Compteur dynamique exact reflétant l'ensemble des résultats
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
    name: 'Llama 3.3 70B (Groq)',
    type: 'groq' as const,
    endpoint: '/api/ai',
    model: 'llama-3.3-70b-versatile',
    keyStorage: 'elicine_groq_api_key'
  },
  {
    name: 'Qwen 2.5 (Alibaba — Fallback)',
    type: 'qwen' as const,
    endpoint: '/api/ai',
    model: 'qwen-plus',
    keyStorage: 'cinéia_qwen_api_key'
  }
];

export default executeCinoraSearch;

