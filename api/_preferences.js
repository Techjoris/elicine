/**
 * Persistance des préférences utilisateur.
 *
 * Lecture et écriture sont volontairement silencieuses en cas d'échec : la
 * table peut ne pas encore exister (le script SQL se lance à la main), et une
 * panne de personnalisation ne doit jamais empêcher une recherche de répondre.
 * Dans ces cas, on renvoie un profil vide et le moteur retrouve exactement son
 * comportement historique.
 */
import { supabaseServer } from './_security.js';
import {
  emptyPreferenceProfile,
  mergePreferenceSignal,
  readPreferenceProfile
} from '../src/search/preferenceProfile.js';

export const PREFERENCE_TABLE = 'user_preference_profile';

/** Profil enregistré d'un membre, ou un profil vide. */
export async function loadPreferenceProfile(userId) {
  const id = String(userId || '').trim();
  if (!id || !supabaseServer) return emptyPreferenceProfile();
  try {
    const { data, error } = await supabaseServer
      .from(PREFERENCE_TABLE)
      .select('genres, themes, moods, languages, media_types, searches, signals')
      .eq('user_id', id)
      .maybeSingle();
    if (error || !data) return emptyPreferenceProfile();
    return readPreferenceProfile(data);
  } catch {
    return emptyPreferenceProfile();
  }
}

/** Écrit le profil d'un membre (une ligne par compte). */
export async function savePreferenceProfile(userId, profile) {
  const id = String(userId || '').trim();
  if (!id || !supabaseServer || !profile) return null;
  try {
    const { error } = await supabaseServer.from(PREFERENCE_TABLE).upsert({
      user_id: id,
      genres: profile.genres,
      themes: profile.themes,
      moods: profile.moods,
      languages: profile.languages,
      media_types: profile.mediaTypes,
      searches: profile.searches,
      signals: profile.signals,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) return null;
    return profile;
  } catch {
    return null;
  }
}

/** Ajoute une preuve au profil d'un membre et renvoie le profil à jour. */
export async function recordPreferenceSignal(userId, signal) {
  if (!signal) return null;
  const current = await loadPreferenceProfile(userId);
  return savePreferenceProfile(userId, mergePreferenceSignal(current, signal));
}
