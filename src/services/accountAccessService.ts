import { supabase } from '../lib/supabase';

export interface AccountAccess {
  role: 'admin' | 'user';
  is_admin: boolean;
  isPro: boolean;
  expires_at: string | null;
}

export const NO_ACCOUNT_ACCESS: AccountAccess = { role: 'user', is_admin: false, isPro: false, expires_at: null };

export async function accountSessionHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** Display permissions only. Every privileged API request is checked again on the server. */
export async function readAccountAccess(userId?: string, client = supabase): Promise<AccountAccess> {
  if (!userId) return { ...NO_ACCOUNT_ACCESS };
  try {
    const { data, error } = await client.from('profiles')
      .select('id, is_admin, is_pro, expires_at').eq('id', userId).maybeSingle();
    if (error || data?.id !== userId) return { ...NO_ACCOUNT_ACCESS };
    const isAdmin = data.is_admin === true;
    return {
      role: isAdmin ? 'admin' : 'user',
      is_admin: isAdmin,
      isPro: data.is_pro === true && (!data.expires_at || Date.parse(data.expires_at) > Date.now()),
      expires_at: data.expires_at || null
    };
  } catch {
    return { ...NO_ACCOUNT_ACCESS };
  }
}
