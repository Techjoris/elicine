import { createClient } from '@supabase/supabase-js';

// Configuration Supabase officielle
export const SUPABASE_URL = 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

export const SUPABASE_ANON_KEY = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  '<COLLE_ICI_TA_CLE_ANON>';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_ANON_KEY && 
    SUPABASE_ANON_KEY !== '<COLLE_ICI_TA_CLE_ANON>' &&
    SUPABASE_ANON_KEY.length > 20
  );
};

// Client Supabase avec persistance automatique de session (LocalStorage / PWA mobile)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'elicine-supabase-auth'
  }
});

/**
 * Déclenchement standard de l'authentification Google OAuth
 */
export async function signInWithGoogle(redirectTo?: string) {
  const targetRedirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
  
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: targetRedirect,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });
}
