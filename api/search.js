import { checkRateLimit } from './_rateLimit.js';
import { 
  searchQuotaQuerySchema, 
  verifyServerSession, 
  supabaseServer,
  getMemoryDailyQuota
} from './_security.js';

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
  const ipHash = sessionInfo.ipHash;
  const ipStorageKey = `ip_${ipHash}`;
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

    // 1. Initialisation avec le cache mémoire de l'adresse IP
    let count = getMemoryDailyQuota(ipHash, todayDate);

    // 2. Synchronisation persistante avec Supabase (Compteur IP + Compteur Utilisateur)
    if (supabaseServer) {
      try {
        // A) Recherche du compteur de l'adresse IP
        const { data: ipData } = await supabaseServer
          .from('user_searches')
          .select('search_count')
          .eq('user_id', ipStorageKey)
          .eq('search_date', todayDate)
          .maybeSingle();

        if (ipData && typeof ipData.search_count === 'number') {
          count = Math.max(count, ipData.search_count);
        }

        // B) Recherche du compteur du compte utilisateur connecté (si différent de l'IP)
        if (effectiveUserKey && effectiveUserKey !== ipStorageKey) {
          const { data: userData } = await supabaseServer
            .from('user_searches')
            .select('search_count')
            .eq('user_id', effectiveUserKey)
            .eq('search_date', todayDate)
            .maybeSingle();

          if (userData && typeof userData.search_count === 'number') {
            count = Math.max(count, userData.search_count);
          }
        }
      } catch (err) {
        console.warn('[API /api/search] Erreur lecture quota Supabase :', err?.message);
      }
    }

    const remaining = Math.max(0, 3 - count);
    return res.status(200).json({
      remaining,
      max: 3,
      searchCount: count,
      today: todayDate,
      isPro: false
    });
  }

  // Action : Recherche vectorielle directe Supabase (Niveau 2)
  if (req.method === 'POST' && (action === 'vector' || req.body?.action === 'vector')) {
    const { queryEmbedding, queryText, matchThreshold = 0.40, matchCount = 10 } = req.body || {};
    
    if (supabaseServer && Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
      try {
        const { data, error } = await supabaseServer.rpc('match_movies', {
          query_embedding: queryEmbedding,
          match_threshold: Number(matchThreshold) || 0.40,
          match_count: Number(matchCount) || 10
        });

        if (!error && Array.isArray(data)) {
          const topScore = data[0]?.similarity || 0;
          return res.status(200).json({
            success: true,
            movies: data,
            similarityScore: topScore,
            isLowSimilarity: topScore < (Number(matchThreshold) || 0.40)
          });
        }
      } catch (rpcErr) {
        console.warn('[API /api/search] RPC match_movies non disponible :', rpcErr?.message);
      }
    }

    return res.status(200).json({
      success: true,
      movies: [],
      similarityScore: 0,
      isLowSimilarity: true,
      message: "Recherche vectorielle native non disponible ou aucun résultat au-dessus du seuil"
    });
  }

  return res.status(200).json({ success: true, message: "Service de recherche actif" });
}
