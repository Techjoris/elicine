/** Permissions are read from the protected profile of the verified Auth user. */
export async function verifyAccountSession(req, db) {
  const denied = { isAuthenticated: false, isAdmin: false, isPro: false, user: null, expiresAt: null };
  const headers = req?.headers || {};
  const header = typeof headers.get === 'function' ? headers.get('authorization') : headers.authorization;
  const token = /^Bearer\s+(\S+)$/i.exec(header || '')?.[1]
    || (typeof headers['x-supabase-token'] === 'string' ? headers['x-supabase-token'] : '')
    || (typeof req?.body?.supabaseToken === 'string' ? req.body.supabaseToken : '');
  if (!token || !db) return denied;
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user?.id) return denied;
    const user = data.user;
    const result = { ...denied, isAuthenticated: true, user };
    const profile = await db.from('profiles').select('id, is_admin, is_pro, expires_at').eq('id', user.id).maybeSingle();
    if (profile.error || !profile.data || profile.data.id !== user.id) return result;
    result.isAdmin = profile.data.is_admin === true;
    result.expiresAt = profile.data.expires_at || null;
    result.isPro = profile.data.is_pro === true
      && (!result.expiresAt || Date.parse(result.expiresAt) > Date.now());
    return result;
  } catch {
    return denied;
  }
}
