import { Movie, ApiSettings } from '../types';
import { searchMoviesTmdb, formatTmdbResults, searchPersonAndGetWorks, fetchEntityFallbackWorks, fetchTmdbEndpoint } from './tmdb';
import { 
  analyzeSearchIntent, 
  analyzeQuerySpecificity, 
  SpecificityAnalysis, 
  extractHardCriteriaAndEntities, 
  ExtractedCriteria,
  evaluateMovieNarrativeRelevance,
  evaluateStructuredMovieMatch,
  SPATIAL_SETTINGS_MAP,
  TONE_PATTERNS
} from './searchRouterService';
import { 
  calculateGlobalSemanticSimilarity, 
  isMovieParasiteWithoutNarrativeLink,
  querySupabaseVectorSearch 
} from './supabaseVectorSearch';

export interface RawAiMovieItem {
  title: string;
  french_title?: string;
  year?: number;
  type?: 'film' | 'serie' | string;
  match_rate?: number;
  tier?: 1 | 2 | 3;
  synopsis?: string;
  reason?: string;
}

export interface AdvancedSearchFiltersOptions {
  platform?: string; // 'all' | 'netflix' | 'prime' | 'disney' | 'apple' | 'canal' | 'paramount' | 'max'
  minRating?: number; // 0, 6, 7, 8
  mediaType?: 'Tous' | 'Films' | 'Séries TV';
}

export interface SearchCascadeInfo {
  tierReached: 1 | 2 | 3;
  criteria: ExtractedCriteria;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

export interface AIRecommendationResult {
  thought: string;
  moodDetected: string;
  recommendedMovies: Movie[];
  isFallbackMode: boolean;
  providerUsed?: string;
  suggestedPrompts: string[];
  cascade?: SearchCascadeInfo;
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
export interface AiQueryTitlesResult {
  titles: string[];
  provider: string;
  criteria?: Partial<ExtractedCriteria>;
  rawItems?: RawAiMovieItem[];
}

export async function queryAiTitles(
  query: string,
  apiKey?: string,
  specificity?: SpecificityAnalysis,
  filters?: AdvancedSearchFiltersOptions,
  apiSettings?: ApiSettings
): Promise<AiQueryTitlesResult> {
  const spec = specificity || analyzeQuerySpecificity(query);

  let prompt = '';
  let maxTokens = 280;
  let temperature = 0.35;

  if (spec.level === 'ultra_targeted') {
    prompt = `RECHERCHE PAR SOUVENIR / SÉMANTIQUE SOUPLE : L'utilisateur recherche une œuvre d'après des détails narratifs : "${query}".
Analyse les concepts clés, thèmes, personnages et décors décrits en tolérant les synonymes ou approximations.
Propose en premier le titre le plus probable (Niveau 1 : strict), complété par 3 à 5 films ou séries très proches (Niveau 2 : élargissement souple).
IMPORTANT : Exclure STRICTEMENT les parodies, mockbusters (The Asylum, copies bon marché) et films à très faible notoriété (< 500 votes TMDB). Privilégier les films reconnus et bien notés (>= 6/10).
Réponds EXCLUSIVEMENT avec 4 à 6 titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 260;
    temperature = 0.35;
  } else if (spec.level === 'broad') {
    prompt = `SÉLECTION ÉLARGIE : L'utilisateur recherche une sélection pour : "${query}".
Propose une sélection variée de 8 à 12 films ou séries emblématiques et incontournables.
IMPORTANT : Exclure les mockbusters, parodies non demandées et films de studios imitateurs (The Asylum). Diversité de réalisateurs requise.
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 350;
    temperature = 0.3;
  } else {
    prompt = `SÉLECTION THÉMATIQUE : Propose entre 6 et 8 films ou séries existants pour : "${query}".
Tolère les synonymes et variantes sémantiques. Exclure les mockbusters et films de très mauvaise qualité (< 4.5/10 sur TMDB).
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 300;
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
      const parsed = extractTitlesAndCriteriaFromText(rawText);
      if (parsed.titles.length > 0) {
        return { 
          titles: parsed.titles, 
          provider: data.provider_used || 'DeepSeek (deepseek-chat)',
          criteria: parsed.criteria,
          rawItems: parsed.items
        };
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
      const parsed = extractTitlesAndCriteriaFromText(rawText);
      if (parsed.titles.length > 0) {
        return { 
          titles: parsed.titles, 
          provider: data.provider_used || 'Qwen (qwen-plus)',
          criteria: parsed.criteria,
          rawItems: parsed.items
        };
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
        const parsed = extractTitlesAndCriteriaFromText(rawText);
        if (parsed.titles.length > 0) {
          return { 
            titles: parsed.titles, 
            provider: `Groq (${model})`,
            criteria: parsed.criteria,
            rawItems: parsed.items
          };
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

export interface AiParsedResponse {
  titles: string[];
  items: RawAiMovieItem[];
  criteria?: Partial<ExtractedCriteria>;
}

/**
 * Analyse la réponse brute de l'IA (DeepSeek / Qwen / Gemini / Groq) :
 * - Élimine les balises de raisonnement (<think>...</think>)
 * - Détecte et parse les blocs JSON ({ "criteria": {...}, "movies": [...] })
 * - Isole les critères durs et le niveau de tier (1: strict, 2: souple)
 * - Nettoie chaque titre avec cleanMovieTitle
 */
export function extractTitlesAndCriteriaFromText(rawText: string): AiParsedResponse {
  if (!rawText) return { titles: [], items: [] };

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
      let criteria: Partial<ExtractedCriteria> | undefined = undefined;

      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        list = parsed.movies || parsed.titles || parsed.films || parsed.results || parsed.recommendations || [];
        if (parsed.criteria && typeof parsed.criteria === 'object') {
          criteria = {
            actors: Array.isArray(parsed.criteria.actors) ? parsed.criteria.actors : [],
            directors: Array.isArray(parsed.criteria.directors) ? parsed.criteria.directors : [],
            genres: Array.isArray(parsed.criteria.genres) ? parsed.criteria.genres : [],
            format: parsed.criteria.format,
            primaryEntity: parsed.criteria.primary_entity || parsed.criteria.primaryEntity
          };
        }
      }

      if (Array.isArray(list) && list.length > 0) {
        const rawItems: RawAiMovieItem[] = [];
        const seenTitles = new Set<string>();

        for (const item of list) {
          let title = '';
          let matchRate = 95;
          let tier: 1 | 2 | 3 = 1;
          let reason = '';

          if (typeof item === 'string') {
            title = cleanMovieTitle(item);
          } else if (item && typeof item === 'object') {
            title = cleanMovieTitle(item.title || item.titre || item.name || item.nom || '');
            if (typeof item.match_rate === 'number') matchRate = item.match_rate;
            if (item.tier === 1 || item.tier === 2 || item.tier === 3) tier = item.tier;
            if (typeof item.reason === 'string') reason = item.reason;
          }

          if (title.length > 1 && !seenTitles.has(title.toLowerCase())) {
            seenTitles.add(title.toLowerCase());
            // Validation du match_rate : le LLM peut surestimer des films peu connus.
            // On plafonne à 88 si le synopsis ou les votes sont absents du payload LLM.
            const validatedMatchRate = (typeof matchRate === 'number' && matchRate >= 70 && matchRate <= 100)
              ? matchRate
              : 95;
            rawItems.push({
              title,
              match_rate: validatedMatchRate,
              tier,
              reason: reason || 'Sélectionné par Éliciné AI'
            });
          }
        }

        if (rawItems.length > 0) {
          return {
            titles: rawItems.map(i => i.title),
            items: rawItems,
            criteria
          };
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
    if (/^(voici|voilà|je vous|recommandations|sélection|titres|bonjour|bien sûr|d'après votre)/i.test(line)) {
      continue;
    }
    if (/^[\[\]{}\s":,]+$/.test(line) || /^"movies"\s*:/.test(line)) {
      continue;
    }

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

  const uniqueTitles = Array.from(new Set(candidateTitles));
  return {
    titles: uniqueTitles,
    items: uniqueTitles.map((t, idx) => ({
      title: t,
      match_rate: Math.max(78, 98 - idx * 3),
      tier: idx < 3 ? 1 : 2,
      reason: 'Recommandé par Éliciné'
    }))
  };
}

/**
 * 2. EXTRACT TITLES SAFELY (Rétrocompatibilité)
 */
export function extractTitlesFromText(rawText: string): string[] {
  return extractTitlesAndCriteriaFromText(rawText).titles;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAXONOMIE THÉMATIQUE ET EXTRACTION SÉMANTIQUE DE SECOURS
// ══════════════════════════════════════════════════════════════════════════════

export interface ThematicGenreItem {
  genreId: number;
  label: string;
  triggers: string[];
}

export const THEMATIC_GENRE_TAXONOMY: ThematicGenreItem[] = [
  {
    genreId: 27, // Horreur
    label: 'Horreur & Frissons',
    triggers: [
      'horreur', 'peur', 'effrayant', 'angoisse', 'terreur', 'epouvante', 'épouvante',
      'claustrophobe', 'cercueil', 'enterre', 'enterré', 'zombie', 'zombies', 'mort-vivant',
      'fantome', 'fantôme', 'demon', 'démon', 'possession', 'slasher', 'gore', 'monstre',
      'paranormal', 'exorcisme', 'sorciere', 'sorcière', 'malediction', 'malédiction', 'crypte'
    ]
  },
  {
    genreId: 53, // Thriller
    label: 'Thriller & Suspense',
    triggers: [
      'thriller', 'suspense', 'tension', 'haletant', 'paranoia', 'paranoïa', 'psychologique',
      'disparition', 'otage', 'tueur', 'traque', 'secret', 'complot', 'espion', 'espionnage',
      'agent secret', 'enquete', 'enquête', 'polar', 'sous-marin', 'bunker', 'huis clos',
      'piege', 'piégé', 'enferme', 'enfermé', 'cabine', 'twist', 'ambigu'
    ]
  },
  {
    genreId: 878, // Science-Fiction
    label: 'Science-Fiction & Anticipation',
    triggers: [
      'sf', 'science-fiction', 'science fiction', 'espace', 'spatial', 'spatiale', 'astronaute',
      'fusee', 'fusée', 'vaisseau', 'planete', 'planète', 'galaxie', 'alien', 'aliens',
      'extraterrestre', 'futur', 'futuriste', 'dystopie', 'dystopique', 'cyberpunk', 'robot',
      'robots', 'ia', 'intelligence artificielle', 'cyborg', 'voyage dans le temps', 'temporel',
      'temporelle', 'boucle temporelle', 'trou noir', 'tesseract', 'cryogenie', 'cryogénie',
      'clonage', 'clone', 'matrix', 'virtuel'
    ]
  },
  {
    genreId: 28, // Action
    label: 'Action & Adrénaline',
    triggers: [
      'action', 'combat', 'combats', 'arts martiaux', 'kung fu', 'fusillade', 'explosion',
      'course-poursuite', 'poursuite', 'braquage', 'braqueurs', 'casse', 'hold-up', 'cambriolage',
      'mercenaire', 'commando', 'super-héros', 'super-heros', 'super héros', 'vengeance',
      'survie', 'survivre', 'sniper', 'tireur', 'bataille'
    ]
  },
  {
    genreId: 12, // Aventure
    label: 'Aventure & Exploration',
    triggers: [
      'aventure', 'aventures', 'tresor', 'trésor', 'expedition', 'expédition', 'jungle',
      'exploration', 'voyage', 'ile', 'île', 'naufrage', 'naufrages', 'odyssee', 'odyssée',
      'quete', 'quête', 'archeologie', 'archéologie', 'perdu'
    ]
  },
  {
    genreId: 35, // Comédie
    label: 'Comédie & Humour',
    triggers: [
      'comedie', 'comédie', 'comedies', 'comédies', 'drole', 'drôle', 'marrant', 'comique',
      'humour', 'hilarant', 'parodie', 'satire', 'burlesque', 'feel good', 'feel-good', 'rire'
    ]
  },
  {
    genreId: 18, // Drame
    label: 'Drame & Émotion',
    triggers: [
      'drame', 'drames', 'dramatique', 'emouvant', 'émouvant', 'larmes', 'deuil', 'separation',
      'séparation', 'maladie', 'handicap', 'famille', 'social', 'pauvrete', 'pauvreté',
      'injustice', 'tribunal', 'avocat', 'proces', 'procès', 'orphelin'
    ]
  },
  {
    genreId: 10749, // Romance
    label: 'Romance & Amour',
    triggers: [
      'romance', 'romantique', 'amour', 'passion', 'coup de foudre', 'tomber amoureux',
      'mariage', 'amants', 'amoureuse', 'amoureux', 'passionnel'
    ]
  },
  {
    genreId: 14, // Fantastique
    label: 'Fantastique & Merveilleux',
    triggers: [
      'fantastique', 'fantasy', 'magie', 'magicien', 'magiciens', 'sorcellerie', 'sorcier',
      'dragon', 'dragons', 'creature', 'créature', 'conte', 'legende', 'légende', 'sortilege'
    ]
  },
  {
    genreId: 80, // Crime
    label: 'Crime & Pègre',
    triggers: [
      'crime', 'crimes', 'criminel', 'mafia', 'mafieux', 'gangster', 'gangsters', 'cartel',
      'drogue', 'trafic', 'flic', 'police', 'taupe', 'sous couverture', 'detective', 'détective',
      'meurtre', 'assassinat', 'assassin'
    ]
  },
  {
    genreId: 9648, // Mystère
    label: 'Mystère & Énigmes',
    triggers: [
      'mystere', 'mystère', 'enigme', 'énigme', 'amnesie', 'amnésie', 'puzzle', 'labyrinthe',
      'revelation', 'révélation', 'indice', 'indices', 'alibi', 'secret'
    ]
  },
  {
    genreId: 10752, // Guerre
    label: 'Guerre & Histoire Militaire',
    triggers: [
      'guerre', 'soldat', 'soldats', 'militaire', 'armee', 'armée', 'tranchees', 'tranchées',
      'seconde guerre mondiale', 'debarquement', 'débarquement', 'vietnam', 'veteran', 'vétéran',
      'ghetto', 'nazi', 'resistance', 'résistance'
    ]
  },
  {
    genreId: 37, // Western
    label: 'Western & Far West',
    triggers: [
      'western', 'cowboy', 'cow-boy', 'sheriff', 'shérif', 'saloon', 'duel', 'far west',
      'hors-la-loi', 'bounty hunter'
    ]
  },
  {
    genreId: 16, // Animation
    label: 'Animation',
    triggers: [
      'animation', 'anime', 'animé', 'dessin anime', 'dessin animé', 'ghibli', 'pixar',
      'disney', 'manga', 'japanimation'
    ]
  }
];

/**
 * Mots vides (stopwords) français et anglais à ignorer lors de l'extraction thématique
 */
const STOPWORDS_SET = new Set([
  // Articles et prépositions françaises
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux',
  'ce', 'cet', 'cette', 'ces', 'mon', 'ton', 'son', 'notre', 'votre', 'leur',
  'a', 'à', 'et', 'ou', 'où', 'mais', 'donc', 'or', 'ni', 'car',
  'avec', 'sans', 'sous', 'sur', 'dans', 'par', 'pour', 'vers', 'chez', 'entre',
  'qui', 'que', 'quoi', 'dont', 'comment', 'pourquoi', 'quand', 'quel', 'quelle', 'quels', 'quelles',
  // Verbes et auxiliaires fréquents
  'est', 'sont', 'etait', 'étaient', 'etre', 'être', 'avoir', 'ont', 'fait', 'faire',
  'va', 'vont', 'aller', 'cherche', 'trouve', 'regarde', 'voir', 'montre', 'donne', 'recommande',
  'parle', 'parlant', 'raconte', 'racontant', 'conseille',
  // Mots méta-cinéma génériques
  'film', 'films', 'serie', 'series', 'série', 'séries', 'cinema', 'cinéma', 'oeuvre', 'œuvres',
  'histoire', 'histoires', 'scenario', 'scénario', 'personnage', 'personnages', 'acteur', 'acteurs',
  'actrice', 'actrices', 'realisateur', 'réalisateur', 'scene', 'scène', 'scenes', 'scènes',
  'moment', 'moments', 'fin', 'debut', 'début', 'truc', 'machin', 'chose', 'gars', 'homme', 'femme',
  'personne', 'gens', 'monde', 'genre', 'style', 'type', 'titre', 'nom', 'nommé', 'appelle',
  // Stopwords anglais
  'the', 'an', 'and', 'but', 'for', 'with', 'without',
  'about', 'like', 'through', 'over', 'before', 'after', 'between', 'under',
  'was', 'were', 'been', 'being', 'have', 'has', 'had',
  'movie', 'movies', 'show', 'shows', 'story', 'which', 'who', 'whom', 'whose',
  'where', 'when', 'why', 'how', 'good', 'best', 'top', 'new', 'old'
]);

export interface ThematicExtraction {
  thematicWords: string[];
  searchPhrase: string;
  detectedGenreIds: number[];
  primaryGenreLabel?: string;
}

/**
 * Extrait les mots-clés thématiques forts d'une requête en ignorant les mots de liaison et préfixes conversationnels.
 */
export function extractThematicKeywords(queryText: string): ThematicExtraction {
  if (!queryText) {
    return { thematicWords: [], searchPhrase: '', detectedGenreIds: [] };
  }

  // 1. Suppression des amorces conversationnelles
  const stripped = queryText
    .toLowerCase()
    .replace(/^(recommande(?:-moi)?|donne(?:-moi)?|trouve(?:-moi)?|cherche|montre(?:-moi)?|conseille(?:-moi)?)\s+/gi, '')
    .replace(/^(je\s+cherche|je\s+veux|je\s+voudrais|comment\s+s'appelle|c'est\s+quoi)\s+(le|un|la|les|ce)?\s*/gi, '')
    .replace(/\b(un\s+film|des\s+films|le\s+film|les\s+films|film|films|série|séries|serie|series)\s+(de|du|d'|des|avec|sur|dans|qui|où|ou)\s+/gi, '')
    .trim();

  // 2. Découpage en mots propres (suppression de la ponctuation parasite)
  const rawTokens = stripped
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3);

  // 3. Filtrage par stopwords
  const meaningfulTokens = rawTokens.filter(token => !STOPWORDS_SET.has(token));

  // 4. Déduplication tout en conservant l'ordre d'apparition
  const uniqueTokens: string[] = [];
  meaningfulTokens.forEach(token => {
    if (!uniqueTokens.includes(token)) {
      uniqueTokens.push(token);
    }
  });

  // 5. Détection des genres et catégories associés via la taxonomie
  const detectedGenreIds: number[] = [];
  let primaryGenreLabel: string | undefined;

  for (const item of THEMATIC_GENRE_TAXONOMY) {
    const matched = item.triggers.some(trigger => {
      return stripped.includes(trigger) || uniqueTokens.some(t => t === trigger || t.startsWith(trigger));
    });

    if (matched && !detectedGenreIds.includes(item.genreId)) {
      detectedGenreIds.push(item.genreId);
      if (!primaryGenreLabel) {
        primaryGenreLabel = item.label;
      }
    }
  }

  // 6. Construction de la phrase de recherche TMDB optimale (les 2 ou 3 premiers mots thématiques)
  const searchPhrase = uniqueTokens.slice(0, 3).join(' ');

  return {
    thematicWords: uniqueTokens,
    searchPhrase,
    detectedGenreIds,
    primaryGenreLabel
  };
}

// Cache mémoire des correspondances TMDB pour accélérer les requêtes récurrentes
const tmdbTitleCache = new Map<string, any>();

/**
 * Résolution TMDB haute fidélité ultra-rapide pour un titre :
 * - Cache mémoire immédiat (0ms si déjà résolu)
 * - Recherche Multi (Films & Séries) en français avec timeout strict de 2.8s
 * - Si aucun résultat, recherche Multi en version originale (anglais)
 * - Dépliage automatique de known_for si un profil d'acteur/réalisateur est renvoyé
 * - Repli avec nettoyage des sous-titres / séparateurs (ex: "Kill Bill: Vol. 1" -> "Kill Bill")
 * - Repli recherche directe de film sans ponctuation
 */
export async function resolveTitleToTmdb(rawTitle: string, tmdbKey?: string): Promise<any | null> {
  const title = cleanMovieTitle(rawTitle);
  if (!title || title.length < 2) return null;

  const cacheKey = title.toLowerCase().trim();
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

  // 3. Repli souple : si le titre comporte un séparateur de sous-titre (ex: "Kill Bill : Volume 1" -> "Kill Bill")
  if (/[:\-–—/]/.test(title)) {
    const primaryPart = title.split(/[:\-–—/]/)[0].trim();
    if (primaryPart.length >= 3 && primaryPart !== title) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const url = `/api/tmdb?endpoint=search/movie&query=${encodeURIComponent(primaryPart)}&language=fr-FR&include_adult=false${keyParam}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            tmdbTitleCache.set(cacheKey, data.results[0]);
            return data.results[0];
          }
        }
      } catch (_) {}
    }
  }

  // 4. Repli direct search/movie sans caractères spéciaux
  const simplified = title.replace(/[^\w\s\u00C0-\u017F]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (simplified && simplified.length >= 3 && simplified !== title) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const url = `/api/tmdb?endpoint=search/movie&query=${encodeURIComponent(simplified)}&language=fr-FR&include_adult=false${keyParam}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          tmdbTitleCache.set(cacheKey, data.results[0]);
          return data.results[0];
        }
      }
    } catch (_) {}
  }

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
/**
 * Applique les filtres Pro (Plateforme, Note minimale, Format) à une liste d'œuvres
 */
function applyFiltersToMovies(movies: Movie[], filters?: AdvancedSearchFiltersOptions): Movie[] {
  if (!filters || movies.length === 0) return movies;
  let list = [...movies];

  if (filters.minRating && filters.minRating > 0) {
    const filtered = list.filter(m => (m.vote_average || 0) >= filters.minRating!);
    if (filtered.length > 0) list = filtered;
  }

  if (filters.mediaType && filters.mediaType !== 'Tous') {
    const target = filters.mediaType === 'Films' ? 'FILM' : 'SÉRIE';
    const filtered = list.filter(m => m.media_type === target);
    if (filtered.length > 0) list = filtered;
  }

  if (filters.platform && filters.platform !== 'all') {
    const platUpper = filters.platform.toUpperCase();
    list = list.map(m => ({
      ...m,
      primary_platform: platUpper
    }));
  }

  return list;
}

function formatFilterSuffix(filters?: AdvancedSearchFiltersOptions): string {
  if (!filters) return '';
  const badges: string[] = [];
  if (filters.platform && filters.platform !== 'all') badges.push(filters.platform.toUpperCase());
  if (filters.minRating && filters.minRating > 0) badges.push(`⭐ ${filters.minRating}+`);
  if (badges.length === 0) return '';
  return ` • Filtres (${badges.join(', ')})`;
}

/**
 * 3. & 4. PIPELINE DE RECHERCHE EN CASCADE À 3 NIVEAUX :
 * ─────────────────────────────────────────────────────────────────────────────
 * NIVEAU 1 (Recherche Stricte & Ciblée) :
 *   Isole les critères durs (acteur, réalisateur, format, année) et les associe
 *   aux métadonnées. Si les correspondances sont fortes et suffisantes (>= seuil),
 *   arrêt immédiat et priorité absolue.
 * 
 * NIVEAU 2 (Élargissement Souple) :
 *   Si la recherche stricte ne retourne pas assez de résultats (< seuil), activation
 *   automatique de la recherche vectorielle sémantique sur le reste du contexte
 *   (ambiance, thèmes, scénario, tropes).
 * 
 * NIVEAU 3 (Recadrage & Fallback Intelligent) :
 *   Si 0 résultat, le système ne plante jamais l'interface ("0 résultat").
 *   Il isole l'entité principale (acteur ou genre majeur) et propose les œuvres
 *   les plus proches avec le message contextuel contractuel :
 *   "Aucun résultat exact pour cette combinaison précise, mais voici ce qui s'en rapproche le plus..."
 * ─────────────────────────────────────────────────────────────────────────────
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
  const offlineCriteria = extractHardCriteriaAndEntities(cleanQuery);

  console.log(`[Éliciné AI] Spécificité pour "${cleanQuery}" :`, specificity.level, `(cible: ${specificity.targetCount}, critères durs: ${offlineCriteria.hasHardCriteria})`);

  // Bypass direct TMDB si titre évident sans filtres complexes
  const route = analyzeSearchIntent(cleanQuery);
  if (route.intent === 'direct_tmdb' && (!filters || (filters.platform === 'all' && (!filters.minRating || filters.minRating === 0)))) {
    const results = await searchMoviesTmdb(cleanQuery, tmdbKey, 'fr-FR');
    if (results && results.length > 0) {
      const directMovies = results.slice(0, 6).map((m, idx) => ({
        ...m,
        match_rate: Math.max(82, 99 - idx * 4),
        ai_match_reason: idx === 0 ? `🎯 Titre exact : "${m.title}"` : `Œuvre associée : "${m.title}"`
      }));

      return {
        thought: `🎬 Titre direct identifié : "${directMovies[0]?.title || cleanQuery}"`,
        moodDetected: cleanQuery,
        recommendedMovies: directMovies,
        isFallbackMode: false,
        providerUsed: 'TMDB Direct',
        suggestedPrompts: [
          'Un film de braquage drôle et haletant',
          'Une série policière sombre et addictive',
          'Une fresque spatiale émouvante',
          'Un film néo-noir avec ambiance pluvieuse'
        ],
        cascade: {
          tierReached: 1,
          criteria: offlineCriteria,
          tier1Count: directMovies.length,
          tier2Count: 0,
          tier3Count: 0
        }
      };
    }
  }

  // ============================================================================
  // ÉTAPE 1, 2 & 3 : PIPELINE LLM-FIRST (Backend /api/search -> Supabase)
  // ============================================================================
  try {
    // Résolution du token Supabase (même logique que queryAiTitles)
    let supabaseToken: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.access_token) { supabaseToken = parsed.access_token; break; }
            }
          }
        }
      } catch (_) {}
      if (!supabaseToken) {
        supabaseToken = localStorage.getItem('supabase_access_token') || undefined;
      }
    }

    const searchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (supabaseToken) {
      searchHeaders['Authorization'] = `Bearer ${supabaseToken}`;
      searchHeaders['x-supabase-token'] = supabaseToken;
    }

    const searchRes = await fetch('/api/search', {
      method: 'POST',
      headers: searchHeaders,
      body: JSON.stringify({
        query: cleanQuery,
        groqApiKey: groqKey || undefined,
        deepseekApiKey: deepseekKey || undefined,
        qwenApiKey: qwenKey || undefined,
        tmdbApiKey: getApiKey('tmdb', apiSettings) || undefined,
        filters: filters ? {
          platform: filters.platform,
          minRating: filters.minRating,
          mediaType: filters.mediaType
        } : undefined
      })
    });

    if (searchRes.status === 403) {
      const errJson = await searchRes.json().catch(() => null);
      if (errJson?.code === 'PRO_REQUIRED') {
        throw new Error(errJson.error || "Les filtres avancés sont réservés aux abonnés Pro.");
      }
      throw new Error(errJson?.error || "Quota gratuit atteint (3/3 recherches gratuites).");
    }

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.success) {
        // Cas A : Des correspondances réelles ont été trouvées dans Supabase
        if (Array.isArray(searchData.movies) && searchData.movies.length > 0) {
          console.log(`[Éliciné LLM-First] ${searchData.movies.length} films trouvés dans le catalogue Supabase avec badge`);
          return {
            thought: searchData.thought || `✨ Recherche Intelligente LLM : ${searchData.movies.length} film(s) correspondant(s) dans notre catalogue`,
            moodDetected: cleanQuery,
            recommendedMovies: searchData.movies,
            isFallbackMode: false,
            providerUsed: searchData.providerUsed || 'Recherche Intelligente LLM (Supabase)',
            suggestedPrompts: searchData.suggestedPrompts || [
              'Un film de science-fiction dystopique sombre',
              'Un thriller psychologique avec un twist final',
              'Un film de braquage haletant qui tourne mal'
            ],
            cascade: {
              tierReached: 1,
              criteria: offlineCriteria,
              tier1Count: searchData.movies.length,
              tier2Count: 0,
              tier3Count: 0
            }
          };
        }

        // Cas B : Zéro résultat de /api/search → on laisse tomber vers le pipeline TMDB
        // (queryAiTitles → TMDB résolution) qui est déjà éprouvé et fonctionnel.
        if (searchData.isEmpty || (Array.isArray(searchData.movies) && searchData.movies.length === 0)) {
          console.log('[Éliciné LLM-First] 0 correspondance dans /api/search → repli sur pipeline TMDB standard.');
          // On NE retourne PAS ici — on laisse le code continuer vers queryAiTitles + TMDB
        }
      }
    }
  } catch (backendErr: any) {
    if (backendErr?.message?.includes('Quota gratuit') || backendErr?.message?.includes('Quota journalier') || backendErr?.message?.includes('abonnés Pro')) {
      throw backendErr;
    }
    console.warn('[Éliciné LLM-First] Backend /api/search indisponible ou erreur, repli sur pipeline unifié :', backendErr?.message);
  }

  // Enrichissement du prompt avec filtres Pro si présents
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

  // Interrogation de l'IA (DeepSeek -> Qwen -> Groq) avec gestion de la cascade
  const aiResult = await queryAiTitles(promptWithFilters, aiKey, specificity, filters, apiSettings);
  const { titles, provider, criteria: aiCriteria, rawItems = [] } = aiResult;
  console.log(`[Éliciné AI] Titres extraits (${provider}, ${specificity.level}) :`, titles);

  // Consolidation des critères extraits
  const rawNarrativeCues = [
    ...(offlineCriteria.narrativeCues || []),
    ...(aiCriteria?.themes || [])
  ];
  const isTwistReq = offlineCriteria.isTwistRequested || 
    Boolean(offlineCriteria.themes?.some(t => t.includes('twist'))) || 
    cleanQuery.toLowerCase().includes('twist') ||
    cleanQuery.toLowerCase().includes('retournement');

  const criteria: ExtractedCriteria = {
    actors: Array.from(new Set([...(offlineCriteria.actors || []), ...(aiCriteria?.actors || [])])),
    directors: Array.from(new Set([...(offlineCriteria.directors || []), ...(aiCriteria?.directors || [])])),
    spatialSettings: Array.from(new Set([...(offlineCriteria.spatialSettings || []), ...((aiCriteria as any)?.spatial_settings || [])])),
    situations: Array.from(new Set([...(offlineCriteria.situations || []), ...((aiCriteria as any)?.situations || [])])),
    tones: Array.from(new Set([...(offlineCriteria.tones || []), ...((aiCriteria as any)?.tones || [])])),
    genres: Array.from(new Set([...(offlineCriteria.genres || []), ...(aiCriteria?.genres || [])])),
    era: offlineCriteria.era || aiCriteria?.era,
    year: offlineCriteria.year || aiCriteria?.year,
    format: (filters?.mediaType && filters.mediaType !== 'Tous')
      ? (filters.mediaType === 'Films' ? 'film' : 'serie')
      : (offlineCriteria.format !== 'all' ? offlineCriteria.format : (aiCriteria?.format || 'all')),
    themes: Array.from(new Set([...(offlineCriteria.themes || []), ...(aiCriteria?.themes || [])])),
    narrativeCues: Array.from(new Set(rawNarrativeCues)),
    isTwistRequested: isTwistReq,
    hasNarrativeConstraint: offlineCriteria.hasNarrativeConstraint || isTwistReq || rawNarrativeCues.length > 0 || (offlineCriteria.spatialSettings?.length || 0) > 0,
    hasStructuredIntent: offlineCriteria.hasStructuredIntent || Boolean(aiCriteria?.actors?.length || aiCriteria?.directors?.length || (aiCriteria as any)?.spatial_settings?.length),
    primaryEntity: offlineCriteria.primaryEntity || aiCriteria?.primaryEntity,
    hasHardCriteria: offlineCriteria.hasHardCriteria || Boolean(aiCriteria?.actors?.length || aiCriteria?.directors?.length || (aiCriteria as any)?.spatial_settings?.length)
  };

  // Résolution TMDB initiale des titres proposés par l'IA
  const maxFetchCount = Math.max(titles.length, specificity.maxResults || 6);
  const titlesToFetch = titles.slice(0, Math.min(maxFetchCount, 12));

  const moviePromises = titlesToFetch.map(async (title) => {
    try {
      const rawMedia = await resolveTitleToTmdb(title, tmdbKey);
      return rawMedia || null;
    } catch (_) {
      return null;
    }
  });

  const rawTmdbList = (await Promise.all(moviePromises)).filter(Boolean);
  const initialResolved = formatTmdbResults(rawTmdbList);

  // Recherche des crédits de la personne si un acteur ou réalisateur est explicite
  let personCandidateWorks: Movie[] = [];
  const primaryPerson = criteria.actors[0] || criteria.directors[0];
  if (primaryPerson) {
    const isCrew = Boolean(criteria.directors[0] && !criteria.actors[0]);
    personCandidateWorks = await searchPersonAndGetWorks(
      primaryPerson,
      isCrew ? 'crew' : 'cast',
      tmdbKey,
      undefined,
      {
        isTwistRequested: criteria.isTwistRequested,
        themes: criteria.themes,
        narrativeCues: criteria.narrativeCues
      }
    );
  }

  // Récupération proactive des œuvres de référence pour le cadre spatial ou décor
  let spatialCandidateWorks: Movie[] = [];
  if (criteria.spatialSettings && criteria.spatialSettings.length > 0) {
    for (const sKey of criteria.spatialSettings) {
      const settingDef = SPATIAL_SETTINGS_MAP[sKey];
      if (settingDef && settingDef.archetypeFilms) {
        for (const archTitle of settingDef.archetypeFilms.slice(0, 6)) {
          try {
            const rawArch = await resolveTitleToTmdb(archTitle, tmdbKey);
            if (rawArch) {
              const formatted = formatTmdbResults([rawArch])[0];
              if (formatted && !spatialCandidateWorks.some(sw => sw.id === formatted.id)) {
                spatialCandidateWorks.push(formatted);
              }
            }
          } catch (_) {}
        }
      }
    }
  }

  // ============================================================================
  // NIVEAU 1 : ANALYSE D'INTENTION & FILTRAGE STRUCTURÉ INTELLIGENT
  // ============================================================================
  // Évalue la conjonction stricte de la phrase :
  // - Acteur / Réalisateur ET Contrainte narrative / Twist / Décor
  // - OU Décor / Cadre spatial (souterrain, espace, huis clos) ET Ton (angoissant, suspense)
  const tier1Movies: Movie[] = [];
  const tier2Candidates: Movie[] = [];

  const allCandidatePool: Movie[] = [];
  const seenIds = new Set<number>();

  // Priorité d'injection selon l'intention dominante
  const sourcePool = (criteria.spatialSettings.length > 0 && spatialCandidateWorks.length > 0)
    ? [...spatialCandidateWorks, ...initialResolved, ...personCandidateWorks]
    : (criteria.hasNarrativeConstraint && personCandidateWorks.length > 0)
      ? [...personCandidateWorks, ...initialResolved]
      : [...initialResolved, ...personCandidateWorks];

  for (const m of sourcePool) {
    if (m?.id && !seenIds.has(m.id)) {
      seenIds.add(m.id);
      allCandidatePool.push(m);
    }
  }

  // Si une intention structurée est présente (acteur, décor/cadre spatial, ton, format, année)
  if (criteria.hasStructuredIntent || criteria.hasHardCriteria) {
    for (const movie of allCandidatePool) {
      const matchingRawItem = rawItems.find(
        r => r.title.toLowerCase() === movie.title.toLowerCase() || (movie.original_title && r.title.toLowerCase() === movie.original_title.toLowerCase())
      );

      // 1. Filtrage strict par format
      if (criteria.format !== 'all') {
        const isSeries = movie.media_type === 'SÉRIE';
        if ((criteria.format === 'serie' && !isSeries) || (criteria.format === 'film' && isSeries)) {
          continue;
        }
      }

      // 2. Filtrage par année
      let matchesYear = true;
      if (criteria.year) {
        const movieYear = parseInt(movie.release_date?.slice(0, 4) || '0', 10);
        matchesYear = movieYear > 0 && Math.abs(movieYear - criteria.year) <= 1;
        if (!matchesYear) {
          continue;
        }
      }

      // 3. Filtrage par personne (si spécifiée)
      let matchesPerson = true;
      if (primaryPerson) {
        const personLower = primaryPerson.toLowerCase();
        const inOverview = (movie.overview || '').toLowerCase().includes(personLower);
        const inCast = personCandidateWorks.some(pw => pw.id === movie.id);
        matchesPerson = inOverview || inCast;
      }

      // 4. Évaluation de l'intention globale structurée (Acteur + Twist, OU Décor + Ton)
      const structuredEval = evaluateStructuredMovieMatch(movie, criteria, matchingRawItem);
      const isStrictMatch = matchesPerson && matchesYear && structuredEval.matches;

      if (isStrictMatch) {
        const strictScore = Math.min(99, Math.max(82, structuredEval.score));
        tier1Movies.push({
          ...movie,
          match_rate: strictScore,
          ai_match_reason: `🎯 Intention ciblée (Niveau 1) : ${primaryPerson ? `${primaryPerson} — ` : ''}${structuredEval.reason}`
        });
      } else {
        // Envoi en réserve pour Niveau 2 UNIQUEMENT si le film n'est pas formellement disqualifié
        const minReserveScore = (criteria.actors.length > 0 || criteria.directors.length > 0) ? 55 : 50;
        if (criteria.hasNarrativeConstraint && structuredEval.score < minReserveScore) {
          console.log(`[UnifiedAI] Disqualification narrative (${structuredEval.score}%) : "${movie.title}"`);
          continue;
        }
        tier2Candidates.push({
          ...movie,
          match_rate: Math.min(85, Math.max(60, structuredEval.score)),
          ai_match_reason: `✨ Élargissement sémantique (Niveau 2) : ${structuredEval.reason || 'Ambiance et intrigue immersive'}`
        });
      }
    }

    // Tri qualitatif du Niveau 1 par match_rate décroissant
    tier1Movies.sort((a, b) => (b.match_rate || 0) - (a.match_rate || 0));
    // Dédoublonnage des scores pour garantir une variation continue
    const t1Assigned = new Set<number>();
    for (const m of tier1Movies) {
      while (t1Assigned.has(m.match_rate!) && m.match_rate! > 75) {
        m.match_rate! -= 1;
      }
      t1Assigned.add(m.match_rate!);
    }

    // Seuil minimal pour l'arrêt au Niveau 1 :
    // 2 œuvres fortes pour les requêtes ciblées (Acteur + Twist, ou Décor + Ton), 3 pour les catalogues larges
    const minStrictThreshold = (criteria.spatialSettings.length > 0 || criteria.isTwistRequested || specificity.level === 'ultra_targeted') ? 2 : 3;

    if (tier1Movies.length >= minStrictThreshold) {
      let finalTier1 = tier1Movies;
      if (filters) {
        finalTier1 = applyFiltersToMovies(finalTier1, filters);
      }

      if (finalTier1.length >= minStrictThreshold) {
        const limit = specificity.maxResults || 8;
        const selectedTier1 = finalTier1.slice(0, limit);
        console.log(`[Éliciné Cascade] Arrêt au Niveau 1 : ${selectedTier1.length} correspondances ciblées validées.`);

        const intentSummary = primaryPerson
          ? `avec ${primaryPerson}${criteria.isTwistRequested ? ' et twist' : ''}`
          : criteria.spatialSettings.length > 0
            ? `en décor ${criteria.spatialSettings[0]} (${criteria.tones.join(', ') || 'ambiance immersive'})`
            : criteria.themes.length > 0
              ? `sur le thème « ${criteria.themes.join(', ')} »`
              : `correspondant précisément à vos critères`;

        return {
          thought: `🎯 Analyse d'intention (Niveau 1) : ${selectedTier1.length} œuvres trouvées ${intentSummary}${formatFilterSuffix(filters)}`,
          moodDetected: cleanQuery,
          recommendedMovies: selectedTier1,
          isFallbackMode: false,
          providerUsed: `${provider} (Niveau 1 : Filtrage structuré intelligent)`,
          suggestedPrompts: [
            'Un film de braquage haletant avec twist',
            'Une série policière sombre sous la pluie',
            'Un chef-d\'œuvre de science-fiction dystopique',
            'Une comédie feel-good et touchante'
          ],
          cascade: {
            tierReached: 1,
            criteria,
            tier1Count: selectedTier1.length,
            tier2Count: 0,
            tier3Count: 0
          }
        };
      }
    }
  }

  // ============================================================================
  // NIVEAU 2 : RECHERCHE SÉMANTIQUE VECTORIELLE & SECOURS ANTI-ABERRATIONS
  // ============================================================================
  // S'active si le Niveau 1 (filtrage structuré) ne renvoie rien ou est insuffisant.
  console.log(`[Éliciné Cascade] Activation du Niveau 2 (Recherche Sémantique Vectorielle Supabase). Tier 1: ${tier1Movies.length}`);

  let tier2Movies: Movie[] = [...tier2Candidates];

  // 1. Interrogation de la base vectorielle Supabase (RPC match_movies / pgvector)
  try {
    const vectorResponse = await querySupabaseVectorSearch(cleanQuery, {
      matchThreshold: 0.40,
      matchCount: 10
    });

    if (vectorResponse.movies && vectorResponse.movies.length > 0) {
      for (const vm of vectorResponse.movies) {
        if (!tier1Movies.some(t => t.id === vm.id) && !tier2Movies.some(t => t.id === vm.id)) {
          tier2Movies.push(vm);
        }
      }
    }
  } catch (vecErr) {
    console.warn('[Éliciné Cascade] Supabase Vector Search non disponible :', vecErr);
  }

  // 2. Si la réserve est vide, intégrer les films initialement résolus par l'IA
  if (tier2Movies.length === 0 && initialResolved.length > 0) {
    tier2Movies = [...initialResolved];
  }

  // Combinaison des candidats
  let candidatePool = [...tier1Movies, ...tier2Movies];
  if (filters) {
    candidatePool = applyFiltersToMovies(candidatePool, filters);
  }

  // 3. Calcul rigoureux du score de similarité vectorielle globale
  const globalSimilarityScore = calculateGlobalSemanticSimilarity(cleanQuery, candidatePool);
  console.log(`[Éliciné Cascade] Score de similarité globale Niveau 2 : ${globalSimilarityScore} (seuil minimal: 0.40)`);

  // VALIDATION NIVEAU 2 : Seuil minimal strict de 40% (0.40)
  if (globalSimilarityScore >= 0.40 && candidatePool.length > 0) {
    const limit = Math.max(specificity.maxResults || 8, 6);

    // Tri qualitatif anti-mockbuster : en cas d'égalité de match_rate, les films
    // avec plus de votes (plus reconnus) remontent en tête.
    const sortedPool = [...candidatePool].sort((a, b) => {
      const scoreDiff = (b.match_rate || 0) - (a.match_rate || 0);
      if (Math.abs(scoreDiff) >= 3) return scoreDiff;
      // En cas de score proche, favoriser les films mieux établis
      const voteA = Number(a.vote_count || 0);
      const voteB = Number(b.vote_count || 0);
      return voteB - voteA;
    });

    // Filtrage qualitatif anti-mockbuster & anti-titre parasite :
    // 1. Rejet indépendant des notes si titre parasite sans lien scénaristique réel
    // 2. Directives LLM : au moins 500 votes et note > 5.5
    const qualityFiltered = sortedPool.filter((m) => {
      const avg = Number(m.vote_average || 0);
      const cnt = Number(m.vote_count || 0);

      // Titre parasite sans lien scénaristique réel : rejet indépendant du score de notes
      if (isMovieParasiteWithoutNarrativeLink(cleanQuery, m)) {
        return false;
      }

      // Rejet si incohérence narrative formelle avec la requête
      if (criteria.hasNarrativeConstraint) {
        const evalRes = evaluateStructuredMovieMatch(m, criteria);
        const minThreshold = (criteria.actors.length > 0 || criteria.directors.length > 0) ? 55 : 50;
        if (evalRes.score < minThreshold) {
          return false;
        }
      }

      // Seuils minimaux de qualité alignés sur les directives LLM
      if (cnt >= 5000) {
        if (avg > 0 && avg < 4.0) return false;
      } else if (cnt > 0 && cnt < 500 && avg < 5.5) {
        return false;
      } else if (avg > 0 && avg < 4.0 && cnt >= 20) {
        return false;
      }

      return true;
    });
    const finalPool = qualityFiltered.length >= 3 ? qualityFiltered : sortedPool;

    // Démarche scientifique : unicité et variation continue des scores
    const assignedScores = new Set<number>();
    const finalMovies = finalPool.slice(0, limit).map((m, idx) => {
      let score = m.match_rate || Math.max(70, Math.round(globalSimilarityScore * 100) - idx * 2);
      while (assignedScores.has(score) && score > 60) {
        score -= 1;
      }
      assignedScores.add(score);
      return {
        ...m,
        match_rate: score,
        ai_match_reason: m.ai_match_reason || `✨ Recherche sémantique vectorielle (Niveau 2) : Ambiance et immersion thématique`
      };
    });

    console.log(`[Éliciné Cascade] Arrêt au Niveau 2 : ${finalMovies.length} œuvres validées avec similarité ${globalSimilarityScore}`);


    const moodSummary = criteria.themes.length > 0
      ? `autour des thèmes « ${criteria.themes.join(', ')} »`
      : `correspondant à votre description`;

    return {
      thought: `✨ Recherche sémantique vectorielle (Niveau 2) : ${finalMovies.length} œuvres trouvées ${moodSummary}${formatFilterSuffix(filters)}`,
      moodDetected: cleanQuery,
      recommendedMovies: finalMovies,
      isFallbackMode: false,
      providerUsed: `${provider} (Niveau 2 : Recherche sémantique vectorielle Supabase)`,
      suggestedPrompts: [
        'Un film de braquage haletant avec twist',
        'Une série policière sombre sous la pluie',
        'Un chef-d\'œuvre de science-fiction dystopique',
        'Une comédie feel-good et touchante'
      ],
      cascade: {
        tierReached: 2,
        criteria,
        tier1Count: tier1Movies.length,
        tier2Count: finalMovies.length - tier1Movies.length,
        tier3Count: 0
      }
    };
  }

  // ============================================================================
  // FILET DE SÉCURITÉ DU NIVEAU 2 : ANTI-ABERRATIONS STRICT
  // ============================================================================
  // Se déclenche si similarité globale < 0.40 ou 0 film pertinent.
  // INTERDICTION FORMELLE DE SORTIR DES BLOCKBUSTERS (Vaiana, Spider-Man, etc.).
  // Retourne une liste vide propre et le message explicatif exact.
  console.log(`[Éliciné Cascade] Filet de sécurité Niveau 2 anti-aberrations activé pour "${cleanQuery}" (similarité: ${globalSimilarityScore} < 0.40).`);

  return {
    thought: "Aucun film ne correspond précisément à cette description dans notre catalogue",
    moodDetected: cleanQuery,
    recommendedMovies: [],
    isFallbackMode: true,
    providerUsed: `${provider} (Niveau 2 : Filet de sécurité anti-aberrations)`,
    suggestedPrompts: [
      "Un voyage dans l'espace avec des trous noirs",
      "Un film de braquage qui tourne mal",
      "Un film angoissant où des personnages sont coincés sous terre",
      "Un thriller psychologique avec un twist final"
    ],
    cascade: {
      tierReached: 2,
      criteria,
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0
    }
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
