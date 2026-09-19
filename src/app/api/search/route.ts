import { supabase } from '../../../lib/supabase';

// Schéma de sortie strict pour l'interprétation sémantique LLM (Étape 1)
export interface RecommendedTitle {
  title: string;
  release_year?: number | null;
  type: 'movie' | 'tv';
  reason: string;
  match_percentage?: number;
}

export interface FacetDecomposition {
  is_multi_facet: boolean;
  core_action: string;
  setting: string;
  forbidden_mismatches: string[];
}

export interface SemanticInterpretation {
  media_type: 'movie' | 'tv' | 'all';
  atmosphere_summary: string;
  recommended_titles: RecommendedTitle[];
  facets?: FacetDecomposition;
  // Propriétés de compatibilité
  primary_genres?: string[];
  mood_tags?: string[];
  reference_titles?: string[];
  clean_query?: string;
  suggested_mood?: string;
}

const LLM_EXPANSION_PROMPT = `Tu es le conservateur et programmateur cinéphile d'élite d'Éliciné.
Analyse la requête de l'utilisateur avec une rigueur artistique et narrative chirurgicale.
Ta mission est d'identifier 6 à 10 œuvres cultes, pépites ou titres indispensables qui répondent STRICTEMENT à la demande.

Règles de discernement absolues :
1. Contrainte de format :
   - Si la demande mentionne ou implique une série / mini-série ("série", "mini-série", "épisodes"), "type" DOIT être strictement "tv" pour TOUS les titres (ex: "Chernobyl", "Mare of Easttown", "Broadchurch", "The Night Of", "Sharp Objects", "Unbelievable").
   - Si l'utilisateur demande un film, "type" DOIT être strictement "movie".
   - Si non spécifié, adapter selon la pertinence.
2. Contraintes croisées (ex: Braquage + Espace) :
   - Ne privilégie JAMAIS le décor au détriment de l'action centrale. Ne propose QUE des œuvres combinant les critères (ex: "Lockout", "Solo: A Star Wars Story", "Cowboy Bebop: Le Film", "Outland", "Rogue One").
3. Sagas & Films à venir (ex: "Avengers Doomsday") :
   - Liste les films et séries clés indispensables pour appréhender l'intrigue et le multivers (ex: "Avengers: Infinity War", "Avengers: Endgame", "Loki", "Doctor Strange in the Multiverse of Madness", "Spider-Man: No Way Home").
4. Requêtes émotionnelles ou d'humeur (ex: "film pour pleurer un bon coup", "sans prise de tête") :
   - Sélectionne les chefs-d'œuvre majeurs universellement célébrés pour cet effet émotionnel.
5. Résumé éditorial :
   - Fournis un "atmosphere_summary" élégant et percutant résumant le fil conducteur (ex: "Films et séries clés pour appréhender la saga du multivers et Avengers Doomsday").

Réponds EXCLUSIVEMENT avec cet objet JSON strict (aucun texte d'introduction, pas de markdown) :
{
  "media_type": "movie" | "tv" | "all",
  "atmosphere_summary": "Phrase d'accroche cinéphile résumant la sélection",
  "recommended_titles": [
    {
      "title": "Titre international officiel TMDB",
      "release_year": 2019,
      "type": "movie" | "tv",
      "reason": "Explication cinématographique concise et personnalisée",
      "match_percentage": 98
    }
  ]
}`;

/**
 * Nettoie et parse le JSON renvoyé par le LLM
 */
function parseLlmContent(content: string, rawQuery: string): SemanticInterpretation {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return heuristicFallbackExpansion(rawQuery);
    }

    const parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));

    let mediaType: 'movie' | 'tv' | 'all' = 'all';
    const rawType = String(parsed.media_type || '').toLowerCase();
    if (rawType === 'tv' || rawType === 'series' || rawType === 'série') mediaType = 'tv';
    else if (rawType === 'movie' || rawType === 'film') mediaType = 'movie';

    const atmosphereSummary = String(
      parsed.atmosphere_summary || 
      parsed.curated_atmosphere || 
      parsed.editorial_vision || 
      parsed.suggested_mood || 
      rawQuery
    ).trim();

    const rawList = parsed.recommended_titles || parsed.selections || parsed.recommendations || parsed.matches || [];
    const recommendedTitles: RecommendedTitle[] = [];

    if (Array.isArray(rawList)) {
      for (const item of rawList) {
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
            type: tType === 'tv' || tType === 'série' ? 'tv' : 'movie',
            reason: String(item.reason || item.cinephile_hook || item.cinephile_insight || `Œuvre clé pour votre recherche`).trim(),
            match_percentage: Number(item.match_percentage || item.match_score || 95)
          });
        }
      }
    }

    // Récupération des titres de référence simples si la liste d'objets est vide
    if (recommendedTitles.length === 0 && Array.isArray(parsed.reference_titles)) {
      for (const t of parsed.reference_titles) {
        if (typeof t === 'string' && t.trim().length > 1) {
          recommendedTitles.push({
            title: t.trim(),
            release_year: null,
            type: mediaType === 'tv' ? 'tv' : 'movie',
            reason: `Œuvre de référence recommandée`,
            match_percentage: 92
          });
        }
      }
    }

    if (recommendedTitles.length === 0) {
      return heuristicFallbackExpansion(rawQuery);
    }

    return {
      media_type: mediaType,
      atmosphere_summary: atmosphereSummary,
      recommended_titles: recommendedTitles,
      reference_titles: recommendedTitles.map(t => t.title),
      suggested_mood: atmosphereSummary,
      clean_query: rawQuery
    };
  } catch (_) {
    return heuristicFallbackExpansion(rawQuery);
  }
}

/**
 * Repli heuristique cinéphile de secours si le LLM est inaccessible
 */
function heuristicFallbackExpansion(rawQuery: string): SemanticInterpretation {
  const qLower = rawQuery.toLowerCase();

  if (/\b(?:avenger|avengers|doomsday|multivers|marvel|mcu)\b/i.test(qLower)) {
    return {
      media_type: 'all',
      atmosphere_summary: "Films et séries clés pour appréhender la saga du multivers et Avengers Doomsday",
      recommended_titles: [
        { title: "Avengers: Infinity War", release_year: 2018, type: "movie", reason: "Choc cinématographique inaugural confrontant les héros à une menace universelle.", match_percentage: 99 },
        { title: "Avengers: Endgame", release_year: 2019, type: "movie", reason: "Conclusion magistrale de la saga de l'Infini préparant la transition vers Doomsday.", match_percentage: 99 },
        { title: "Loki", release_year: 2021, type: "tv", reason: "Série pivot explorant les fondations des lignes temporelles et de la TVA.", match_percentage: 96 },
        { title: "Spider-Man: No Way Home", release_year: 2021, type: "movie", reason: "Première collision majeure des réalités alternatives du multivers.", match_percentage: 95 },
        { title: "Doctor Strange in the Multiverse of Madness", release_year: 2022, type: "movie", reason: "Exploration des incursions destructrices entre dimensions parallèles.", match_percentage: 93 },
        { title: "Deadpool & Wolverine", release_year: 2024, type: "movie", reason: "Connexion directe avec le Void et la surveillance multiverselle.", match_percentage: 92 }
      ],
      reference_titles: ["Avengers: Infinity War", "Avengers: Endgame", "Loki", "Spider-Man: No Way Home"],
      clean_query: rawQuery,
      suggested_mood: "Saga du multivers Marvel"
    };
  }

  if (/\b(?:braquage|casse|heist|vol)\b/i.test(qLower) && /\b(?:espace|spatial|spatiale|galaxie|vaisseau)\b/i.test(qLower)) {
    return {
      media_type: 'movie',
      atmosphere_summary: "Braquages et casses de haute voltige dans l'espace",
      recommended_titles: [
        { title: "Lockout", release_year: 2012, type: "movie", reason: "Infiltration d'une station spatiale pénitentiaire en orbite sous haute tension.", match_percentage: 97 },
        { title: "Solo: A Star Wars Story", release_year: 2018, type: "movie", reason: "Casse spatial audacieux pour dérober du coaxium hautement explosif.", match_percentage: 95 },
        { title: "Cowboy Bebop: Knockin' on Heaven's Door", release_year: 2001, type: "movie", reason: "Chasseurs de primes et braquages d'anthologie sur fond de jazz spatial.", match_percentage: 94 },
        { title: "Outland", release_year: 1981, type: "movie", reason: "Western spatial implacable au cœur d'une colonie minière corrompue.", match_percentage: 91 },
        { title: "Rogue One: A Star Wars Story", release_year: 2016, type: "movie", reason: "L'ultime opération commando pour dérober les plans de l'Étoile de la Mort.", match_percentage: 92 },
        { title: "Guardians of the Galaxy", release_year: 2014, type: "movie", reason: "Vol d'orbe cosmique et évasion de prison orbitale spectaculaire.", match_percentage: 90 }
      ],
      reference_titles: ["Lockout", "Solo: A Star Wars Story", "Cowboy Bebop", "Outland", "Rogue One"],
      clean_query: rawQuery,
      suggested_mood: "Braquage spatial"
    };
  }

  if (/\b(?:s[ée]rie|mini[\s-]?s[ée]rie)\b/i.test(qLower) && /\b(?:enqu[eê]te|polic|crime|meurtre|polar)\b/i.test(qLower)) {
    return {
      media_type: 'tv',
      atmosphere_summary: "Mini-séries d'enquête policière sous haute tension psychologique",
      recommended_titles: [
        { title: "Mare of Easttown", release_year: 2021, type: "tv", reason: "Enquête provinciale poignante portée par une Kate Winslet impériale.", match_percentage: 98 },
        { title: "Broadchurch", release_year: 2013, type: "tv", reason: "Drame policier côtier bouleversant disséquant les secrets d'une communauté.", match_percentage: 97 },
        { title: "The Night Of", release_year: 2016, type: "tv", reason: "Plongée judiciaire asphyxiante dans les rouages du système carcéral new-yorkais.", match_percentage: 96 },
        { title: "Chernobyl", release_year: 2019, type: "tv", reason: "Enquête humaine et politique haletante sur la pire catastrophe nucléaire.", match_percentage: 95 },
        { title: "Sharp Objects", release_year: 2018, type: "tv", reason: "Thriller psychologique gothique et vénéneux dans le Sud américain.", match_percentage: 94 },
        { title: "Unbelievable", release_year: 2019, type: "tv", reason: "Traque rigoureuse et émouvante menée par deux inspectrices d'exception.", match_percentage: 94 }
      ],
      reference_titles: ["Mare of Easttown", "Broadchurch", "The Night Of", "Chernobyl"],
      clean_query: rawQuery,
      suggested_mood: "Mini-séries d'enquête policière"
    };
  }

  if (/\b(?:pleurer|larmes|triste|chialer|d[eé]chirant|bouleversant)\b/i.test(qLower)) {
    return {
      media_type: 'movie',
      atmosphere_summary: "Drames déchirants et récits d'émotion pure pour pleurer un bon coup",
      recommended_titles: [
        { title: "The Green Mile", release_year: 1999, type: "movie", reason: "L'un des récits les plus bouleversants et poignants de l'histoire du cinéma.", match_percentage: 99 },
        { title: "Grave of the Fireflies", release_year: 1988, type: "movie", reason: "Chef-d'œuvre absolu de l'animation, d'une tristesse viscérale et inoubliable.", match_percentage: 98 },
        { title: "The Fault in Our Stars", release_year: 2014, type: "movie", reason: "Romance adolescente solaire et tragique à la force émotionnelle dévastatrice.", match_percentage: 95 },
        { title: "Manchester by the Sea", release_year: 2016, type: "movie", reason: "Chronique intime d'un deuil impossible portée par une pudeur déchirante.", match_percentage: 96 },
        { title: "Schindler's List", release_year: 1993, type: "movie", reason: "Fresque historique humaniste d'une intensité émotionnelle monumentale.", match_percentage: 97 },
        { title: "La Vita è Bella", release_year: 1997, type: "movie", reason: "Fable bouleversante où l'amour d'un père sublime l'horreur absolue.", match_percentage: 96 }
      ],
      reference_titles: ["The Green Mile", "Grave of the Fireflies", "The Fault in Our Stars", "Manchester by the Sea"],
      clean_query: rawQuery,
      suggested_mood: "Drames déchirants"
    };
  }

  if (/\b(?:com[eé]die|rire|dr[oô]le|feel[\s-]?good|d[eé]tente|sans prise de t[eê]te)\b/i.test(qLower)) {
    return {
      media_type: 'movie',
      atmosphere_summary: "Comédies légères et feel-good sans prise de tête",
      recommended_titles: [
        { title: "Le Dîner de Cons", release_year: 1998, type: "movie", reason: "Comédie culte aux dialogues légendaires et au rythme comique parfait.", match_percentage: 98 },
        { title: "Superbad", release_year: 2007, type: "movie", reason: "Comédie adolescente hilarante sur l'amitié indéfectible avant le départ à la fac.", match_percentage: 96 },
        { title: "La Cité de la Peur", release_year: 1994, type: "movie", reason: "Parodie policière jubilatoire des Nuls devenue un monument d'humour absurde.", match_percentage: 95 },
        { title: "Intouchables", release_year: 2011, type: "movie", reason: "Comédie humaine chaleureuse et lumineuse qui redonne le sourire à coup sûr.", match_percentage: 97 },
        { title: "The Nice Guys", release_year: 2016, type: "movie", reason: "Buddy-movie savoureux et déjanté dans le Los Angeles rétro des années 70.", match_percentage: 94 },
        { title: "Little Miss Sunshine", release_year: 2006, type: "movie", reason: "Road-trip familial irrésistible de tendresse, d'excentricité et d'optimisme.", match_percentage: 96 }
      ],
      reference_titles: ["Le Dîner de Cons", "Superbad", "La Cité de la Peur", "Intouchables"],
      clean_query: rawQuery,
      suggested_mood: "Comédie feel-good"
    };
  }

  return {
    media_type: 'all',
    atmosphere_summary: `Sélection personnalisée pour : "${rawQuery}"`,
    recommended_titles: [
      { title: "Inception", release_year: 2010, type: "movie", reason: "Voyage immersif dans les strates de l'inconscient.", match_percentage: 92 },
      { title: "Interstellar", release_year: 2014, type: "movie", reason: "Épopée spatiale et métaphysique inoubliable.", match_percentage: 90 },
      { title: "Parasite", release_year: 2019, type: "movie", reason: "Choc scénaristique oscillant entre comédie noire et thriller social.", match_percentage: 94 },
      { title: "Whiplash", release_year: 2014, type: "movie", reason: "Duel psychologique incandescent sur l'obsession de l'excellence.", match_percentage: 93 }
    ],
    reference_titles: ["Inception", "Interstellar", "Parasite", "Whiplash"],
    clean_query: rawQuery,
    suggested_mood: "Cinéma d'exception"
  };
}

/**
 * Étape 1 : Interprétation sémantique systématique via LLM
 */
async function expandQueryWithLlm(rawQuery: string, customKeys: Record<string, string | undefined> = {}): Promise<SemanticInterpretation> {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || customKeys.deepseekApiKey || '').trim();
  const qwenKey = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || customKeys.qwenApiKey || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || customKeys.groqApiKey || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || customKeys.geminiApiKey || '').trim();
  const openAiKey = (process.env.OPENAI_API_KEY || customKeys.openAiApiKey || '').trim();

  const messages = [
    { role: 'system', content: LLM_EXPANSION_PROMPT },
    { role: 'user', content: `Demande de recommandation : "${rawQuery}"\nRéponds UNIQUEMENT avec le JSON strict demandé.` }
  ];

  // 1. DeepSeek
  if (deepseekKey) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseLlmContent(content, rawQuery);
          if (parsed.recommended_titles.length > 0) return parsed;
        }
      }
    } catch (_) {}
  }

  // 2. Qwen
  if (qwenKey) {
    try {
      const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qwenKey}` },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseLlmContent(content, rawQuery);
          if (parsed.recommended_titles.length > 0) return parsed;
        }
      }
    } catch (_) {}
  }

  // 3. Groq Cloud (Ultra-rapide)
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseLlmContent(content, rawQuery);
          if (parsed.recommended_titles.length > 0) return parsed;
        }
      }
    } catch (_) {}
  }

  // 2. Gemini
  if (geminiKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages,
          temperature: 0.2
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseLlmContent(content, rawQuery);
          if (parsed.recommended_titles.length > 0) return parsed;
        }
      }
    } catch (_) {}
  }

  // 3. OpenAI
  if (openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseLlmContent(content, rawQuery);
          if (parsed.recommended_titles.length > 0) return parsed;
        }
      }
    } catch (_) {}
  }

  return heuristicFallbackExpansion(rawQuery);
}

/**
 * Étape 2 : Récupération instantanée sur l'API TMDB pour chaque titre recommandé
 */
async function fetchTmdbSingleCandidate(
  title: string,
  type: 'tv' | 'movie',
  year: number | null | undefined,
  tmdbKey: string
): Promise<any | null> {
  if (!title || !tmdbKey) return null;

  const isBearer = tmdbKey.startsWith('eyJ');
  const headers: Record<string, string> = isBearer ? { 'Authorization': `Bearer ${tmdbKey}` } : {};
  const authQuery = isBearer ? '' : `&api_key=${encodeURIComponent(tmdbKey)}`;

  // Variantes de titre (ex: "Titre Français / English Title")
  const variants = title
    .split(/[/|]/)
    .map(p => p.trim())
    .filter(p => p.length > 1);

  const cleanYear = year && !isNaN(year) ? Number(year) : null;
  const isTv = type === 'tv';

  for (const term of variants) {
    const q = encodeURIComponent(term);
    const urlsToTry: string[] = [];

    if (isTv) {
      if (cleanYear) {
        urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&first_air_date_year=${cleanYear}&language=fr-FR&include_adult=false${authQuery}`);
      }
      urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/tv?query=${q}&language=en-US&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/multi?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
    } else {
      if (cleanYear) {
        urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&primary_release_year=${cleanYear}&language=fr-FR&include_adult=false${authQuery}`);
      }
      urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/movie?query=${q}&language=en-US&include_adult=false${authQuery}`);
      urlsToTry.push(`https://api.themoviedb.org/3/search/multi?query=${q}&language=fr-FR&include_adult=false${authQuery}`);
    }

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) continue;
        const data = await res.json();
        const hits = (data.results || []).filter((h: any) => h && h.poster_path);
        if (hits.length === 0) continue;

        // Prioriser la correspondance de titre exacte et la popularité
        hits.sort((a: any, b: any) => {
          const aTitle = (a.title || a.name || '').toLowerCase().trim();
          const bTitle = (b.title || b.name || '').toLowerCase().trim();
          const termLower = term.toLowerCase().trim();
          const aExact = aTitle === termLower || (a.original_title || a.original_name || '').toLowerCase().trim() === termLower;
          const bExact = bTitle === termLower || (b.original_title || b.original_name || '').toLowerCase().trim() === termLower;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return Number(b.vote_count || 0) - Number(a.vote_count || 0);
        });

        return hits[0];
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Route Handler Next.js App Router (POST /api/search)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body?.query || body?.searchQuery || body?.prompt || '').trim();

    if (!rawQuery) {
      return Response.json({ success: false, error: "Requête vide", results: [], movies: [] }, { status: 400 });
    }

    const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || body?.tmdbApiKey || '').trim();

    // ── Étape 1 : Le LLM comme Cinéphile Expert (Identification des Titres) ──
    const expansion = await expandQueryWithLlm(rawQuery, {
      groqApiKey: body?.groqApiKey,
      geminiApiKey: body?.geminiApiKey,
      openAiApiKey: body?.openAiApiKey
    });

    console.log(`[API /api/search] LLM a recommandé ${expansion.recommended_titles.length} titre(s) pour "${rawQuery}". Ambiance: "${expansion.atmosphere_summary}"`);

    // ── Étape 2 & Priorité 1 : Récupération instantanée sur l'API TMDB ───────
    let directTmdbMovies: any[] = [];
    const seenTmdbIds = new Set<number>();
    const seenTitles = new Set<string>();

    if (tmdbKey && expansion.recommended_titles.length > 0) {
      const resolvedList = await Promise.all(
        expansion.recommended_titles.slice(0, 10).map(async (item) => {
          const hit = await fetchTmdbSingleCandidate(item.title, item.type, item.release_year, tmdbKey);
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
    }

    // ── PRIORITÉ 1 — SI au moins 1 ou 2 titres sont validés par TMDB ─────────
    // Ces films constituent la réponse FINALE à renvoyer au frontend.
    // DÉSACTIVER IMMÉDIATEMENT tout appel au fallback de genre.
    // Conserver les badges exacts (badge: "FILM" ou "SÉRIE").
    if (directTmdbMovies.length >= 1) {
      console.log(`[API /api/search] [Priorité 1 Succès] ${directTmdbMovies.length} titre(s) validé(s) par TMDB. Blocage absolu du fallback.`);

      const editorialSummary = expansion.atmosphere_summary || `Sélection Éliciné pour : "${rawQuery}"`;
      const thoughtMsg = editorialSummary.toLowerCase().startsWith('vision') || editorialSummary.toLowerCase().startsWith('atmosphère')
        ? editorialSummary
        : `Vision & Recommandation Éliciné — ${editorialSummary}`;

      return Response.json({
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
        extractedTitles: expansion.recommended_titles.map(t => t.title),
        suggestedPrompts: [
          'Une série policière sombre et addictive',
          'Un film de science-fiction dystopique',
          'Une comédie feel-good et touchante'
        ]
      });
    }

    // ── PRIORITÉ 2 — BLOCAGE DU FALLBACK AVEUGLE ─────────────────────────────
    // Le bloc de fallback ne s'exécute QUE SI l'appel LLM plante OU aucun titre TMDB n'a pu être validé.
    let fallbackResults: any[] = [];
    if (supabase) {
      console.log('[API /api/search] [Priorité 2 Fallback] Aucun titre TMDB direct, tentative de repêchage Supabase...');
      const tokens = rawQuery.split(/\s+/).filter(w => w.length >= 3);
      if (tokens.length > 0) {
        const orClauses = tokens.map(t => `overview.ilike.%${t}%,genres.ilike.%${t}%`).join(',');
        const { data } = await supabase
          .from('movies')
          .select('*')
          .or(orClauses)
          .order('vote_average', { ascending: false })
          .limit(6);
        if (Array.isArray(data) && data.length > 0) {
          fallbackResults = data;
        }
      }
    }

    const thoughtMsg = `Vision & Recommandation Éliciné — ${expansion.atmosphere_summary || rawQuery}`;

    return Response.json({
      success: true,
      results: fallbackResults,
      movies: fallbackResults,
      count: fallbackResults.length,
      fallback_triggered: fallbackResults.length > 0,
      isFallbackMode: fallbackResults.length > 0,
      suggested_mood: expansion.atmosphere_summary || rawQuery,
      badge: fallbackResults.length > 0 ? 'Recommandations Éliciné pour votre atmosphère' : 'Sélection Éliciné',
      thought: thoughtMsg,
      extractedTitles: expansion.recommended_titles.map(t => t.title),
      suggestedPrompts: [
        'Un thriller psychologique avec un twist final',
        'Une série policière addictive',
        'Une comédie feel-good et chaleureuse'
      ]
    });
  } catch (err: any) {
    console.error('[API /api/search] Erreur non gérée :', err);
    return Response.json({ success: false, error: err?.message, results: [], movies: [] }, { status: 500 });
  }
}
