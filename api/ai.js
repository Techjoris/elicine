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
    temperature = 0.3,
    response_format,
    max_tokens = 220,
    filters
  } = parseResult.data;

  // ─── 2. Contrôle d'Accès & Paywall Côté Serveur (Supabase) ─────────────────
  const sessionInfo = await verifyServerSession(req);
  const isPro = sessionInfo.isPro;
  const isBypassQuotas = Boolean(sessionInfo.isBypassQuotas || sessionInfo.isAdmin);
  const effectiveUserKey = sessionInfo.effectiveUserId;
  const todayDate = new Date().toISOString().split('T')[0];

  // A. Vérification de l'accès aux filtres Pro (Plateformes ou notes minimales)
  const hasProFilters = Boolean(
    filters && (
      (filters.platform && filters.platform !== 'all') ||
      (filters.minRating && filters.minRating > 0)
    )
  );

  if (hasProFilters && !isPro && !isBypassQuotas) {
    return res.status(403).json({
      error: "Les filtres avancés (plateformes de streaming, notes minimales) sont strictement réservés aux abonnés Pro (1.99$).",
      code: "PRO_REQUIRED",
      requiresPro: true
    });
  }

  // B. Validation systématique du quota journalier (3 recherches gratuites / jour)
  // L'administrateur principal (ivanjoris959@gmail.com) et les membres Pro sont exemptés de toute restriction
  if (!isPro && !isBypassQuotas && effectiveUserKey && supabaseServer) {
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

  // 1. DeepSeek (Moteur Principal - Niveau 1)
  const deepseekKey = (
    process.env.DEEPSEEK_API_KEY       ||
    process.env.DEEPSEEK_KEY           ||
    process.env.VITE_DEEPSEEK_API_KEY  ||
    req.body?.deepseekApiKey           ||
    (bearerToken.startsWith('sk-') ? bearerToken : '')
  ).trim().replace(/^["']|["']$/g, '');

  // 2. Qwen / DashScope (Alibaba Cloud — Secours 1)
  const qwenKey = (
    process.env.DASHSCOPE_API_KEY      ||
    process.env.QWEN_API_KEY           ||
    process.env.VITE_DASHSCOPE_API_KEY ||
    req.body?.qwenApiKey               ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  // 3. Google Gemini (Secours 2)
  const geminiKey = (
    process.env.GEMINI_API_KEY         ||
    process.env.GOOGLE_API_KEY         ||
    process.env.VITE_GEMINI_API_KEY    ||
    req.body?.geminiApiKey             ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  // 4. Groq Cloud (Llama — Filet Supplémentaire)
  const groqKey = (
    process.env.GROQ_API_KEY           ||
    process.env.AI_API_KEY             ||
    req.body?.groqApiKey               ||
    (bearerToken.startsWith('gsk_') ? bearerToken : '')
  ).trim().replace(/^["']|["']$/g, '');

  // Modèles par défaut
  const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const DEFAULT_QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
  const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

  // Helper fetch avec timeout pour éviter tout blocage réseau
  const fetchWithTimeout = async (url, options, timeoutMs = 12000) => {
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

  // ─── Niveau 1 : DeepSeek-Flash / Chat (Moteur Principal) ─────────────────────
  const tryDeepSeek = async (customModel = 'deepseek-chat') => {
    const effectiveKey = (process.env.DEEPSEEK_API_KEY || deepseekKey || '').trim().replace(/^["']|["']$/g, '');
    if (!effectiveKey) {
      const err = new Error("Clé d'API DeepSeek absente : DEEPSEEK_API_KEY n'est pas configurée dans les variables d'environnement Vercel");
      console.error("Détail Erreur DeepSeek:", err.message);
      throw err;
    }

    const selectedModel = 'deepseek-chat';
    const targetUrl = 'https://api.deepseek.com/chat/completions';

    console.log(`[API /api/ai] Interrogation DeepSeek (${selectedModel}) sur ${targetUrl}...`);

    const response = await fetchWithTimeout(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: finalMessages,
        temperature: 0.3,
        max_tokens: Math.min(Number(max_tokens) || 220, 250),
        stream: false,
        response_format: { type: 'json_object' }
      }),
    }, 7000);

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`DeepSeek HTTP ${response.status}: ${errText}`);
      console.error("Détail Erreur DeepSeek:", err);
      throw err;
    }

    const data = await response.json();
    console.log(`[API /api/ai] Réponse reçue avec succès de DeepSeek (${selectedModel}) !`);
    return { ...data, provider_used: `DeepSeek (${selectedModel})` };
  };

  // ─── Secours 1 : Qwen DashScope (Alibaba Cloud) ──────────────────────────────
  const tryQwen = async (customModel = DEFAULT_QWEN_MODEL) => {
    const effectiveKey = (process.env.DASHSCOPE_API_KEY || qwenKey || '').trim().replace(/^["']|["']$/g, '');
    if (!effectiveKey) {
      const err = new Error("Clé Qwen/DashScope (DASHSCOPE_API_KEY) non configurée dans l'environnement");
      console.error("Détail Erreur Qwen:", err.message);
      throw err;
    }
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
            'Authorization': `Bearer ${effectiveKey}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: finalMessages,
            temperature: 0.3,
            max_tokens: Math.min(Number(max_tokens) || 220, 250),
            stream: false,
          }),
        }, 6000);

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`Qwen HTTP ${response.status}: ${errText}`);
          continue;
        }

        const data = await response.json();
        console.log(`[API /api/ai] Réponse reçue avec succès de Qwen (${selectedModel}) !`);
        return { ...data, provider_used: `Qwen (${selectedModel})` };
      } catch (err) {
        lastError = err;
      }
    }

    const err = lastError || new Error('Tous les endpoints Qwen ont échoué ou dépassé le délai');
    console.error("Détail Erreur Qwen:", err.message);
    throw err;
  };

  // ─── Secours 2 : Google Gemini (gemini-2.0-flash / gemini-1.5-flash) ─────────
  const tryGemini = async (customModel = DEFAULT_GEMINI_MODEL) => {
    const effectiveKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || geminiKey || '').trim().replace(/^["']|["']$/g, '');
    if (!effectiveKey) {
      const err = new Error("Clé Gemini (GEMINI_API_KEY ou GOOGLE_API_KEY) non configurée");
      console.error("Détail Erreur Gemini:", err.message);
      throw err;
    }

    // 1. Essai endpoint compatible OpenAI de Gemini
    try {
      const response = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: customModel,
          messages: finalMessages,
          temperature: 0.3,
          max_tokens: Math.min(Number(max_tokens) || 220, 250),
        }),
      }, 7000);

      if (response.ok) {
        const data = await response.json();
        console.log(`[API /api/ai] Réponse reçue avec succès de Gemini (${customModel}) !`);
        return { ...data, provider_used: `Gemini (${customModel})` };
      }
    } catch (openAiErr) {
      console.warn('[API /api/ai] Endpoint OpenAI Gemini échoué, repli sur generateContent native...', openAiErr?.message);
    }

    // 2. Fallback direct generateContent API native
    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${customModel}:generateContent?key=${effectiveKey}`;
    const nativeResponse = await fetchWithTimeout(nativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: finalMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n') }
            ]
          }
        ]
      })
    }, 10000);

    if (!nativeResponse.ok) {
      const errText = await nativeResponse.text();
      const err = new Error(`Gemini HTTP ${nativeResponse.status}: ${errText}`);
      console.error("Détail Erreur Gemini:", err.message);
      throw err;
    }

    const nativeData = await nativeResponse.json();
    const textContent = nativeData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[API /api/ai] Réponse reçue avec succès de Gemini native (${customModel}) !`);
    return {
      choices: [{ message: { content: textContent } }],
      provider_used: `Gemini (${customModel})`
    };
  };

  // ─── Filet Supplémentaire : Groq Cloud (Llama 3.3) ───────────────────────────
  const tryGroq = async (customModel = DEFAULT_GROQ_MODEL) => {
    const effectiveKey = (process.env.GROQ_API_KEY || process.env.AI_API_KEY || groqKey || '').trim().replace(/^["']|["']$/g, '');
    if (!effectiveKey) throw new Error('Clé GROQ_API_KEY non configurée');

    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: customModel,
        messages: finalMessages,
        temperature: 0.2,
        stream: false,
      }),
    }, 8000);

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`Groq HTTP ${response.status}: ${errText}`);
      console.error("Détail Erreur Groq:", err.message);
      throw err;
    }

    const data = await response.json();
    console.log(`[API /api/ai] Réponse reçue avec succès de Groq (${customModel}) !`);
    return { ...data, provider_used: `Groq (${customModel})` };
  };

  // ─── Enregistrement Quota dans Supabase pour les Utilisateurs Gratuits ───────
  const recordSearchInSupabase = async () => {
    // Si membre Pro ou Administrateur principal : AUCUNE décrémentation ni incrémentation de compteur
    if (!supabaseServer || !effectiveUserKey || isPro || isBypassQuotas) return;
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

  // ─── Routage & Cascade Haute Disponibilité (DeepSeek -> Qwen -> Gemini -> Groq) ──
  // Helper exécutant la cascade complète avec priorité absolue à DeepSeek
  const executeFullCascade = async () => {
    // 1. Tentative 1 : DeepSeek-Flash / Chat (Moteur Principal)
    try {
      console.log('[API /api/ai] [Niveau 1] Appel effectif de DeepSeek (deepseek-chat)...');
      const deepseekResult = await tryDeepSeek('deepseek-chat');
      await recordSearchInSupabase();
      return res.status(200).json(deepseekResult);
    } catch (error) {
      console.error("Détail Erreur DeepSeek:", error);
      console.warn("Basculement sur Qwen (Secours 1)...");

      // 2. Tentative 2 : Qwen (DashScope - Secours 1)
      try {
        console.log('[API /api/ai] [Secours 1] Appel de secours Qwen (DashScope)...');
        const qwenResult = await tryQwen(DEFAULT_QWEN_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(qwenResult);
      } catch (qwenError) {
        console.error("Détail Erreur Qwen:", qwenError);
        console.warn("Basculement sur Gemini (Secours 2)...");

        // 3. Tentative 3 : Gemini (gemini-2.0-flash - Secours 2)
        try {
          console.log('[API /api/ai] [Secours 2] Appel de secours Gemini (gemini-2.0-flash)...');
          const geminiResult = await tryGemini(DEFAULT_GEMINI_MODEL);
          await recordSearchInSupabase();
          return res.status(200).json(geminiResult);
        } catch (geminiError) {
          console.error("Détail Erreur Gemini:", geminiError);

          // 4. Filet de secours ultime : Groq Cloud (Llama 3.3)
          if (groqKey || process.env.GROQ_API_KEY) {
            try {
              console.log('[API /api/ai] [Secours 3] Filet de secours ultime : tentative Groq Cloud...');
              const groqResult = await tryGroq(DEFAULT_GROQ_MODEL);
              await recordSearchInSupabase();
              return res.status(200).json(groqResult);
            } catch (groqErr) {
              console.error("Détail Erreur Groq:", groqErr);
            }
          }

          throw new Error(`Tous les moteurs IA ont échoué : DeepSeek (${error?.message || error}) -> Qwen (${qwenError?.message || qwenError}) -> Gemini (${geminiError?.message || geminiError})`);
        }
      }
    }
  };

  try {
    // Si l'utilisateur demande explicitement Qwen en priorité
    if (provider === 'qwen') {
      try {
        const result = await tryQwen(model || DEFAULT_QWEN_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(result);
      } catch (qwenErr) {
        console.error("Détail Erreur Qwen:", qwenErr);
        console.warn("Basculement sur DeepSeek...");
        return await executeFullCascade();
      }
    }

    // Si l'utilisateur demande explicitement Groq en priorité
    if (provider === 'groq') {
      try {
        const result = await tryGroq(model || DEFAULT_GROQ_MODEL);
        await recordSearchInSupabase();
        return res.status(200).json(result);
      } catch (groqErr) {
        console.error("Détail Erreur Groq:", groqErr);
        return await executeFullCascade();
      }
    }

    // Par défaut et pour provider === 'deepseek' : exécuter la cascade prioritaire DeepSeek -> Qwen -> Gemini -> Groq
    return await executeFullCascade();
  } catch (finalErr) {
    console.error('[API /api/ai] Erreur globale moteurs IA :', finalErr?.message || finalErr);
    return res.status(502).json({
      error: 'Tous les moteurs IA ont échoué',
      details: finalErr?.message || String(finalErr),
      fallback_suggested: true,
    });
  }
}
