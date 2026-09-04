/**
 * Générateur de liens directs vers les moteurs de recherche des plateformes de streaming
 */
export const getPlatformDirectUrl = (
  providerName: string,
  movieTitle: string,
  fallbackJustWatch?: string | null
): string => {
  const name = (providerName || '').toLowerCase();
  const encodedTitle = encodeURIComponent(movieTitle);

  if (name.includes('netflix')) return `https://www.netflix.com/search?q=${encodedTitle}`;
  if (name.includes('amazon') || name.includes('prime')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodedTitle}`;
  if (name.includes('disney')) return `https://www.disneyplus.com/search?q=${encodedTitle}`;
  if (name.includes('canal') || name.includes('mycanal')) return `https://www.canalplus.com/recherche?q=${encodedTitle}`;
  if (name.includes('apple')) return `https://tv.apple.com/search?term=${encodedTitle}`;
  if (name.includes('max') || name.includes('hbo')) return `https://www.max.com/search?q=${encodedTitle}`;
  if (name.includes('paramount')) return `https://www.paramountplus.com/search/?q=${encodedTitle}`;

  // Fallback vers la page certifiée JustWatch ou recherche Google
  return fallbackJustWatch || `https://www.google.com/search?q=regarder+${encodedTitle}+streaming`;
};
