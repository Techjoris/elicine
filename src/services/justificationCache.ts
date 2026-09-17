/**
 * Service de mise en cache contextuelle des justifications de recommandation cinématographique.
 * 
 * RÈGLE FONDAMENTALE D'ARCHITECTURE :
 * La justification d'un film dépend de l'INTENTION de la requête (ex: Fight Club n'a pas
 * la même justification selon qu'on cherche "un film à twist" ou "un film sur le consumérisme").
 * 
 * La clé de cache ne doit JAMAIS être movie_id seul, mais obligatoirement le couple :
 * (movie_id + cluster thématique identifié)
 * 
 * Réutilise directement le cluster calculé par THEMATIC_LEXICON_CLUSTERS pour le scoring,
 * sans aucune extraction redondante.
 */

// Cache mémoire vive rapide (0ms)
const inMemoryCache = new Map<string, string>();

/**
 * Construit la clé de cache composite obligatoire : `${movieId}:${clusterId}`
 * Échoue ou retourne null si le movieId ou le clusterId est manquant.
 */
export function buildJustificationCacheKey(
  movieId: string | number | undefined | null, 
  clusterId: string | undefined | null
): string | null {
  if (movieId === undefined || movieId === null || clusterId === undefined || clusterId === null) {
    return null;
  }
  const cleanId = String(movieId).trim();
  const cleanCluster = String(clusterId).trim().toLowerCase();
  if (!cleanId || !cleanCluster) return null;
  return `${cleanId}:${cleanCluster}`;
}

/**
 * Récupère la justification en cache pour un film et son cluster
 */
export function getCachedJustification(
  movieId: string | number | undefined | null, 
  clusterId: string | undefined | null
): string | null {
  const key = buildJustificationCacheKey(movieId, clusterId);
  if (!key) return null;

  // 1. Recherche en mémoire vive
  if (inMemoryCache.has(key)) {
    return inMemoryCache.get(key) || null;
  }

  // 2. Recherche dans le stockage local persistant (navigateur)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(`elicine_justif_${key}`);
      if (stored) {
        inMemoryCache.set(key, stored);
        return stored;
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Enregistre une justification pour le couple (movieId, clusterId)
 */
export function setCachedJustification(
  movieId: string | number | undefined | null, 
  clusterId: string | undefined | null, 
  justification: string
): void {
  const key = buildJustificationCacheKey(movieId, clusterId);
  if (!key || !justification) return;
  const cleanJustif = justification.trim();
  if (!cleanJustif) return;

  inMemoryCache.set(key, cleanJustif);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`elicine_justif_${key}`, cleanJustif);
    } catch (_) {}
  }
}

/**
 * Vérifie l'existence en cache pour le couple (movieId, clusterId)
 */
export function hasCachedJustification(
  movieId: string | number | undefined | null, 
  clusterId: string | undefined | null
): boolean {
  return getCachedJustification(movieId, clusterId) !== null;
}

/**
 * Résout la justification d'un film pour un cluster donné :
 * 1. Vérifie le cache (movieId, clusterId) -> si trouvé, le retourne directement SANS appel LLM
 * 2. Si non trouvé, exécute le callback fetchFn
 * 3. Enregistre la nouvelle justification en cache sous (movieId, clusterId)
 */
export async function resolveOrFetchJustification(
  movieId: string | number,
  clusterId: string | null | undefined,
  fetchFn: () => Promise<string> | string
): Promise<string> {
  if (clusterId) {
    const cached = getCachedJustification(movieId, clusterId);
    if (cached) {
      return cached;
    }
  }

  const generated = await fetchFn();
  if (clusterId && generated) {
    setCachedJustification(movieId, clusterId, generated);
  }

  return generated;
}

/**
 * Vide le cache (utile pour les tests et la maintenance)
 */
export function clearJustificationCache(): void {
  inMemoryCache.clear();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('elicine_justif_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }
}

/**
 * Récupère l'ensemble des entrées en cache mémoire
 */
export function getAllCachedJustifications(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of inMemoryCache.entries()) {
    result[k] = v;
  }
  return result;
}
