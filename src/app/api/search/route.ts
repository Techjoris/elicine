import { supabase } from '../../../lib/supabase';

// Schéma de sortie strict pour l'interprétation sémantique LLM (Étape 1)
export interface SemanticInterpretation {
  media_type: 'movie' | 'tv' | 'all';
  primary_genres: string[];
  mood_tags: string[];
  reference_titles: string[];
  clean_query: string;
  suggested_mood: string;
}

const LLM_EXPANSION_PROMPT = `Tu es l'encyclopédie cinématographique de référence d'Éliciné.
Analyse la requête de l'utilisateur et effectue une expansion sémantique cinématographique haute précision.
Schéma JSON strict obligatoire sans texte autour :
{
  "media_type": "movie" | "tv" | "all",
  "primary_genres": ["Comedy", "Romance"],
  "mood_tags": ["feel-good", "légère", "détente", "humour"],
  "reference_titles": ["Le Dîner de Cons", "SuperGrave", "La Cité de la Peur"],
  "clean_query": "comédie légère sans prise de tête",
  "suggested_mood": "Comédie feel-good et détente"
}`;

/**
 * Étape 1 : Analyse sémantique systématique (LLM Semantic Expansion)
 */
async function expandQueryWithLlm(rawQuery: string, customKeys: Record<string, string | undefined> = {}): Promise<SemanticInterpretation> {
  const groqKey = process.env.GROQ_API_KEY || customKeys.groqApiKey;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || customKeys.geminiApiKey;
  const openAiKey = process.env.OPENAI_API_KEY || customKeys.openAiApiKey;

  const messages = [
    { role: 'system', content: LLM_EXPANSION_PROMPT },
    { role: 'user', content: `Requête cinématographique : "${rawQuery}"` }
  ];

  // 1. Groq
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return parseLlmContent(content, rawQuery);
      }
    } catch (_) {}
  }

  // 2. Gemini
  if (geminiKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages,
          temperature: 0.2
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return parseLlmContent(content, rawQuery);
      }
    } catch (_) {}
  }

  // 3. OpenAI
  if (openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return parseLlmContent(content, rawQuery);
      }
    } catch (_) {}
  }

  return heuristicFallbackExpansion(rawQuery);
}

function parseLlmContent(content: string, rawQuery: string): SemanticInterpretation {
  try {
    const cleaned = content.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
    const parsed = JSON.parse(cleaned);
    const primaryGenres = Array.isArray(parsed.primary_genres) ? parsed.primary_genres : (Array.isArray(parsed.canonical_genres) ? parsed.canonical_genres : []);
    const moodTags = Array.isArray(parsed.mood_tags) ? parsed.mood_tags : (Array.isArray(parsed.themes) ? parsed.themes : []);
    const refTitles = Array.isArray(parsed.reference_titles) ? parsed.reference_titles : (Array.isArray(parsed.similar_reference_titles) ? parsed.similar_reference_titles : []);
    const cleanQuery = typeof parsed.clean_query === 'string' && parsed.clean_query ? parsed.clean_query : rawQuery;
    const suggestedMood = typeof parsed.suggested_mood === 'string' && parsed.suggested_mood ? parsed.suggested_mood : (primaryGenres.join(' / ') || rawQuery);

    return {
      media_type: parsed.media_type === 'tv' ? 'tv' : (parsed.media_type === 'movie' ? 'movie' : 'all'),
      primary_genres: primaryGenres,
      mood_tags: moodTags,
      reference_titles: refTitles,
      clean_query: cleanQuery,
      suggested_mood: suggestedMood
    };
  } catch (_) {
    return heuristicFallbackExpansion(rawQuery);
  }
}

function heuristicFallbackExpansion(rawQuery: string): SemanticInterpretation {
  const qLower = rawQuery.toLowerCase();
  let genres = ['Drame'];
  let moods = ['émotion', 'cinéma'];
  let refs = ['Intouchables', 'Le Fabuleux Destin d\'Amélie Poulain', 'La La Land'];
  let moodLabel = 'Drame & Émotion';

  if (/\b(com[eé]die|rire|dr[oô]le|feel[\s-]?good|d[eé]tente|sans prise de t[eê]te)\b/i.test(qLower)) {
    genres = ['Comédie'];
    moods = ['feel-good', 'légère', 'détente', 'humour'];
    refs = ['Le Dîner de Cons', 'SuperGrave', 'La Cité de la Peur', 'Intouchables'];
    moodLabel = 'Comédie feel-good et détente';
  } else if (/\b(pleurer|larmes|triste|chialer|d[eé]chirant|bouleversant)\b/i.test(qLower)) {
    genres = ['Drame', 'Romance'];
    moods = ['poignant', 'larmes', 'cathartique', 'tristesse'];
    refs = ['La Ligne verte', 'Le Tombeau des lucioles', 'Nos étoiles contraires', 'Manchester by the Sea'];
    moodLabel = 'Drame déchirant et larmes cathartiques';
  } else if (/\b(amour|romance|amoureux|impossible|r[eé]aliste)\b/i.test(qLower)) {
    genres = ['Romance', 'Drame'];
    moods = ['amour impossible', 'réaliste', 'mélancolique', 'passion'];
    refs = ['Past Lives', 'La La Land', 'Blue Valentine', 'In the Mood for Love'];
    moodLabel = 'Romance impossible et amours contrariées';
  }

  return {
    media_type: 'movie',
    primary_genres: genres,
    mood_tags: moods,
    reference_titles: refs,
    clean_query: rawQuery,
    suggested_mood: moodLabel
  };
}

/**
 * Route Handler Next.js App Router (POST /api/search)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body?.query || body?.searchQuery || body?.prompt || '').trim();

    if (!rawQuery) {
      return Response.json({ success: false, error: "Requête vide", results: [], movies: [] }, { status: 400 });
    }

    // Étape 1 : Interprétation sémantique systématique
    const expansion = await expandQueryWithLlm(rawQuery, {
      groqApiKey: body?.groqApiKey,
      geminiApiKey: body?.geminiApiKey,
      openAiApiKey: body?.openAiApiKey
    });

    let resolvedResults: any[] = [];
    let fallbackTriggered = false;

    // Étape 2 — Niveau 1 : Matching direct & vectoriel
    if (supabase) {
      const tokens = expansion.clean_query.split(/\s+/).filter(w => w.length >= 3);
      if (tokens.length > 0) {
        const orClauses = tokens.map(t => `overview.ilike.%${t}%,genres.ilike.%${t}%`).join(',');
        const { data } = await supabase
          .from('movies')
          .select('*')
          .or(orClauses)
          .order('vote_average', { ascending: false })
          .limit(10);
        if (Array.isArray(data) && data.length > 0) {
          resolvedResults.push(...data);
        }
      }
    }

    // Étape 2 — Niveau 2 : Si Niveau 1 renvoie moins de 4 films, élargir
    if (resolvedResults.length < 4 && supabase) {
      const seenIds = new Set(resolvedResults.map(m => m.id || m.tmdb_id));

      // 1. Matching par reference_titles
      if (expansion.reference_titles.length > 0) {
        const titleClauses = expansion.reference_titles
          .map(t => `title.ilike.%${t.split('/')[0].trim()}%`)
          .join(',');
        const { data: refData } = await supabase.from('movies').select('*').or(titleClauses).limit(10);
        if (Array.isArray(refData)) {
          for (const m of refData) {
            const id = m.id || m.tmdb_id;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              resolvedResults.push(m);
            }
          }
        }
      }

      // 2. Matching par primary_genres et mood_tags
      if (resolvedResults.length < 6 && expansion.primary_genres.length > 0) {
        const genreClauses = expansion.primary_genres.map(g => `genres.ilike.%${g}%`).join(',');
        const { data: genreData } = await supabase
          .from('movies')
          .select('*')
          .or(genreClauses)
          .order('vote_average', { ascending: false })
          .limit(10);
        if (Array.isArray(genreData)) {
          for (const m of genreData) {
            const id = m.id || m.tmdb_id;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              resolvedResults.push(m);
              if (resolvedResults.length >= 10) break;
            }
          }
        }
      }
    }

    // Étape 3 : Règle absolue "Zéro Écran Vide" (Smart Fallback)
    // Sélectionner les 6 meilleurs films du catalogue appartenant au genre principal (primary_genres[0])
    if (resolvedResults.length === 0 && supabase) {
      const mainGenre = expansion.primary_genres[0] || 'Comédie';
      const { data: fallbackData } = await supabase
        .from('movies')
        .select('*')
        .ilike('genres', `%${mainGenre}%`)
        .gte('vote_count', 250)
        .order('vote_average', { ascending: false })
        .limit(6);

      if (Array.isArray(fallbackData) && fallbackData.length > 0) {
        resolvedResults = fallbackData.slice(0, 6);
        fallbackTriggered = true;
      }
    }

    return Response.json({
      success: true,
      results: resolvedResults,
      movies: resolvedResults,
      count: resolvedResults.length,
      fallback_triggered: fallbackTriggered,
      isFallbackMode: fallbackTriggered,
      suggested_mood: expansion.suggested_mood,
      badge: fallbackTriggered ? 'Recommandations Éliciné pour votre atmosphère' : 'Sélection Éliciné',
      thought: `Vision & Recommandation Éliciné — Atmosphère : ${expansion.suggested_mood}`,
      extractedTitles: expansion.reference_titles
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message, results: [], movies: [] }, { status: 500 });
  }
}
