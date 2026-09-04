export const MOBILE_MONEY_COUNTRIES = [
  'CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'GA', 'CD', 'GN',
  'NE', 'MR', 'GW', 'SL', 'LR', 'GH', 'NG', 'TZ', 'KE', 'UG',
  'RW', 'ET', 'ZM', 'MW', 'MZ', 'MG'
];

export interface GeoData {
  countryCode: string;
  country: string;
  currency: string;
}

export async function getUserGeoData(): Promise<GeoData> {
  // Return from session cache if available
  const cached = sessionStorage.getItem('cinéia_user_geo');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
  }

  const FALLBACK: GeoData = { countryCode: 'FR', country: 'France', currency: 'EUR' };

  // Primary: ipapi.co
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.country_code && !data.error) {
        const geo: GeoData = {
          countryCode: data.country_code,
          country: data.country_name || data.country_code,
          currency: data.currency || 'EUR'
        };
        sessionStorage.setItem('cinéia_user_geo', JSON.stringify(geo));
        return geo;
      }
    }
  } catch (_) {}

  // Fallback: ipwho.is
  try {
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.country_code && data.success !== false) {
        const geo: GeoData = {
          countryCode: data.country_code,
          country: data.country || data.country_code,
          currency: data.currency?.code || 'EUR'
        };
        sessionStorage.setItem('cinéia_user_geo', JSON.stringify(geo));
        return geo;
      }
    }
  } catch (_) {}

  // Ultimate fallback: localStorage stored country if user previously saved
  const storedCountry = localStorage.getItem('cineia_country_code');
  if (storedCountry) {
    const geo: GeoData = { countryCode: storedCountry, country: storedCountry, currency: 'XAF' };
    sessionStorage.setItem('cinéia_user_geo', JSON.stringify(geo));
    return geo;
  }

  return FALLBACK;
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

let inMemoryCountry: string | null = null;

export function getCachedCountryCode(): string {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  if (override && override !== 'auto') {
    return override.toUpperCase();
  }

  if (inMemoryCountry) return inMemoryCountry;
  const session = sessionStorage.getItem('elicine_user_geo') || sessionStorage.getItem('cinora_user_geo') || sessionStorage.getItem('cinéia_user_geo');
  if (session) {
    try {
      const parsed = JSON.parse(session);
      if (parsed.countryCode) {
        inMemoryCountry = parsed.countryCode;
        return parsed.countryCode;
      }
    } catch (_) {}
  }
  const local = localStorage.getItem('elicine_user_country') || localStorage.getItem('cinora_user_country') || localStorage.getItem('cineia_country_code');
  if (local) {
    inMemoryCountry = local;
    return local;
  }
  return 'FR';
}

export async function getUserCountryCode(): Promise<string> {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  if (override && override !== 'auto') {
    return override.toUpperCase();
  }

  const cached = getCachedCountryCode();
  if (cached && cached !== 'FR') return cached;
  try {
    const geo = await getUserGeoData();
    inMemoryCountry = geo.countryCode;
    return geo.countryCode;
  } catch {
    return 'FR';
  }
}

export async function getUserCountry(): Promise<{ code: string; name: string }> {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  if (override && override !== 'auto') {
    return { code: override.toUpperCase(), name: override.toUpperCase() };
  }

  const geo = await getUserGeoData();
  return { code: geo.countryCode, name: geo.country };
}
