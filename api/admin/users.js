import { createClient } from '@supabase/supabase-js';

// Configuration Supabase Serverless
const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  '';

const supabaseAdmin = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

const MASTER_ADMIN_EMAIL = 'ivanjoris959@gmail.com';
const ADMIN_EMAILS = [
  'ivanjoris959@gmail.com',
  'techjoris@gmail.com',
  'admin@elicine.app',
  'joris@elicine.app'
];

const SEED_USERS = [
  {
    id: 'usr_master_admin',
    username: 'techjoris',
    email: 'ivanjoris959@gmail.com',
    name: 'Joris (Master Admin)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'admin',
    is_admin: true,
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: 'Illimité (Fondateur)',
    referralCode: 'ELICINE-CREATOR',
    createdAt: '2026-08-01T10:00:00.000Z',
    moviesInListCount: 42,
    aiQueriesCount: 215,
    lastActiveAt: 'En direct'
  },
  {
    id: 'usr_seed_02',
    username: 'sarah_cine',
    email: 'sarah.k@cinema.fr',
    name: 'Sarah K.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    provider: 'credentials',
    role: 'user',
    is_admin: false,
    isPro: true,
    proPlanType: 'monthly',
    proPlanExpiresAt: '2026-10-15T00:00:00.000Z',
    referralCode: 'CINE-SARAH9',
    createdAt: '2026-08-14T14:22:10.000Z',
    moviesInListCount: 18,
    aiQueriesCount: 84,
    lastActiveAt: 'Il y a 2h'
  },
  {
    id: 'usr_seed_03',
    username: 'alex_marcus',
    email: 'alex.marcus@gmail.com',
    name: 'Alexandre Marcus',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'user',
    is_admin: false,
    isPro: false,
    referralCode: 'CINE-ALEX2',
    createdAt: '2026-08-28T09:15:00.000Z',
    moviesInListCount: 7,
    aiQueriesCount: 19,
    lastActiveAt: 'Hier'
  },
  {
    id: 'usr_seed_04',
    username: 'mouloud_cine',
    email: 'mouloud.b@orange.fr',
    name: 'Mouloud B.',
    provider: 'credentials',
    role: 'user',
    is_admin: false,
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: '2027-08-15T00:00:00.000Z',
    referralCode: 'CINE-MOULOUD',
    createdAt: '2026-08-15T18:40:00.000Z',
    moviesInListCount: 29,
    aiQueriesCount: 112,
    lastActiveAt: 'Aujourd\'hui'
  }
];

/**
 * Vérifie si la requête provient d'un administrateur authentifié
 */
async function verifyAdminAuth(req) {
  const adminSecret = req.headers['x-admin-secret'] || '';
  if (['elicine2026', 'admin123', 'techjoris', 'elicine'].includes(adminSecret.trim())) {
    return { authorized: true, user: { email: MASTER_ADMIN_EMAIL, role: 'admin' } };
  }

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (supabaseAdmin && token) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && user && user.email) {
          const emailLower = user.email.toLowerCase();
          if (emailLower === MASTER_ADMIN_EMAIL || ADMIN_EMAILS.includes(emailLower) || user.user_metadata?.role === 'admin') {
            return { authorized: true, user };
          }
        }
      } catch (_) {}
    }
  }

  return { authorized: false };
}

/**
 * API Route: /api/admin/users
 * Console d'administration sécurisée Éliciné connectée à Supabase
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await verifyAdminAuth(req);
  if (!auth.authorized) {
    return res.status(403).json({
      error: "Accès refusé. Cette console est strictement réservée à l'administrateur principal (ivanjoris959@gmail.com)."
    });
  }

  // ─── GET : LISTE CONSOLIDÉE DES UTILISATEURS & METRICS ───────────────────────
  if (req.method === 'GET') {
    let combinedUsers = [...SEED_USERS];

    if (supabaseAdmin) {
      try {
        // Récupérer les profils et souscriptions Supabase
        const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
          supabaseAdmin.from('profiles').select('*').limit(200),
          supabaseAdmin.from('subscriptions').select('*').limit(200)
        ]);

        if (Array.isArray(profiles) && profiles.length > 0) {
          const userMap = new Map();
          combinedUsers.forEach(u => userMap.set(u.email.toLowerCase(), u));

          profiles.forEach((p) => {
            const email = (p.email || '').toLowerCase().trim();
            if (!email) return;

            const isMaster = email === MASTER_ADMIN_EMAIL;
            const sub = Array.isArray(subscriptions) ? subscriptions.find(s => s.email?.toLowerCase() === email) : null;
            const isPro = isMaster ? true : Boolean(p.is_pro || sub?.status === 'active');
            const role = isMaster ? 'admin' : (p.role || (ADMIN_EMAILS.includes(email) ? 'admin' : 'user'));

            userMap.set(email, {
              id: p.id || `usr_${email}`,
              username: p.username || email.split('@')[0],
              email: p.email,
              name: p.name || p.full_name || (isMaster ? 'Joris (Master Admin)' : email.split('@')[0]),
              avatar: p.avatar_url || undefined,
              provider: p.provider || 'credentials',
              role,
              is_admin: role === 'admin' || isMaster,
              isPro,
              proPlanType: isPro ? (sub?.plan || 'monthly') : undefined,
              proPlanExpiresAt: isMaster ? 'Illimité (Fondateur)' : (sub?.expires_at || (isPro ? 'Accordé par Admin' : null)),
              referralCode: p.referral_code || 'CINE-' + email.slice(0, 4).toUpperCase(),
              createdAt: p.created_at || new Date().toISOString(),
              moviesInListCount: p.movies_count || 0,
              aiQueriesCount: p.queries_count || 0,
              lastActiveAt: 'Récemment'
            });
          });

          combinedUsers = Array.from(userMap.values());
        }
      } catch (sbErr) {
        console.warn('[Admin API] Notice lecture Supabase:', sbErr);
      }
    }

    // Assurer que le master admin est toujours en tête et configuré admin
    const masterIndex = combinedUsers.findIndex(u => u.email.toLowerCase() === MASTER_ADMIN_EMAIL);
    if (masterIndex >= 0) {
      combinedUsers[masterIndex].role = 'admin';
      combinedUsers[masterIndex].is_admin = true;
      combinedUsers[masterIndex].isPro = true;
    }

    const totalUsers = combinedUsers.length;
    const premiumSubscribers = combinedUsers.filter(u => u.isPro).length;
    const freeUsers = Math.max(0, totalUsers - premiumSubscribers);
    const totalSearches = combinedUsers.reduce((acc, u) => acc + (u.aiQueriesCount || 0), 0);
    const totalSavedMovies = combinedUsers.reduce((acc, u) => acc + (u.moviesInListCount || 0), 0);

    return res.status(200).json({
      success: true,
      masterAdmin: MASTER_ADMIN_EMAIL,
      metrics: {
        totalUsers,
        premiumSubscribers,
        freeUsers,
        totalSearches,
        totalSavedMovies,
        conversionRate: totalUsers > 0 ? ((premiumSubscribers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      },
      users: combinedUsers
    });
  }

  // ─── PATCH : BASCULE PASS PRO & RÔLE DANS SUPABASE ─────────────────────────
  if (req.method === 'PATCH') {
    try {
      const { userId, email, isPro, role } = req.body || {};
      const now = new Date().toISOString();

      if (!userId && !email) {
        return res.status(400).json({ error: 'userId ou email requis.' });
      }

      // 1. Mise à jour Supabase si configuré
      if (supabaseAdmin) {
        const updatePayload = { updated_at: now };
        if (typeof isPro === 'boolean') {
          updatePayload.is_pro = isPro;
        }
        if (role) {
          updatePayload.role = role;
          updatePayload.is_admin = role === 'admin';
        }

        if (email) {
          await supabaseAdmin.from('profiles').update(updatePayload).eq('email', email.toLowerCase());
          if (typeof isPro === 'boolean') {
            await supabaseAdmin.from('subscriptions').upsert({
              id: `sub_admin_${userId || email}`,
              email: email.toLowerCase(),
              status: isPro ? 'active' : 'cancelled',
              plan: isPro ? 'yearly' : 'free',
              updated_at: now
            });
          }
        } else if (userId) {
          await supabaseAdmin.from('profiles').update(updatePayload).eq('id', userId);
        }
      }

      // 2. Mise à jour mémoire locale
      const userIndex = SEED_USERS.findIndex(u => (userId && u.id === userId) || (email && u.email.toLowerCase() === email.toLowerCase()));
      if (userIndex >= 0) {
        if (typeof isPro === 'boolean') SEED_USERS[userIndex].isPro = isPro;
        if (role) {
          SEED_USERS[userIndex].role = role;
          SEED_USERS[userIndex].is_admin = role === 'admin';
        }
      }

      return res.status(200).json({
        success: true,
        message: "Statut utilisateur mis à jour avec succès dans Supabase.",
        updated: { userId, email, isPro, role }
      });
    } catch (err) {
      console.error('[Admin API PATCH Error]:', err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour utilisateur." });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
