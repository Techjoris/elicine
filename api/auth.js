import { createClient } from '@supabase/supabase-js';
import { authLoginSchema, authRegisterSchema } from './_security.js';
import { checkRateLimit } from './_rateLimit.js';
import { createEmailAuth, isAuthEmail } from '../src/lib/emailAuth.js';

function authClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // A new stateless client per request avoids sharing login sessions between users.
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

export function createAuthHandler(clientFactory = authClient, siteOrigin = () => process.env.SITE_URL || 'https://elicine.vercel.app') {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
    if (!checkRateLimit(req, res, { max: 10, windowMs: 60000 }).allowed) return;
    const action = String(req.query?.action || req.url?.split('?')[0].split('/').pop() || '').toLowerCase();
    if (!['login','register','send-verification','forgot-password'].includes(action)) return res.status(404).json({ error: 'Action inconnue.' });
    const client = clientFactory();
    if (!client) return res.status(503).json({ error: 'Service de comptes indisponible.' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const email = typeof (body.email || body.identifier) === 'string' ? (body.email || body.identifier).trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const flow = createEmailAuth(client, siteOrigin);
      if (action === 'login') {
        if (!authLoginSchema.safeParse({ email, password }).success) return res.status(400).json({ error: 'Adresse e-mail ou mot de passe incorrect.', errorCode: 'invalid_credentials' });
        const result = await flow.login(email, password);
        if (!result.success) return res.status(401).json({ error: result.error, errorCode: result.errorCode });
        return res.status(200).json({ success: true, user: result.data.user, session: result.data.session });
      }
      if (action === 'register') {
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        if (!authRegisterSchema.safeParse({ email, password, username }).success) return res.status(400).json({ error: "Données d'inscription invalides." });
        const result = await flow.register(email, password, username);
        return res.status(result.success ? 200 : 400).json(result);
      }
      if (!isAuthEmail(email)) return res.status(400).json({ error: 'Veuillez saisir une adresse e-mail valide.' });
      const result = action === 'send-verification' ? await flow.resendConfirmation(email) : await flow.requestPasswordReset(email);
      return res.status(result.success ? 200 : 400).json(result);
    } catch { return res.status(503).json({ error: 'Service de comptes indisponible.' }); }
  };
}

export default createAuthHandler();
