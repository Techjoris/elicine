import { checkRateLimit } from './_rateLimit.js';
import { searchQuotaQuerySchema, verifyServerSession, supabaseServer } from './_security.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Limiteur de requêtes : 20 requêtes par minute par IP
  const limiter = checkRateLimit(req, res, { max: 20, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  // Validation Zod des paramètres
  const validation = searchQuotaQuerySchema.safeParse(req.query || {});
  if (!validation.success) {
    return res.status(400).json({
      error: "Paramètres de requête non valides",
      details: validation.error.format()
    });
  }

  const { action } = validation.data;
  const sessionInfo = await verifyServerSession(req);
  const isPro = sessionInfo.isPro || sessionInfo.isBypassQuotas;
  const effectiveUserKey = sessionInfo.effectiveUserId;
  const todayDate = new Date().toISOString().split('T')[0];

  // Action : Consultation du quota quotidien
  if (action === 'quota' || req.method === 'GET') {
    // Si l'utilisateur est abonné Pro ou Administrateur principal (ivanjoris959@gmail.com)
    if (isPro) {
      return res.status(200).json({
        remaining: 999,
        max: 3,
        searchCount: 0,
        today: todayDate,
        isPro: true,
        isAdmin: Boolean(sessionInfo.isAdmin)
      });
    }

    if (!effectiveUserKey || !supabaseServer) {
      return res.status(200).json({
        remaining: 3,
        max: 3,
        searchCount: 0,
        today: todayDate,
        isPro: false
      });
    }

    try {
      const { data, error } = await supabaseServer
        .from('user_searches')
        .select('search_count')
        .eq('user_id', effectiveUserKey)
        .eq('search_date', todayDate)
        .maybeSingle();

      const count = (data && typeof data.search_count === 'number') ? data.search_count : 0;
      const remaining = Math.max(0, 3 - count);

      return res.status(200).json({
        remaining,
        max: 3,
        searchCount: count,
        today: todayDate,
        isPro: false
      });
    } catch (err) {
      return res.status(200).json({
        remaining: 3,
        max: 3,
        searchCount: 0,
        today: todayDate,
        isPro: false,
        error: err?.message
      });
    }
  }

  return res.status(200).json({ success: true, message: "Service de recherche actif" });
}
