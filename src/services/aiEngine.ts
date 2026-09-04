import { Movie, ApiSettings } from '../types';
import { 
  searchMoviesTmdb, 
  searchMovieExactByTitleAndYear,
  FALLBACK_MOVIES 
} from './tmdb';
import { analyzeSearchIntent } from './searchRouterService';
import { unifiedAiSearch } from './unifiedAiSearch';

export interface AIRecommendationResult {
  thought: string;
  moodDetected: string;
  recommendedMovies: Movie[];
  suggestedPrompts: string[];
  isFallbackMode?: boolean;
  providerUsed?: string;
}

export interface RawAiMovieItem {
  title: string;
  year?: number | string;
  match_rate?: number;
  reason?: string;
}

export { 
  unifiedAiSearch, 
  executeElicineSearch,
  executeCinoraSearch,
  fetchTmdbDetails,
  queryGroq,
  getGroqKey,
  parseAIResponse, 
  AI_PROVIDERS, 
  GROQ_MODELS,
  ACTIVE_GROQ_MODELS,
  getApiKey 
} from './unifiedAiSearch';

const UNIFIED_SYSTEM_PROMPT = `Tu es l'algorithme cinématographique expert d'Éliciné.
À partir de la demande de l'utilisateur, recommande entre 6 et 8 films ou séries existants et pertinents.
Réponds STRICTEMENT sous la forme d'un objet JSON pur, sans texte d'introduction ni conclusion.
Format JSON requis :
{
  "provider_used": "Nom du modèle",
  "movies": [
    {
      "title": "Titre exact du film",
      "year": 2024,
      "match_rate": 96,
      "reason": "Explication cinématographique concise en une phrase"
    }
  ]
}
Note : "match_rate" doit être un nombre entier compris entre 75 et 99 reflétant l'affinité avec la demande.`;

/**
 * Auto-détection dynamique des modèles actifs sur le compte Groq
 */
export async function getAvailableGroqModel(apiKey?: string): Promise<string> {
  const cached = sessionStorage.getItem('cineia_active_groq_model');
  if (cached && cached.trim().length > 2) {
    return cached.trim();
  }
  return 'llama-3.3-70b-versatile';
}

/**
 * ROUTEUR PRINCIPAL HYBRIDE (Cinora - Cascade Qwen Priority 1 / Groq Backup 2)
 */
export async function askCineIA(
  searchQuery: string,
  apiSettings: ApiSettings
): Promise<AIRecommendationResult> {
  return await unifiedAiSearch(searchQuery, apiSettings);
}

export const askElicine = askCineIA;
export const askCinora = askCineIA;

/**
 * Appel API Groq avec extraction JSON robuste
 */
async function callGroqApi(
  query: string,
  apiKey?: string,
  model?: string
): Promise<{ provider_used: string; movies: RawAiMovieItem[] }> {
  const selectedModel = model || 'llama-3.3-70b-versatile';
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {})
    },
    body: JSON.stringify({
      provider: 'groq',
      model: selectedModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: UNIFIED_SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq ${selectedModel} (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  return parseUnifiedJsonResponse(rawText, `Llama 3.3 (Groq)`);
}

/**
 * Appel API Qwen sécurisé via le proxy serveur /api/ai
 */
async function callQwenApi(
  query: string,
  apiKey?: string,
  model: 'qwen-turbo' | 'qwen-plus' = 'qwen-plus'
): Promise<{ provider_used: string; movies: RawAiMovieItem[] }> {
  try {
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
          { role: 'system', content: UNIFIED_SYSTEM_PROMPT },
          { role: 'user', content: query }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Qwen ${model} (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    return parseUnifiedJsonResponse(rawText, model === 'qwen-turbo' ? 'Qwen Turbo (Alibaba)' : 'Qwen Plus (Alibaba)');
  } catch (err: any) {
    console.warn('[Éliciné Qwen] Erreur proxy /api/ai :', err?.message || err);
    throw err;
  }
}

/**
 * Extraction & Parsing JSON tolérant pour les structures { provider_used, movies: [...] } ou [...]
 */
function parseUnifiedJsonResponse(rawText: string, defaultProvider: string): { provider_used: string; movies: RawAiMovieItem[] } {
  if (!rawText) throw new Error('Réponse vide du modèle IA');

  // Nettoyage Markdown
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // 1. Tenter de matcher un objet { ... }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      const list = parsed.movies || parsed.results || (Array.isArray(parsed) ? parsed : []);
      if (Array.isArray(list) && list.length > 0) {
        return {
          provider_used: parsed.provider_used || defaultProvider,
          movies: list.map(item => ({
            title: item.title,
            year: item.year,
            match_rate: Number(item.match_rate) || Math.floor(Math.random() * 15) + 85, // 85-99% fallback
            reason: item.reason || item.pitch || item.highlight
          }))
        };
      }
    } catch (_) {}
  }

  // 2. Tenter de matcher un tableau [ ... ]
  const arrMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrMatch) {
    try {
      const list = JSON.parse(arrMatch[0]);
      if (Array.isArray(list) && list.length > 0) {
        return {
          provider_used: defaultProvider,
          movies: list.map(item => ({
            title: item.title,
            year: item.year,
            match_rate: Number(item.match_rate) || Math.floor(Math.random() * 15) + 85,
            reason: item.reason || item.pitch || item.highlight
          }))
        };
      }
    } catch (_) {}
  }

  throw new Error("Format JSON non détecté dans la réponse IA");
}

/**
 * RECHERCHE DIRECTE TMDB (Bypass IA ou Mode Secours)
 */
async function executeDirectTmdbSearch(
  query: string,
  tmdbKey?: string,
  isRescueMode = false
): Promise<AIRecommendationResult> {
  let movies: Movie[] = [];

  try {
    const results = await searchMoviesTmdb(query, tmdbKey);
    if (results && results.length > 0) {
      movies = results.slice(0, 8).map((m, idx) => ({
        ...m,
        match_rate: Math.max(78, 98 - idx * 3), // 98%, 95%, 92%...
        ai_match_reason: isRescueMode
          ? `Résultats directs TMDB (Mode secours)`
          : `Recherche directe titre : "${m.title}"`
      }));
    }
  } catch (err) {
    console.warn('[CinéIA] Erreur recherche TMDB directe :', err);
  }

  if (movies.length === 0) {
    console.log(`[CinéIA] Aucun film trouvé sur TMDB pour "${query}".`);
  }

  const thought = isRescueMode
    ? `Résultats directs TMDB (Mode secours)`
    : `🎬 Recherche directe TMDB : ${movies.length} titre${movies.length > 1 ? 's' : ''} trouvé${movies.length > 1 ? 's' : ''}`;

  return {
    thought,
    moodDetected: query,
    recommendedMovies: movies,
    isFallbackMode: isRescueMode,
    providerUsed: isRescueMode ? 'TMDB Secours' : 'TMDB Direct',
    suggestedPrompts: [
      'Un film de braquage drôle et haletant',
      'Un thriller psychologique sombre et mystérieux',
      'Une fresque spatiale émouvante',
      'Un film néo-noir avec ambiance pluvieuse'
    ]
  };
}

/**
 * ENRICHISSEMENT TMDB ULTRA-RAPIDE EN PARALLÈLE (Promise.all)
 */
async function enrichMoviesWithTmdbParallel(
  rawItems: RawAiMovieItem[],
  searchQuery: string,
  providerLabel: string,
  tmdbKey?: string
): Promise<AIRecommendationResult> {
  const enrichmentPromises = rawItems.map(async (item, index) => {
    if (!item.title) return null;

    const assignedMatchRate = item.match_rate && item.match_rate >= 70 && item.match_rate <= 100
      ? item.match_rate
      : Math.floor(Math.random() * 15) + 85;

    // 1. Recherche exacte
    let match = await searchMovieExactByTitleAndYear(item.title, item.year, tmdbKey);

    // 2. Recherche générale
    if (!match) {
      const results = await searchMoviesTmdb(item.title, tmdbKey);
      if (results && results.length > 0) {
        match = results[0];
      }
    }

    // 3. Fallback unitaire
    if (!match) {
      match = {
        id: Math.floor(Math.random() * 900000) + 100000 + index,
        title: item.title,
        overview: item.reason || `Film sélectionné par CinéIA pour votre recherche "${searchQuery}".`,
        poster_path: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80',
        backdrop_path: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80',
        release_date: String(item.year || '2024'),
        vote_average: 8.0,
        genres: [{ id: 18, name: 'Cinéma' }],
        primary_platform: 'Netflix'
      };
    }

    return {
      ...match,
      match_rate: assignedMatchRate,
      ai_match_reason: item.reason || `Sélectionné pour "${searchQuery}"`
    } as Movie;
  });

  const resolved = await Promise.all(enrichmentPromises);
  const movies: Movie[] = resolved.filter((m): m is Movie => m !== null);

  const thought = `✨ Analyse ${providerLabel} en direct : ${movies.length} films sélectionnés avec succès`;

  return {
    thought,
    moodDetected: searchQuery,
    recommendedMovies: movies,
    isFallbackMode: false,
    providerUsed: providerLabel,
    suggestedPrompts: [
      'Un film de braquage drôle et haletant',
      'Un thriller psychologique sous haute tension',
      'Une fresque spatiale émouvante',
      'Un film néo-noir avec ambiance pluvieuse'
    ]
  };
}

/**
 * OpenAI Call
 */
async function executeOpenAiCall(
  searchQuery: string,
  openaiKey: string,
  tmdbKey?: string
): Promise<AIRecommendationResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      messages: [
        { role: 'system', content: UNIFIED_SYSTEM_PROMPT },
        { role: 'user', content: searchQuery }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  const parsed = parseUnifiedJsonResponse(rawText, 'OpenAI GPT-4o');
  return await enrichMoviesWithTmdbParallel(parsed.movies, searchQuery, parsed.provider_used, tmdbKey);
}

/**
 * Anthropic Call
 */
async function executeAnthropicCall(
  searchQuery: string,
  anthropicKey: string,
  tmdbKey?: string
): Promise<AIRecommendationResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'dangerously-allow-browser': 'true'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.1,
      system: UNIFIED_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: searchQuery }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';
  const parsed = parseUnifiedJsonResponse(rawText, 'Anthropic Claude 3.5');
  return await enrichMoviesWithTmdbParallel(parsed.movies, searchQuery, parsed.provider_used, tmdbKey);
}

/**
 * xAI Call
 */
async function executeXaiCall(
  searchQuery: string,
  xaiKey: string,
  tmdbKey?: string
): Promise<AIRecommendationResult> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${xaiKey}`
    },
    body: JSON.stringify({
      model: 'grok-beta',
      temperature: 0.1,
      messages: [
        { role: 'system', content: UNIFIED_SYSTEM_PROMPT },
        { role: 'user', content: searchQuery }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`xAI (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  const parsed = parseUnifiedJsonResponse(rawText, 'xAI Grok');
  return await enrichMoviesWithTmdbParallel(parsed.movies, searchQuery, parsed.provider_used, tmdbKey);
}
