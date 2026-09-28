import type { Language } from './translations';

const SPANISH_COUNTRIES = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ']);
const FRENCH_COUNTRIES = new Set(['FR', 'CM', 'CI', 'SN', 'CD', 'MG', 'ML', 'BF', 'NE', 'GN', 'TD', 'BI', 'BJ', 'TG', 'CF', 'CG', 'GA', 'DJ', 'KM', 'BE', 'CH', 'LU', 'MC', 'HT']);
const GERMAN_COUNTRIES = new Set(['DE', 'AT', 'LI']);
const ITALIAN_COUNTRIES = new Set(['IT', 'SM', 'VA']);

export function languageForCountry(countryCode: string | null | undefined): Language {
  const code = countryCode?.trim().toUpperCase();
  if (code && SPANISH_COUNTRIES.has(code)) return 'es';
  if (code && FRENCH_COUNTRIES.has(code)) return 'fr';
  if (code && GERMAN_COUNTRIES.has(code)) return 'de';
  if (code && ITALIAN_COUNTRIES.has(code)) return 'it';
  return 'en';
}

export async function detectCountryLanguage(signal?: AbortSignal): Promise<Language> {
  try {
    const response = await fetch('/api/geo', { cache: 'no-store', signal });
    if (!response.ok) return 'en';
    const geo = await response.json();
    return languageForCountry(geo?.countryCode);
  } catch {
    return 'en';
  }
}
