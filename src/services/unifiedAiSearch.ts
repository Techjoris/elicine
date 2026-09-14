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

export interface AdvancedSearchFiltersOptions {
  platform?: string; // 'all' | 'netflix' | 'prime' | 'disney' | 'apple' | 'canal' | 'paramount' | 'max'
  minRating?: number; // 0, 6, 7, 8
  mediaType?: 'Tous' | 'Films' | 'Séries TV';
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
 * MODÈLES QWEN ACTIFS — Moteur principal de recommandation (Précision & Compréhension sémantique)
 */
export const ACTIVE_QWEN_MODELS = [
  'qwen-plus',
  'qwen2.5-72b-instruct',
];
export const QWEN_MODELS = ACTIVE_QWEN_MODELS;

/**
 * MODÈLES DEEPSEEK ACTIFS — Fallback Haute Disponibilité (Vitesse & Résilience)
 */
export const ACTIVE_DEEPSEEK_MODELS = [
  'deepseek-flash',
  'deepseek-chat',
];
export const DEEPSEEK_MODELS = ACTIVE_DEEPSEEK_MODELS;

/**
 * MODÈLES GROQ — Filet de secours supplémentaire
 */
export const ACTIVE_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];
export const GROQ_MODELS = ACTIVE_GROQ_MODELS;

export const getQwenKey = (apiSettings?: ApiSettings): string => {
  return (
    localStorage.getItem('dashscope_api_key') ||
    localStorage.getItem('elicine_qwen_key') ||
    localStorage.getItem('elicine_qwen_api_key') ||
    localStorage.getItem('cinora_qwen_api_key') ||
    localStorage.getItem('cinéia_qwen_api_key') ||
    localStorage.getItem('cinéia_qwen_key') ||
    localStorage.getItem('qwen_api_key') ||
    apiSettings?.qwenApiKey ||
    ""
  ).trim();
};

export const getDeepSeekKey = (apiSettings?: ApiSettings): string => {
  return (
    localStorage.getItem('deepseek_api_key') ||
    localStorage.getItem('elicine_deepseek_key') ||
    localStorage.getItem('cinora_deepseek_api_key') ||
    localStorage.getItem('cinéia_deepseek_api_key') ||
    apiSettings?.deepseekApiKey ||
    ""
  ).trim();
};

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

export const getApiKey = (provider: 'qwen' | 'deepseek' | 'groq' | 'tmdb', apiSettings?: ApiSettings): string => {
  if (provider === 'qwen') return getQwenKey(apiSettings);
  if (provider === 'deepseek') return getDeepSeekKey(apiSettings);
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
  return getQwenKey(apiSettings);
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
  specificity?: SpecificityAnalysis,
  filters?: AdvancedSearchFiltersOptions,
  apiSettings?: ApiSettings
): Promise<{ titles: string[]; provider: string }> {
  const spec = specificity || analyzeQuerySpecificity(query);

  let prompt = '';
  let maxTokens = 200;
  let temperature = 0.3;

  if (spec.level === 'ultra_targeted') {
    prompt = `IDENTIFICATION ULTRA-CIBLÉE : L'utilisateur recherche une œuvre précise d'après des détails narratifs stricts : "${query}".
Identifie avec exactitude UNIQUEMENT la ou les 1 à 2 œuvres réelles correspondantes.
Réponds EXCLUSIVEMENT avec le ou les titres exacts séparés par des virgules (1 ou 2 titres maximum).`;
    maxTokens = 100;
    temperature = 0.2;
  } else if (spec.level === 'broad') {
    prompt = `SÉLECTION ÉLARGIE : L'utilisateur recherche une sélection pour : "${query}".
Propose une sélection percutante de 8 à 10 films ou séries emblématiques et incontournables.
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 220;
    temperature = 0.3;
  } else {
    prompt = `SÉLECTION THÉMATIQUE : Propose entre 6 et 8 films ou séries existants pour : "${query}".
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 180;
    temperature = 0.3;
  }

  const deviceId = typeof window !== 'undefined' ? (localStorage.getItem('elicine_device_id') || undefined) : undefined;

  // Résolution du token de session Supabase pour la vérification serveur de l'abonnement
  let supabaseToken: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.access_token) {
              supabaseToken = parsed.access_token;
              break;
            }
          }
        }
      }
    } catch (_) {}
  }

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (supabaseToken) {
      headers['x-supabase-token'] = supabaseToken;
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    } else if (supabaseToken) {
      headers['Authorization'] = `Bearer ${supabaseToken}`;
    }
    return headers;
  };

  const payloadBase = {
    query: query.slice(0, 350),
    prompt,
    deviceId,
    supabaseToken,
    deepseekApiKey: getDeepSeekKey(apiSettings) || undefined,
    qwenApiKey: getQwenKey(apiSettings) || undefined,
    groqApiKey: getGroqKey(apiSettings) || undefined,
    filters: filters ? {
      platform: filters.platform,
      minRating: filters.minRating,
      mediaType: filters.mediaType
    } : undefined,
    temperature,
    max_tokens: maxTokens
  };

  // TENTATIVE 1 : DEEPSEEK-FLASH / CHAT (MOTEUR PRINCIPAL) AVEC FALLBACK SERVEUR AUTOMATIQUE VERS QWEN
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        ...payloadBase,
        provider: 'deepseek',
        model: 'deepseek-chat'
      })
    });

    if (response.status === 403) {
      const errJson = await response.json().catch(() => null);
      if (errJson?.code === 'PRO_REQUIRED') {
        throw new Error(errJson.error || "Les filtres avancés sont réservés aux abonnés Pro.");
      }
      throw new Error(errJson?.error || "Quota gratuit atteint (3/3 recherches gratuites).");
    }

    if (response.ok) {
      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      const titles = extractTitlesFromText(rawText);
      if (titles.length > 0) {
        return { titles, provider: data.provider_used || 'DeepSeek (deepseek-chat)' };
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('Quota gratuit') || err?.message?.includes('Quota journalier') || err?.message?.includes('filtres avancés sont réservés')) {
      throw err;
    }
    console.warn('[Éliciné AI] Tentative DeepSeek échouée ou basculée, repli client vers Qwen...', err?.message || err);
  }

  // TENTATIVE 2 : APPEL DE SECOURS QWEN (DASHSCOPE - SECOURS 1)
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        ...payloadBase,
        provider: 'qwen',
        model: 'qwen-plus'
      })
    });

    if (response.status === 403) {
      const errJson = await response.json().catch(() => null);
      if (errJson?.code === 'PRO_REQUIRED') {
        throw new Error(errJson.error || "Les filtres avancés sont réservés aux abonnés Pro.");
      }
      throw new Error(errJson?.error || "Quota gratuit atteint (3/3 recherches gratuites).");
    }

    if (response.ok) {
      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      const titles = extractTitlesFromText(rawText);
      if (titles.length > 0) {
        return { titles, provider: data.provider_used || 'Qwen (qwen-plus)' };
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('Quota gratuit') || err?.message?.includes('Quota journalier') || err?.message?.includes('filtres avancés sont réservés')) {
      throw err;
    }
    console.warn('[Éliciné AI] Échec Qwen explicite (Secours 1) :', err?.message || err);
  }

  // TENTATIVE 3 : FILET DE SECOURS SUPPLÉMENTAIRE (GROQ LLAMA 3.3)
  for (const model of ACTIVE_GROQ_MODELS) {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          ...payloadBase,
          provider: 'groq',
          model
        })
      });

      if (response.status === 403) {
        const errJson = await response.json().catch(() => null);
        if (errJson?.code === 'PRO_REQUIRED') {
          throw new Error(errJson.error || "Les filtres avancés sont réservés aux abonnés Pro.");
        }
        throw new Error(errJson?.error || "Quota gratuit atteint (3/3 recherches gratuites).");
      }

      if (response.ok) {
        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        const titles = extractTitlesFromText(rawText);
        if (titles.length > 0) {
          return { titles, provider: `Groq (${model})` };
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('Quota gratuit') || err?.message?.includes('Quota journalier') || err?.message?.includes('filtres avancés sont réservés')) {
        throw err;
      }
      console.warn(`[Éliciné AI] Échec Groq (${model}) :`, err);
    }
  }

  return { titles: [], provider: 'Fallback' };
}

/**
 * Nettoie rigoureusement un titre de film ou série pour maximiser la correspondance avec TMDB :
 * - Supprime les années entre parenthèses : "(2010)", "(1997)", "(2024)"
 * - Supprime les annotations descriptives : "(Film)", "(Série TV)", "(Film de David Fincher)"
 * - Supprime les puces et numérotations : "1. ", "1 - ", "• ", "- ", "* "
 * - Supprime les guillemets et apostrophes parasites : "Inception", « The Descent »
 * - Supprime les suffixes descriptifs trop longs : "Buried - Un homme piégé dans un cercueil" -> "Buried"
 */
export function cleanMovieTitle(raw: string): string {
  if (!raw) return '';
  let cleaned = String(raw).trim();

  // 1. Supprimer les balises HTML/XML éventuelles
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // 2. Supprimer les préfixes de liste numérotée (ex: "1. ", "1) ", "1 - ") ou à puces (ex: "- ", "* ", "• ")
  // Note : exige impérativement une ponctuation (. ) - :) après les chiffres pour ne pas tronquer "10 Cloverfield Lane", "12 Angry Men" ou "28 Days Later"
  cleaned = cleaned.replace(/^(\d+[\.)\-–—:]+\s*|[\*•\-–—]\s*)/, '');

  // 3. Supprimer les guillemets et apostrophes encadrantes
  cleaned = cleaned.replace(/^["'«“‘]+|["'»”’]+$/g, '').trim();

  // 4. Supprimer les parenthèses de date ou d'information (ex: "(2010)", "(Film)", "(Série)")
  cleaned = cleaned.replace(/\s*\((?:19\d\d|20\d\d|film|série|serie|série tv|tv|court-métrage|mini-série)[^)]*\)/gi, '');
  // Supprimer toute parenthèse finale qui contient une date à 4 chiffres
  cleaned = cleaned.replace(/\s*\(\d{4}\)$/g, '');

  // 5. Si le titre contient " - " suivi d'une description longue, ne conserver que le titre principal
  if (cleaned.includes(' - ') && cleaned.length > 25) {
    const parts = cleaned.split(' - ');
    if (parts[0].length >= 2 && parts[0].length <= 50) {
      cleaned = parts[0].trim();
    }
  }

  // 6. Nettoyage final des guillemets résiduels et espaces
  cleaned = cleaned.replace(/^["'«“‘]+|["'»”’]+$/g, '').trim();

  return cleaned;
}

/**
 * 2. EXTRACT TITLES SAFELY
 * Analyse intelligemment la réponse brute de l'IA (DeepSeek / Qwen / Gemini / Groq) :
 * - Élimine les balises de raisonnement (<think>...</think>) propres à DeepSeek
 * - Détecte et parse les blocs JSON ({ "movies": [...] } ou [...])
 * - Nettoie chaque titre avec cleanMovieTitle
 * - Gère le découpage par ligne ou par virgule en repli
 * - Déduplique les titres obtenus
 */
export function extractTitlesFromText(rawText: string): string[] {
  if (!rawText) return [];

  // 1. Éliminer les balises de raisonnement de DeepSeek (<think>...</think>)
  let text = String(rawText).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Détection d'un bloc de code markdown ```json ... ``` ou ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const potentialJson = codeBlockMatch ? codeBlockMatch[1].trim() : text;

  // 3. Chercher un objet {...} ou tableau [...] JSON dans le texte
  const jsonMatch = potentialJson.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      let list: any[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        list = parsed.movies || parsed.titles || parsed.films || parsed.results || parsed.recommendations || [];
      }
      if (Array.isArray(list) && list.length > 0) {
        const titles = list
          .map(item => {
            if (typeof item === 'string') return cleanMovieTitle(item);
            if (item && typeof item === 'object') {
              return cleanMovieTitle(item.title || item.titre || item.name || item.nom || '');
            }
            return '';
          })
          .filter(t => t.length > 1);

        if (titles.length > 0) {
          return Array.from(new Set(titles));
        }
      }
    } catch (_) {
      // Si parsing JSON échoue, on continue sur le découpage textuel
    }
  }

  // 4. Extraction textuelle résiliente (lignes numérotées, tirets ou virgules)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const candidateTitles: string[] = [];

  for (const line of lines) {
    // Ignorer les lignes de politesse, d'introduction ou de métadonnées
    if (/^(voici|voilà|je vous|recommandations|sélection|titres|bonjour|bien sûr|d'après votre)/i.test(line)) {
      continue;
    }
    // Ignorer les lignes qui ressemblent à des fragments JSON résiduels
    if (/^[\[\]{}\s":,]+$/.test(line) || /^"movies"\s*:/.test(line)) {
      continue;
    }

    // Si la ligne contient des séparateurs par virgule, tester si c'est une liste à plat
    if (line.includes(',') && !line.startsWith('-') && !line.startsWith('*') && !/^\d+\./.test(line)) {
      const parts = line.split(',').map(p => cleanMovieTitle(p)).filter(p => p.length > 1);
      if (parts.length > 1) {
        candidateTitles.push(...parts);
        continue;
      }
    }

    const cleaned = cleanMovieTitle(line);
    if (cleaned.length > 1 && cleaned.length < 100) {
      candidateTitles.push(cleaned);
    }
  }

  return Array.from(new Set(candidateTitles));
}

// Cache mémoire des correspondances TMDB pour accélérer les requêtes récurrentes
const tmdbTitleCache = new Map<string, any>();

/**
 * Résolution TMDB haute fidélité ultra-rapide pour un titre :
 * - Cache mémoire immédiat (0ms si déjà résolu)
 * - Recherche Multi (Films & Séries) en français avec timeout strict de 2.8s
 * - Si aucun résultat, recherche Multi en version originale (anglais)
 * - Dépliage automatique de known_for si un profil d'acteur/réalisateur est renvoyé
 */
export async function resolveTitleToTmdb(rawTitle: string, tmdbKey?: string): Promise<any | null> {
  const title = cleanMovieTitle(rawTitle);
  if (!title || title.length < 2) return null;

  const cacheKey = title.toLowerCase();
  if (tmdbTitleCache.has(cacheKey)) {
    return tmdbTitleCache.get(cacheKey);
  }

  const keyParam = tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : '';

  // 1. Essai search/multi en français (couvre films, séries et personnes en une seule requête)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const url = `/api/tmdb?endpoint=search/multi&query=${encodeURIComponent(title)}&language=fr-FR&include_adult=false${keyParam}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const media = data.results.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
        if (media) {
          tmdbTitleCache.set(cacheKey, media);
          return media;
        }
        if (data.results[0]?.known_for?.length > 0) {
          const item = data.results[0].known_for[0];
          tmdbTitleCache.set(cacheKey, item);
          return item;
        }
        tmdbTitleCache.set(cacheKey, data.results[0]);
        return data.results[0];
      }
    }
  } catch (_) {}

  // 2. Repli rapide search/multi en anglais (pour titres originaux non traduits)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const url = `/api/tmdb?endpoint=search/multi&query=${encodeURIComponent(title)}&language=en-US&include_adult=false${keyParam}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const media = data.results.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
        if (media) {
          tmdbTitleCache.set(cacheKey, media);
          return media;
        }
        if (data.results[0]?.known_for?.length > 0) {
          const item = data.results[0].known_for[0];
          tmdbTitleCache.set(cacheKey, item);
          return item;
        }
        tmdbTitleCache.set(cacheKey, data.results[0]);
        return data.results[0];
      }
    }
  } catch (_) {}

  return null;
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

export async function queryDeepSeek(userQuery: string, apiKey?: string): Promise<RawAiMovieItem[]> {
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
  const cleanTitle = cleanMovieTitle(item.title);
  if (!cleanTitle) return null;

  try {
    const rawMedia = await resolveTitleToTmdb(cleanTitle, tmdbKey);
    if (rawMedia) {
      const formatted = formatTmdbResults([rawMedia]);
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
 * - Query AI adaptée (prompts spécialisés, volume ciblé avec Qwen -> DeepSeek-Flash fallback)
 * - Fetch TMDB en parallèle pour le volume exact attendu
 * - Restriction stricte des résultats si ultra-ciblée (1-2 titres) ou expansion riche si large (14-16 titres)
 */
export async function executeCinoraSearch(
  query: string,
  apiSettings?: ApiSettings,
  _tmdbLang?: string,
  _aiPromptLang?: string,
  filters?: AdvancedSearchFiltersOptions
): Promise<AIRecommendationResult> {
  const cleanQuery = query.trim();
  const tmdbKey = getApiKey('tmdb', apiSettings);
  const qwenKey = getQwenKey(apiSettings);
  const deepseekKey = getDeepSeekKey(apiSettings);
  const groqKey = getGroqKey(apiSettings);
  const aiKey = qwenKey || deepseekKey || groqKey;
  const specificity = analyzeQuerySpecificity(cleanQuery);

  console.log(`[Éliciné AI] Spécificité détectée pour "${cleanQuery}" :`, specificity.level, `(cible: ${specificity.targetCount}, score: ${specificity.score})`);

  // Enrichissement de la requête pour l'IA si des filtres Pro sont actifs
  let promptWithFilters = cleanQuery;
  if (filters?.platform && filters.platform !== 'all') {
    promptWithFilters += ` (disponible sur ${filters.platform.toUpperCase()})`;
  }
  if (filters?.minRating && filters.minRating > 0) {
    promptWithFilters += ` (note minimale ${filters.minRating}/10)`;
  }
  if (filters?.mediaType && filters.mediaType !== 'Tous') {
    promptWithFilters += ` (format: ${filters.mediaType})`;
  }

  // Recherche directe TMDB si titre direct évident sans filtres complexes
  const route = analyzeSearchIntent(cleanQuery);
  if (route.intent === 'direct_tmdb' && (!filters || (filters.platform === 'all' && (!filters.minRating || filters.minRating === 0)))) {
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

  // 1 & 2. Interrogation de l'IA avec prompt adapté à la spécificité et aux filtres (DeepSeek -> Qwen -> Gemini)
  let { titles, provider } = await queryAiTitles(promptWithFilters, aiKey, specificity, filters, apiSettings);
  console.log(`[Éliciné AI] Titres extraits (${provider}, ${specificity.level}) :`, titles);

  // 3. Hydratation depuis TMDB selon le volume adéquat
  let resolvedMovies: Movie[] = [];
  if (titles.length > 0) {
    // Restreindre strictement pour les requêtes ultra-ciblées (max 2 ou 3) ou élargir pour les requêtes larges (max 16)
    const titlesToFetch = titles.slice(0, specificity.maxResults);

    const moviePromises = titlesToFetch.map(async (title) => {
      try {
        const rawMedia = await resolveTitleToTmdb(title, tmdbKey);
        return rawMedia || null;
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
      const keyParam = tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : '';

      // Nettoyage de la requête : retirer les préfixes conversationnels
      // ex: "film de leonardo dicaprio" -> "leonardo dicaprio"
      // ex: "films d'horreur claustrophobe" -> "horreur claustrophobe"
      const strippedQuery = cleanQuery
        .replace(/^(recommande(?:-moi)?|donne(?:-moi)?|trouve(?:-moi)?|cherche|montre(?:-moi)?)\s+/i, '')
        .replace(/^(un\s+film|des\s+films|le\s+film|les\s+films|film|films|série|séries|serie|series)\s+(de|du|d'|des|avec|sur|dans)\s+/i, '')
        .replace(/^(un\s+film|des\s+films|le\s+film|les\s+films|film|films|série|séries)\s+/i, '')
        .trim();

      const searchTarget = strippedQuery || cleanQuery;
      console.log(`[Éliciné AI] Requête nettoyée pour fallback TMDB : "${searchTarget}" (original: "${cleanQuery}")`);

      // 1. Recherche Multi (Films, Séries, Personnes) avec la requête nettoyée
      const multiUrl = `/api/tmdb?endpoint=search/multi&query=${encodeURIComponent(searchTarget)}&language=fr-FR&include_adult=false${keyParam}`;
      const multiRes = await fetch(multiUrl);

      if (multiRes.ok) {
        const multiData = await multiRes.json();
        const results = multiData.results || [];
        if (results.length > 0) {
          // formatTmdbResults déplie automatiquement les oeuvres de known_for si un profil d'acteur/réalisateur est renvoyé
          const formatted = formatTmdbResults(results.slice(0, fallbackLimit));
          if (formatted.length > 0) {
            resolvedMovies = formatted.map((m, idx) => ({
              ...m,
              match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 95) : Math.max(75, 95 - idx * 3),
              ai_match_reason: `Sélection TMDB pour "${cleanQuery}"`
            }));
          }
        }
      }

      // 2. Si search/multi n'a rien donné, essayer search/movie direct
      if (resolvedMovies.length === 0) {
        const movieUrl = `/api/tmdb?endpoint=search/movie&query=${encodeURIComponent(searchTarget)}&language=fr-FR&include_adult=false${keyParam}`;
        const movieRes = await fetch(movieUrl);
        if (movieRes.ok) {
          const movieData = await movieRes.json();
          if (movieData.results && movieData.results.length > 0) {
            resolvedMovies = formatTmdbResults(movieData.results.slice(0, fallbackLimit)).map((m, idx) => ({
              ...m,
              match_rate: specificity.level === 'ultra_targeted' ? (idx === 0 ? 99 : 95) : Math.max(75, 95 - idx * 3),
              ai_match_reason: `Sélection TMDB pour "${cleanQuery}"`
            }));
          }
        }
      }

      // 3. Si toujours 0 résultat, essayer par mot-clé de genre incontournable
      if (resolvedMovies.length === 0) {
        const lower = cleanQuery.toLowerCase();
        const GENRE_KEYWORD_MAP: Record<string, number> = {
          'horreur': 27,
          'peur': 27,
          'angoisse': 27,
          'claustrophobe': 27,
          'action': 28,
          'aventure': 12,
          'animation': 16,
          'animé': 16,
          'comédie': 35,
          'comedie': 35,
          'drame': 18,
          'thriller': 53,
          'suspense': 53,
          'sf': 878,
          'science-fiction': 878,
          'science fiction': 878,
          'western': 37,
          'romance': 10749,
          'guerre': 10752
        };

        let matchedGenreId: number | null = null;
        for (const [kw, gid] of Object.entries(GENRE_KEYWORD_MAP)) {
          if (lower.includes(kw)) {
            matchedGenreId = gid;
            break;
          }
        }

        if (matchedGenreId) {
          console.log(`[Éliciné AI] Secours Discover par genre TMDB (${matchedGenreId}) pour "${cleanQuery}"`);
          const discUrl = `/api/tmdb?endpoint=discover/movie&with_genres=${matchedGenreId}&sort_by=vote_average.desc&vote_count.gte=100&language=fr-FR${keyParam}`;
          const discRes = await fetch(discUrl);
          if (discRes.ok) {
            const discData = await discRes.json();
            if (discData.results && discData.results.length > 0) {
              resolvedMovies = formatTmdbResults(discData.results.slice(0, fallbackLimit)).map((m, idx) => ({
                ...m,
                match_rate: Math.max(75, 92 - idx * 3),
                ai_match_reason: `Les incontournables du genre pour "${cleanQuery}"`
              }));
            }
          }
        }
      }
    } catch (e) {
      console.error('[Éliciné AI] Échec du fallback direct TMDB :', e);
    }
  }

  // 3. bis : Application des filtres Pro post-résolution (Note minimale, Plateforme, Format)
  if (resolvedMovies.length > 0 && filters) {
    // a) Filtre de note minimale
    if (filters.minRating && filters.minRating > 0) {
      const filteredByRating = resolvedMovies.filter(m => (m.vote_average || 0) >= filters.minRating!);
      if (filteredByRating.length > 0) {
        resolvedMovies = filteredByRating;
      }
    }

    // b) Filtre de type de média (Films vs Séries)
    if (filters.mediaType && filters.mediaType !== 'Tous') {
      const targetType = filters.mediaType === 'Films' ? 'FILM' : 'SÉRIE';
      const filteredByType = resolvedMovies.filter(m => m.media_type === targetType);
      if (filteredByType.length > 0) {
        resolvedMovies = filteredByType;
      }
    }

    // c) Marquage de la plateforme sélectionnée
    if (filters.platform && filters.platform !== 'all') {
      const platUpper = filters.platform.toUpperCase();
      resolvedMovies = resolvedMovies.map(m => ({
        ...m,
        primary_platform: platUpper
      }));
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

  if (filters && ((filters.platform && filters.platform !== 'all') || (filters.minRating && filters.minRating > 0))) {
    const badgeList = [];
    if (filters.platform && filters.platform !== 'all') badgeList.push(filters.platform.toUpperCase());
    if (filters.minRating && filters.minRating > 0) badgeList.push(`⭐ ${filters.minRating}+`);
    thoughtMessage += ` • Filtres Pro (${badgeList.join(', ')})`;
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
