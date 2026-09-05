import { detectProviderKey } from './tmdb';
import { getVpnAffiliateUrl } from '../config/affiliates';
import { 
  getPlatformDirectUrl, 
  getDirectStreamingUrl,
  isIntermediaryWatchLink,
  StreamingDeepLinkOptions 
} from './deepLinkHelper';

export { getDirectStreamingUrl, isIntermediaryWatchLink };

export interface SvodProviderItem {
  name: string;
  logo: string | null;
  url?: string;
  deepLink?: string | null;
  providerId?: number;
}

export interface VodProviderItem {
  name: string;
  logo: string | null;
  url: string;
}

export interface MediaProvidersResult {
  svod: {
    status: 'local' | 'vpn_needed' | 'none';
    providers: SvodProviderItem[];
    targetCountry?: string | null;
    flag?: string | null;
    justWatchLink?: string | null;
  };
  vod: VodProviderItem[];
}

// Générateur de lien direct / deep-link officiel par plateforme SVOD
export const buildStreamingUrl = (
  providerKey: string, 
  providerName: string, 
  title: string = '',
  options?: Partial<StreamingDeepLinkOptions>
): string => {
  return getPlatformDirectUrl({
    providerKey,
    providerName,
    movieTitle: title,
    ...options
  });
};

export function getPlatformSearchUrl(name: string, movieTitle: string = ''): string {
  const key = detectProviderKey(name);
  return buildStreamingUrl(key, name, movieTitle);
}

// Générateur de redirection boutique VOD
export function getVodStoreUrl(name: string, movieTitle: string = ''): string {
  const n = name.toLowerCase();
  const q = encodeURIComponent(movieTitle);
  if (n.includes('apple') || n.includes('itunes')) return 'https://tv.apple.com';
  if (n.includes('google') || n.includes('youtube')) return 'https://play.google.com/store/movies';
  if (n.includes('amazon')) return 'https://www.primevideo.com/storefront';
  if (n.includes('canal')) return 'https://vod.canalplus.com';
  return 'https://www.google.com/search?q=louer+acheter+' + encodeURIComponent(name) + (q ? '+' + q : '');
}

// Cache mémoire pour la session
const mediaProvidersCache = new Map<string, MediaProvidersResult>();

/**
 * 1. EXTRACTION DISTINCTE SVOD vs VOD (AVEC ENDPOINT SÉRIE /tv DÉDIÉ)
 */
export async function getMediaProviders(
  id: number,
  mediaType: string = 'movie',
  userCountryCode: string = 'CM',
  movieTitle: string = '',
  apiKey?: string,
  movie?: any
): Promise<MediaProvidersResult> {
  const endpoint = (
    mediaType === 'tv' || 
    mediaType === 'serie' || 
    mediaType === 'SÉRIE' ||
    mediaType === 'series'
  ) ? 'tv' : 'movie';

  const cacheKey = `${endpoint}_${id}_${userCountryCode}`;
  if (mediaProvidersCache.has(cacheKey)) {
    return mediaProvidersCache.get(cacheKey)!;
  }

  const key = (
    apiKey || 
    localStorage.getItem('tmdb_api_key') ||
    localStorage.getItem('elicine_tmdb_key') ||
    localStorage.getItem('cinora_tmdb_key') || 
    localStorage.getItem('cinéia_tmdb_key') || 
    localStorage.getItem('cineia_tmdb_key') || 
    ''
  ).trim();

  if (!id) {
    return { svod: { status: 'none', providers: [] }, vod: [] };
  }

  try {
    const tmdbUrl = `/api/tmdb?endpoint=${encodeURIComponent(`${endpoint}/${id}/watch/providers`)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;
    const res = await fetch(tmdbUrl);
    if (!res.ok) {
      return { svod: { status: 'none', providers: [] }, vod: [] };
    }
    const data = await res.json();
    const results = data.results || {};

    const majorMarkets = [
      { code: 'US', label: 'USA', flag: '🇺🇸' },
      { code: 'FR', label: 'France', flag: '🇫🇷' },
      { code: 'GB', label: 'Royaume-Uni', flag: '🇬🇧' }
    ];

    // A. STREAMING SVOD (Abonnement illimité)
    let svod: MediaProvidersResult['svod'] = {
      status: 'none',
      providers: [],
      targetCountry: null,
      flag: null
    };

    // 1. Test local (incluant flatrate, free et replay avec pub)
    const userCountryData = results[userCountryCode] || results['FR'] || results['US'] || results['GB'];
    const rawJustWatchLink = userCountryData?.link || null;
    const justWatchLink = isIntermediaryWatchLink(rawJustWatchLink) ? null : rawJustWatchLink;

    const localFlatrate = [
      ...(results[userCountryCode]?.flatrate || []),
      ...(results[userCountryCode]?.free || []),
      ...(results[userCountryCode]?.ads || [])
    ];

    if (localFlatrate.length > 0) {
      const uniqueLocal = new Map<number, SvodProviderItem>();
      localFlatrate.forEach((p: any) => {
        if (p.provider_id && !uniqueLocal.has(p.provider_id)) {
          const pKey = detectProviderKey(p.provider_name);
          const directUrl = getPlatformDirectUrl({
            providerKey: pKey,
            providerName: p.provider_name,
            movieTitle: movieTitle || movie?.title || '',
            movie,
            watchProviderLink: justWatchLink,
            netflixId: movie?.netflix_id || movie?.netflixId || p.netflix_id,
            primeId: movie?.prime_id || movie?.primeId || p.prime_id,
            disneyId: movie?.disney_id || movie?.disneyId || p.disney_id,
            canalId: movie?.canal_id || movie?.canalId,
            appleId: movie?.apple_id || movie?.appleId
          });

          uniqueLocal.set(p.provider_id, {
            name: p.provider_name,
            logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
            url: directUrl,
            deepLink: directUrl,
            providerId: p.provider_id
          });
        }
      });

      svod = {
        status: 'local',
        providers: Array.from(uniqueLocal.values()),
        justWatchLink
      };
    } else {
      // 2. Test marchés étrangers STRICTEMENT pour option VPN
      for (const m of majorMarkets) {
        if (m.code === userCountryCode) continue;
        const foreignFlatrate = [
          ...(results[m.code]?.flatrate || []),
          ...(results[m.code]?.free || []),
          ...(results[m.code]?.ads || [])
        ];
        if (foreignFlatrate.length > 0) {
          const uniqueForeign = new Map<number, SvodProviderItem>();
          foreignFlatrate.slice(0, 3).forEach((p: any) => {
            if (p.provider_id && !uniqueForeign.has(p.provider_id)) {
              uniqueForeign.set(p.provider_id, {
                name: `${p.provider_name} (${m.label})`,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null
              });
            }
          });

          svod = {
            status: 'vpn_needed',
            targetCountry: m.label,
            flag: m.flag,
            providers: Array.from(uniqueForeign.values())
          };
          break;
        }
      }
    }

    // B. VOD (Location & Achat numérique - Prêt pour affiliation)
    const userVod = results[userCountryCode] || results['FR'] || results['US'] || results['GB'];
    const rawVod = [...(userVod?.rent || []), ...(userVod?.buy || [])];

    const uniqueVod = new Map<number, VodProviderItem>();
    rawVod.forEach((p: any) => {
      if (p.provider_id && !uniqueVod.has(p.provider_id)) {
        uniqueVod.set(p.provider_id, {
          name: p.provider_name,
          logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
          url: getVodStoreUrl(p.provider_name, movieTitle)
        });
      }
    });

    const result: MediaProvidersResult = {
      svod,
      vod: Array.from(uniqueVod.values())
    };

    mediaProvidersCache.set(cacheKey, result);
    return result;

  } catch (err) {
    console.error("[Éliciné TMDB] Erreur providers :", err);
    return { svod: { status: 'none', providers: [] }, vod: [] };
  }
}

// Pour compatibilité descendante
export const resolveStreamingAction = async (
  movieId: number,
  mediaType: string,
  userCountryCode: string,
  movieTitle: string,
  apiKey?: string,
  movie?: any
) => {
  const res = await getMediaProviders(movieId, mediaType, userCountryCode, movieTitle, apiKey, movie);
  if (res.svod.status === 'local') {
    return {
      type: 'DIRECT' as const,
      providers: res.svod.providers.map((p, idx) => {
        const pKey = detectProviderKey(p.name);
        const candidateUrl = p.url || p.deepLink;
        const actionUrl = (!candidateUrl || isIntermediaryWatchLink(candidateUrl))
          ? getPlatformDirectUrl({
              providerKey: pKey,
              providerName: p.name,
              movieTitle,
              movie,
              watchProviderLink: res.svod.justWatchLink,
              netflixId: movie?.netflix_id || movie?.netflixId,
              primeId: movie?.prime_id || movie?.primeId,
              disneyId: movie?.disney_id || movie?.disneyId
            })
          : candidateUrl;

        return {
          id: idx + 1,
          name: p.name,
          logo: p.logo,
          providerKey: pKey,
          actionUrl,
          deepLink: actionUrl
        };
      })
    };
  }
  if (res.svod.status === 'vpn_needed') {
    const affiliateVpnUrl = getVpnAffiliateUrl('nordvpn');
    return {
      type: 'VPN_REQUIRED' as const,
      marketLabel: res.svod.targetCountry || 'USA',
      marketFlag: res.svod.flag || '🇺🇸',
      marketCode: 'US',
      vpnUrl: affiliateVpnUrl,
      providers: res.svod.providers.map((p, idx) => ({
        id: idx + 1,
        name: p.name,
        logo: p.logo,
        providerKey: detectProviderKey(p.name),
        vpnUrl: affiliateVpnUrl
      }))
    };
  }
  return {
    type: 'VOD_ONLY' as const
  };
};

export type StreamingActionResult = Awaited<ReturnType<typeof resolveStreamingAction>>;
