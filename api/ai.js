import { checkRateLimit } from './_rateLimit.js';
import { 
  aiSearchRequestSchema, 
  verifyServerSession, 
  sanitizeUserQuery, 
  buildSecuredPrompt, 
  supabaseServer 
} from './_security.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Protection contre les abus : 8 requêtes par minute par adresse IP
  const limiter = checkRateLimit(req, res, { max: 8, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // ─── 1. Validation Stricte des Données Entrantes avec Zod ────────────────────
  const parseResult = aiSearchRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Données de requête invalides",
      details: parseResult.error.format()
    });
  }

  const {
    query,
    prompt,
    messages,
    provider = 'auto',
    model,
    temperature = 0.2,
    response_format,
    max_tokens = 600,
    filters
  } = parseResult.data;

  // ─── 2. Contrôle d'Accès & Paywall Côté Serveur (Supabase) ─────────────────
  const sessionInfo = await verifyServerSession(req);
  const isPro = sessionInfo.isPro;
  const effectiveUserKey = sessionInfo.effectiveUserId;
  const todayDate = new Date().toISOString().split('T')[0];

  // A. Vérification de l'accès aux filtres Pro (Plateformes ou notes minimales)
  const hasProFilters = Boolean(
    filters && (
      (filters.platform && filters.platform !== 'all') ||
      (filters.minRating && filters.minRating > 0)
    )
  );

  if (hasProFilters && !isPro) {
    return res.status(403).json({
      error: "Les filtres avancés (plateformes de streaming, notes minimales) sont strictement réservés aux abonnés Pro (1.99$).",
      code: "PRO_REQUIRED",
      requiresPro: true
    });
  }

  // B. Validation systématique du quota journalier (3 recherches gratuites / jour)
  if (!isPro && effectiveUserKey && supabaseServer) {
    try {
      const { data: searchRecord } = await supabaseServer
        .from('user_searches')
        .select('search_count')
        .eq('user_id', effectiveUserKey)
        .eq('search_date', todayDate)
        .maybeSingle();

      if (searchRecord && searchRecord.search_count >= 3) {
        return res.status(403).json({
          error: "Quota journalier atteint (3/3 recherches gratuites). Passez au compte Pro (1.99$) pour un accès illimité.",
          code: "QUOTA_EXCEEDED",
          quotaExceeded: true,
          remaining: 0,
          max: 3
        });
      }
    } catch (quotaErr) {
      console.warn('[API /api/ai] Erreur vérification quota Supabase :', quotaErr?.message);
    }
  }

  // ─── 3. Défense contre les Prompt Injections : Assainissement & Délimitation ─
  let rawUserQuery = query || prompt || '';
  if (!rawUserQuery && messages && messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    rawUserQuery = lastUserMsg ? lastUserMsg.content : '';
  }

  const cleanUserQuery = sanitizeUserQuery(rawUserQuery);
  if (!cleanUserQuery) {
    return res.status(400).json({ error: "Requête de recherche vide ou invalide après assainissement." });
  }

  // Détection de spécificité pour calibrer les instructions de réponse
  const cleanLower = cleanUserQuery.toLowerCase();
  const isUltra = /\b(twist|fin où|il était mort|schizophrène|piégé|enfermé|cercueil|cabine téléphonique|île psychiatrique|hopital psychiatrique|asile|pianiste juif|ghetto|sniper|magiciens rivaux)\b/i.test(cleanLower);
  const isBroad = !isUltra && /\b(films d|films de|films avec|films des|années 80|années 90|années 2000|comédie|science-fiction|action|horreur|thriller|western|coréen|français|américain)\b/i.test(cleanLower);
  const specificityLevel = isUltra ? 'ultra_targeted' : (isBroad ? 'broad' : 'standard');

  // Construction du prompt hermétique avec rôle système inviolable et conteneur <search_query>
  const finalMessages = buildSecuredPrompt(cleanUserQuery, specificityLevel);

  // ─── 4. Clés API & Fournisseurs LLM ──────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  // 1. Qwen / DashScope (Alibaba Cloud — Moteur Principal)
  const qwenKey = (
    process.env.DASHSCOPE_API_KEY      ||
    process.env.QWEN_API_KEY           ||
    process.env.VITE_DASHSCOPE_API_KEY ||
    (bearerToken.startsWith('sk-') && !bearerToken.startsWith('sk-deepseek') ? bearerToken : '')
  ).trim();

  // 2. DeepSeek (Moteur Fallback Haute Disponibilité)
  const deepseekKey = (
    process.env.DEEPSEEK_API_KEY       ||
    process.env.VITE_DEEPSEEK_API_KEY  ||
    (bearerToken.startsWith('sk-deepseek') ? bearerToken : '')
  ).trim();

  // 3. Groq Cloud (Llama — Secours Supplémentaire)
  const groqKey = (
    process.env.GROQ_API_KEY      ||
    process.env.AI_API_KEY        ||
    (bearerToken.startsWith('gsk_') ? bearerToken : '')
  ).trim();

  // Modèles par défaut
  const DEFAULT_QWEN_MODEL = 'qwen-plus';
  const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
  const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

  // Helper fetch avec timeout pour éviter tout blocage réseau
  const fetchWithTimeout = async (url, options, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Délai d'attente dépassé (${timeoutMs}ms)`));
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  // ─── Étape 1 : Qwen DashScope (Moteur Principal) ─────────────────────────────
  const tryQwen = async (customModel) => {
    if (!qwenKey) throw new Error('Clé Qwen/DashScope (DASHSCOPE_API_KEY) non configurée');
    const selectedModel = customModel || (model && model.includes('qwen') ? model : DEFAULT_QWEN_MODEL);
    const endpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ];

    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${qwenKey}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: finalMessages,
            temperature,
            ...(response_format ? { response_format } : {}),
            ...(max_tokens ? { max_tokens } : {}),
            stream: false,
          }),
        }, 8000);

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`Qwen HTTP ${response.status}: ${errText}`);
          continue;
        }

        const data = await response.json();
        return { ...data, provider_used: `Qwen (${selectedModel})` };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Tous les endpoints Qwen ont échoué ou dépassé le délai');
  };

  // ─── Étape 3 : DeepSeek-Flash (Moteur Fallback Haute Disponibilité) ───────────
  const tryDeepSeek = async (customModel) => {
    if (!deepseekKey) throw new Error('Clé DeepSeek (DEEPSEEK_API_KEY) non configurée');
    const selectedModel = customModel || DEFAULT_DEEPSEEK_MODEL;

    const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: finalMessages,
        temperature,
        ...(response_format ? { response_format } : {}),
        ...(max_tokens ? { max_tokens } : {}),
        stream: false,
      }),
    }, 10000);

    if (!response.ok) {
      const errText = await response.text();
      // Repli automatique sur deepseek-chat si deepseek-flash n'est pas reconnu
      if (response.status === 400 && errText.toLowerCase().includes('model') && selectedModel === 'deepseek-flash') {
        console.warn('[API /api/ai] DeepSeek : Repli sur deepseek-chat suite au rejet de deepseek-flash');
        return await tryDeepSeek('deepseek-chat');
      }
      throw new Error(`DeepSeek HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return { ...data, provider_used: `DeepSeek (${selectedModel})` };
  };

  // ─── Secours Supplémentaire : Groq Cloud (Llama 3.3) ─────────────────────────
  const tryGroq = async (customModel) => {
    if (!groqKey) throw new Error('Clé GROQ_API_KEY non configurée');
    const selectedModel = customModel || (model && !model.includes('qwen') && !model.includes('deepseek') ? model : DEFAULT_GROQ_MODEL);

    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: finalMessages,
        temperature,
        ...(response_format ? { response_format } : {}),
        ...(max_tokens ? { max_tokens } : {}),
        stream: false,
      }),
    }, 8000);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return { ...data, provider_used: `Groq (${selectedModel})` };
  };

  // ─── Enregistrement Quota dans Supabase pour les Utilisateurs Gratuits ───────
  const recordSearchInSupabase = async () => {
    if (!supabaseServer || !effectiveUserKey || isPro) return;
    try {
      const { data: existing } = await supabaseServer
        .from('user_searches')
        .select('id, search_count')
        .eq('user_id', effectiveUserKey)
        .eq('search_date', todayDate)
        .maybeSingle();

      if (existing?.id) {
        await supabaseServer
          .from('user_searches')
          .update({
            search_count: (existing.search_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabaseServer
          .from('user_searches')
          .insert({
            user_id: effectiveUserKey,
            ip_address: sessionInfo.clientIp || null,
            search_date: todayDate,
            search_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    } catch (e) {
      console.warn('[API /api/ai] Erreur incrémentation user_searches:', e?.message);
    }
  };

  // ─── Routage & Cascade Haute Disponibilité (Qwen -> DeepSeek-Flash -> Groq) ──
  try {
    // Cas 1 : Demande explicite de DeepSeek
    if (provider === 'deepseek') {
      try {
        const result = await tryDeepSeek(model || DEFAULT_DEEPSEEK_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(result);
      } catch (deepseekErr) {
        console.warn('[API /api/ai] Échec DeepSeek, repli vers Qwen...', deepseekErr?.message);
        if (qwenKey) {
          const fallbackQwen = await tryQwen(DEFAULT_QWEN_MODEL);
          await recordSearchInSupabase();
          return res.status(200).json(fallbackQwen);
        }
        throw deepseekErr;
      }
    }

    // Cas 2 : Demande explicite de Groq
    if (provider === 'groq') {
      try {
        const result = await tryGroq(model || DEFAULT_GROQ_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(result);
      } catch (groqErr) {
        console.warn('[API /api/ai] Échec Groq, repli vers Qwen/DeepSeek...', groqErr?.message);
      }
    }

    // CAS PAR DÉFAUT : Qwen (DashScope) en Priorité Absolue
    try {
      console.log('[API /api/ai] [Étape 1] Interrogation sécurisée de Qwen (DashScope)...');
      const result = await tryQwen();
      await recordSearchInSupabase();
      return res.status(200).json(result);
    } catch (qwenErr) {
      // Étape 2 : Interception de l'échec Qwen dans le try/catch
      console.warn('[API /api/ai] [Étape 2] Échec ou timeout Qwen :', qwenErr?.message || qwenErr);
      
      // Étape 3 : Bascule automatique immédiate sur DeepSeek-Flash
      console.log('[API /api/ai] [Étape 3] Bascule immédiate sur DeepSeek (deepseek-flash)...');
      try {
        const deepseekResult = await tryDeepSeek(DEFAULT_DEEPSEEK_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(deepseekResult);
      } catch (deepseekErr) {
        console.warn('[API /api/ai] Échec du fournisseur de secours DeepSeek :', deepseekErr?.message || deepseekErr);

        // Filet de sécurité tertiaire si Groq est disponible
        if (groqKey) {
          console.log('[API /api/ai] Filet de secours ultime : tentative via Groq Cloud...');
          try {
            const groqResult = await tryGroq(DEFAULT_GROQ_MODEL);
            await recordSearchInSupabase();
            return res.status(200).json(groqResult);
          } catch (groqErr) {
            console.warn('[API /api/ai] Groq a également échoué :', groqErr?.message);
          }
        }

        throw new Error(`Qwen (${qwenErr.message}) et DeepSeek (${deepseekErr.message}) ont tous deux échoué.`);
      }
    }
  } catch (finalErr) {
    console.error('[API /api/ai] Erreur globale moteurs IA :', finalErr.message);
    return res.status(502).json({
      error: 'Tous les moteurs IA ont échoué',
      details: finalErr.message,
      fallback_suggested: true,
    });
  }
}
