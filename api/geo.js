export const config = {
  runtime: 'edge',
};

export default function handler(request) {
  // Récupération du code pays (ISO 2 lettres) via l'en-tête de requête Vercel
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    null;

  const countryCode = country ? country.toUpperCase().trim() : null;

  return new Response(
    JSON.stringify({
      countryCode,
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
