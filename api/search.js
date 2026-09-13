import { checkRateLimit } from './_rateLimit.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY ||
  '';

const supabase = (supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 20)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default async function handler(req, res) {
  // Limiteur de requêtes : 15 requêtes par minute par IP
  const limiter = checkRateLimit(req, res, { max: 15, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  const { action, userId, deviceId } = req.query || {};
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const effectiveUserKey = userId ? String(userId).trim() : (deviceId ? String(deviceId).trim() : (clientIp ? `ip_${clientIp}` : ''));
  const todayDate = new Date().toISOString().split('T')[0];

  // Action : Récupération du quota quotidien
  if (action === 'quota' || req.method === 'GET') {
    if (!effectiveUserKey || !supabase) {
      return res.status(200).json({
        remaining: 3,
        max: 3,
        searchCount: 0,
        today: todayDate,
        isPro: false
      });
    }

    try {
      const { data, error } = await supabase
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
        error: err?.message
      });
    }
  }

  if (req.method === 'POST') {
    return res.status(200).json({ success: true, message: "Requête acceptée" });
  }

  return res.status(200).json({ success: true, message: "Service de recherche actif" });
}
