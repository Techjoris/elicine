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
// SYSTEM PROMPT — ÉTAPE 1 : Cerveau LLM (Extraction & Correction)
// Rôle : Corriger les fautes, interpréter les descriptions libres,
//        et renvoyer impérativement 3 à 5 titres de films pertinents.
// ============================================================================
const LLM_SYSTEM_PROMPT = `Tu es une encyclopédie universelle du cinéma dotée d'une intelligence exceptionnelle.

Ta mission est double :
1. CORRIGER silencieusement toutes les fautes de frappe, d'orthographe ou de grammaire dans la requête de l'utilisateur avant de l'analyser.
2. TRANSFORMER toute description littéraire, ambiance vague, situation narrative ou mots-clés incomplets en une liste précise de 3 à 5 films cinématographiques qui correspondent le mieux à cette intention.

Règles strictes à respecter :
- Tu DOIS toujours retourner entre 3 et 5 films. Jamais moins, jamais un tableau vide.
- Si la requête est floue ou ambiguë, interprète-la de la façon la plus intelligente et cinéphile possible.
- Fournis à la fois le titre français et le titre original international quand ils diffèrent (ex: "Prisonniers / Prisoners").
- Chaque film doit avoir une justification courte et précise expliquant pourquoi il correspond.
- N'invente jamais un film qui n'existe pas.

Format de réponse OBLIGATOIRE — objet JSON strict, sans texte autour :
{
  "corrected_query": "la requête corrigée de l'utilisateur",
  "matches": [
    { "title": "Titre français / Original Title", "reason": "courte justification en français" },
    { "title": "Titre 2", "reason": "justification" }
  ]
}`;

// ============================================================================
// Mots vides français & anglais pour l'extraction de mots-clés
// ============================================================================
const STOP_WORDS = new Set([
  'le','la','les','un','une','des','de','du','en','et','ou','où','qui','que',
  'quel','quelle','dans','sur','sous','avec','pour','par','sans','mais','donc',
  'or','ni','car','si','est','sont','être','avoir','faire','film','cinéma',
  'a','an','the','in','on','at','to','for','of','with','and','but',
  'this','that','is','are','was','were','have','has','had','be','been',
  'je','tu','il','elle','nous','vous','ils','elles','mon','ton','son','mes',
  'très','plus','trop','peu','bien','mal','pas','ne','se','me','te','lui',
  'qui','qu','dont','comme','après','avant','pendant','depuis','jusqu'
]);

/**
 * Extrait les mots-clés significatifs d'une requête utilisateur
 * pour la recherche textuelle élargie (Phase B)
 */
function extractKeywords(query) {
  if (!query || typeof query !== 'string') return [];
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 6);
}

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
 * Extrait et parse l'objet JSON du LLM.
 * Supporte le champ optionnel `corrected_query`.
 * Robuste aux balises markdown et aux préfixes de texte.
 */
function extractMatchesFromJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return { matches: [], correctedQuery: '' };
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonSub = cleaned.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonSub);
      const matches = Array.isArray(parsed.matches)
        ? parsed.matches
            .filter(m => m && typeof m.title === 'string' && m.title.trim().length > 0)
            .map(m => ({
              title: String(m.title).trim(),
              reason: String(m.reason || '').trim() || 'Recommandation cinématographique directe'
            }))
        : [];
      return {
        matches,
        correctedQuery: typeof parsed.corrected_query === 'string' ? parsed.corrected_query.trim() : ''
      };
    }
  } catch (err) {
    console.warn('[API /api/search] Erreur parsing JSON LLM :', err?.message);
  }
  return { matches: [], correctedQuery: '' };
}

/**
 * Construit le body commun pour les appels LLM OpenAI-compatible.
 * Le paramètre useJsonFormat doit être false pour Gemini (non supporté).
 */
function buildChatBody(messages, useJsonFormat = true) {
  const body = { messages, temperature: 0.2, max_tokens: 512 };
  if (useJsonFormat) body.response_format = { type: 'json_object' };
  return body;
}

// ============================================================================
// ÉTAPE 1 : Cascade LLM — DeepSeek → Qwen → Groq → Gemini → OpenAI
// ============================================================================
async function queryLlmCandidates(cleanQuery, customKeys = {}) {
  const messages = [
    { role: 'system', content: LLM_SYSTEM_PROMPT },
    { role: 'user', content: `Requête de l'utilisateur : "${cleanQuery}"\n\nRéponds UNIQUEMENT avec l'objet JSON strict demandé.` }
  ];

  const deepseekKey = (process.env.DEEPSEEK_API_KEY || customKeys.deepseekApiKey || '').trim().replace(/^["']|["']$/g, '');
  const qwenKey     = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || customKeys.qwenApiKey || '').trim().replace(/^["']|["']$/g, '');
  const groqKey     = (process.env.GROQ_API_KEY || process.env.AI_API_KEY || customKeys.groqApiKey || '').trim().replace(/^["']|["']$/g, '');
  const geminiKey   = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || customKeys.geminiApiKey || '').trim().replace(/^["']|["']$/g, '');
  const openAiKey   = (process.env.OPENAI_API_KEY || customKeys.openAiApiKey || '').trim().replace(/^["']|["']$/g, '');

  // ── 1. DeepSeek (deepseek-chat) — Provider primaire
  if (deepseekKey) {
    try {
      console.log('[API /api/search] [LLM] DeepSeek (deepseek-chat)...');
      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', ...buildChatBody(messages, true) })
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (matches.length > 0) return { matches, correctedQuery, provider: 'DeepSeek (deepseek-chat)' };
      } else {
        console.warn(`[API /api/search] DeepSeek HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[API /api/search] DeepSeek échoué → Qwen :', err?.message);
    }
  }

  // ── 2. Qwen (DashScope) — Secondaire
  if (qwenKey) {
    const endpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    ];
    for (const endpoint of endpoints) {
      try {
        console.log(`[API /api/search] [LLM] Qwen (qwen-plus) via ${endpoint}...`);
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qwenKey}` },
          body: JSON.stringify({ model: 'qwen-plus', ...buildChatBody(messages, true) })
        }, 7000);
        if (res.ok) {
          const data = await res.json();
          const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
          if (matches.length > 0) return { matches, correctedQuery, provider: 'Qwen (qwen-plus)' };
        } else {
          console.warn(`[API /api/search] Qwen HTTP ${res.status} sur ${endpoint}`);
        }
      } catch (err) {
        console.warn('[API /api/search] Qwen endpoint échoué :', err?.message);
      }
    }
  }

  // ── 3. Groq Cloud (llama-3.3-70b) — Tertiaire
  if (groqKey) {
    try {
      console.log('[API /api/search] [LLM] Groq (llama-3.3-70b-versatile)...');
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', ...buildChatBody(messages, true) })
      }, 7000);
      if (res.ok) {
        const data = await res.json();
        const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (matches.length > 0) return { matches, correctedQuery, provider: 'Groq (Llama 3.3 70B)' };
      }
    } catch (err) {
      console.warn('[API /api/search] Groq échoué :', err?.message);
    }
  }

  // ── 4. Google Gemini (gemini-2.0-flash) — SANS response_format (bug "empty output")
  if (geminiKey) {
    try {
      console.log('[API /api/search] [LLM] Gemini (gemini-2.0-flash)...');
      const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({ model: 'gemini-2.0-flash', ...buildChatBody(messages, false) })
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (matches.length > 0) return { matches, correctedQuery, provider: 'Gemini (gemini-2.0-flash)' };
      }
    } catch (err) {
      console.warn('[API /api/search] Gemini échoué :', err?.message);
    }
  }

  // ── 5. OpenAI (gpt-4o-mini) — Dernier recours
  if (openAiKey) {
    try {
      console.log('[API /api/search] [LLM] OpenAI (gpt-4o-mini)...');
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', ...buildChatBody(messages, true) })
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (matches.length > 0) return { matches, correctedQuery, provider: 'OpenAI (gpt-4o-mini)' };
      }
    } catch (err) {
      console.warn('[API /api/search] OpenAI échoué :', err?.message);
    }
  }

  return { matches: [], correctedQuery: '', provider: 'Aucun' };
}

// ============================================================================
// ÉTAPE 2 — Phase A : Résolution par titre (ilike souple, multi-parties)
// Ex: "Prisonniers / Prisoners" → cherche "Prisonniers" ET "Prisoners" séparément
// ============================================================================
async function resolveByTitles(extractedTitles, matches) {
  if (!supabaseServer || !Array.isArray(extractedTitles) || extractedTitles.length === 0) return [];

  const orClauses = [];
  for (const rawTitle of extractedTitles) {
    // Sépare sur '/', '|', ',' pour gérer "Titre FR / Original Title"
    const parts = String(rawTitle)
      .split(/[/|,]/)
      .map(p => p.trim().replace(/[(),%_]/g, '').trim())
      .filter(p => p.length > 2);
    for (const clean of parts) {
      orClauses.push(`title.ilike.%${clean}%`);
      orClauses.push(`original_title.ilike.%${clean}%`);
    }
  }
  if (orClauses.length === 0) return [];

  const orFilter = orClauses.join(',');
  let results = [];

  try {
    const { data, error } = await supabaseServer.from('movies').select('*').or(orFilter).limit(20);
    if (!error && Array.isArray(data) && data.length > 0) results = data;
  } catch (err) {
    console.warn('[API /api/search] [Phase A] table movies :', err?.message);
  }

  if (results.length === 0) {
    try {
      const { data, error } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .or(orFilter).limit(20);
      if (!error && Array.isArray(data) && data.length > 0) results = data;
    } catch (err) {
      console.warn('[API /api/search] [Phase A] table movies_embeddings :', err?.message);
    }
  }

  return enrichWithBadges(results, matches, 'Recherche Intelligente LLM');
}

// ============================================================================
// ÉTAPE 2 — Phase B : Fallback textuel sur overview / genres / moods
// Déclenchée uniquement si Phase A retourne 0 résultat.
// ============================================================================
async function resolveByKeywords(rawQuery, extractedTitles) {
  if (!supabaseServer) return [];

  const keywords = extractKeywords(rawQuery);
  for (const title of (extractedTitles || [])) {
    for (const w of extractKeywords(title)) {
      if (!keywords.includes(w)) keywords.push(w);
    }
  }
  const uniqueKeywords = [...new Set(keywords)].slice(0, 7);
  if (uniqueKeywords.length === 0) return [];

  console.log('[API /api/search] [Phase B] Mots-clés :', uniqueKeywords);

  const orClauses = [];
  for (const kw of uniqueKeywords) {
    orClauses.push(`overview.ilike.%${kw}%`);
    orClauses.push(`genres.ilike.%${kw}%`);
  }
  for (const kw of uniqueKeywords.slice(0, 3)) {
    orClauses.push(`moods.ilike.%${kw}%`);
    orClauses.push(`setting.ilike.%${kw}%`);
  }

  const orFilter = orClauses.join(',');
  let results = [];

  try {
    const { data, error } = await supabaseServer
      .from('movies').select('*').or(orFilter).order('vote_average', { ascending: false }).limit(12);
    if (!error && Array.isArray(data) && data.length > 0) results = data;
  } catch (err) {
    console.warn('[API /api/search] [Phase B] table movies :', err?.message);
  }

  if (results.length === 0) {
    try {
      const { data, error } = await supabaseServer
        .from('movies_embeddings')
        .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
        .or(orFilter).order('vote_average', { ascending: false }).limit(12);
      if (!error && Array.isArray(data) && data.length > 0) results = data;
    } catch (err) {
      console.warn('[API /api/search] [Phase B] table movies_embeddings :', err?.message);
    }
  }

  return enrichWithBadges(results, [], 'Recherche par contexte & mots-clés');
}

// ============================================================================
// Helper : Déduplication + enrichissement badge IA
// ============================================================================
function enrichWithBadges(rawMovies, matches = [], badgeLabel = 'Recherche Intelligente LLM') {
  if (!Array.isArray(rawMovies) || rawMovies.length === 0) return [];

  const seenIds = new Set();
  const unique = [];
  for (const movie of rawMovies) {
    const key = movie.id || movie.tmdb_id || movie.title;
    if (!seenIds.has(key)) { seenIds.add(key); unique.push(movie); }
  }

  return unique.map(movie => {
    const movieTitleLower = (movie.title || '').toLowerCase().trim();
    const movieOrigLower  = (movie.original_title || '').toLowerCase().trim();

    let matchingLLM = matches.find(m => {
      const ml = (m.title || '').toLowerCase().trim();
      return ml === movieTitleLower || (movieOrigLower && ml === movieOrigLower);
    });
    if (!matchingLLM) {
      matchingLLM = matches.find(m => {
        const ml = (m.title || '').toLowerCase().trim();
        return movieTitleLower.includes(ml) || ml.includes(movieTitleLower) ||
               (movieOrigLower && (movieOrigLower.includes(ml) || ml.includes(movieOrigLower)));
      });
    }

    return {
      ...movie,
      ai_badge: badgeLabel,
      badge: badgeLabel,
      ai_match_reason: matchingLLM?.reason || "Sélectionné par l'encyclopédie cinématographique IA",
      match_rate: matchingLLM ? 98 : 82
    };
  });
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

    // ─── ÉTAPE 1 : Cerveau LLM — Extraction & Correction ─────────────────────
    const { matches, correctedQuery, provider } = await queryLlmCandidates(cleanQuery, {
      groqApiKey:     req.body?.groqApiKey,
      deepseekApiKey: req.body?.deepseekApiKey,
      qwenApiKey:     req.body?.qwenApiKey,
      geminiApiKey:   req.body?.geminiApiKey
    });

    const extractedTitles = matches.map(m => m.title);
    const effectiveQuery  = correctedQuery || cleanQuery;
    console.log(`[API /api/search] [Étape 1] ${matches.length} candidat(s) via ${provider} :`, extractedTitles);
    if (correctedQuery && correctedQuery !== cleanQuery) {
      console.log(`[API /api/search] [Étape 1] Requête corrigée : "${cleanQuery}" → "${correctedQuery}"`);
    }

    // ─── ÉTAPE 2 — Phase A : Résolution par titres (ilike souple) ─────────────
    let resolvedMovies = [];
    if (extractedTitles.length > 0) {
      resolvedMovies = await resolveByTitles(extractedTitles, matches);
      console.log(`[API /api/search] [Étape 2 Phase A] ${resolvedMovies.length} correspondance(s) par titre.`);
    }

    // ─── ÉTAPE 2 — Phase B : Fallback textuel (overview / genres / moods) ─────
    if (resolvedMovies.length === 0) {
      console.log('[API /api/search] [Étape 2 Phase B] Phase A vide → recherche élargie par mots-clés...');
      resolvedMovies = await resolveByKeywords(effectiveQuery, extractedTitles);
      console.log(`[API /api/search] [Étape 2 Phase B] ${resolvedMovies.length} résultat(s) par mots-clés.`);
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

    // ─── Résultats trouvés (Phase A ou Phase B) ─────────────────────────────
    if (resolvedMovies.length > 0) {
      const isPhaseB     = resolvedMovies.some(m => m.badge === 'Recherche par contexte & mots-clés');
      const badgeLabel   = isPhaseB ? 'Recherche par contexte IA' : 'Recherche Intelligente LLM';
      const thoughtMsg   = isPhaseB
        ? `🔍 Recherche élargie : ${resolvedMovies.length} film(s) correspondant à l'ambiance et au contexte`
        : `✨ Recherche Intelligente LLM : ${resolvedMovies.length} film(s) identifié(s) dans notre catalogue`;

      return res.status(200).json({
        success: true,
        movies: resolvedMovies,
        count: resolvedMovies.length,
        badge: badgeLabel,
        providerUsed: `LLM-First (${provider})`,
        correctedQuery: correctedQuery || null,
        thought: thoughtMsg,
        extractedTitles,
        suggestedPrompts: [
          'Un film de science-fiction dystopique sombre',
          'Un thriller psychologique avec un twist final',
          'Un film de braquage haletant qui tourne mal'
        ]
      });
    }

    // ─── ÉTAPE 3 : Filet de sécurité — Zéro résultat absolu ─────────────────
    // Atteint UNIQUEMENT si Phase A (titres) + Phase B (mots-clés) ont toutes les deux échoué.
    // INTERDIT ABSOLU : aucun film aléatoire ou blockbuster par défaut.
    console.log('[API /api/search] [Étape 3] Phase A + Phase B : 0 résultat. Retour [] strict.');
    return res.status(200).json({
      success: true,
      movies: [],
      isEmpty: true,
      badge: 'Recherche Intelligente LLM',
      providerUsed: `LLM-First (${provider} → 0 résultat)`,
      correctedQuery: correctedQuery || null,
      message: "Notre IA a cherché, mais cette description est trop mystérieuse pour notre catalogue actuel...",
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
