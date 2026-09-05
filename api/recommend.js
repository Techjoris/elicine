export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const userQuery = String(req.body?.query || req.body?.prompt || '').trim();
  if (!userQuery) {
    return res.status(400).json({ error: 'Requête vide' });
  }

  const groqKey = (process.env.GROQ_API_KEY || process.env.AI_API_KEY || '').trim();
  const qwenKey = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '').trim();
  const tmdbKey = (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '').trim();

  let aiText = '';

  // 1. Appel principal Groq
  if (groqKey) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Tu es le moteur de recommandation de films d\'Éliciné.\nPour toute demande de l\'utilisateur, réponds EXCLUSIVEMENT avec un objet JSON contenant une liste de 5 à 8 titres de films exacts pertinents.\nExemple de format attendu :\n{\n  "movies": ["Shutter Island", "Inception", "The Departed", "Catch Me If You Can"]\n}'
            },
            { role: 'user', content: userQuery }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 400
        }),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        aiText = groqData.choices?.[0]?.message?.content || '';
      }
    } catch (err) {
      console.warn('[API /api/recommend] Groq échoué, tentative Qwen...', err.message);
    }
  }

  // Fallback Qwen si Groq n'a rien renvoyé
  if (!aiText && qwenKey) {
    const endpoints = [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    ];
    for (const ep of endpoints) {
      try {
        const qwenRes = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${qwenKey}`,
          },
          body: JSON.stringify({
            model: 'qwen-plus',
            messages: [
              {
                role: 'system',
                content: 'Tu es le moteur de recommandation de films d\'Éliciné. Réponds EXCLUSIVEMENT avec un objet JSON {"movies": ["Titre 1", "Titre 2"]}.'
              },
              { role: 'user', content: userQuery }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 400
          }),
        });

        if (qwenRes.ok) {
          const qwenData = await qwenRes.json();
          aiText = qwenData.choices?.[0]?.message?.content || '';
          if (aiText) break;
        }
      } catch (err) {
        console.warn('[API /api/recommend] Qwen endpoint échoué :', ep, err.message);
      }
    }
  }

  // 2. Extraction résiliente des titres
  let titles = [];
  try {
    const cleanContent = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    titles = parsed.movies || parsed.titles || parsed.results || [];
  } catch (e) {
    // Regex fallback if JSON was malformed: extract lines or quoted strings
    const matches = aiText.match(/"([^"]+)"/g);
    if (matches) titles = matches.map(m => m.replace(/"/g, ''));
  }

  // If still empty, extract core keywords from user query for TMDB direct search:
  if (!titles || titles.length === 0) {
    titles = [userQuery.replace(/(film|film de|avec|une fin twist|recommande|moi)/gi, '').trim()];
  }

  // 3. Hydratation TMDB exacte
  let resolvedMovies = [];
  if (tmdbKey) {
    const moviePromises = titles.slice(0, 8).map(async (title) => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(title)}&language=fr-FR&include_adult=false`);
        const data = await res.json();
        return data.results && data.results.length > 0 ? data.results[0] : null;
      } catch (err) {
        return null;
      }
    });

    resolvedMovies = (await Promise.all(moviePromises)).filter(Boolean);

    // Si aucun résultat résolu, repli de secours direct TMDB avec la requête utilisateur
    if (resolvedMovies.length === 0) {
      try {
        const cleanKeyword = userQuery.replace(/(film|film de|avec|une fin twist|recommande|moi)/gi, '').trim();
        const fallbackRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(cleanKeyword || userQuery)}&language=fr-FR&include_adult=false`);
        const fallbackData = await fallbackRes.json();
        if (fallbackData.results && fallbackData.results.length > 0) {
          resolvedMovies = fallbackData.results.slice(0, 8);
        }
      } catch (e) {
        console.error('[API /api/recommend] Erreur repli TMDB :', e);
      }
    }
  }

  return res.status(200).json({
    movies: resolvedMovies,
    titles: titles,
    count: resolvedMovies.length
  });
}
