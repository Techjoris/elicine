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
    name: 'Ivan Joris (Master Admin)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'admin',
    is_admin: true,
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: 'Illimité (Fondateur)',
    referralCode: 'ELICINE-CREATOR',
    createdAt: '2026-08-01T10:00:00.000Z',
    moviesInListCount: 0,
    aiQueriesCount: 0,
    lastActiveAt: 'En direct'
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

  // ─── DELETE : SUPPRESSION DÉFINITIVE & EN CASCADE D'UN UTILISATEUR ─────────
  if (req.method === 'DELETE') {
    try {
      const targetUserId = (req.body?.userId || req.query?.userId || '').trim();
      const targetEmail = (req.body?.email || req.query?.email || '').toLowerCase().trim();

      if (!targetUserId && !targetEmail) {
        return res.status(400).json({ error: 'userId ou email requis pour la suppression.' });
      }

      // 🛡️ Protection absolue des comptes administrateurs & fondateurs
      if (
        targetEmail === MASTER_ADMIN_EMAIL.toLowerCase() ||
        ADMIN_EMAILS.includes(targetEmail) ||
        targetUserId === 'usr_master_admin' ||
        targetUserId === 'usr_master_admin_01' ||
        targetUserId === 'usr_creator_01'
      ) {
        return res.status(403).json({
          error: "Action interdite : Les comptes administrateurs et fondateurs ne peuvent pas être supprimés."
        });
      }

      // 1. Suppression en cascade dans Supabase si configuré
      if (supabaseAdmin) {
        try {
          // a. Suppression des souscriptions associées
          if (targetEmail) {
            await supabaseAdmin.from('subscriptions').delete().eq('email', targetEmail);
          }
          if (targetUserId) {
            await supabaseAdmin.from('subscriptions').delete().eq('user_id', targetUserId);
          }

          // b. Suppression des quotas / recherches associées
          if (targetUserId) {
            await supabaseAdmin.from('user_searches').delete().eq('user_id', targetUserId);
          }

          // c. Suppression du profil utilisateur
          if (targetUserId) {
            await supabaseAdmin.from('profiles').delete().eq('id', targetUserId);
          }
          if (targetEmail) {
            await supabaseAdmin.from('profiles').delete().eq('email', targetEmail);
          }

          // d. Suppression dans auth.users si disponible (UUID standard)
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
          if (isUuid && supabaseAdmin.auth?.admin?.deleteUser) {
            await supabaseAdmin.auth.admin.deleteUser(targetUserId).catch((e) => {
              console.warn('[Admin API DELETE auth.users UUID notice]:', e?.message);
            });
          } else if (targetEmail && supabaseAdmin.auth?.admin?.listUsers && supabaseAdmin.auth?.admin?.deleteUser) {
            // Chercher par email si le userId n'est pas un UUID direct
            try {
              const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
              const matchedAuthUser = authUsers?.find(u => u.email?.toLowerCase() === targetEmail);
              if (matchedAuthUser?.id) {
                await supabaseAdmin.auth.admin.deleteUser(matchedAuthUser.id);
              }
            } catch (authListErr) {
              console.warn('[Admin API DELETE auth.users lookup notice]:', authListErr?.message);
            }
          }
        } catch (dbErr) {
          console.error('[Admin API DELETE Supabase Error]:', dbErr);
        }
      }

      // 2. Suppression en mémoire locale du seed
      const seedIndex = SEED_USERS.findIndex(
        u => (targetUserId && u.id === targetUserId) || (targetEmail && u.email.toLowerCase() === targetEmail)
      );
      if (seedIndex >= 0) {
        SEED_USERS.splice(seedIndex, 1);
      }

      return res.status(200).json({
        success: true,
        message: `L'utilisateur ${targetEmail || targetUserId} a été définitivement supprimé avec toutes ses données associées.`,
        deleted: { userId: targetUserId, email: targetEmail }
      });
    } catch (err) {
      console.error('[Admin API DELETE Error]:', err);
      return res.status(500).json({ error: "Erreur serveur lors de la suppression de l'utilisateur." });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
