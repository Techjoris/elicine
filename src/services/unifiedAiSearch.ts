import { Movie, ApiSettings } from '../types';
import { searchMoviesTmdb, formatTmdbResults } from './tmdb';
import { analyzeSearchIntent, analyzeQuerySpecificity, SpecificityAnalysis } from './searchRouterService';

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
 * 1. QUERY AI DYNAMIQUE (Groq first, fallback Qwen)
 * - Requête Large : demande 16 titres variés et emblématiques (liste complète).
 * - Requête Ultra-Ciblée : exige strictement 1 à 2 titres exacts sans aucun remplissage.
 * - Requête Thématique : demande 6 à 8 titres pertinents.
 */
export async function queryAiTitles(
  query: string,
  apiKey?: string,
  specificity?: SpecificityAnalysis
): Promise<{ titles: string[]; provider: string }> {
  const spec = specificity || analyzeQuerySpecificity(query);

  let prompt = '';
  let maxTokens = 300;
  let temperature = 0.2;

  if (spec.level === 'ultra_targeted') {
    prompt = `IDENTIFICATION ULTRA-CIBLÉE : L'utilisateur recherche une œuvre précise d'après des détails narratifs stricts : "${query}".
Identifie avec une exactitude absolue UNIQUEMENT la ou les 1 à 2 œuvres réelles qui correspondent à l'ENSEMBLE de ces détails (aucun film approximatif, aucune recommandation large, aucun film de remplissage).
Réponds EXCLUSIVEMENT avec le ou les titres exacts séparés par des virgules (1 ou 2 titres maximum).`;
    maxTokens = 100;
    temperature = 0.0;
  } else if (spec.level === 'broad') {
    prompt = `SÉLECTION ÉLARGIE : L'utilisateur recherche une sélection large et complète pour : "${query}".
Propose une liste riche et diversifiée d'environ 15 à 18 films ou séries incontournables et emblématiques qui correspondent parfaitement à cette catégorie (mélange de classiques et de références modernes).
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans numérotation ni texte additionnel.`;
    maxTokens = 650;
    temperature = 0.3;
  } else {
    prompt = `SÉLECTION THÉMATIQUE : Propose entre 6 et 8 films ou séries existants et pertinents pour l'ambiance ou le thème : "${query}".
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 250;
    temperature = 0.2;
  }

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
          temperature,
          max_tokens: maxTokens
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
          temperature,
          max_tokens: maxTokens
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
  const specificity = analyzeQuerySpecificity(userQuery);
  const { titles } = await queryAiTitles(userQuery, apiKey, specificity);
  const limit = specificity.maxResults;
  return titles.slice(0, limit).map((t, idx) => ({
    title: t,
    match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 96) : Math.max(78, 98 - idx * 3),
    reason: specificity.level === 'ultra_targeted' ? 'Correspondance exacte identifiée' : 'Recommandé par Éliciné'
  }));
}

export async function queryQwen(userQuery: string, apiKey?: string): Promise<RawAiMovieItem[]> {
  const specificity = analyzeQuerySpecificity(userQuery);
  const { titles } = await queryAiTitles(userQuery, apiKey, specificity);
  const limit = specificity.maxResults;
  return titles.slice(0, limit).map((t, idx) => ({
    title: t,
    match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 96) : Math.max(78, 98 - idx * 3),
    reason: specificity.level === 'ultra_targeted' ? 'Correspondance exacte identifiée' : 'Recommandé par Éliciné'
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
 * 3. & 4. PIPELINE END-TO-END AVEC ADAPTATION DE DENSITÉ ET VOLUME :
 * - Analyse de spécificité (Large vs Ultra-Ciblée vs Modérée)
 * - Query AI adaptée (prompts spécialisés, volume ciblé)
 * - Fetch TMDB en parallèle pour le volume exact attendu
 * - Restriction stricte des résultats si ultra-ciblée (1-2 titres) ou expansion riche si large (14-16 titres)
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
  const specificity = analyzeQuerySpecificity(cleanQuery);

  console.log(`[Éliciné AI] Spécificité détectée pour "${cleanQuery}" :`, specificity.level, `(cible: ${specificity.targetCount}, score: ${specificity.score})`);

  // Recherche directe TMDB si titre direct évident
  const route = analyzeSearchIntent(cleanQuery);
  if (route.intent === 'direct_tmdb') {
    const results = await searchMoviesTmdb(cleanQuery, tmdbKey, 'fr-FR');
    const movies = (results || []).slice(0, 6).map((m, idx) => ({
      ...m,
      match_rate: Math.max(82, 99 - idx * 4),
      ai_match_reason: idx === 0 ? `Titre exact : "${m.title}"` : `Œuvre associée : "${m.title}"`
    }));

    return {
      thought: `🎬 Titre direct identifié : "${movies[0]?.title || cleanQuery}"`,
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

  // 1 & 2. Interrogation de l'IA avec prompt adapté à la spécificité
  let { titles, provider } = await queryAiTitles(cleanQuery, groqKey, specificity);
  console.log(`[Éliciné AI] Titres extraits (${provider}, ${specificity.level}) :`, titles);

  // 3. Hydratation depuis TMDB selon le volume adéquat
  let resolvedMovies: Movie[] = [];
  if (titles.length > 0) {
    // Restreindre strictement pour les requêtes ultra-ciblées (max 2 ou 3) ou élargir pour les requêtes larges (max 16)
    const titlesToFetch = titles.slice(0, specificity.maxResults);

    const moviePromises = titlesToFetch.map(async (title) => {
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
      resolvedMovies = formatTmdbResults(rawTmdbList).map((m, idx) => {
        let matchRate = Math.max(78, 98 - idx * 3);
        let matchReason = `Sélection cinématographique pour "${cleanQuery}"`;

        if (specificity.level === 'ultra_targeted') {
          matchRate = idx === 0 ? 99 : (idx === 1 ? 96 : 92);
          matchReason = `Correspondance exacte avec vos critères narratifs précis`;
        } else if (specificity.level === 'broad') {
          matchRate = Math.max(80, 99 - idx * 2);
          matchReason = `Sélection incontournable pour la catégorie "${cleanQuery}"`;
        }

        return {
          ...m,
          match_rate: matchRate,
          ai_match_reason: matchReason
        };
      });
    }
  }

  // Si l'IA a échoué ou aucun titre n'a été trouvé dans TMDB :
  // Recherche directe de la requête utilisateur sur TMDB comme fallback ultime
  if (resolvedMovies.length === 0) {
    console.log(`[Éliciné AI] Fallback direct TMDB avec "${cleanQuery}"`);
    try {
      const fallbackLimit = specificity.maxResults;
      const fallbackUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/movie')}&query=${encodeURIComponent(cleanQuery)}&language=fr-FR&include_adult=false${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.results && fallbackData.results.length > 0) {
          resolvedMovies = formatTmdbResults(fallbackData.results.slice(0, fallbackLimit)).map((m, idx) => ({
            ...m,
            match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 95) : Math.max(75, 95 - idx * 3),
            ai_match_reason: specificity.level === 'ultra_targeted' 
              ? `Correspondance TMDB directe pour "${cleanQuery}"`
              : `Sélection TMDB pour "${cleanQuery}"`
          }));
        }
      }

      // Si search/movie n'a rien retourné, essayer search/multi
      if (resolvedMovies.length === 0) {
        const multiUrl = `/api/tmdb?endpoint=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(cleanQuery)}&language=fr-FR${tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : ''}`;
        const multiRes = await fetch(multiUrl);
        if (multiRes.ok) {
          const multiData = await multiRes.json();
          const valid = (multiData.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, fallbackLimit);
          if (valid.length > 0) {
            resolvedMovies = formatTmdbResults(valid).map((m, idx) => ({
              ...m,
              match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 95) : Math.max(75, 95 - idx * 3),
              ai_match_reason: `Sélection TMDB pour "${cleanQuery}"`
            }));
          }
        }
      }
    } catch (e) {
      console.error('[Éliciné AI] Échec du fallback direct TMDB :', e);
    }
  }

  // 4. Formulation du message d'explication selon la spécificité
  let thoughtMessage = `✨ ${resolvedMovies.length} œuvres trouvées pour "${cleanQuery}"`;
  if (specificity.level === 'ultra_targeted') {
    thoughtMessage = resolvedMovies.length === 1
      ? `🎯 Œuvre exacte identifiée selon vos critères stricts pour "${cleanQuery}"`
      : `🎯 Correspondance ultra-ciblée (${resolvedMovies.length} œuvres exactes trouvées) pour "${cleanQuery}"`;
  } else if (specificity.level === 'broad') {
    thoughtMessage = `🎬 Sélection élargie (${resolvedMovies.length} œuvres trouvées) pour explorer "${cleanQuery}"`;
  }

  return {
    thought: thoughtMessage,
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
export { analyzeQuerySpecificity };
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
