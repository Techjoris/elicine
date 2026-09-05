export const DEFAULT_QWEN_KEY = '';

export interface QwenRawMovie {
  title: string;
  year?: number | string;
  reason?: string;
}

/**
 * Service d'appel sécurisé au moteur Qwen via le proxy serveur /api/ai
 */
export async function fetchMoviesFromQwen(
  userQuery: string,
  apiKey?: string
): Promise<QwenRawMovie[]> {
  const customKey = (
    apiKey || 
    localStorage.getItem('dashscope_api_key') ||
    localStorage.getItem('cinéia_qwen_api_key') || 
    localStorage.getItem('cinéia_qwen_key') || 
    localStorage.getItem('elicine_qwen_key') || 
    ''
  ).trim();

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

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customKey ? { 'Authorization': `Bearer ${customKey}` } : {}),
      },
      body: JSON.stringify({
        provider: 'qwen',
        model: 'qwen2.5-72b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API IA (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    // Extraction sécurisée du JSON
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Format JSON non détecté dans la réponse IA');
    }

    const parsed = JSON.parse(match[0]);
    const list: QwenRawMovie[] = parsed.movies || parsed.results || [];
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }

    throw new Error('Aucun film extrait de la réponse IA');
  } catch (err: any) {
    console.warn('[Éliciné Qwen] Erreur proxy /api/ai :', err?.message || err);
    throw err;
  }
}
