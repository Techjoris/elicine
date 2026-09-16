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
2. TRANSFORMER toute description littéraire, ambiance, situation narrative ou mots-clés en une liste précise de 5 à 8 films cinématographiques qui correspondent le mieux à cette intention.

Règles strictes à respecter :
- Tu DOIS toujours retourner entre 5 et 8 films distincts et variés. Jamais moins de 5, jamais un tableau vide.
- SIMILARITÉ DE SCÉNARIO, SYNOPSIS ET AMBIANCE : Tes propositions doivent reposer EXCLUSIVEMENT sur la similarité des intrigues, des scénarios et des thèmes profonds, et JAMAIS sur une simple ressemblance de mots dans le titre. Ne propose JAMAIS des films qui partagent un mot dans leur nom sans rapport scénaristique.
- DIVERSITÉ : Propose des films de réalisateurs différents qui explorent la même idée sous des angles cinématographiques riches.
- Si la requête mentionne un acteur ou un réalisateur (ex: "Leonardo DiCaprio"), inclus en priorité ses films majeurs qui incarnent fidèlement le scénario et le genre demandés (ex: Inception, Les Infiltrés, Arrête-moi si tu peux pour un film de braquage/escroquerie avec DiCaprio), complétés par d'autres chefs-d'œuvre majeurs du même genre.
- Si la requête cible un film précis que l'utilisateur a probablement déjà vu, propose volontairement des films SIMILAIRES (même scénario, même ambiance) plutôt que ce film lui-même ou ses suites directes.
- Fournis à la fois le titre français et le titre original international quand ils diffèrent (ex: "Prisonniers / Prisoners").
- Chaque film doit avoir une justification courte et précise expliquant pourquoi son SCÉNARIO correspond à la demande.
- N'invente jamais un film qui n'existe pas.
- INTERDICTION ABSOLUE des mockbusters, copies bon marché, parodies ou productions dérivées (aucun court-métrage promotionnel, spin-off obscur, making-of ou film Asylum).
- QUALITÉ MINIMALE : Films ayant obtenu au moins 500 votes sur TMDB et une note supérieure à 5.5.

Format de réponse OBLIGATOIRE — objet JSON strict, sans texte autour :
{
  "corrected_query": "la requête corrigée de l'utilisateur",
  "matches": [
    { "title": "Titre français / Original Title", "reason": "courte justification du scénario en français" },
    { "title": "Titre 2", "reason": "justification scénaristique" }
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

  // ── 1. Groq Cloud (llama-3.3-70b-versatile) — Ultra-rapide (~300ms sur LPU)
  if (groqKey) {
    try {
      console.log('[API /api/search] [LLM] Groq (llama-3.3-70b-versatile)...');
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', ...buildChatBody(messages, true) })
      }, 4000);
      if (res.ok) {
        const data = await res.json();
        const { matches, correctedQuery } = extractMatchesFromJson(data.choices?.[0]?.message?.content || '');
        if (matches.length > 0) return { matches, correctedQuery, provider: 'Groq (Llama 3.3 70B)' };
      }
    } catch (err) {
      console.warn('[API /api/search] Groq échoué → DeepSeek :', err?.message);
    }
  }

  // ── 2. DeepSeek (deepseek-chat) — Secondaire
  if (deepseekKey) {
    try {
      console.log('[API /api/search] [LLM] DeepSeek (deepseek-chat)...');
      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', ...buildChatBody(messages, true) })
      }, 4000);
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

  // ── 3. Qwen (DashScope) — Tertiaire
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
        }, 4000);
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

  // ── 4. Google Gemini (gemini-2.0-flash) — SANS response_format (bug "empty output")
  if (geminiKey) {
    try {
      console.log('[API /api/search] [LLM] Gemini (gemini-2.0-flash)...');
      const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({ model: 'gemini-2.0-flash', ...buildChatBody(messages, false) })
      }, 4500);
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
      }, 4500);
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
// ============================================================================
// ÉTAPE 2 — Phase A : Résolution par titre (ilike souple, multi-parties)
// Ex: "Prisonniers / Prisoners" → cherche "Prisonniers" ET "Prisoners" séparément
// Sélectionne impérativement 1 seul film par recommandation LLM (anti-doublon)
// ============================================================================
async function resolveByTitles(extractedTitles, matches, queryText = '') {
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

  if (results.length === 0) return [];

  // Sélection rigoureuse 1-pour-1 : pour chaque titre LLM, ne garder QUE la meilleure correspondance
  const selectedResults = [];
  const seenIds = new Set();
  const seenBases = new Set();

  for (const rawTitle of extractedTitles) {
    const parts = String(rawTitle)
      .split(/[/|,]/)
      .map(p => p.trim().toLowerCase())
      .filter(p => p.length > 1);

    const hits = results.filter(c => {
      if (seenIds.has(c.id || c.tmdb_id)) return false;
      const cTitle = (c.title || '').toLowerCase().trim();
      const cOrig = (c.original_title || '').toLowerCase().trim();
      return parts.some(p => cTitle === p || cOrig === p || cTitle.startsWith(p) || cOrig.startsWith(p));
    });

    if (hits.length > 0) {
      hits.sort((a, b) => {
        const aTitle = (a.title || '').toLowerCase();
        const bTitle = (b.title || '').toLowerCase();
        const aExact = parts.some(p => aTitle === p || (a.original_title || '').toLowerCase() === p);
        const bExact = parts.some(p => bTitle === p || (b.original_title || '').toLowerCase() === p);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return Number(b.vote_count || 0) - Number(a.vote_count || 0);
      });

      const best = hits[0];
      const base = (best.title || best.original_title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
        .trim();

      if (!seenBases.has(base)) {
        seenBases.add(base);
        seenIds.add(best.id || best.tmdb_id);
        selectedResults.push(best);
      }
    }
  }

  return enrichWithBadges(selectedResults, matches, 'Recherche Intelligente LLM', queryText);
}

// ============================================================================
// ÉTAPE 2 — Phase B : Résolution TMDB 1-pour-1 et enrichissement scénaristique
// - Résout STRICTEMENT 1 SEUL film TMDB par recommandation LLM (évite les doublons de nom).
// - Enrichit si besoin par les recommandations TMDB basées sur le scénario et l'affinité.
// ============================================================================
async function resolveByKeywords(rawQuery, matches = [], tmdbApiKey = '') {
  const candidatesList = Array.isArray(matches) && matches.length > 0
    ? matches
    : [{ title: rawQuery }];

  const extractedTitles = candidatesList.map(m => typeof m === 'string' ? m : m?.title || '');

  // ── Phase B.1 : Recherche Supabase par mots-clés ────────────────────────
  if (supabaseServer) {
    const keywords = extractKeywords(rawQuery);
    for (const title of extractedTitles) {
      for (const w of extractKeywords(title)) {
        if (!keywords.includes(w)) keywords.push(w);
      }
    }
    const uniqueKeywords = [...new Set(keywords)].slice(0, 7);

    if (uniqueKeywords.length > 0) {
      console.log('[API /api/search] [Phase B.1] Mots-clés Supabase :', uniqueKeywords);

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
        console.warn('[API /api/search] [Phase B.1] table movies :', err?.message);
      }

      if (results.length === 0) {
        try {
          const { data, error } = await supabaseServer
            .from('movies_embeddings')
            .select('id, tmdb_id, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, setting, moods')
            .or(orFilter).order('vote_average', { ascending: false }).limit(12);
          if (!error && Array.isArray(data) && data.length > 0) results = data;
        } catch (err) {
          console.warn('[API /api/search] [Phase B.1] table movies_embeddings :', err?.message);
        }
      }

      if (results.length > 0) {
        return enrichWithBadges(results, matches, 'Recherche par contexte & mots-clés', rawQuery);
      }
    }
  }

  // ── Phase B.2 : Résolution TMDB 1-pour-1 par recommandation LLM ─────────
  const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || tmdbApiKey || '').trim();
  if (!tmdbKey) {
    console.warn('[API /api/search] [Phase B.2] Clé TMDB absente.');
    return [];
  }

  const allTmdbResults = [];
  const seenTmdbIds = new Set();
  const seenTitleBases = new Set();

  // ── Résolution TMDB en parallèle 1-pour-1 par recommandation LLM ─────────
  const resolveCandidate = async (item) => {
    const rawTitle = typeof item === 'string' ? item : item?.title || '';
    const matchReason = typeof item === 'object' ? item?.reason : '';
    if (!rawTitle || rawTitle.length < 2) return null;

    const variants = rawTitle
      .split(/[/|]/)
      .map(p => p.trim())
      .filter(p => p.length > 1);

    for (const term of variants) {
      try {
        const tmdbRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(term)}&language=fr-FR&page=1&include_adult=false`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          3500
        );

        if (!tmdbRes.ok) continue;

        const tmdbData = await tmdbRes.json();
        const hits = (tmdbData.results || []).filter(m => !seenTmdbIds.has(m.id));
        if (hits.length === 0) continue;

        hits.sort((a, b) => {
          const aTitle = (a.title || '').toLowerCase().trim();
          const aOrig = (a.original_title || '').toLowerCase().trim();
          const bTitle = (b.title || '').toLowerCase().trim();
          const bOrig = (b.original_title || '').toLowerCase().trim();
          const termLower = term.toLowerCase().trim();

          const aExact = aTitle === termLower || aOrig === termLower;
          const bExact = bTitle === termLower || bOrig === termLower;

          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          return Number(b.vote_count || 0) - Number(a.vote_count || 0);
        });

        return { bestMatch: hits[0], item, rawTitle, matchReason };
      } catch (tmdbErr) {
        console.warn('[API /api/search] [Phase B.2] TMDB échoué pour', term, ':', tmdbErr?.message);
      }
    }
    return null;
  };

  const parallelResolutions = await Promise.all(
    candidatesList.slice(0, 8).map(resolveCandidate)
  );

  for (const resolved of parallelResolutions) {
    if (!resolved || !resolved.bestMatch) continue;
    const { bestMatch, item, rawTitle, matchReason } = resolved;
    if (seenTmdbIds.has(bestMatch.id)) continue;

    const titleBase = (bestMatch.title || bestMatch.original_title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
      .trim();

    if (!seenTitleBases.has(titleBase)) {
      seenTitleBases.add(titleBase);
      seenTmdbIds.add(bestMatch.id);

      const dynamicScore = calculateSemanticMatchScore(bestMatch, rawQuery, item);
      // Rejet si score éliminatoire (hors-sujet formel comme Titanic pour un braquage)
      if (dynamicScore < 50) {
        console.log(`[API /api/search] Film disqualifié par cohérence thématique (${dynamicScore}%) : "${bestMatch.title}"`);
        continue;
      }

      allTmdbResults.push({
        id: bestMatch.id,
        tmdb_id: bestMatch.id,
        title: bestMatch.title || bestMatch.name || '',
        original_title: bestMatch.original_title || bestMatch.original_name || '',
        overview: bestMatch.overview || '',
        poster_path: bestMatch.poster_path ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}` : null,
        backdrop_path: bestMatch.backdrop_path ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}` : null,
        release_date: bestMatch.release_date || bestMatch.first_air_date || '',
        vote_average: bestMatch.vote_average || 0,
        vote_count: bestMatch.vote_count || 0,
        genres: Array.isArray(bestMatch.genre_ids) ? bestMatch.genre_ids.join(',') : '',
        media_type: 'movie',
        ai_badge: 'Recommandation IA (TMDB)',
        badge: 'Recommandation IA (TMDB)',
        ai_match_reason: matchReason || `Recommandé pour sa cohérence scénaristique avec "${rawTitle}"`,
        match_rate: dynamicScore
      });
    }
  }

  // ── Complément scénaristique / thématique par recommandations TMDB ────────
  // Si le LLM a renvoyé peu d'œuvres et qu'on a moins de 8 films, on complète
  // UNIQUEMENT avec les recommandations basées sur l'affinité scénaristique
  // du film phare, JAMAIS par recherche textuelle de titre !
  if (allTmdbResults.length > 0 && allTmdbResults.length < 8 && tmdbKey) {
    const primaryMovie = allTmdbResults[0];
    try {
      console.log(`[API /api/search] [Phase B.2] Enrichissement scénaristique depuis "${primaryMovie.title}" (#${primaryMovie.id})...`);
      const recRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${primaryMovie.id}/recommendations?api_key=${encodeURIComponent(tmdbKey)}&language=fr-FR&page=1`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        3500
      );
      if (recRes.ok) {
        const recData = await recRes.json();
        const recHits = (recData.results || []).filter(m => {
          if (seenTmdbIds.has(m.id)) return false;
          const avg = Number(m.vote_average || 0);
          const cnt = Number(m.vote_count || 0);
          return cnt >= 500 && avg >= 5.5; // Qualité minimale
        });

        for (const m of recHits) {
          if (allTmdbResults.length >= 8) break;
          const titleBase = (m.title || m.original_title || '')
            .toLowerCase()
            .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
            .trim();
          if (seenTitleBases.has(titleBase)) continue;
          seenTitleBases.add(titleBase);
          seenTmdbIds.add(m.id);

          const dynamicScore = calculateSemanticMatchScore(m, rawQuery, null);
          if (dynamicScore < 50) continue;

          allTmdbResults.push({
            id: m.id,
            tmdb_id: m.id,
            title: m.title || m.name || '',
            original_title: m.original_title || m.original_name || '',
            overview: m.overview || '',
            poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            backdrop_path: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
            release_date: m.release_date || m.first_air_date || '',
            vote_average: m.vote_average || 0,
            vote_count: m.vote_count || 0,
            genres: Array.isArray(m.genre_ids) ? m.genre_ids.join(',') : '',
            media_type: 'movie',
            ai_badge: 'Recommandation Thématique',
            badge: 'Recommandation Thématique',
            ai_match_reason: `Recommandation cinématographique proche de l'univers et du scénario de "${primaryMovie.title}"`,
            match_rate: dynamicScore
          });
        }
      }
    } catch (recErr) {
      console.warn('[API /api/search] Recommandations TMDB échouées :', recErr?.message);
    }
  }

  if (allTmdbResults.length > 0) {
    console.log(`[API /api/search] [Phase B.2] ${allTmdbResults.length} résultat(s) TMDB résolu(s).`);
    return allTmdbResults;
  }

  return [];
}

// ============================================================================
// Helper : Démarche Scientifique de Scoring Sémantique Continu
// Modèle multi-critères : Personne (35%) + Thématique (45%) + Genres (20%) + Note Bayésienne
// Rejette strictement les faux-positifs hors-sujet (Titanic pour un braquage).
// ============================================================================
const THEMATIC_CLUSTERS_RAW = [
  {
    id: 'braquage',
    triggers: ['braquage', 'braquer', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'heist'],
    primaryKeywords: ['braquage', 'braquages', 'braquer', 'braqueurs', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'cambrioleur', 'dévaliser', 'coffre-fort', 'butin'],
    secondaryKeywords: ['vol', 'voleur', 'voleurs', 'dérober', 'extraction', 'infiltration', 'escroc', 'escroquerie', 'faussaire', 'arnaque', 'gang', 'gangsters', 'pègre', 'lingots', 'diamants'],
    expectedGenres: [80, 53, 28, 9648],
    conflictingGenres: [10749, 10751, 10402],
    archetypes: ['inception', 'heat', "ocean's eleven", 'oceans eleven', 'the town', 'inside man', 'baby driver', 'reservoir dogs', 'snatch', 'the italian job', 'point break', 'arrête-moi si tu peux', 'arrete-moi si tu peux', 'catch me if you can', 'les infiltrés', 'the departed'],
    disqualified: ['titanic', 'romeo + juliet', 'roméo + juliette', 'gatsby le magnifique', 'the great gatsby', 'revolutionary road', 'les noces rebelles', 'la la land', 'notting hill']
  },
  {
    id: 'twist',
    triggers: ['twist', 'retournement', 'dénouement', 'fin surprenante', 'chute'],
    primaryKeywords: ['twist', 'retournement', 'dénouement', 'chute', 'révélation', 'illusion', 'hallucination', 'psychiatrique', 'asile', 'schizophr'],
    secondaryKeywords: ['secret', 'vérité', 'double jeu', 'mensonge', 'machination', 'paranoïa', 'complot', 'infiltr'],
    expectedGenres: [53, 9648, 878, 27, 80],
    conflictingGenres: [10749, 35, 10751],
    archetypes: ['shutter island', 'inception', 'fight club', 'sixième sens', 'les autres', 'usual suspects', 'memento', 'le prestige', 'seven', 'gone girl', 'oldboy', 'prisoners'],
    disqualified: ['titanic', 'le loup de wall street', 'django unchained', 'the revenant', 'gatsby le magnifique']
  }
];

function calculateSemanticMatchScore(movie, queryText, llmMatch) {
  const titleLower = (movie.title || movie.name || '').toLowerCase().trim();
  const origLower = (movie.original_title || movie.original_name || '').toLowerCase().trim();
  const overviewLower = (movie.overview || '').toLowerCase();
  const voteCount = Number(movie.vote_count || 0);
  const voteAvg = Number(movie.vote_average || 0);
  const rawGenreIds = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
    : (typeof movie.genres === 'string' ? movie.genres.split(',').map(Number).filter(Boolean) : []);
  const genreIds = rawGenreIds.map(Number);
  const queryLower = (queryText || '').toLowerCase();

  // 1. Détection du cluster thématique actif
  let activeCluster = null;
  for (const cluster of THEMATIC_CLUSTERS_RAW) {
    if (cluster.triggers.some(t => queryLower.includes(t))) {
      activeCluster = cluster;
      break;
    }
  }

  // 2. Disqualification stricte si le film est formellement incompatible
  if (activeCluster) {
    if (activeCluster.disqualified.includes(titleLower) || activeCluster.disqualified.includes(origLower)) {
      return 25; // Rejet formel immédiat
    }

    const hasExpectedGenre = activeCluster.expectedGenres.some(id => genreIds.includes(id));
    const isPureConflicting = genreIds.length > 0 && genreIds.every(id => activeCluster.conflictingGenres.includes(id));

    let lexicalHits = 0;
    for (const kw of activeCluster.primaryKeywords) {
      if (overviewLower.includes(kw) || titleLower.includes(kw)) lexicalHits += 3;
    }
    for (const kw of activeCluster.secondaryKeywords) {
      if (overviewLower.includes(kw)) lexicalHits += 1.5;
    }

    const isArchetype = activeCluster.archetypes.some(a => titleLower === a || origLower === a || titleLower.includes(a));

    if (!isArchetype && lexicalHits === 0 && (isPureConflicting || !hasExpectedGenre)) {
      return 35; // Rejet catégorique : ni mot clé, ni genre compatible
    }
  }

  // 3. Calcul continu multi-critères
  // A. Sous-score Personne / Acteur (si mentionné dans la requête)
  let personScore = 100;
  const personKeywords = ['dicaprio', 'leonardo', 'nolan', 'tarantino', 'pitt', 'cruise', 'scorsese', 'denzel'];
  for (const pk of personKeywords) {
    if (queryLower.includes(pk)) {
      const inOverview = overviewLower.includes(pk);
      const inTitle = titleLower.includes(pk);
      // Les films proposés par le LLM pour un acteur ont déjà l'acteur validé
      personScore = (inOverview || inTitle || llmMatch) ? 100 : 50;
      break;
    }
  }

  // B. Sous-score Thématique / Narratif
  let narrativeScore = llmMatch ? 88 : 70;
  if (activeCluster) {
    const isArchetype = activeCluster.archetypes.some(a => titleLower === a || origLower === a || titleLower.includes(a));
    if (isArchetype) {
      narrativeScore = 98;
    } else {
      let hits = 0;
      for (const kw of activeCluster.primaryKeywords) {
        if (overviewLower.includes(kw) || titleLower.includes(kw)) hits += 3;
      }
      for (const kw of activeCluster.secondaryKeywords) {
        if (overviewLower.includes(kw)) hits += 1.5;
      }
      narrativeScore = Math.min(100, Math.max(50, 60 + hits * 8));
    }
  }

  // C. Sous-score Genre
  let genreScore = 75;
  if (activeCluster) {
    if (activeCluster.expectedGenres.some(id => genreIds.includes(id))) {
      genreScore = 95;
    } else if (genreIds.includes(18)) { // Drame
      genreScore = 70;
    } else {
      genreScore = 40;
    }
  }

  // D. Composante Bayésienne de Qualité
  const bayesRating = voteCount > 0
    ? (voteCount * voteAvg + 1000 * 6.5) / (voteCount + 1000)
    : 6.5;
  const qualityDelta = (bayesRating - 7.0) * 2.5; // [-4, +4]

  // E. Synthèse pondérée continue
  const composite = (personScore * 0.35) + (narrativeScore * 0.45) + (genreScore * 0.20) + qualityDelta;

  return Math.min(99, Math.max(60, Math.round(composite)));
}

// ============================================================================
// Helper : Filtre Anti-Mockbuster & Anti-Titres Parasites
// Alignement strict sur les directives LLM (> 500 votes, note > 5.5).
// Deux axes de rejet indépendants :
//   1. Qualité insuffisante (seuil minimal de notoriété et de note)
//   2. Titre parasite : le film partage un seul mot avec la requête en y ajoutant
//      des termes parasites, sans lien scénaristique réel dans son synopsis.
//      Ce motif de rejet est TOTALEMENT INDÉPENDANT de la note du film.
// ============================================================================
function filterMockbusters(movies, queryText) {
  if (!Array.isArray(movies) || movies.length === 0) return [];

  // Mots significatifs de la requête (longueur >= 4, hors mots vides)
  const queryTokens = (queryText || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

  const filtered = movies.filter(m => {
    const avg = Number(m.vote_average || 0);
    const cnt = Number(m.vote_count || 0);
    const titleLower = (m.title || m.original_title || '').toLowerCase();
    const overviewLower = (m.overview || '').toLowerCase();

    // 0. Bénéfice du doute si aucune donnée de vote disponible (film non encore coté)
    if (avg === 0 && cnt === 0) return true;

    // ── AXE 1 : Seuils de qualité alignés sur les directives LLM ──────────
    // Directive : "au moins 500 votes ET note > 5.5"
    // Protection : les grands classiques / blockbusters établis (cnt >= 5000)
    if (cnt >= 5000) {
      if (avg > 0 && avg < 4.0) return false; // Vraiment mauvais malgré la notoriété
    } else if (cnt > 0 && cnt < 500 && avg < 5.5) {
      // Échec aux critères minimaux de qualité TMDB (> 500 votes et > 5.5/10)
      return false;
    } else if (avg > 0 && avg < 4.0 && cnt >= 20) {
      // Franchement mauvais confirmé
      return false;
    }

    // ── AXE 2 : Titre parasite (REJET INDÉPENDANT DU SCORE DE NOTES) ──────
    // Détection : le nom du film ne partage qu'un mot avec la requête tout en
    // ajoutant des termes externes (ex: "Bikini Inception" pour "Inception"),
    // sans qu'aucun lien scénaristique réel ne soit présent dans le synopsis.
    // Protection : films très populaires (cnt >= 5000) protégés.
    if (queryTokens.length > 0 && cnt < 5000) {
      const titleWords = titleLower
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

      // Mots du titre empruntés à la requête
      const sharedQueryWords = queryTokens.filter(qt =>
        titleWords.some(tw => tw === qt || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
      );

      // Mots du titre n'appartenant pas à la requête (= ajouts opportunistes)
      const extraWords = titleWords.filter(tw =>
        !queryTokens.some(qt => qt === tw || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
      );

      // Le film partage un seul mot clé avec la requête et contient des mots additionnels
      const isParasiteTitle = sharedQueryWords.length === 1 && extraWords.length > 0;

      if (isParasiteTitle) {
        // Vérification de lien scénaristique réel dans le synopsis
        const narrativeConfirmed = queryTokens.some(qt => overviewLower.includes(qt));
        // Sans confirmation scénaristique réelle → rejet IMMÉDIAT et INDÉPENDANT de la note
        if (!narrativeConfirmed) {
          return false;
        }
      }
    }

    return true;
  });

  // Déduplication par base de titre (évite les suites non officielles en doublons)
  const seenTitleBases = new Set();
  const deduplicated = filtered.filter(m => {
    const titleBase = (m.title || m.original_title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u017F\s]/g, '')
      .replace(/\s*(2|3|4|5|ii|iii|iv|v|part 2|part two|suite|sequel)\s*$/i, '')
      .trim();
    if (titleBase.length < 2) return true;
    if (seenTitleBases.has(titleBase)) return false;
    seenTitleBases.add(titleBase);
    return true;
  });

  return deduplicated;
}


// ============================================================================
// Helper : Déduplication + enrichissement badge IA
// ============================================================================
function enrichWithBadges(rawMovies, matches = [], badgeLabel = 'Recherche Intelligente LLM', queryText = '') {
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

    // Score dynamique basé sur la sémantique et la qualité du film
    const dynamicScore = calculateSemanticMatchScore(movie, queryText, matchingLLM);

    return {
      ...movie,
      ai_badge: badgeLabel,
      badge: badgeLabel,
      ai_match_reason: matchingLLM?.reason || "Sélectionné par l'encyclopédie cinématographique IA",
      match_rate: dynamicScore
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

  try {
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

      // Vérification des filtres avancés réservés aux membres Pro
      const filters = req.body?.filters;
      const hasActiveFilters = Boolean(
        filters && (
          (filters.platform && filters.platform !== 'all') ||
          (filters.minRating && Number(filters.minRating) > 0) ||
          (filters.mediaType && filters.mediaType !== 'Tous')
        )
      );

      if (hasActiveFilters && !isPro) {
        return res.status(403).json({
          success: false,
          code: "PRO_REQUIRED",
          error: "Les filtres de recherche avancés (note minimale, plateformes de streaming) sont réservés aux abonnés Pass Pro. Activez votre Pass Pro pour débloquer ces options."
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
        geminiApiKey:   req.body?.geminiApiKey,
        openAiApiKey:   req.body?.openAiApiKey || req.body?.openaiApiKey
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
        resolvedMovies = await resolveByTitles(extractedTitles, matches, effectiveQuery);
        console.log(`[API /api/search] [Étape 2 Phase A] ${resolvedMovies.length} correspondance(s) par titre.`);
      }

      // ─── ÉTAPE 2 — Phase B : Fallback textuel + TMDB si Phase A vide ─────────
      if (resolvedMovies.length === 0) {
        console.log('[API /api/search] [Étape 2 Phase B] Phase A vide → recherche élargie...');
        resolvedMovies = await resolveByKeywords(
          effectiveQuery,
          matches,
          req.body?.tmdbApiKey || ''
        );
        console.log(`[API /api/search] [Étape 2 Phase B] ${resolvedMovies.length} résultat(s).`);
      }

      // ─── ÉTAPE 2.5 — Filtre Anti-Mockbuster ─────────────────────────────────
      if (resolvedMovies.length > 0) {
        const beforeFilter = resolvedMovies.length;
        resolvedMovies = filterMockbusters(resolvedMovies, effectiveQuery);
        console.log(`[API /api/search] [Étape 2.5] Anti-mockbuster : ${beforeFilter} → ${resolvedMovies.length} film(s).`);
      }

      // Application des filtres Pro (ex: note minimale) si demandés
      if (filters?.minRating && Number(filters.minRating) > 0 && resolvedMovies.length > 0) {
        const minVal = Number(filters.minRating);
        resolvedMovies = resolvedMovies.filter(m => {
          const rating = Number(m.vote_average || m.rating || 0);
          return rating >= minVal;
        });
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
  } catch (err) {
    console.error('[API /api/search] Erreur non gérée :', err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Une erreur interne est survenue lors du traitement de la recherche.",
      movies: [],
      isEmpty: true
    });
  }
}
