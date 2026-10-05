/**
 * Détection des genres évoqués dans une requête libre.
 *
 * Module volontairement sans dépendance : il est partagé par les suggestions
 * d'affinage (affichage) et par le complément de résultats TMDB (récupération),
 * et il doit rester testable sans navigateur ni réseau.
 *
 * La détection travaille sur un texte normalisé (minuscules, accents retirés,
 * ponctuation remplacée par des espaces) pour tolérer « d'action », « science-
 * fiction », « comédies » ou « comedie ».
 */

export const GENRE_KEYS = [
  'action',
  'adventure',
  'animation',
  'comedy',
  'crime',
  'documentary',
  'drama',
  'family',
  'fantasy',
  'history',
  'horror',
  'music',
  'mystery',
  'romance',
  'scifi',
  'thriller',
  'war',
  'western'
] as const;

export type GenreKey = (typeof GENRE_KEYS)[number];

/** Termes reconnus par genre (déjà normalisés : sans accent, sans tiret). */
const GENRE_TERMS: Record<GenreKey, string[]> = {
  action: ['action', 'actions', 'bagarre', 'baston'],
  adventure: ['aventure', 'aventures', 'adventure'],
  animation: ['animation', 'anime', 'animes', 'dessin anime', 'dessins animes', 'animated'],
  comedy: ['comedie', 'comedies', 'drole', 'droles', 'humoristique', 'rigolo', 'rigolote', 'funny', 'comedy'],
  crime: ['crime', 'crimes', 'policier', 'policiere', 'policiers', 'policieres', 'polar', 'polards',
    'gangster', 'gangsters', 'mafia', 'braquage', 'braquages', 'heist'],
  documentary: ['documentaire', 'documentaires', 'documentary', 'docu'],
  drama: ['drame', 'drames', 'dramatique', 'drama'],
  family: ['famille', 'familial', 'familiale', 'family'],
  fantasy: ['fantastique', 'fantasy', 'fantaisie', 'magie'],
  history: ['historique', 'historiques', 'history'],
  horror: ['horreur', 'horreurs', 'epouvante', 'horror', 'terrifiant', 'flippant', 'angoissant'],
  music: ['musique', 'musical', 'musicale', 'musicales', 'music', 'comedie musicale'],
  mystery: ['mystere', 'mysteres', 'mystery', 'enigme', 'enigmes'],
  romance: ['romance', 'romances', 'romantique', 'romantiques', 'amour', 'love story'],
  scifi: ['science fiction', 'sciencefiction', 'sci fi', 'scifi', 'sf', 'anticipation',
    'dystopie', 'dystopique', 'dystopiques'],
  thriller: ['thriller', 'thrillers', 'suspense', 'frisson', 'frissons'],
  war: ['guerre', 'guerres', 'war', 'militaire', 'militaires', 'military'],
  western: ['western', 'westerns']
};

/** Normalise un texte pour la comparaison : minuscules, sans accent, espaces uniques. */
export function normalizeQueryText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Genres explicitement évoqués par la requête, dans l'ordre du catalogue.
 * Une requête sans genre (« un film avec Tom Hanks ») renvoie un tableau vide.
 */
export function detectGenreKeys(query: string): GenreKey[] {
  const normalized = normalizeQueryText(query);
  if (!normalized) return [];
  return GENRE_KEYS.filter((key) =>
    GENRE_TERMS[key].some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`).test(normalized))
  );
}

/** Vrai si la requête porte sur une catégorie de film (genre) plutôt qu'un titre précis. */
export function hasCategoryIntent(query: string): boolean {
  return detectGenreKeys(query).length > 0;
}
