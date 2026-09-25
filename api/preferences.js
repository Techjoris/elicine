/**
 * GET  /api/preferences  → préférences du compte connecté.
 * POST /api/preferences  → enregistre une preuve (œuvre gardée, alerte, recherche).
 *
 * Les préférences sont toujours rattachées au compte : un membre qui se
 * reconnecte ailleurs retrouve les mêmes propositions. Sans compte identifié,
 * l'endpoint ne fait rien et ne renvoie rien — rien n'est deviné ni partagé.
 */
import { checkRateLimit } from './_rateLimit.js';
import { verifyServerSession } from './_security.js';
import { loadPreferenceProfile, recordPreferenceSignal } from './_preferences.js';
import {
  emptyPreferenceProfile,
  preferenceSignalFromWork
} from '../src/search/preferenceProfile.js';

/** Une preuve envoyée par le client ne peut pas peser plus qu'une œuvre gardée. */
const CLIENT_SIGNAL_KINDS = new Set(['watchlist', 'alert']);

function readSignal(body) {
  const kind = String(body?.signal?.kind || '').toLowerCase();
  if (!CLIENT_SIGNAL_KINDS.has(kind)) return null;
  const work = body?.work || {};
  const signal = preferenceSignalFromWork({
    genreIds: work.genreIds ?? work.genre_ids,
    mediaType: work.mediaType ?? work.media_type,
    originalLanguage: work.originalLanguage ?? work.original_language,
    constraintData: { themes: work.themes, moods: work.moods }
  }, { kind });

  const hasEvidence = signal.genres.length > 0 || signal.themes.length > 0
    || signal.moods.length > 0 || signal.mediaType;
  return hasEvidence ? signal : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const limiter = checkRateLimit(req, res, { max: 60, windowMs: 60 * 1000 });
    if (!limiter.allowed) return;

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
    }

    const sessionInfo = await verifyServerSession(req);
    const userId = sessionInfo?.isAuthenticated ? String(sessionInfo.effectiveUserId || '') : '';
    if (!userId) {
      return res.status(200).json({ success: true, profile: emptyPreferenceProfile(), recorded: false });
    }

    if (req.method === 'GET') {
      const profile = await loadPreferenceProfile(userId);
      return res.status(200).json({ success: true, profile });
    }

    if (req.method === 'POST') {
      const signal = readSignal(req.body);
      const profile = signal ? await recordPreferenceSignal(userId, signal) : null;
      return res.status(200).json({
        success: true,
        recorded: Boolean(signal && profile),
        profile: profile || await loadPreferenceProfile(userId)
      });
    }

    return res.status(200).json({ success: true, profile: emptyPreferenceProfile(), recorded: false });
  } catch (error) {
    return res.status(200).json({ success: false, profile: emptyPreferenceProfile(), recorded: false });
  }
}
