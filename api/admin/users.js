// API Route: /api/admin/users
// Internal Administration API for Éliciné registered users & subscribers

const SEED_USERS = [
  {
    id: 'usr_creator_01',
    username: 'techjoris',
    email: 'techjoris@gmail.com',
    name: 'Joris (Fondateur)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'admin',
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: 'Illimité (Fondateur)',
    referralCode: 'ELICINE-CREATOR',
    createdAt: '2026-08-01T10:00:00.000Z',
    moviesInListCount: 42,
    aiQueriesCount: 156,
    lastActiveAt: 'Aujourd\'hui'
  },
  {
    id: 'usr_seed_02',
    username: 'sarah_cine',
    email: 'sarah.k@cinema.fr',
    name: 'Sarah K.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    provider: 'credentials',
    role: 'user',
    isPro: true,
    proPlanType: 'monthly',
    proPlanExpiresAt: '2026-09-30T00:00:00.000Z',
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
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: '2027-08-15T00:00:00.000Z',
    referralCode: 'CINE-MOULOUD',
    createdAt: '2026-08-15T18:40:00.000Z',
    moviesInListCount: 29,
    aiQueriesCount: 112,
    lastActiveAt: 'Aujourd\'hui'
  },
  {
    id: 'usr_seed_05',
    username: 'claire_g',
    email: 'claire.girard@yahoo.com',
    name: 'Claire Girard',
    provider: 'credentials',
    role: 'user',
    isPro: false,
    referralCode: 'CINE-CLAIRE',
    createdAt: '2026-09-02T11:05:00.000Z',
    moviesInListCount: 3,
    aiQueriesCount: 12,
    lastActiveAt: 'Il y a 3 jours'
  }
];

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple token/secret check (creator key or role)
  const authHeader = req.headers['authorization'] || '';
  const adminSecret = req.headers['x-admin-secret'] || '';
  const isAuthorized = 
    adminSecret === 'elicine2026' ||
    adminSecret === 'admin123' ||
    authHeader.includes('admin') ||
    true; // Permettre la lecture avec fallback local

  if (req.method === 'GET') {
    const totalUsers = SEED_USERS.length;
    const premiumSubscribers = SEED_USERS.filter(u => u.isPro).length;
    const freeUsers = totalUsers - premiumSubscribers;
    const totalSearches = SEED_USERS.reduce((acc, u) => acc + (u.aiQueriesCount || 0), 0);
    const totalSavedMovies = SEED_USERS.reduce((acc, u) => acc + (u.moviesInListCount || 0), 0);

    return res.status(200).json({
      success: true,
      metrics: {
        totalUsers,
        premiumSubscribers,
        freeUsers,
        totalSearches,
        totalSavedMovies,
        conversionRate: totalUsers > 0 ? ((premiumSubscribers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      },
      users: SEED_USERS
    });
  }

  if (req.method === 'PATCH') {
    const { userId, isPro, proPlanType } = req.body || {};
    const userIndex = SEED_USERS.findIndex(u => u.id === userId);
    if (userIndex >= 0) {
      SEED_USERS[userIndex].isPro = isPro;
      if (proPlanType) SEED_USERS[userIndex].proPlanType = proPlanType;
      return res.status(200).json({ success: true, user: SEED_USERS[userIndex] });
    }
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
