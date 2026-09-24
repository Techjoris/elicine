/**
 * Genres du catalogue et resolution du filtre par onglet.
 *
 * TMDB n'utilise pas les memes identifiants en film et en serie, et n'a pas
 * d'equivalent tele pour l'horreur, le thriller, la romance, l'histoire ou la
 * musique. Envoyer un identifiant inconnu a TMDB ne renvoie pas une erreur :
 * l'API ignore simplement `with_genres`, ce qui ferait remonter un catalogue
 * non filtre sous un en-tete qui annonce pourtant un genre. `tv: null` marque
 * donc un genre indisponible en serie, et il doit etre ecarte du filtre.
 */
export type MediaType = 'movie' | 'tv';

export type GenreOption = { key: string; label: string; movie: number; tv: number | null };

export const GENRES: GenreOption[] = [
  { key: 'action',      label: 'Action',          movie: 28,    tv: 10759 },
  { key: 'adventure',   label: 'Aventure',        movie: 12,    tv: 10759 },
  { key: 'animation',   label: 'Animation',       movie: 16,    tv: 16    },
  { key: 'comedy',      label: 'Comédie',         movie: 35,    tv: 35    },
  { key: 'crime',       label: 'Crime',           movie: 80,    tv: 80    },
  { key: 'documentary', label: 'Documentaire',    movie: 99,    tv: 99    },
  { key: 'drama',       label: 'Drame',           movie: 18,    tv: 18    },
  { key: 'family',      label: 'Famille',         movie: 10751, tv: 10751 },
  { key: 'fantasy',     label: 'Fantastique',     movie: 14,    tv: 10765 },
  { key: 'history',     label: 'Histoire',        movie: 36,    tv: null  },
  { key: 'horror',      label: 'Horreur',         movie: 27,    tv: null  },
  { key: 'music',       label: 'Musique',         movie: 10402, tv: null  },
  { key: 'mystery',     label: 'Mystère',         movie: 9648,  tv: 9648  },
  { key: 'romance',     label: 'Romance',         movie: 10749, tv: null  },
  { key: 'scifi',       label: 'Science-Fiction', movie: 878,   tv: 10765 },
  { key: 'thriller',    label: 'Thriller',        movie: 53,    tv: null  },
  { key: 'war',         label: 'Guerre',          movie: 10752, tv: 10768 },
  { key: 'western',     label: 'Western',         movie: 37,    tv: 37    }
];

export const genreIdFor = (option: GenreOption, mediaType: MediaType): number | null =>
  mediaType === 'tv' ? option.tv : option.movie;

export const genreAppliesTo = (option: GenreOption, mediaType: MediaType) =>
  genreIdFor(option, mediaType) != null;

export type GenreFilter = {
  /** Genres retenus, donc reellement envoyes a TMDB et affiches comme actifs. */
  applied: GenreOption[];
  /** Genres choisis mais inexistants pour ce type de media : jamais appliques. */
  ignored: GenreOption[];
  /** Identifiants TMDB a combiner en OU. */
  ids: number[];
  labels: string[];
};

/** Resout une selection de genres (cles) pour un type de media donne. */
export function resolveGenreFilter(selectedKeys: string[], mediaType: MediaType): GenreFilter {
  const selected = selectedKeys
    .map(selectionKey => GENRES.find(genre => genre.key === selectionKey))
    .filter((genre): genre is GenreOption => genre !== undefined);

  const applied = selected.filter(genre => genreAppliesTo(genre, mediaType));
  const ignored = selected.filter(genre => !genreAppliesTo(genre, mediaType));

  return {
    applied,
    ignored,
    ids: applied
      .map(genre => genreIdFor(genre, mediaType))
      .filter((id): id is number => Number.isSafeInteger(id)),
    labels: applied.map(genre => genre.label)
  };
}
