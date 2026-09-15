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
  let maxTokens = 280;
  let temperature = 0.35;

  if (spec.level === 'ultra_targeted') {
    prompt = `RECHERCHE PAR SOUVENIR / SÉMANTIQUE SOUPLE : L'utilisateur recherche une œuvre d'après des détails narratifs : "${query}".
Analyse les concepts clés, thèmes, personnages et décors décrits en tolérant les synonymes ou approximations.
Propose en premier le titre le plus probable, complété par 3 à 5 films ou séries très proches (même univers, trope ou ambiance).
Réponds EXCLUSIVEMENT avec 4 à 6 titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 260;
    temperature = 0.35;
  } else if (spec.level === 'broad') {
    prompt = `SÉLECTION ÉLARGIE : L'utilisateur recherche une sélection pour : "${query}".
Propose une sélection variée de 8 à 12 films ou séries emblématiques et incontournables.
Réponds EXCLUSIVEMENT avec les titres exacts séparés par des virgules, sans texte additionnel.`;
    maxTokens = 350;
    temperature = 0.3;
  } else {
    prompt = `SÉLECTION THÉMATIQUE : Propose entre 6 et 8 films ou séries existants pour : "${query}".
Tolère les synonymes et variantes sémantiques.
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
    // Récupération souple : on prend jusqu'à 8-10 titres en parallèle pour garantir une liste riche
    const maxFetchCount = Math.max(titles.length, specificity.maxResults || 6);
    const titlesToFetch = titles.slice(0, Math.min(maxFetchCount, 10));

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
          matchRate = idx === 0 ? 99 : (idx === 1 ? 95 : Math.max(78, 92 - idx * 2));
          matchReason = idx === 0 
            ? `Correspondance principale avec votre description`
            : `Œuvre très proche partageant la même ambiance ou trope`;
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

  let isFallbackTriggered = false;
  let fallbackExtraction: ThematicExtraction | null = null;

  // Si l'IA a échoué ou aucun titre n'a été trouvé dans TMDB :
  // DÉCLENCHEMENT DU SYSTÈME DE REPLI (FALLBACK) AUTOMATIQUE MULTI-NIVEAUX
  if (resolvedMovies.length === 0) {
    isFallbackTriggered = true;
    console.log(`[Éliciné AI] Aucun résultat direct pour "${cleanQuery}". Lancement du système de repli sémantique...`);
    const fallbackLimit = Math.max(6, specificity.maxResults || 6);
    const keyParam = tmdbKey ? `&api_key=${encodeURIComponent(tmdbKey)}` : '';

    // Extraction des mots-clés thématiques (en ignorant les mots de liaison)
    fallbackExtraction = extractThematicKeywords(cleanQuery);
    const { thematicWords, searchPhrase, detectedGenreIds, primaryGenreLabel } = fallbackExtraction;
    console.log('[Éliciné AI] Mots thématiques extraits :', thematicWords, 'Phrase cible :', searchPhrase, 'Genres détectés :', detectedGenreIds);

    try {
      // ─── NIVEAU 1 : RECHERCHE TMDB PAR MOTS-CLÉS THÉMATIQUES ÉPURÉS ───────────
      if (searchPhrase) {
        // 1.1 Recherche movie avec la phrase thématique (sans mots de liaison)
        const movieUrl = `/api/tmdb?endpoint=search/movie&query=${encodeURIComponent(searchPhrase)}&language=fr-FR&include_adult=false${keyParam}`;
        const movieRes = await fetch(movieUrl);
        if (movieRes.ok) {
          const movieData = await movieRes.json();
          if (movieData.results && movieData.results.length > 0) {
            resolvedMovies = formatTmdbResults(movieData.results.slice(0, fallbackLimit)).map((m, idx) => ({
              ...m,
              match_rate: Math.max(76, 95 - idx * 3),
              ai_match_reason: `Repli sémantique : Thèmes « ${thematicWords.slice(0, 2).join(', ')} »`
            }));
          }
        }

        // 1.2 Si movie n'a rien donné, essayer search/multi
        if (resolvedMovies.length === 0) {
          const multiUrl = `/api/tmdb?endpoint=search/multi&query=${encodeURIComponent(searchPhrase)}&language=fr-FR&include_adult=false${keyParam}`;
          const multiRes = await fetch(multiUrl);
          if (multiRes.ok) {
            const multiData = await multiRes.json();
            if (multiData.results && multiData.results.length > 0) {
              resolvedMovies = formatTmdbResults(multiData.results.slice(0, fallbackLimit)).map((m, idx) => ({
                ...m,
                match_rate: Math.max(76, 95 - idx * 3),
                ai_match_reason: `Repli sémantique : Thèmes « ${thematicWords.slice(0, 2).join(', ')} »`
              }));
            }
          }
        }

        // 1.3 Si la phrase composée échoue mais qu'on a des mots clés individuels, essayer le mot-clé le plus spécifique
        if (resolvedMovies.length === 0 && thematicWords.length > 1) {
          const topWord = thematicWords[0];
          const singleUrl = `/api/tmdb?endpoint=search/movie&query=${encodeURIComponent(topWord)}&language=fr-FR&include_adult=false${keyParam}`;
          const singleRes = await fetch(singleUrl);
          if (singleRes.ok) {
            const singleData = await singleRes.json();
            if (singleData.results && singleData.results.length > 0) {
              resolvedMovies = formatTmdbResults(singleData.results.slice(0, fallbackLimit)).map((m, idx) => ({
                ...m,
                match_rate: Math.max(75, 93 - idx * 3),
                ai_match_reason: `Repli par mot-clé principal : « ${topWord} »`
              }));
            }
          }
        }
      }

      // ─── NIVEAU 2 : DÉCOUVERTE PAR GENRE / TROPE ÉLARGIE (TMDB DISCOVER) ────
      if (resolvedMovies.length === 0 && detectedGenreIds.length > 0) {
        const genreQuery = detectedGenreIds.slice(0, 2).join(',');
        console.log(`[Éliciné AI] Secours Discover par genres (${genreQuery}) pour "${cleanQuery}"`);

        const discUrl = `/api/tmdb?endpoint=discover/movie&with_genres=${genreQuery}&sort_by=vote_average.desc&vote_count.gte=150&language=fr-FR${keyParam}`;
        const discRes = await fetch(discUrl);
        if (discRes.ok) {
          const discData = await discRes.json();
          if (discData.results && discData.results.length > 0) {
            resolvedMovies = formatTmdbResults(discData.results.slice(0, fallbackLimit)).map((m, idx) => ({
              ...m,
              match_rate: Math.max(75, 92 - idx * 3),
              ai_match_reason: primaryGenreLabel
                ? `Recherche élargie : Les références du genre ${primaryGenreLabel}`
                : `Les incontournables du genre pour votre recherche`
            }));
          }
        }

        // Secours par popularité si vote_count.gte=150 n'a rien renvoyé
        if (resolvedMovies.length === 0) {
          const popUrl = `/api/tmdb?endpoint=discover/movie&with_genres=${genreQuery}&sort_by=popularity.desc&language=fr-FR${keyParam}`;
          const popRes = await fetch(popUrl);
          if (popRes.ok) {
            const popData = await popRes.json();
            if (popData.results && popData.results.length > 0) {
              resolvedMovies = formatTmdbResults(popData.results.slice(0, fallbackLimit)).map((m, idx) => ({
                ...m,
                match_rate: Math.max(75, 90 - idx * 3),
                ai_match_reason: `Sélection populaire du genre pour votre recherche`
              }));
            }
          }
        }
      }

      // ─── NIVEAU 3 : REPLI DE SÛRETÉ ULTIME (TENDANCES & CLASSIQUES) ───────────
      if (resolvedMovies.length === 0) {
        console.log(`[Éliciné AI] Secours ultime Trending pour "${cleanQuery}"`);
        const trendUrl = `/api/tmdb?endpoint=trending/movie/week&language=fr-FR${keyParam}`;
        const trendRes = await fetch(trendUrl);
        if (trendRes.ok) {
          const trendData = await trendRes.json();
          if (trendData.results && trendData.results.length > 0) {
            resolvedMovies = formatTmdbResults(trendData.results.slice(0, fallbackLimit)).map((m, idx) => ({
              ...m,
              match_rate: Math.max(70, 88 - idx * 3),
              ai_match_reason: `Recommandation élargie : Œuvres phares du moment`
            }));
          }
        }
      }
    } catch (fallbackErr) {
      console.error('[Éliciné AI] Erreur du fallback direct TMDB :', fallbackErr);
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
  if (resolvedMovies.length === 0) {
    thoughtMessage = `Aucune œuvre trouvée pour "${cleanQuery}". Essayez d'autres mots-clés.`;
  } else if (isFallbackTriggered) {
    const keyTokens = fallbackExtraction?.thematicWords || [];
    const keySummary = keyTokens.length > 0 ? `aux thèmes « ${keyTokens.slice(0, 3).join(', ')} »` : 'à votre demande';
    thoughtMessage = `🔍 Recherche élargie (${resolvedMovies.length} œuvres suggérées) : adaptée ${keySummary}`;
  } else if (specificity.level === 'ultra_targeted') {
    thoughtMessage = `🎯 Œuvre principale identifiée, complétée par les alternatives les plus proches (${resolvedMovies.length} œuvres)`;
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
    isFallbackMode: titles.length === 0 || isFallbackTriggered,
    providerUsed: isFallbackTriggered ? `${provider} (Repli sémantique)` : provider,
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
