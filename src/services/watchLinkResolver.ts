import { providerKeyFor, type WatchLinkMap } from '../../api/_watchLink.js';

/**
 * Récupère, pour un titre, l'URL exacte de sa fiche chez chaque plateforme.
 *
 * Le résultat est mémoïsé par titre : ouvrir deux fois la même fiche ne
 * redemande rien, et une erreur se traduit par un objet vide — l'appelant
 * conserve alors son repli vers la recherche de la plateforme.
 */
const pending = new Map<string, Promise<WatchLinkMap>>();

export function fetchTitleWatchLinks(params: {
  title?: string;
  year?: string;
  country?: string;
  mediaType?: string;
}): Promise<WatchLinkMap> {
  const title = (params.title || '').trim();
  if (!title) return Promise.resolve({});

  const country = (params.country || 'FR').toUpperCase().slice(0, 2) || 'FR';
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';
  const year = (params.year || '').replace(/\D/g, '').slice(0, 4);
  const key = `${country}|${mediaType}|${year}|${title.toLowerCase()}`;

  const cached = pending.get(key);
  if (cached) return cached;

  const search = new URLSearchParams({ title, type: mediaType, country });
  if (year) search.set('year', year);

  const request = fetch(`/api/watch-link?${search.toString()}`)
    .then(response => (response.ok ? response.json() : { links: {} }))
    .then(data => (data && typeof data.links === 'object' && data.links !== null ? data.links as WatchLinkMap : {}))
    .catch(() => ({} as WatchLinkMap));

  pending.set(key, request);
  return request;
}

/** URL de la fiche du fournisseur demandé, ou null si elle n'a pas été résolue. */
export function deepLinkForProvider(links: WatchLinkMap | null | undefined, providerName: string): string | null {
  if (!links) return null;
  const key = providerKeyFor(providerName);
  if (!key) return null;
  const url = links[key];
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

/** Année d'exploitation d'une œuvre, sous forme de chaîne à 4 chiffres. */
export function releaseYearOf(releaseDate?: string | null): string {
  return typeof releaseDate === 'string' ? releaseDate.slice(0, 4) : '';
}
