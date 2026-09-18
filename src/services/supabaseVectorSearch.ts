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
import { isDisqualifiedNonFiction } from './searchRouterService';

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
  },
  serial_killer: {
    triggers: [
      'tueur en série', 'tueurs en série', 'tueur en serie', 'tueurs en serie',
      'serial killer', 'serial killers', 'psychopathe', 'psychopathes',
      'meurtre en série', 'meurtres en série', 'meurtre en serie', 'meurtres en serie'
    ],
    genres: [80, 53, 27, 9648, 18],
    films: ['Se7en', 'Le Silence des agneaux', 'Zodiac', 'Memories of Murder', 'Monster', 'American Psycho', 'Mindhunter', 'Saw', 'Psychose', 'Prisoners']
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

  // 2. Détection des concepts d'intrigue forts ou d'époques / métaphores
  let matchedConceptBonus = 0;
  let targetConceptFilms: string[] = [];
  let expectedGenres: number[] = [];

  const isMetaphorOrEra = /\b(impression|comme si|sensation|ascenseur|pluie|70s|80s|90s|années 70|années 80|années 90|dramatique|sans )\b/i.test(clean);
  if (isMetaphorOrEra) {
    matchedConceptBonus += 0.25;
  }

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
    if (isDisqualifiedNonFiction(clean, movie)) {
      continue;
    }

    // Score bonifié si l'œuvre a déjà été recommandée avec justification par l'IA ou TMDB
    let itemScore = (movie.ai_match_reason || (movie.match_rate && movie.match_rate >= 60)) ? 0.60 : 0.35;
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

    // E. Pénalité mockbuster : seuil aligné sur les directives LLM (< 500 votes ET < 5.5/10)
    if (voteCount > 0 && voteCount < 500 && voteAvg < 5.5) {
      itemScore = Math.min(itemScore, 0.35); // Sous le seuil de validation Niveau 2 (0.40)
    }

    // F. Rejet strict titre parasite : partage un seul mot avec la requête sans lien scénaristique
    // Ce motif de rejet effondre le score indépendamment des notes (ex: "Bikini Inception" pour "Inception")
    const titleWords = (titleLower + ' ' + origLower)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 3);

    const sharedTokens = queryTokens.filter(qt =>
      titleWords.some(tw => tw === qt || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
    );
    const extraWords = titleWords.filter(tw =>
      !queryTokens.some(qt => qt === tw || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
    );

    const isParasiteTitle = sharedTokens.length === 1 && extraWords.length > 0 && voteCount < 5000;
    if (isParasiteTitle && tokenMatches === 0 && !targetConceptFilms.some(tf => titleLower.includes(tf) || origLower.includes(tf))) {
      // Aucun lien narratif réel dans le synopsis : score effondré (rejet strict)
      itemScore = 0.05;
    }

    // Si le film a déjà un score de similarité vectoriel natif Supabase
    if (typeof movie.similarity === 'number' && movie.similarity > 0 && !isParasiteTitle) {
      itemScore = Math.max(itemScore, movie.similarity);
    }

    cumulativeScore += Math.min(1.0, itemScore);
  }

  const averageScore = cumulativeScore / topCandidates.length;
  const finalScore = Math.min(1.0, averageScore + matchedConceptBonus);

  return Number(finalScore.toFixed(2));
}

/**
 * Détermine si un film présente un titre parasite (partage un seul mot avec la requête
 * en y ajoutant des termes externes, sans lien scénaristique réel dans son synopsis).
 * Motif de rejet indépendant des notes du film.
 */
export function isMovieParasiteWithoutNarrativeLink(
  queryText: string,
  movie: any
): boolean {
  const clean = (queryText || '').toLowerCase().trim();
  if (!clean || !movie) return false;
  if (isDisqualifiedNonFiction(clean, movie)) return true;
  const voteCount = Number(movie.vote_count || 0);
  if (voteCount >= 5000) return false; // Blockbusters et classiques populaires protégés

  const queryTokens = clean
    .replace(/^(un|une|le|la|les|film|films|cherche|trouve)\s+/gi, '')
    .split(/\s+/)
    .filter(w => w.length >= 4);
  if (queryTokens.length === 0) return false;

  const titleLower = (movie.title || movie.name || '').toLowerCase();
  const origLower = (movie.original_title || movie.original_name || '').toLowerCase();
  const overviewLower = (movie.overview || '').toLowerCase();

  const titleWords = (titleLower + ' ' + origLower)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w: string) => w.length >= 3);

  const sharedTokens = queryTokens.filter(qt =>
    titleWords.some(tw => tw === qt || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
  );
  const extraWords = titleWords.filter(tw =>
    !queryTokens.some(qt => qt === tw || (tw.length >= 4 && qt.length >= 4 && (tw.startsWith(qt) || qt.startsWith(tw))))
  );

  const isParasiteTitle = sharedTokens.length === 1 && extraWords.length > 0;
  if (!isParasiteTitle) return false;

  // Lien scénaristique : présence d'au moins un mot-clé de la requête dans le synopsis
  const hasNarrativeLink = queryTokens.some(qt => overviewLower.includes(qt));
  return !hasNarrativeLink;
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
          providerUsed: 'Algorithme Éliciné'
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
          providerUsed: 'Algorithme Éliciné'
        };
      }
    } catch (_) {}
  }

  // 3. Repli sans résultat vectoriel direct
  return {
    movies: [],
    globalSimilarityScore: 0.0,
    isLowSimilarity: true,
    providerUsed: 'Algorithme Éliciné'
  };
}

export default querySupabaseVectorSearch;
