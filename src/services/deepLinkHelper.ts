/**
 * Module de Deep-Linking Direct pour Plateformes de Streaming
 * (Netflix, Prime Video, Disney+, Canal+, Apple TV+, etc.)
 *
 * Hiérarchie de résolution stricte :
 * 1. Priorité 1 : Si un ID de catalogue spécifique est disponible (netflix_id, prime_id, disney_id...),
 *    formater en deep-link officiel direct ouvrant la fiche dans l'application mobile ou web :
 *    - Netflix : https://www.netflix.com/title/${netflixId}
 *    - Prime Video : https://www.amazon.fr/gp/video/detail/${primeId} ou https://www.primevideo.com/detail/${primeId}
 *    - Disney+ : https://www.disneyplus.com/video/${disneyId}
 *    - Canal+ : https://www.canalplus.com/programme-tv/${canalId}
 * 2. Priorité 2 : Utiliser l'URL directe fournie par TMDB Watch Providers (results.FR.link / JustWatch certifié).
 * 3. Priorité 3 (Fallback recherche directe optimisée) :
 *    Cibler la recherche de la plateforme avec encodage strict et schémas d'intent Android optionnels.
 */

export interface StreamingDeepLinkOptions {
  providerName?: string;
  providerKey?: string;
  movieTitle: string;
  year?: string;
  movie?: any;
  netflixId?: string | number | null;
  primeId?: string | number | null;
  disneyId?: string | number | null;
  canalId?: string | number | null;
  appleId?: string | number | null;
  watchProviderLink?: string | null;
  justWatchUrl?: string | null;
  fallbackJustWatch?: string | null;
  useAndroidIntent?: boolean;
}

/**
 * Détecte et rejette formellement les pages intermédiaires TMDB et JustWatch
 * Empêche toute redirection parasite vers "themoviedb.org/.../watch"
 */
export const isIntermediaryWatchLink = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('themoviedb.org') ||
    lower.includes('tmdb.org') ||
    lower.includes('/watch') ||
    lower.includes('justwatch.com')
  );
};

/**
 * Générateur direct d'URL vers la plateforme de streaming officielle
 * Résout le problème critique d'Android où netflix.com/search?q= vide le champ.
 * 1. Si ID direct disponible (netflixId, primeId, disneyId...) -> format titre officiel in-app
 * 2. Si lien TMDB Watch Provider / JustWatch disponible (results.FR.link) -> lien certifié avec action native
 * 3. Sinon -> Google Watch Action mobile avec carte interactive et deep-link officiel certifié
 */
export const getDirectStreamingUrl = (
  providerName: string,
  title: string,
  year?: string,
  catalogId?: string | number | null,
  watchProviderLink?: string | null
): string => {
  const cleanTitle = title.trim();
  const encodedTitle = encodeURIComponent(cleanTitle);
  const lower = providerName.toLowerCase();
  const cleanId = catalogId ? String(catalogId).trim() : null;

  // 1. NETFLIX
  if (lower.includes('netflix')) {
    if (cleanId) return `https://www.netflix.com/title/${cleanId}`;
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Netflix`;
  }

  // 2. AMAZON PRIME VIDEO
  if (lower.includes('amazon') || lower.includes('prime')) {
    if (cleanId) {
      return cleanId.startsWith('amzn')
        ? `https://www.amazon.fr/gp/video/detail/${cleanId}`
        : `https://www.primevideo.com/detail/${cleanId}`;
    }
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Prime+Video`;
  }

  // 3. DISNEY+
  if (lower.includes('disney')) {
    if (cleanId) return `https://www.disneyplus.com/video/${cleanId}`;
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Disney%2B`;
  }

  // 4. CANAL+ (myCANAL)
  if (lower.includes('canal') || lower.includes('mycanal')) {
    if (cleanId) return `https://www.canalplus.com/programme-tv/${cleanId}`;
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.canalplus.com/recherche/${encodedTitle}`;
  }

  // 5. APPLE TV+
  if (lower.includes('apple')) {
    if (cleanId) return `https://tv.apple.com/movie/${cleanId}`;
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Apple+TV`;
  }

  // 6. MAX / HBO MAX
  if (lower.includes('max') || lower.includes('hbo')) {
    if (cleanId) return `https://www.max.com/title/${cleanId}`;
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Max`;
  }

  // 7. PARAMOUNT+
  if (lower.includes('paramount')) {
    if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
    return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Paramount%2B`;
  }

  // 8. TF1+
  if (lower.includes('tf1')) {
    return `https://www.tf1.fr/recherche?q=${encodedTitle}`;
  }

  // 9. FRANCE.TV
  if (lower.includes('france') || lower.includes('francetv')) {
    return `https://www.france.tv/recherche/?q=${encodedTitle}`;
  }

  // 10. ARTE
  if (lower.includes('arte')) {
    return `https://www.arte.tv/fr/search/?q=${encodedTitle}`;
  }

  // 11. 6PLAY / M6+
  if (lower.includes('6play') || lower.includes('m6')) {
    return `https://www.6play.fr/recherche?q=${encodedTitle}`;
  }

  // FALLBACK UNIVERSEL (Google Watch Action avec fiche officielle)
  if (watchProviderLink && watchProviderLink.trim()) return watchProviderLink.trim();
  return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+${encodeURIComponent(providerName.trim())}`;
};

/**
 * Détecte si le client actuel tourne sous Android
 */
export const isAndroidClient = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent || '');
};

/**
 * Construit un schéma d'intent Android officiel avec URL de repli sécurisée pour le navigateur
 */
export const buildAndroidIntentUrl = (
  path: string,
  packageName: string,
  fallbackUrl: string
): string => {
  const cleanPath = path.replace(/^https?:\/\//, '');
  const encodedFallback = encodeURIComponent(fallbackUrl);
  return `intent://${cleanPath}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${encodedFallback};end`;
};

/**
 * Retourne true si le fournisseur est Netflix
 */
export const isNetflixProvider = (providerName: string): boolean =>
  providerName.toLowerCase().includes('netflix');

/**
 * Gère le clic sur un badge de streaming avec logique clipboard + toast pour Netflix sans ID direct.
 *
 * - Si Netflix ET aucun catalogId connu : copie le titre dans le presse-papier et déclenche le toast
 *   "📋 Titre copié ! Collez-le dans la recherche Netflix." avant d'ouvrir l'URL.
 * - Sinon : ouvre simplement l'URL dans un nouvel onglet.
 *
 * @param url          URL de destination finale (déjà résolue par getDirectStreamingUrl)
 * @param providerName Nom du fournisseur (ex: "Netflix", "Amazon Prime Video")
 * @param movieTitle   Titre exact du film / de la série
 * @param catalogId    Identifiant de catalogue direct (netflix_id, etc.) si disponible
 * @param showToast    Fonction de notification toast fournie par le contexte React
 */
export const handleStreamingClick = (
  url: string,
  providerName: string,
  movieTitle: string,
  catalogId?: string | number | null,
  showToast?: (msg: string) => void
): void => {
  const isNetflix = isNetflixProvider(providerName);
  const hasDirectId = catalogId != null && String(catalogId).trim().length > 0;

  if (isNetflix && !hasDirectId) {
    // Copie le titre dans le presse-papier pour faciliter la recherche manuelle
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(movieTitle).catch(() => {});
    }
    if (showToast) {
      showToast('📋 Titre copié ! Collez-le dans la recherche Netflix.');
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * 1. NETFLIX DEEP-LINK
 */
export const getNetflixDeepLink = (
  movieTitle: string,
  netflixId?: string | number | null,
  watchProviderLink?: string | null,
  useIntent: boolean = false
): string => {
  const cleanId = netflixId ? String(netflixId).trim() : null;
  const encodedTitle = encodeURIComponent(movieTitle.trim());

  // Priorité 1 : ID direct de catalogue Netflix (garanti d'ouvrir la fiche exacte dans l'app Android)
  if (cleanId) {
    const universalUrl = `https://www.netflix.com/title/${cleanId}`;
    if (useIntent && isAndroidClient()) {
      return buildAndroidIntentUrl(`www.netflix.com/title/${cleanId}`, 'com.netflix.mediaclient', universalUrl);
    }
    return universalUrl;
  }

  // Priorité 2 : Lien TMDB Watch Providers / JustWatch direct de l'œuvre (results.FR.link)
  // Ouvre la fiche certifiée où l'utilisateur clique sur Netflix avec le titre et l'ID rattachés
  if (watchProviderLink && watchProviderLink.trim()) {
    return watchProviderLink.trim();
  }

  // Priorité 3 : Google Watch Action mobile
  // Sur Android, netflix.com/search?q= est intercepté par l'app mais le champ q est purgé.
  // La recherche Google Watch Action affiche la fiche interactive officielle avec le deep-link direct :
  return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Netflix`;
};

/**
 * 2. AMAZON PRIME VIDEO DEEP-LINK
 */
export const getPrimeVideoDeepLink = (
  movieTitle: string,
  primeId?: string | number | null,
  watchProviderLink?: string | null,
  useIntent: boolean = false
): string => {
  const cleanId = primeId ? String(primeId).trim() : null;
  const encodedTitle = encodeURIComponent(movieTitle.trim());

  // Priorité 1 : ID direct Amazon Prime Video
  if (cleanId) {
    const directUrl = cleanId.startsWith('amzn') 
      ? `https://www.amazon.fr/gp/video/detail/${cleanId}`
      : `https://www.primevideo.com/detail/${cleanId}`;
    if (useIntent && isAndroidClient()) {
      return buildAndroidIntentUrl(`www.primevideo.com/detail/${cleanId}`, 'com.amazon.avod.thirdpartyclient', directUrl);
    }
    return directUrl;
  }

  // Priorité 2 : Lien certifié JustWatch
  if (watchProviderLink && watchProviderLink.trim()) {
    return watchProviderLink.trim();
  }

  // Priorité 3 : Fallback officiel Watch Action
  return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Prime+Video`;
};

/**
 * 3. DISNEY+ DEEP-LINK
 */
export const getDisneyDeepLink = (
  movieTitle: string,
  disneyId?: string | number | null,
  watchProviderLink?: string | null,
  useIntent: boolean = false
): string => {
  const cleanId = disneyId ? String(disneyId).trim() : null;
  const encodedTitle = encodeURIComponent(movieTitle.trim());

  // Priorité 1 : ID direct Disney+
  if (cleanId) {
    const directUrl = `https://www.disneyplus.com/video/${cleanId}`;
    if (useIntent && isAndroidClient()) {
      return buildAndroidIntentUrl(`www.disneyplus.com/video/${cleanId}`, 'com.disney.disneyplus', directUrl);
    }
    return directUrl;
  }

  // Priorité 2 : Lien certifié JustWatch
  if (watchProviderLink && watchProviderLink.trim()) {
    return watchProviderLink.trim();
  }

  // Priorité 3 : Fallback officiel Watch Action
  return `https://www.google.com/search?q=regarder+${encodedTitle}+sur+Disney%2B`;
};

/**
 * 4. CANAL+ (myCANAL) DEEP-LINK
 */
export const getCanalDeepLink = (
  movieTitle: string,
  canalId?: string | number | null,
  watchProviderLink?: string | null,
  useIntent: boolean = false
): string => {
  const cleanId = canalId ? String(canalId).trim() : null;
  const encodedTitle = encodeURIComponent(movieTitle.trim());

  if (cleanId) {
    const directUrl = `https://www.canalplus.com/programme-tv/${cleanId}`;
    if (useIntent && isAndroidClient()) {
      return buildAndroidIntentUrl(`www.canalplus.com/programme-tv/${cleanId}`, 'com.canal.android.canal', directUrl);
    }
    return directUrl;
  }

  if (watchProviderLink && watchProviderLink.trim()) {
    return watchProviderLink.trim();
  }

  return `https://www.canalplus.com/recherche/${encodedTitle}`;
};

/**
 * 5. APPLE TV+ DEEP-LINK
 */
export const getAppleTvDeepLink = (
  movieTitle: string,
  appleId?: string | number | null,
  watchProviderLink?: string | null
): string => {
  const cleanId = appleId ? String(appleId).trim() : null;
  if (cleanId) {
    return `https://tv.apple.com/movie/${cleanId}`;
  }
  if (watchProviderLink && watchProviderLink.trim()) {
    return watchProviderLink.trim();
  }
  return `https://www.google.com/search?q=regarder+${encodeURIComponent(movieTitle.trim())}+sur+Apple+TV`;
};

/**
 * Résolveur Universel de Deep-Linking Direct
 * Supporte la signature par objet d'options ou la signature classique (providerName, movieTitle, fallbackJustWatch).
 */
export const getPlatformDirectUrl = (
  providerNameOrOptions: string | StreamingDeepLinkOptions,
  legacyMovieTitle?: string,
  legacyFallbackJustWatch?: string | null
): string => {
  // Détection de l'appel objet vs arguments séparés
  let opts: StreamingDeepLinkOptions;
  if (typeof providerNameOrOptions === 'object' && providerNameOrOptions !== null) {
    opts = providerNameOrOptions;
  } else {
    opts = {
      providerName: typeof providerNameOrOptions === 'string' ? providerNameOrOptions : '',
      movieTitle: legacyMovieTitle || '',
      watchProviderLink: legacyFallbackJustWatch,
      fallbackJustWatch: legacyFallbackJustWatch
    };
  }

  const name = (opts.providerName || opts.providerKey || '').toLowerCase();
  const title = (opts.movieTitle || opts.movie?.title || '').trim();
  const year = opts.year || (opts.movie?.release_date ? opts.movie.release_date.split('-')[0] : '');
  const encodedTitle = encodeURIComponent(title);

  // Extraction des IDs directs depuis l'objet movie si présent
  const movie = opts.movie || {};
  const netflixId = opts.netflixId || movie.netflix_id || movie.netflixId || null;
  const primeId = opts.primeId || movie.prime_id || movie.primeId || null;
  const disneyId = opts.disneyId || movie.disney_id || movie.disneyId || null;
  const canalId = opts.canalId || movie.canal_id || movie.canalId || null;
  const appleId = opts.appleId || movie.apple_id || movie.appleId || null;
  
  // Priorité au lien JustWatch direct de TMDB Watch Providers si disponible
  const watchLink = opts.watchProviderLink || opts.justWatchUrl || opts.fallbackJustWatch || movie.watch_provider_link || null;
  const useIntent = opts.useAndroidIntent ?? false;

  // 1. NETFLIX
  if (name.includes('netflix')) {
    return getNetflixDeepLink(title, netflixId, watchLink, useIntent);
  }

  // 2. AMAZON PRIME VIDEO
  if (name.includes('amazon') || name.includes('prime')) {
    return getPrimeVideoDeepLink(title, primeId, watchLink, useIntent);
  }

  // 3. DISNEY+
  if (name.includes('disney')) {
    return getDisneyDeepLink(title, disneyId, watchLink, useIntent);
  }

  // 4. CANAL+ / myCANAL
  if (name.includes('canal') || name.includes('mycanal')) {
    return getCanalDeepLink(title, canalId, watchLink, useIntent);
  }

  // 5. APPLE TV+
  if (name.includes('apple')) {
    return getAppleTvDeepLink(title, appleId, watchLink);
  }

  // 6. MAX (HBO)
  if (name.includes('max') || name.includes('hbo')) {
    if (watchLink && watchLink.includes('max.com')) return watchLink;
    return `https://www.max.com/search?q=${encodedTitle}`;
  }

  // 7. PARAMOUNT+
  if (name.includes('paramount')) {
    if (watchLink && watchLink.includes('paramountplus.com')) return watchLink;
    return `https://www.paramountplus.com/search/?query=${encodedTitle}`;
  }

  // 8. TF1+ / TF1
  if (name.includes('tf1')) {
    if (watchLink && watchLink.includes('tf1.fr')) return watchLink;
    return `https://www.tf1.fr/recherche?q=${encodedTitle}`;
  }

  // 9. FRANCE.TV
  if (name.includes('france') || name.includes('francetv')) {
    if (watchLink && watchLink.includes('france.tv')) return watchLink;
    return `https://www.france.tv/recherche/?q=${encodedTitle}`;
  }

  // 10. ARTE
  if (name.includes('arte')) {
    if (watchLink && watchLink.includes('arte.tv')) return watchLink;
    return `https://www.arte.tv/fr/search/?q=${encodedTitle}`;
  }

  // 11. 6PLAY / M6+
  if (name.includes('6play') || name.includes('m6')) {
    if (watchLink && watchLink.includes('6play.fr')) return watchLink;
    return `https://www.6play.fr/recherche?q=${encodedTitle}`;
  }

  // Fallback direct avec getDirectStreamingUrl (Google Watch Action ou JustWatch)
  if (name) {
    return getDirectStreamingUrl(name, title, year, null, watchLink);
  }

  if (watchLink && watchLink.trim()) return watchLink.trim();
  return `https://www.google.com/search?q=regarder+${encodedTitle}+streaming`;
};
