export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const {
    provider = 'auto',
    messages = [],
    model,
    temperature = 0.5,
    response_format,
    max_tokens,
    stream = false,
  } = req.body || {};

  // ─── Clés API ────────────────────────────────────────────────────────────────
  // Priorité : variable d'environnement générique AI_API_KEY,
  // puis clé spécifique au provider, puis header Authorization du client.
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  // Qwen / DashScope (Alibaba Cloud)
  const qwenKey = (
    process.env.AI_API_KEY        ||   // clé générique recommandée
    process.env.QWEN_API_KEY      ||   // clé spécifique Qwen
    (bearerToken.startsWith('sk-') ? bearerToken : '')
  ).trim();

  // Groq Cloud (Llama / GPT-OSS — fallback)
  const groqKey = (
    process.env.GROQ_API_KEY      ||
    (bearerToken.startsWith('gsk_') ? bearerToken : '')
  ).trim();

  // Modèle actif : variable d'environnement AI_MODEL > payload > défaut Qwen
  const DEFAULT_QWEN_MODEL = 'qwen2.5-72b-instruct';
  const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
  const resolvedModel = process.env.AI_MODEL || model || DEFAULT_QWEN_MODEL;

  // ─── Helper Qwen DashScope ────────────────────────────────────────────────────
  const tryQwen = async (customModel) => {
    if (!qwenKey) throw new Error('Clé Qwen non configurée (AI_API_KEY ou QWEN_API_KEY manquante)');
    const selectedModel = customModel || resolvedModel;
    const endpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ];

    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${qwenKey}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages,
            temperature,
            ...(response_format ? { response_format } : {}),
            ...(max_tokens ? { max_tokens } : {}),
            stream: false,
          }),
        });

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

    throw lastError || new Error('Tous les endpoints Qwen ont échoué');
  };

  // ─── Helper Groq Cloud (fallback) ────────────────────────────────────────────
  const tryGroq = async (customModel) => {
    if (!groqKey) throw new Error('Clé GROQ_API_KEY non configurée');
    const selectedModel = customModel || DEFAULT_GROQ_MODEL;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature,
        ...(response_format ? { response_format } : {}),
        ...(max_tokens ? { max_tokens } : {}),
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return { ...data, provider_used: `Groq (${selectedModel})` };
  };

  // ─── Routage & repli automatique ─────────────────────────────────────────────
  try {
    if (provider === 'groq') {
      // Appel explicitement Groq (ex: validation de clé dans les paramètres)
      try {
        const result = await tryGroq(model || DEFAULT_GROQ_MODEL);
        return res.status(200).json(result);
      } catch (groqErr) {
        console.warn('[API /api/ai] Échec Groq explicite, repli vers Qwen...', groqErr.message);
        if (qwenKey) {
          const fallbackResult = await tryQwen(DEFAULT_QWEN_MODEL);
          return res.status(200).json(fallbackResult);
        }
        throw groqErr;
      }
    } else {
      // Défaut : Qwen en priorité → Groq en fallback
      try {
        const result = await tryQwen(provider === 'qwen' ? (model || resolvedModel) : resolvedModel);
        return res.status(200).json(result);
      } catch (qwenErr) {
        console.warn('[API /api/ai] Échec Qwen, repli automatique vers Groq (Llama)...', qwenErr.message);
        if (groqKey) {
          const fallbackResult = await tryGroq(DEFAULT_GROQ_MODEL);
          return res.status(200).json(fallbackResult);
        }
        throw qwenErr;
      }
    }
  } catch (finalErr) {
    console.error('[API /api/ai] Erreur globale moteurs IA :', finalErr.message);
    return res.status(502).json({
      error: 'Tous les moteurs IA ont échoué',
      details: finalErr.message,
    });
  }
}
