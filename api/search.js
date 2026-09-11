import { checkRateLimit } from './_rateLimit.js';

export default async function handler(req, res) {
  // Limiteur de requêtes : 8 requêtes par minute par IP
  const limiter = checkRateLimit(req, res, { max: 8, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  if (req.method === 'POST') {
    return res.status(200).json({ success: true, message: "Requête acceptée" });
  }

  return res.status(200).json({ success: true, message: "Service de recherche actif" });
}
