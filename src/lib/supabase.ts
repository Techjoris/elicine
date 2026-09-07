import { createClient } from '@supabase/supabase-js';

// Configuration Supabase officielle (Support Vite & Next.js)
const supabaseUrl = 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  (typeof process !== 'undefined' ? (process as any).env?.NEXT_PUBLIC_SUPABASE_URL : undefined) ||
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  (typeof process !== 'undefined' ? (process as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) ||
  '<COLLE_ICI_TA_CLE_ANON>';

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseAnonKey && 
    supabaseAnonKey !== '<COLLE_ICI_TA_CLE_ANON>' &&
    supabaseAnonKey.length > 20
  );
};

// Client Supabase UNIQUE singleton (Support Vite & PWA mobile)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const supabaseClient = supabase;
export default supabase;

/**
 * Déclenchement standard de l'authentification Google OAuth
 */
export async function signInWithGoogle(redirectTo?: string) {
  const targetRedirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
  
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: targetRedirect
    }
  });
}


