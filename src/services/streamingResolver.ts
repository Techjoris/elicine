import { detectProviderKey } from './tmdb';
import { getVpnAffiliateUrl } from '../config/affiliates';

export interface SvodProviderItem {
  name: string;
  logo: string | null;
  url?: string;
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
  };
  vod: VodProviderItem[];
}

// Générateur de lien de recherche officiel par plateforme SVOD
export const buildStreamingUrl = (providerKey: string, providerName: string, title: string = ''): string => {
  const q = encodeURIComponent(title);
  switch (providerKey) {
    case 'netflix': return q ? `https://www.netflix.com/search?q=${q}` : 'https://www.netflix.com';
    case 'prime': return q ? `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}` : 'https://www.primevideo.com';
    case 'disney': return q ? `https://www.disneyplus.com/search?q=${q}` : 'https://www.disneyplus.com';
    case 'canal': return q ? `https://www.canalplus.com/recherche/${q}` : 'https://www.canalplus.com';
    case 'tf1': return q ? `https://www.tf1.fr/recherche?q=${q}` : 'https://www.tf1.fr';
    case 'francetv': return q ? `https://www.france.tv/recherche/?q=${q}` : 'https://www.france.tv';
    case 'arte': return q ? `https://www.arte.tv/fr/search/?q=${q}` : 'https://www.arte.tv';
    case '6play': return q ? `https://www.6play.fr/recherche?q=${q}` : 'https://www.6play.fr';
    case 'apple': return q ? `https://tv.apple.com/search?term=${q}` : 'https://tv.apple.com';
    case 'max': return q ? `https://www.max.com/search?q=${q}` : 'https://www.max.com';
    case 'paramount': return q ? `https://www.paramountplus.com/search/?q=${q}` : 'https://www.paramountplus.com';
    case 'molotov': return q ? `https://www.molotov.tv/search?q=${q}` : 'https://www.molotov.tv';
    case 'pluto': return q ? `https://pluto.tv/search/details?q=${q}` : 'https://pluto.tv';
    default: return `https://www.google.com/search?q=regarder+${q}+sur+${encodeURIComponent(providerName)}`;
  }
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
  apiKey?: string
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
    const localFlatrate = [
      ...(results[userCountryCode]?.flatrate || []),
      ...(results[userCountryCode]?.free || []),
      ...(results[userCountryCode]?.ads || [])
    ];

    if (localFlatrate.length > 0) {
      const uniqueLocal = new Map<number, SvodProviderItem>();
      localFlatrate.forEach((p: any) => {
        if (p.provider_id && !uniqueLocal.has(p.provider_id)) {
          uniqueLocal.set(p.provider_id, {
            name: p.provider_name,
            logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
            url: getPlatformSearchUrl(p.provider_name, movieTitle)
          });
        }
      });

      svod = {
        status: 'local',
        providers: Array.from(uniqueLocal.values())
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
  apiKey?: string
) => {
  const res = await getMediaProviders(movieId, mediaType, userCountryCode, movieTitle, apiKey);
  if (res.svod.status === 'local') {
    return {
      type: 'DIRECT' as const,
      providers: res.svod.providers.map((p, idx) => ({
        id: idx + 1,
        name: p.name,
        logo: p.logo,
        providerKey: detectProviderKey(p.name),
        actionUrl: p.url || buildStreamingUrl(detectProviderKey(p.name), p.name, movieTitle)
      }))
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
