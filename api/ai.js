export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const {
    provider = 'auto',
    messages = [],
    model,
    temperature = 0.2,
    response_format,
    max_tokens,
    stream = false,
  } = req.body || {};

  const groqKey = process.env.GROQ_API_KEY || (req.headers.authorization?.startsWith('Bearer gsk_') ? req.headers.authorization.slice(7).trim() : '');
  const qwenKey = process.env.QWEN_API_KEY || (req.headers.authorization?.startsWith('Bearer sk-') ? req.headers.authorization.slice(7).trim() : '');

  // 1. Helper Groq Cloud
  const tryGroq = async (customModel) => {
    if (!groqKey) throw new Error('Clé GROQ_API_KEY non configurée');
    const selectedModel = customModel || model || 'llama-3.3-70b-versatile';

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

  // 2. Helper Qwen DashScope (Alibaba Cloud)
  const tryQwen = async (customModel) => {
    if (!qwenKey) throw new Error('Clé QWEN_API_KEY non configurée');
    const selectedModel = customModel || model || 'qwen-plus';
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

  // 3. Routage et repli automatique
  try {
    if (provider === 'qwen') {
      try {
        const result = await tryQwen();
        return res.status(200).json(result);
      } catch (qwenErr) {
        console.warn('[API /api/ai] Échec Qwen, repli automatique vers Groq...', qwenErr.message);
        if (groqKey) {
          const fallbackResult = await tryGroq('llama-3.3-70b-versatile');
          return res.status(200).json(fallbackResult);
        }
        throw qwenErr;
      }
    } else {
      // Priorité Groq Cloud par défaut
      try {
        const result = await tryGroq();
        return res.status(200).json(result);
      } catch (groqErr) {
        console.warn('[API /api/ai] Échec Groq, repli automatique vers Qwen...', groqErr.message);
        if (qwenKey) {
          const fallbackResult = await tryQwen('qwen-plus');
          return res.status(200).json(fallbackResult);
        }
        throw groqErr;
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
