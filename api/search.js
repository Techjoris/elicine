import { checkRateLimit } from './_rateLimit.js';
import { 
  searchQuotaQuerySchema, 
  verifyServerSession, 
  supabaseServer,
  getMemoryDailyQuota,
  incrementMemoryDailyQuota,
  sanitizeUserQuery
} from './_security.js';

// ============================================================================
// SYSTEM PROMPT STRICT — ÉTAPE 1 : Le Cerveau LLM (Extraction de Candidats)
// ============================================================================
const LLM_SYSTEM_PROMPT = `Agis en tant qu'encyclopédie universelle du cinéma. Analyse la requête de l'utilisateur et identifie entre 3 et 6 titres de films exacts (en français ou titre original international) qui correspondent le plus précisément à cette description, ambiance ou contrainte. 
Tu dois impérativement répondre sous la forme d'un objet JSON strict respectant ce format :
{
  "matches": [
    { "title": "Titre du film 1", "reason": "courte justification" },
    { "title": "Titre du film 2", "reason": "courte justification" }
  ]
}`;

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
 * Extrait et parse l'objet JSON contenant les films candidats retournés par le LLM
 */
function extractMatchesFromJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonSub = cleaned.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonSub);
      if (Array.isArray(parsed.matches)) {
        return parsed.matches
          .filter(m => m && typeof m.title === 'string' && m.title.trim().length > 0)
          .map(m => ({
            title: String(m.title).trim(),
            reason: String(m.reason || '').trim() || "Recommandation cinématographique directe"
          }));
      }
    }
  } catch (err) {
    console.warn('[API /api/search] Erreur parsing JSON LLM :', err?.message);
  }
  return [];
}

/**
 * ÉTAPE 1 : Interroge le modèle LLM via notre cascade haute disponibilité
 * (Groq Cloud -> DeepSeek -> Qwen -> Gemini -> OpenAI)
 */
async function queryLlmCandidates(cleanQuery, customKeys = {}) {
  const messages = [
    { role: 'system', content: LLM_SYSTEM_PROMPT },
    { role: 'user', content: `Requête de l'utilisateur : "${cleanQuery}"\nRéponds strictement avec l'objet JSON contenant le tableau "matches".` }
  ];

  const groqKey = (process.env.GROQ_API_KEY || process.env.AI_API_KEY || customKeys.groqApiKey || '').trim().replace(/^["']|["']$/g, '');
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || customKeys.deepseekApiKey || '').trim().replace(/^["']|["']$/g, '');
  const qwenKey = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || customKeys.qwenApiKey || '').trim().replace(/^["']|["']$/g, '');
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || customKeys.geminiApiKey || '').trim().replace(/^["']|["']$/g, '');
  const openAiKey = (process.env.OPENAI_API_KEY || customKeys.openAiApiKey || '').trim().replace(/^["']|["']$/g, '');

  // 1. Tentative Groq Cloud (Llama 3.3 70B - Vitesse & Précision)
  if (groqKey) {
    try {
      console.log('[API /api/search] [Étape 1 LLM] Interrogation Groq Cloud (llama-3.3-70b-versatile)...');
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          max_tokens: 450,
          response_format: { type: 'json_object' }
        })
      }, 7000);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const matches = extractMatchesFromJson(content);
        if (matches.length > 0) {
          return { matches, provider: 'Groq (Llama 3.3 70B)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] Groq a échoué, bascule vers le provider suivant...', err?.message);
    }
  }

  // 2. Tentative DeepSeek (deepseek-chat)
  if (deepseekKey) {
    try {
      console.log('[API /api/search] [Étape 1 LLM] Interrogation DeepSeek (deepseek-chat)...');
      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.2,
          max_tokens: 450,
          response_format: { type: 'json_object' }
        })
      }, 7000);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const matches = extractMatchesFromJson(content);
        if (matches.length > 0) {
          return { matches, provider: 'DeepSeek (deepseek-chat)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] DeepSeek a échoué, bascule vers Qwen...', err?.message);
    }
  }

  // 3. Tentative Qwen (DashScope Alibaba Cloud)
  if (qwenKey) {
    const qwenEndpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    ];
    for (const endpoint of qwenEndpoints) {
      try {
        console.log('[API /api/search] [Étape 1 LLM] Interrogation Qwen (qwen-plus)...');
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${qwenKey}`
          },
          body: JSON.stringify({
            model: 'qwen-plus',
            messages,
            temperature: 0.2,
            max_tokens: 450,
            response_format: { type: 'json_object' }
          })
        }, 6000);

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || '';
          const matches = extractMatchesFromJson(content);
          if (matches.length > 0) {
            return { matches, provider: 'Qwen (qwen-plus)' };
          }
        }
      } catch (err) {
        console.warn('[API /api/search] Qwen endpoint échoué :', err?.message);
      }
    }
  }

  // 4. Tentative Google Gemini (gemini-2.0-flash)
  if (geminiKey) {
    try {
      console.log('[API /api/search] [Étape 1 LLM] Interrogation Gemini (gemini-2.0-flash)...');
      const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${geminiKey}`
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages,
          temperature: 0.2,
          max_tokens: 450,
          response_format: { type: 'json_object' }
        })
      }, 7000);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const matches = extractMatchesFromJson(content);
        if (matches.length > 0) {
          return { matches, provider: 'Gemini (gemini-2.0-flash)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] Gemini a échoué :', err?.message);
    }
  }

  // 5. Tentative OpenAI (gpt-4o-mini si présent)
  if (openAiKey) {
    try {
      console.log('[API /api/search] [Étape 1 LLM] Interrogation OpenAI (gpt-4o-mini)...');
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          max_tokens: 450,
          response_format: { type: 'json_object' }
        })
      }, 7000);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const matches = extractMatchesFromJson(content);
        if (matches.length > 0) {
          return { matches, provider: 'OpenAI (gpt-4o-mini)' };
        }
      }
    } catch (err) {
      console.warn('[API /api/search] OpenAI a échoué :', err?.message);
    }
  }

  return { matches: [], provider: 'Aucun' };
}

/**
 * ÉTAPE 2 : Résolution et filtrage des titres extraits dans le catalogue Supabase
 */
async function resolveTitlesInSupabase(extractedTitles, matches) {
  if (!supabaseServer || !Array.isArray(extractedTitles) || extractedTitles.length === 0) {
    return [];
  }

  let catalogResults = [];
  const titlesList = extractedTitles.map(t => t.trim()).filter(Boolean);

  try {
    // 1. Interrogation de la table 'movies' par title
    const { data: moviesByTitle, error: errTitle } = await supabaseServer
      .from('movies')
      .select('*')
      .in('title', titlesList);

    if (!errTitle && Array.isArray(moviesByTitle)) {
      catalogResults.push(...moviesByTitle);
    }

    // 2. Interrogation par original_title pour les films étrangers
    const { data: moviesByOriginal, error: errOrig } = await supabaseServer
      .from('movies')
      .select('*')
      .in('original_title', titlesList);

    if (!errOrig && Array.isArray(moviesByOriginal)) {
      const existingIds = new Set(catalogResults.map(m => m.id || m.tmdb_id || m.title));
      for (const m of moviesByOriginal) {
        const key = m.id || m.tmdb_id || m.title;
        if (!existingIds.has(key)) {
          catalogResults.push(m);
          existingIds.add(key);
        }
      }
    }
  } catch (moviesErr) {
    console.warn('[API /api/search] Table movies non disponible ou erreur :', moviesErr?.message);
  }

  // 3. Repli résilient : table 'movies_embeddings' si la table 'movies' est vide ou inexistante
  if (catalogResults.length === 0) {
    try {
      const { data: embTitle } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .in('title', titlesList);

      if (Array.isArray(embTitle) && embTitle.length > 0) {
        catalogResults.push(...embTitle);
      } else {
        const { data: embOrig } = await supabaseServer
          .from('movies_embeddings')
          .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
          .in('original_title', titlesList);

        if (Array.isArray(embOrig) && embOrig.length > 0) {
          catalogResults.push(...embOrig);
        }
      }
    } catch (embErr) {
      console.warn('[API /api/search] Table movies_embeddings non disponible :', embErr?.message);
    }
  }

  // 4. Enrichissement avec la raison fournie par le LLM et le badge "Recherche Intelligente LLM"
  const resolved = catalogResults.map(movie => {
    const movieTitleLower = (movie.title || '').toLowerCase().trim();
    const movieOrigLower = (movie.original_title || '').toLowerCase().trim();

    const matchingLLM = matches.find(m => {
      const matchLower = (m.title || '').toLowerCase().trim();
      return matchLower === movieTitleLower || (movieOrigLower && matchLower === movieOrigLower);
    });

    return {
      ...movie,
      ai_badge: "Recherche Intelligente LLM",
      badge: "Recherche Intelligente LLM",
      ai_match_reason: matchingLLM?.reason || "Sélectionné par l'encyclopédie cinématographique IA",
      match_rate: 98
    };
  });

  return resolved;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
        const { data, error } = await supabaseServer.rpc('match_movies', {
          query_embedding: queryEmbedding,
          match_threshold: Number(matchThreshold) || 0.40,
          match_count: Number(matchCount) || 10
        });

        if (!error && Array.isArray(data)) {
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
      message: "Recherche vectorielle native non disponible ou aucun résultat au-dessus du seuil"
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

    console.log(`[API /api/search] [LLM-First] Lancement pipeline pour : "${cleanQuery}"`);

    // ─── ÉTAPE 1 : Le Cerveau LLM (Extraction Intelligente de Candidats) ──────
    const { matches, provider } = await queryLlmCandidates(cleanQuery, {
      groqApiKey: req.body?.groqApiKey,
      deepseekApiKey: req.body?.deepseekApiKey,
      qwenApiKey: req.body?.qwenApiKey,
      geminiApiKey: req.body?.geminiApiKey
    });

    const extractedTitles = matches.map(m => m.title);
    console.log(`[API /api/search] [Étape 1 LLM] ${matches.length} candidats extraits via ${provider} :`, extractedTitles);

    // ─── ÉTAPE 2 : Résolution et Filtrage dans Supabase ───────────────────────
    let resolvedMovies = [];
    if (extractedTitles.length > 0) {
      resolvedMovies = await resolveTitlesInSupabase(extractedTitles, matches);
      console.log(`[API /api/search] [Étape 2 Supabase] ${resolvedMovies.length} correspondance(s) trouvée(s) dans le catalogue.`);
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

    // Si des films correspondent dans Supabase, renvoi immédiat avec badge
    if (resolvedMovies.length > 0) {
      return res.status(200).json({
        success: true,
        movies: resolvedMovies,
        count: resolvedMovies.length,
        badge: "Recherche Intelligente LLM",
        providerUsed: `LLM-First (${provider} -> Supabase)`,
        thought: `✨ Recherche Intelligente LLM : ${resolvedMovies.length} film(s) correspondant(s) dans notre catalogue`,
        suggestedPrompts: [
          'Un film de science-fiction dystopique sombre',
          'Un thriller psychologique avec un twist final',
          'Un film de braquage haletant qui tourne mal'
        ]
      });
    }

    // ─── ÉTAPE 3 : Gestion du Cas Zéro Résultat (Filet de Sécurité) ───────────
    // 1. ZÉRO BLOCKBUSTER ALÉATOIRE : Interdiction formelle de renvoyer Spider-Man ou Vaiana
    // 2. Renvoi d'un tableau vide [] propre
    // 3. Déclenchement de l'écran de secours élégant côté front-end
    console.log(`[API /api/search] [Étape 3 Filet de Sécurité] 0 correspondance Supabase. Retour [] strict.`);
    return res.status(200).json({
      success: true,
      movies: [],
      isEmpty: true,
      badge: "Recherche Intelligente LLM",
      providerUsed: `LLM-First (${provider} -> Supabase 0-result)`,
      message: "Notre IA cherche la perle rare, mais cette description est un peu trop mystérieuse...",
      extractedTitles,
      suggestedPrompts: [
        "Un voyage dans l'espace avec des trous noirs",
        "Un film de braquage qui tourne mal",
        "Un film angoissant où des personnages sont coincés sous terre",
        "Un thriller psychologique avec un twist final"
      ]
    });
  }

  return res.status(200).json({ success: true, message: "Service de recherche actif" });
}
