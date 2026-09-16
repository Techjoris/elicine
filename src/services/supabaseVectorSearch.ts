/**
 * Service de Recherche Vectorielle & Sémantique Supabase pour Éliciné
 * Cœur du Niveau 2 de la cascade de recherche.
 * 
 * Interroge les embeddings vectoriels Supabase (pgvector) ou applique l'analyse
 * sémantique haute fidélité pour les intrigues narratives complexes sans acteur.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Movie } from '../types';
import { formatTmdbResults } from './tmdb';

export interface VectorMovieMatch {
  id: number;
  tmdb_id?: number;
  title: string;
  original_title?: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  genres?: any[];
  similarity: number;
  match_reason?: string;
}

export interface VectorSearchResponse {
  movies: Movie[];
  globalSimilarityScore: number;
  isLowSimilarity: boolean; // true si < 0.40 (40%)
  providerUsed: string;
}

/**
 * Mots-clés et tropes sémantiques pour la détection narrative fine
 */
const NARRATIVE_CONCEPT_MAP: Record<string, { triggers: string[]; genres: number[]; films: string[] }> = {
  subterranean_horror: {
    triggers: ['sous terre', 'coincé sous terre', 'coinces sous terre', 'grotte', 'caverne', 'speleologie', 'spéléologie', 'catacombes', 'tunnel', 'sous-sol', 'claustrophobe'],
    genres: [27, 53, 9648], // Horreur, Thriller, Mystère
    films: ['The Descent', 'Cube', 'Buried', 'Catacombes', 'As Above, So Below', 'The Cave', 'Sanctum']
  },
  space_black_hole: {
    triggers: ['trou noir', 'espace', 'astronaute', 'station spatiale', 'galaxie', 'relativité', 'temps qui passe plus vite'],
    genres: [878, 12, 18], // SF, Aventure, Drame
    films: ['Interstellar', '2001 : L\'Odyssée de l\'espace', 'Ad Astra', 'Gravity', 'First Man']
  },
  time_loop: {
    triggers: ['boucle temporelle', 'revit la meme journee', 'revit la même journée', 'recommence sans cesse', 'bloqué dans le temps'],
    genres: [878, 35, 53],
    films: ['Un jour sans fin', 'Edge of Tomorrow', 'Palm Springs', 'Source Code', 'Happy Birthdead']
  },
  heist_bad_turn: {
    triggers: ['braquage qui tourne mal', 'braquage', 'casse qui tourne mal', 'braqueurs', 'banque'],
    genres: [80, 53, 28],
    films: ['Un après-midi de chien', 'Heat', 'The Town', 'Reservoir Dogs', 'Inside Man', 'Good Time']
  },
  claustrophobic_coffin: {
    triggers: ['cercueil', 'enterré vivant', 'enterre vivant', 'dans une boite', 'dans une boîte'],
    genres: [53, 9648],
    films: ['Buried', 'Kill Bill: Vol. 2', 'Oxygen']
  }
};

/**
 * Calcule le score global de similarité sémantique (entre 0.0 et 1.0)
 * d'une liste de films par rapport à la requête en langage naturel.
 */
export function calculateGlobalSemanticSimilarity(
  queryText: string,
  candidateMovies: any[]
): number {
  const clean = (queryText || '').toLowerCase().trim();
  if (!clean || !candidateMovies || candidateMovies.length === 0) {
    return 0.0;
  }

  // 1. Détection de requêtes hors-sujet flagrantes (ex: recettes, bricolage, code informatique)
  const isObviousOutOfDomain = /\b(recette|cuisine|ingrédients|gateau|gâteau|tarte|pommes|bicarbonate|voiture occasion|plomberie|python script|npm install|réparer robinet)\b/i.test(clean);
  if (isObviousOutOfDomain) {
    return 0.15; // Inférieur à 40% -> Niveau 3 filet de sécurité
  }

  // 2. Détection des concepts d'intrigue forts
  let matchedConceptBonus = 0;
  let targetConceptFilms: string[] = [];
  let expectedGenres: number[] = [];

  for (const [, concept] of Object.entries(NARRATIVE_CONCEPT_MAP)) {
    if (concept.triggers.some(t => clean.includes(t))) {
      matchedConceptBonus += 0.45;
      targetConceptFilms.push(...concept.films.map(f => f.toLowerCase()));
      expectedGenres.push(...concept.genres);
      break;
    }
  }

  // 3. Évaluation moyenne des 3 meilleures correspondances
  const topCandidates = candidateMovies.slice(0, 3);
  let cumulativeScore = 0;

  for (const movie of topCandidates) {
    let itemScore = 0.35; // Score de base pour un film cinéphile proposé
    const titleLower = (movie.title || movie.name || '').toLowerCase();
    const origLower = (movie.original_title || movie.original_name || '').toLowerCase();
    const overviewLower = (movie.overview || '').toLowerCase();
    const genreIds = (Array.isArray(movie.genre_ids) ? movie.genre_ids : (Array.isArray(movie.genres) ? movie.genres.map((g: any) => typeof g === 'number' ? g : g?.id) : [])) as number[];
    const voteCount = Number(movie.vote_count || 0);
    const voteAvg = Number(movie.vote_average || 0);

    // A. Présence dans les films archétypaux du trope
    if (targetConceptFilms.some(tf => titleLower.includes(tf) || origLower.includes(tf))) {
      itemScore += 0.50;
    }

    // B. Mots-clés du synopsis en lien avec la requête
    const queryTokens = clean
      .replace(/^(un|une|le|la|les|film|films|cherche|trouve)\s+/gi, '')
      .split(/\s+/)
      .filter(w => w.length >= 4);

    let tokenMatches = 0;
    for (const token of queryTokens) {
      if (overviewLower.includes(token)) {
        tokenMatches++;
      }
    }
    if (tokenMatches > 0) {
      itemScore += Math.min(0.25, tokenMatches * 0.08);
    }

    // C. Genres attendus
    if (expectedGenres.some(eg => genreIds.includes(eg))) {
      itemScore += 0.15;
    }

    // D. Bonus qualité : films établis et bien notés (anti-mockbuster)
    if (voteCount >= 5000) itemScore += 0.08;
    else if (voteCount >= 1000) itemScore += 0.04;
    else if (voteCount > 0 && voteCount < 100) itemScore -= 0.12; // Très obscur → pénalité

    if (voteAvg >= 7.5) itemScore += 0.05;
    else if (voteAvg >= 6.0) itemScore += 0.02;
    else if (voteAvg > 0 && voteAvg < 4.5) itemScore -= 0.15; // Franchement mauvais → pénalité

    // E. Pénalité mockbuster combinée : note basse + très peu de votes
    if (voteCount > 0 && voteCount < 200 && voteAvg < 5.5) {
      itemScore = Math.min(itemScore, 0.45); // Plafond mockbuster
    }

    // Si le film a déjà un score de similarité vectoriel natif Supabase
    if (typeof movie.similarity === 'number' && movie.similarity > 0) {
      itemScore = Math.max(itemScore, movie.similarity);
    }

    cumulativeScore += Math.min(1.0, itemScore);
  }

  const averageScore = cumulativeScore / topCandidates.length;
  const finalScore = Math.min(1.0, averageScore + matchedConceptBonus);

  return Number(finalScore.toFixed(2));
}

/**
 * Interroge la base de données vectorielle Supabase (RPC match_movies)
 * avec bascule automatique vers le moteur sémantique si la table n'est pas instanciée.
 */
export async function querySupabaseVectorSearch(
  queryText: string,
  options?: {
    matchThreshold?: number; // Défaut: 0.40 (40%)
    matchCount?: number;     // Défaut: 10
    queryEmbedding?: number[];
  }
): Promise<VectorSearchResponse> {
  const threshold = options?.matchThreshold ?? 0.40;
  const limit = options?.matchCount ?? 10;
  const cleanQuery = (queryText || '').trim();

  // 1. Si Supabase est configuré et qu'un embedding ou un RPC est disponible
  if (isSupabaseConfigured() && options?.queryEmbedding && options.queryEmbedding.length > 0) {
    try {
      const { data, error } = await supabase.rpc('match_movies', {
        query_embedding: options.queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const movies = formatTmdbResults(data);
        const topSimilarity = Number(data[0]?.similarity || threshold);
        const isLow = topSimilarity < threshold;

        return {
          movies,
          globalSimilarityScore: topSimilarity,
          isLowSimilarity: isLow,
          providerUsed: 'Supabase pgvector (match_movies)'
        };
      }
    } catch (err: any) {
      console.warn('[Éliciné Vector] RPC match_movies non disponible sur Supabase :', err?.message);
    }
  }

  // 2. Recherche sémantique d'ambiance et de décor en base Supabase (table movies) si existante
  if (isSupabaseConfigured()) {
    try {
      const { data: textMatches, error: textErr } = await supabase
        .from('movies')
        .select('*')
        .textSearch('overview', cleanQuery, { config: 'french', type: 'websearch' })
        .limit(limit);

      if (!textErr && Array.isArray(textMatches) && textMatches.length > 0) {
        const movies = formatTmdbResults(textMatches);
        const sim = calculateGlobalSemanticSimilarity(cleanQuery, movies);
        return {
          movies,
          globalSimilarityScore: sim,
          isLowSimilarity: sim < threshold,
          providerUsed: 'Supabase Semantic TextSearch'
        };
      }
    } catch (_) {}
  }

  // 3. Repli sans résultat vectoriel direct
  return {
    movies: [],
    globalSimilarityScore: 0.0,
    isLowSimilarity: true,
    providerUsed: 'Supabase Vector Fallback'
  };
}

export default querySupabaseVectorSearch;
