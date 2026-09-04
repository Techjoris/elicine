export const DEFAULT_QWEN_KEY = 'sk-ws-H.DDHXLEH.6ybV.MEYCIQDu4RlmBTi6yqwCYiFYZf3QAKK2Az_1w7TMz12GJ3ZCNgIhAIZZuPMd5G0uvPtFMXH93tFfUk7fGg96qK_2lWSm14sz';

export interface QwenRawMovie {
  title: string;
  year?: number | string;
  reason?: string;
}

/**
 * Service d'appel direct à l'API Qwen (Alibaba Cloud / DashScope)
 * Endpoint OpenAI-compatible
 */
export async function fetchMoviesFromQwen(
  userQuery: string,
  apiKey?: string
): Promise<QwenRawMovie[]> {
  const key = (
    apiKey || 
    localStorage.getItem('cinéia_qwen_api_key') || 
    localStorage.getItem('cinéia_qwen_key') || 
    (import.meta as any).env?.VITE_QWEN_API_KEY || 
    DEFAULT_QWEN_KEY
  ).trim();

  if (!key) {
    throw new Error('Clé API Qwen manquante.');
  }

  const systemPrompt = `Tu es l'algorithme cinématographique expert d'Éliciné.
À partir de la demande de l'utilisateur, recommande entre 6 et 8 films ou séries existants et pertinents.
Réponds STRICTEMENT sous la forme d'un objet JSON pur, sans texte d'introduction ni conclusion.
Format requis :
{
  "movies": [
    {
      "title": "Titre exact",
      "year": 2023,
      "reason": "Une phrase percutante expliquant pourquoi ce titre correspond à la demande"
    }
  ]
}`;

  const endpoints = [
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  ];

  const models = ['qwen-turbo', 'qwen-plus'];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    for (const model of models) {
      try {
        console.log(`[CinéIA Qwen] Tentative d'appel (${model}) via ${endpoint}...`);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userQuery }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[CinéIA Qwen] Échec sur ${model} (${response.status}) : ${errorText}`);
          lastError = new Error(`Erreur Qwen (${response.status}): ${errorText}`);
          continue;
        }

        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';

        // Extraction sécurisée du JSON
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
          console.warn('[CinéIA Qwen] Format JSON non détecté :', rawText);
          continue;
        }

        const parsed = JSON.parse(match[0]);
        const list: QwenRawMovie[] = parsed.movies || parsed.results || [];
        if (Array.isArray(list) && list.length > 0) {
          console.log(`[CinéIA Qwen] Succès ! ${list.length} films retournés par ${model}`);
          return list;
        }
      } catch (err: any) {
        console.warn(`[CinéIA Qwen] Erreur appel (${model}) :`, err?.message || err);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Format JSON introuvable dans la réponse de Qwen.');
}
