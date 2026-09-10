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
    max_tokens = 600,
    stream = false,
  } = req.body || {};

  // Auto-génération des messages si query/prompt est fourni directement
  let finalMessages = messages;
  if ((!finalMessages || finalMessages.length === 0) && (req.body?.query || req.body?.prompt)) {
    const userQ = String(req.body.query || req.body.prompt).trim();
    const cleanLower = userQ.toLowerCase();

    // Détection de spécificité côté backend
    const isUltra = /\b(twist|fin où|il était mort|schizophrène|piégé|enfermé|cercueil|cabine téléphonique|île psychiatrique|hopital psychiatrique|asile|pianiste juif|ghetto|sniper|magiciens rivaux)\b/i.test(cleanLower);
    const isBroad = !isUltra && /\b(films d|films de|films avec|films des|années 80|années 90|années 2000|comédie|science-fiction|action|horreur|thriller|western|coréen|français|américain)\b/i.test(cleanLower);

    let sysContent = `Tu es le moteur de recommandation cinématographique expert d'Éliciné.`;
    if (isUltra) {
      sysContent += `\nL'utilisateur effectue une recherche ultra-ciblée. Identifie STRICTEMENT la ou les 1 à 2 œuvres exactes correspondant à l'ensemble des critères d'intrigue, sans aucun film de remplissage.\nRéponds EXCLUSIVEMENT avec un objet JSON :\n{\n  "movies": ["Titre exact"]\n}`;
    } else if (isBroad) {
      sysContent += `\nL'utilisateur effectue une recherche large. Fournis une sélection complète, variée et riche de 14 à 16 films ou séries incontournables et emblématiques.\nRéponds EXCLUSIVEMENT avec un objet JSON :\n{\n  "movies": ["Titre 1", "Titre 2", ...]\n}`;
    } else {
      sysContent += `\nPour toute demande de l'utilisateur, réponds EXCLUSIVEMENT avec un objet JSON contenant une liste de 6 à 8 titres de films ou séries exacts et pertinents.\nExemple de format attendu :\n{\n  "movies": ["Shutter Island", "Inception", "The Departed", "Catch Me If You Can"]\n}`;
    }

    finalMessages = [
      { role: 'system', content: sysContent },
      { role: 'user', content: userQ }
    ];
  }

  // ─── Clés API ────────────────────────────────────────────────────────────────
  // Priorité absolue : Groq en premier (vitesse, fiabilité, 0% 401)
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  // Groq Cloud (Llama — Moteur Principal)
  const groqKey = (
    process.env.GROQ_API_KEY      ||
    process.env.AI_API_KEY        ||
    (bearerToken.startsWith('gsk_') ? bearerToken : '')
  ).trim();

  // Qwen / DashScope (Alibaba Cloud — Fallback)
  const qwenKey = (
    process.env.DASHSCOPE_API_KEY      ||
    process.env.QWEN_API_KEY           ||
    process.env.VITE_DASHSCOPE_API_KEY ||
    (bearerToken.startsWith('sk-') ? bearerToken : '')
  ).trim();

  // Modèles par défaut
  const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
  const DEFAULT_QWEN_MODEL = 'qwen-plus';

  // ─── Helper 1 : Groq Cloud (Primaire) ─────────────────────────────────────────
  const tryGroq = async (customModel) => {
    if (!groqKey) throw new Error('Clé GROQ_API_KEY non configurée');
    const selectedModel = customModel || (model && !model.includes('qwen') ? model : DEFAULT_GROQ_MODEL);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return { ...data, provider_used: `Groq (${selectedModel})` };
  };

  // ─── Helper 2 : Qwen DashScope (Fallback 1) ──────────────────────────────────
  const tryQwen = async (customModel) => {
    if (!qwenKey) throw new Error('Clé Qwen/DashScope non configurée');
    const selectedModel = customModel || (model && model.includes('qwen') ? model : DEFAULT_QWEN_MODEL);
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
            messages: finalMessages,
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

  // ─── Routage & Cascade de Résilience ─────────────────────────────────────────
  try {
    if (provider === 'qwen') {
      // Si Qwen explicitement demandé, tente Qwen d'abord mais replie immédiatement sur Groq si 401 ou erreur
      try {
        const result = await tryQwen();
        return res.status(200).json(result);
      } catch (qwenErr) {
        console.warn('[API /api/ai] Échec Qwen (ex: 401), repli automatique vers Groq...', qwenErr.message);
        if (groqKey) {
          const fallbackResult = await tryGroq(DEFAULT_GROQ_MODEL);
          return res.status(200).json(fallbackResult);
        }
        throw qwenErr;
      }
    } else {
      // PAR DÉFAUT : GROQ EN PREMIER (Fastest, High Reliability, 0% blocker)
      try {
        const result = await tryGroq(model || DEFAULT_GROQ_MODEL);
        return res.status(200).json(result);
      } catch (groqErr) {
        console.warn('[API /api/ai] Groq indisponible, tentative de repli vers Qwen...', groqErr.message);
        if (qwenKey) {
          try {
            const fallbackResult = await tryQwen(DEFAULT_QWEN_MODEL);
            return res.status(200).json(fallbackResult);
          } catch (qwenErr) {
            console.warn('[API /api/ai] Qwen a également échoué :', qwenErr.message);
          }
        }
        throw groqErr;
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
