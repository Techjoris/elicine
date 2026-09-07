export const MOBILE_MONEY_COUNTRIES = [
  'CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'GA', 'CD', 'GN',
  'NE', 'MR', 'GW', 'SL', 'LR', 'GH', 'NG', 'TZ', 'KE', 'UG',
  'RW', 'ET', 'ZM', 'MW', 'MZ', 'MG'
];

export interface GeoData {
  countryCode: string;
  country: string;
  currency: string;
  source?: string;
}

let inMemoryCountry: string | null = null;

/**
 * Détection du pays via le fuseau horaire de l'appareil (100% synchrone, instantané, sans réseau)
 */
export function getCountryFromTimezone(): string | null {
  if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;

    const tzMap: Record<string, string> = {
      // France & DOM-TOM
      'Europe/Paris': 'FR',
      'America/Guadeloupe': 'FR',
      'America/Martinique': 'FR',
      'America/Cayenne': 'FR',
      'Indian/Reunion': 'FR',
      'Indian/Mayotte': 'FR',
      // Europe
      'Europe/Brussels': 'BE',
      'Europe/Zurich': 'CH',
      'Europe/Luxembourg': 'LU',
      'Europe/Monaco': 'MC',
      'Europe/London': 'GB',
      'Europe/Belfast': 'GB',
      'Europe/Madrid': 'ES',
      'Africa/Ceuta': 'ES',
      'Atlantic/Canary': 'ES',
      'Europe/Berlin': 'DE',
      'Europe/Rome': 'IT',
      'Europe/Amsterdam': 'NL',
      'Europe/Lisbon': 'PT',
      'Europe/Dublin': 'IE',
      'Europe/Vienna': 'AT',
      'Europe/Stockholm': 'SE',
      'Europe/Oslo': 'NO',
      'Europe/Copenhagen': 'DK',
      'Europe/Helsinki': 'FI',
      'Europe/Athens': 'GR',
      'Europe/Warsaw': 'PL',
      'Europe/Prague': 'CZ',
      'Europe/Budapest': 'HU',
      'Europe/Bucharest': 'RO',
      // Amérique du Nord
      'America/New_York': 'US',
      'America/Detroit': 'US',
      'America/Kentucky/Louisville': 'US',
      'America/Chicago': 'US',
      'America/Indiana/Indianapolis': 'US',
      'America/Denver': 'US',
      'America/Phoenix': 'US',
      'America/Los_Angeles': 'US',
      'America/Anchorage': 'US',
      'Pacific/Honolulu': 'US',
      'America/Boise': 'US',
      'America/Toronto': 'CA',
      'America/Montreal': 'CA',
      'America/Vancouver': 'CA',
      'America/Edmonton': 'CA',
      'America/Winnipeg': 'CA',
      'America/Halifax': 'CA',
      'America/St_Johns': 'CA',
      'America/Mexico_City': 'MX',
      'America/Cancun': 'MX',
      'America/Monterrey': 'MX',
      'America/Tijuana': 'MX',
      // Afrique
      'Africa/Douala': 'CM',
      'Africa/Abidjan': 'CI',
      'Africa/Dakar': 'SN',
      'Africa/Kinshasa': 'CD',
      'Africa/Lubumbashi': 'CD',
      'Africa/Lome': 'TG',
      'Africa/Porto-Novo': 'BJ',
      'Africa/Ouagadougou': 'BF',
      'Africa/Bamako': 'ML',
      'Africa/Niamey': 'NE',
      'Africa/Conakry': 'GN',
      'Africa/Libreville': 'GA',
      'Africa/Brazzaville': 'CG',
      'Africa/Bangui': 'CF',
      'Africa/Ndjamena': 'TD',
      'Africa/Lagos': 'NG',
      'Africa/Accra': 'GH',
      'Africa/Nairobi': 'KE',
      'Africa/Dar_es_Salaam': 'TZ',
      'Africa/Kampala': 'UG',
      'Africa/Kigali': 'RW',
      'Africa/Addis_Ababa': 'ET',
      'Africa/Johannesburg': 'ZA',
      'Africa/Casablanca': 'MA',
      'Africa/Tunis': 'TN',
      'Africa/Algiers': 'DZ',
      'Africa/Cairo': 'EG',
      'Indian/Antananarivo': 'MG',
      'Indian/Mauritius': 'MU',
      // Amérique du Sud
      'America/Bogota': 'CO',
      'America/Buenos_Aires': 'AR',
      'America/Cordoba': 'AR',
      'America/Santiago': 'CL',
      'America/Lima': 'PE',
      'America/Caracas': 'VE',
      'America/Guayaquil': 'EC',
      'America/La_Paz': 'BO',
      'America/Asuncion': 'PY',
      'America/Montevideo': 'UY',
      'America/Sao_Paulo': 'BR',
      // Asie & Océanie
      'Asia/Tokyo': 'JP',
      'Asia/Seoul': 'KR',
      'Asia/Shanghai': 'CN',
      'Asia/Hong_Kong': 'HK',
      'Asia/Singapore': 'SG',
      'Asia/Kolkata': 'IN',
      'Asia/Dubai': 'AE',
      'Asia/Riyadh': 'SA',
      'Australia/Sydney': 'AU',
      'Australia/Melbourne': 'AU',
      'Australia/Brisbane': 'AU',
      'Australia/Perth': 'AU',
      'Pacific/Auckland': 'NZ'
    };

    if (tzMap[tz]) return tzMap[tz];
    if (tz.startsWith('Europe/')) return 'FR';
    if (tz.startsWith('America/')) return 'US';
    if (tz.startsWith('Africa/')) return 'CM';
    if (tz.startsWith('Asia/')) return 'JP';
    if (tz.startsWith('Australia/')) return 'AU';

    return null;
  } catch {
    return null;
  }
}

/**
 * Récupère le code pays de manière synchrone depuis le cache ou le fuseau horaire
 */
export function getCachedCountryCode(): string {
  // 1. Dérogation manuelle explicite de région
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  if (override && override !== 'auto') {
    return override.toUpperCase();
  }

  // 2. Cache mémoire rapide
  if (inMemoryCountry) return inMemoryCountry;

  // 3. Cookie utilisateur 'userCountry'
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)(?:userCountry|elicine_user_country)=([A-Za-z]{2})/i);
    if (match && match[1]) {
      inMemoryCountry = match[1].toUpperCase();
      return inMemoryCountry;
    }
  }

  // 4. SessionStorage
  if (typeof sessionStorage !== 'undefined') {
    const session = sessionStorage.getItem('elicine_user_geo') || sessionStorage.getItem('cinéia_user_geo');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.countryCode) {
          inMemoryCountry = parsed.countryCode.toUpperCase();
          return inMemoryCountry;
        }
      } catch (_) {}
    }
  }

  // 5. LocalStorage
  if (typeof localStorage !== 'undefined') {
    const local = localStorage.getItem('elicine_user_country') || localStorage.getItem('cineia_country_code');
    if (local) {
      inMemoryCountry = local.toUpperCase();
      return inMemoryCountry;
    }
  }

  // 6. Détection fuseau horaire
  const tzCode = getCountryFromTimezone();
  if (tzCode) {
    inMemoryCountry = tzCode;
    return tzCode;
  }

  return 'FR';
}

function persistCountry(code: string, countryName?: string, currency?: string, source?: string) {
  const cleanCode = code.toUpperCase().trim();
  inMemoryCountry = cleanCode;

  const geo: GeoData = {
    countryCode: cleanCode,
    country: countryName || cleanCode,
    currency: currency || (isMobileMoneyAvailable(cleanCode) ? 'XAF' : 'EUR'),
    source
  };

  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('elicine_user_geo', JSON.stringify(geo));
      sessionStorage.setItem('cinéia_user_geo', JSON.stringify(geo));
    } catch (_) {}
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('elicine_user_country', cleanCode);
    } catch (_) {}
  }

  if (typeof document !== 'undefined') {
    try {
      document.cookie = `userCountry=${cleanCode}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (_) {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('elicine-country-detected', { detail: { countryCode: cleanCode } }));
  }

  return geo;
}

/**
 * Détection asynchrone complète du pays :
 * 1. En-tête Vercel 'x-vercel-ip-country' via /api/geo
 * 2. Fuseau horaire local (timezone)
 * 3. Services IP tiers (ipapi.co, ipwho.is)
 */
export async function getUserGeoData(): Promise<GeoData> {
  // Dérogation manuelle explicite
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  if (override && override !== 'auto') {
    return persistCountry(override, override, 'EUR', 'manual-override');
  }

  // Cache session existant valide
  if (typeof sessionStorage !== 'undefined') {
    const cached = sessionStorage.getItem('elicine_user_geo') || sessionStorage.getItem('cinéia_user_geo');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.countryCode) {
          inMemoryCountry = parsed.countryCode;
          return parsed;
        }
      } catch (_) {}
    }
  }

  // ÉTAPE 1 : Appel direct vers l'en-tête Vercel (request.headers.get('x-vercel-ip-country'))
  try {
    const geoRes = await fetch('/api/geo', { signal: AbortSignal.timeout(2500) });
    if (geoRes.ok) {
      const geoJson = await geoRes.json();
      if (geoJson.countryCode && geoJson.countryCode.length === 2) {
        return persistCountry(geoJson.countryCode, geoJson.countryCode, undefined, 'vercel-header');
      }
    }
  } catch (_) {}

  // ÉTAPE 2 : Détection par Timezone
  const tzCountry = getCountryFromTimezone();
  if (tzCountry) {
    persistCountry(tzCountry, tzCountry, undefined, 'timezone');
  }

  // ÉTAPE 3 : Fallback IP tierce (ipapi.co)
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.country_code && !data.error) {
        return persistCountry(data.country_code, data.country_name || data.country_code, data.currency || 'EUR', 'ipapi');
      }
    }
  } catch (_) {}

  // ÉTAPE 4 : Fallback IP tierce alternative (ipwho.is)
  try {
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.country_code && data.success !== false) {
        return persistCountry(data.country_code, data.country || data.country_code, data.currency?.code || 'EUR', 'ipwho');
      }
    }
  } catch (_) {}

  // ÉTAPE 5 : Fallback si timezone disponible
  if (tzCountry) {
    return {
      countryCode: tzCountry,
      country: tzCountry,
      currency: isMobileMoneyAvailable(tzCountry) ? 'XAF' : 'EUR',
      source: 'timezone'
    };
  }

  // ÉTAPE 6 : Fallback par défaut France
  return persistCountry('FR', 'France', 'EUR', 'fallback-default');
}

export function isMobileMoneyAvailable(countryCode: string): boolean {
  return MOBILE_MONEY_COUNTRIES.includes(countryCode?.toUpperCase());
}

export function getSuggestedCurrencyForCountry(
  countryCode: string,
  geoCurrency: string
): string {
  if (isMobileMoneyAvailable(countryCode)) return 'XAF';
  if (['GB', 'AU', 'NZ'].includes(countryCode)) return 'USD';
  if (['CA'].includes(countryCode)) return 'CAD';
  if (['US'].includes(countryCode)) return 'USD';
  // EU zone
  return 'EUR';
}

export async function getUserCountryCode(): Promise<string> {
  const cached = getCachedCountryCode();
  if (cached && cached !== 'FR') return cached;
  try {
    const geo = await getUserGeoData();
    return geo.countryCode;
  } catch {
    return cached || 'FR';
  }
}

export async function getUserCountry(): Promise<{ code: string; name: string }> {
  const geo = await getUserGeoData();
  return { code: geo.countryCode, name: geo.country };
}

