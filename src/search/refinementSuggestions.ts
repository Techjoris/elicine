/**
 * Suggestions d'affinage proposées sous les résultats d'une recherche large.
 *
 * Principe : quand l'utilisateur cherche une catégorie (« films d'action »,
 * « comédies », « séries de science-fiction ») sans autre précision, on lui
 * propose des ajustements d'un clic — plus récents / plus anciens / mieux notés
 * / en série — qui relancent la recherche en enrichissant la requête.
 *
 * Les libellés affichés sont localisés ; les mots ajoutés à la requête restent
 * en français, car c'est la langue que le moteur d'interprétation comprend.
 */

import { detectGenreKeys, normalizeQueryText } from './genreIntent';

export type RefinementCategory = 'era' | 'rating' | 'format';

export interface SearchRefinement {
  id: string;
  label: string;
  emoji: string;
  /** Requête complète à relancer si l'utilisateur clique sur la suggestion. */
  query: string;
  category: RefinementCategory;
}

export interface RefinementInput {
  query: string;
  mediaType?: 'Tous' | 'Films' | 'Séries TV';
  locale?: string;
  /** Nombre maximum de suggestions renvoyées (4 par défaut). */
  max?: number;
}

type Locale = 'fr' | 'en' | 'es' | 'de' | 'it';

interface LabelSet {
  recent: string;
  nineties: string;
  twoThousands: string;
  classics: string;
  bestRated: string;
  series: string;
  films: string;
}

const LABELS: Record<Locale, LabelSet> = {
  fr: {
    recent: 'Plus récents',
    nineties: 'Années 90',
    twoThousands: 'Années 2000',
    classics: 'Des classiques',
    bestRated: 'Les mieux notés',
    series: 'En série',
    films: 'En films'
  },
  en: {
    recent: 'More recent',
    nineties: 'From the 90s',
    twoThousands: 'From the 2000s',
    classics: 'Classics',
    bestRated: 'Best rated',
    series: 'As a series',
    films: 'As movies'
  },
  es: {
    recent: 'Más recientes',
    nineties: 'De los 90',
    twoThousands: 'De los 2000',
    classics: 'Clásicos',
    bestRated: 'Mejor valoradas',
    series: 'En serie',
    films: 'En películas'
  },
  de: {
    recent: 'Neuere',
    nineties: 'Aus den 90ern',
    twoThousands: 'Aus den 2000ern',
    classics: 'Klassiker',
    bestRated: 'Bestbewertet',
    series: 'Als Serie',
    films: 'Als Filme'
  },
  it: {
    recent: 'Più recenti',
    nineties: 'Anni 90',
    twoThousands: 'Anni 2000',
    classics: 'Classici',
    bestRated: 'Più votati',
    series: 'Come serie',
    films: 'Come film'
  }
};

function resolveLocale(locale?: string): Locale {
  const code = String(locale || '').toLowerCase().slice(0, 2);
  if (code === 'fr' || code === 'en' || code === 'es' || code === 'de' || code === 'it') {
    return code;
  }
  return 'en';
}

const cleanBase = (query: string): string =>
  String(query || '')
    .replace(/\s+/g, ' ')
    .replace(/[.?!,;:]+$/g, '')
    .trim();

/**
 * Construit les suggestions d'affinage d'une recherche.
 * Renvoie un tableau vide si la requête ne porte pas sur une catégorie (genre),
 * afin de ne pas encombrer les recherches déjà précises (titre, acteur, année).
 */
export function buildRefinementSuggestions(input: RefinementInput): SearchRefinement[] {
  const base = cleanBase(input?.query || '');
  if (!base || detectGenreKeys(base).length === 0) return [];

  const labels = LABELS[resolveLocale(input?.locale)];
  const normalized = normalizeQueryText(base);
  const has = (pattern: RegExp) => pattern.test(normalized);

  const suggestions: SearchRefinement[] = [];

  if (!has(/\brecents?\b|\brecentes?\b|\bnouveautes?\b/)) {
    suggestions.push({
      id: 'era-recent',
      label: labels.recent,
      emoji: '🆕',
      query: `${base} récents`,
      category: 'era'
    });
  }

  if (!has(/\bclassiques?\b|\bvieux\b|\bvieil\b|\banciens?\b|\banciennes?\b/)) {
    suggestions.push({
      id: 'era-classics',
      label: labels.classics,
      emoji: '🎞️',
      query: `${base} anciens et classiques`,
      category: 'era'
    });
  }

  if (!has(/\bannees 90\b|\b90s\b|\bnineties\b/)) {
    suggestions.push({
      id: 'era-90s',
      label: labels.nineties,
      emoji: '📼',
      query: `${base} des années 90`,
      category: 'era'
    });
  }

  if (!has(/\bmieux notes?\b|\bbien notes?\b|\bculte\b|\bcultes\b/)) {
    suggestions.push({
      id: 'rating-best',
      label: labels.bestRated,
      emoji: '⭐',
      query: `${base} les mieux notés`,
      category: 'rating'
    });
  }

  if (!has(/\bannees 2000\b|\b2000s\b/)) {
    suggestions.push({
      id: 'era-2000s',
      label: labels.twoThousands,
      emoji: '💿',
      query: `${base} des années 2000`,
      category: 'era'
    });
  }

  // Format complémentaire : uniquement si le type de média est déjà tranché.
  if (input?.mediaType === 'Séries TV') {
    suggestions.push({
      id: 'format-films',
      label: labels.films,
      emoji: '🎬',
      query: `${base} en film`,
      category: 'format'
    });
  } else if (input?.mediaType === 'Films') {
    suggestions.push({
      id: 'format-series',
      label: labels.series,
      emoji: '📺',
      query: `${base} en série`,
      category: 'format'
    });
  }

  const limit = Number.isFinite(input?.max) && (input!.max as number) > 0 ? (input!.max as number) : 4;
  return suggestions.slice(0, limit);
}
