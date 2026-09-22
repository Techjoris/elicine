/**
 * Single display rule for films and series.
 *
 * The catalogue carries both the historical labels ("FILM"/"SÉRIE") and the
 * canonical provider values ("movie"/"tv"). Reading only one of them showed a
 * FILM badge on series; this helper is the only place the equivalence is
 * written, and it never guesses from a title.
 */
export type MediaTypeValue = 'FILM' | 'SÉRIE' | 'movie' | 'tv' | 'series' | string | null | undefined;

export function isSeriesMedia(value: MediaTypeValue): boolean {
  return value === 'tv' || value === 'SÉRIE' || value === 'series';
}

export function mediaTypeEndpoint(value: MediaTypeValue): 'tv' | 'movie' {
  return isSeriesMedia(value) ? 'tv' : 'movie';
}

export function mediaTypeBadge(value: MediaTypeValue,
  labels: { series: string; film: string }): string {
  return isSeriesMedia(value) ? labels.series : labels.film;
}
