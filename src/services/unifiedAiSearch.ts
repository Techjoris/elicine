import { Movie, ApiSettings } from '../types';
import { searchMoviesTmdb, formatTmdbResults } from './tmdb';
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
 * 1. QUERY AI (Groq first, fallback Qwen)
 * Prompt épuré : "Liste 5 films pour: [query]. Réponds UNIQUEMENT avec les titres séparés par des virgules."
 */
export async function queryAiTitles(query: string, apiKey?: string): Promise<{ titles: string[]; provider: string }> {
  const prompt = `Liste 5 films pour: ${query}. Réponds UNIQUEMENT avec les titres séparés par des virgules.`;

  // TENTATIVE 1 : GROQ (Llama 3.3 70B / 8B Instant)
  for (const model of ACTIVE_GROQ_MODELS) {
    try {
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
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 200
        })
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        const titles = extractTitlesFromText(rawText);
        if (titles.length > 0) {
          return { titles, provider: `Groq (${model})` };
        }
      }
    } catch (err) {
      console.warn(`[Éliciné AI] Échec Groq (${model}) :`, err);
    }
  }

  // TENTATIVE 2 : FALLBACK QWEN
  for (const model of ACTIVE_QWEN_MODELS) {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {})
        },
        body: JSON.stringify({
          provider: 'qwen',
          model: model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 200
        })
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        const titles = extractTitlesFromText(rawText);
        if (titles.length > 0) {
          return { titles, provider: `Qwen (${model})` };
        }
      }
    } catch (err) {
      console.warn(`[Éliciné AI] Échec Qwen (${model}) :`, err);
    }
  }

  return { titles: [], provider: 'Fallback' };
}

/**
 * 2. EXTRACT TITLES SAFELY
 * Sépare par virgules ou retours à la ligne et nettoie les puces/chiffres/guillemets
 */
export function extractTitlesFromText(rawText: string): string[] {
  if (!rawText) return [];

  // Si l'IA a répondu en JSON par réflexe
  try {
    const cleanContent = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (cleanContent.startsWith('{') || cleanContent.startsWith('[')) {
      const parsed = JSON.parse(cleanContent);
      const arr = Array.isArray(parsed) ? parsed : (parsed.movies || parsed.titles || parsed.results || []);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr
          .map(t => typeof t === 'string' ? t.trim() : String(t.title || t.titre || t.name || '').trim())
          .filter(t => t.length > 1);
      }
    }
  } catch (e) {
    // Continue sur le découpage standard
  }

  return rawText
    .split(/,|\n/)
    .map(t => t.trim().replace(/^[-*•\d.]\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter(t => t.length > 1);
}

export function extractRawMovieItems(rawText: string, userQuery?: string): RawAiMovieItem[] {
  let titles = extractTitlesFromText(rawText);
  if ((!titles || titles.length === 0) && userQuery) {
    const clean = userQuery.replace(/(film|film de|avec|une fin twist|recommande|moi)/gi, '').trim();
    if (clean.length > 1) titles = [clean];
  }

  return titles.map((t, idx) => ({
    title: t,
    match_rate: Math.max(78, 98 - idx * 3),
    reason: 'Recommandé par Éliciné'
  }));
}

export function parseAIResponse(rawText: string): RawAiMovieItem[] {
  return extractRawMovieItems(rawText);
}

export async function queryGroq(userQuery: string, apiKey?: string): Promise<RawAiMovieItem[]> {
  const { titles } = await queryAiTitles(userQuery, apiKey);
  return titles.map((t, idx) => ({
    title: t,
    match_rate: Math.max(78, 98 - idx * 3),
    reason: 'Recommandé par Éliciné'
  }));
}

export async function queryQwen(userQuery: string, apiKey?: string): Promise<RawAiMovieItem[]> {
  const { titles } = await queryAiTitles(userQuery, apiKey);
  return titles.map((t, idx) => ({
    title: t,
    match_rate: Math.max(78, 98 - idx * 3),
    reason: 'Recommandé par Éliciné'
  }));
}

export async function fetchTmdbDetails(
  item: RawAiMovieItem,
  tmdbKey: string,
  _fallbackIndex = 0,
  _tmdbLang?: string
): Promise<Movie | null> {
  const cleanTitle = item.title.trim();
  if (!cleanTitle) return null;

  try {
    const url = `/api/tmdb?endpoint=${encodeURIComponent('search/movie')}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR&include_adult=false${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const formatted = formatTmdbResults([data.results[0]]);
      return formatted[0] || null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 3. & 4. PIPELINE END-TO-END :
 * - Query AI (Groq first, fallback Qwen)
 * - Extract Titles Safely
 * - Fetch from TMDB
 * - Return Hydrated Movies (Jamais de résultat vide si TMDB match)
 */
export async function executeCinoraSearch(
  query: string,
  apiSettings?: ApiSettings,
  _tmdbLang?: string,
  _aiPromptLang?: string
): Promise<AIRecommendationResult> {
  const cleanQuery = query.trim();
  const tmdbKey = getApiKey('tmdb', apiSettings);
  const groqKey = getGroqKey(apiSettings);

  // Recherche directe TMDB si titre direct évident
  const route = analyzeSearchIntent(cleanQuery);
  if (route.intent === 'direct_tmdb') {
    const results = await searchMoviesTmdb(cleanQuery, tmdbKey, 'fr-FR');
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

  // 1 & 2. Interrogation de l'IA et extraction des titres
  let { titles, provider } = await queryAiTitles(cleanQuery, groqKey);
  console.log(`[Éliciné AI] Titres extraits (${provider}) :`, titles);

  // 3. Hydratation depuis TMDB
  let resolvedMovies: Movie[] = [];
  if (titles.length > 0) {
    const moviePromises = titles.slice(0, 8).map(async (title) => {
      try {
        const url = `/api/tmdb?endpoint=${encodeURIComponent('search/movie')}&query=${encodeURIComponent(title)}&language=fr-FR&include_adult=false${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return (data.results && data.results.length > 0) ? data.results[0] : null;
      } catch (err) {
        return null;
      }
    });

    const rawTmdbList = (await Promise.all(moviePromises)).filter(Boolean);
    if (rawTmdbList.length > 0) {
      resolvedMovies = formatTmdbResults(rawTmdbList).map((m, idx) => ({
        ...m,
        match_rate: Math.max(78, 98 - idx * 3),
        ai_match_reason: `Sélection cinématographique pour "${cleanQuery}"`
      }));
    }
  }

  // Si l'IA a échoué ou aucun titre n'a été trouvé dans TMDB :
  // Recherche directe de la requête utilisateur sur TMDB comme fallback ultime
  if (resolvedMovies.length === 0) {
    console.log(`[Éliciné AI] Fallback direct TMDB avec "${cleanQuery}"`);
    try {
      const fallbackUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/movie')}&query=${encodeURIComponent(cleanQuery)}&language=fr-FR&include_adult=false${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.results && fallbackData.results.length > 0) {
          resolvedMovies = formatTmdbResults(fallbackData.results.slice(0, 8)).map((m, idx) => ({
            ...m,
            match_rate: Math.max(75, 95 - idx * 3),
            ai_match_reason: `Correspondance TMDB pour "${cleanQuery}"`
          }));
        }
      }

      // Si search/movie n'a rien retourné, essayer search/multi
      if (resolvedMovies.length === 0) {
        const multiUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(cleanQuery)}&language=fr-FR${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const multiRes = await fetch(multiUrl);
        if (multiRes.ok) {
          const multiData = await multiRes.json();
          const valid = (multiData.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);
          if (valid.length > 0) {
            resolvedMovies = formatTmdbResults(valid).map((m, idx) => ({
              ...m,
              match_rate: Math.max(75, 95 - idx * 3),
              ai_match_reason: `Sélection TMDB pour "${cleanQuery}"`
            }));
          }
        }
      }
    } catch (e) {
      console.error('[Éliciné AI] Échec du fallback direct TMDB :', e);
    }
  }

  // 4. Retour des films hydratés directement à l'UI
  return {
    thought: `✨ ${resolvedMovies.length} œuvres trouvées pour "${cleanQuery}"`,
    moodDetected: cleanQuery,
    recommendedMovies: resolvedMovies,
    isFallbackMode: titles.length === 0 || resolvedMovies.length === 0,
    providerUsed: provider,
    suggestedPrompts: [
      'Un film de braquage haletant avec twist',
      'Une série policière sombre sous la pluie',
      "Un chef-d'œuvre de science-fiction dystopique",
      'Une comédie feel-good et touchante'
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
