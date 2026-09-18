export const config = {
  runtime: 'edge',
};

export const SASPAY_ALLOWED_COUNTRIES = [
  'BE', // Belgique
  'BF', // Burkina Faso
  'BJ', // Bénin
  'CD', // RDC
  'CG', // Congo
  'CI', // Côte d'Ivoire
  'CM', // Cameroun
  'DE', // Allemagne
  'DK', // Danemark
  'ES', // Espagne
  'ET', // Éthiopie
  'FR', // France
  'GA', // Gabon
  'GH', // Ghana
  'GN', // Guinée
  'KE', // Kenya
  'ML', // Mali
  'MW', // Malawi
  'MZ', // Mozambique
  'NE', // Niger
  'NG', // Nigeria
  'RW', // Rwanda
  'SN', // Sénégal
  'TG', // Togo
  'TZ', // Tanzanie
  'UG', // Ouganda
  'ZM'  // Zambie
];

export default function handler(request) {
  // Récupération du code pays (ISO 2 lettres) via l'en-tête de requête Vercel
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    null;

  const countryCode = country ? country.toUpperCase().trim() : null;
  const isSaspayAvailable = countryCode ? SASPAY_ALLOWED_COUNTRIES.includes(countryCode) : null;

  return new Response(
    JSON.stringify({
      countryCode,
      country: countryCode,
      isSaspayAvailable,
      source: countryCode ? 'vercel-header' : 'none'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}
