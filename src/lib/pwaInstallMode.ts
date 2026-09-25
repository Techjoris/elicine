/**
 * Comment proposer l'installation d'Éliciné selon l'appareil.
 *
 * Trois cas, dans cet ordre :
 *  - `native` : le navigateur a annoncé pouvoir installer l'application ; un
 *    seul bouton suffit et l'installation se fait sans quitter la page ;
 *  - `share`  : iOS n'expose aucune installation programmatique ; la feuille de
 *    partage du système contient « Sur l'écran d'accueil », ce qui reste la
 *    voie la plus courte ;
 *  - `guide`  : les navigateurs sans installation (Firefox notamment) n'ont que
 *    des étapes manuelles.
 */

export type PwaInstallMode = 'native' | 'share' | 'guide';

export interface PwaInstallEnvironment {
  /** Le navigateur a-t-il émis `beforeinstallprompt` ? */
  hasNativePrompt: boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** iOS et iPadOS, y compris l'iPad qui se déclare « MacIntel » mais est tactile. */
export function isIosEnvironment(userAgent = '', platform = '', maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return platform === 'MacIntel' && Number(maxTouchPoints) > 1;
}

export function pwaInstallMode({
  hasNativePrompt,
  userAgent = '',
  platform = '',
  maxTouchPoints = 0
}: PwaInstallEnvironment): PwaInstallMode {
  if (hasNativePrompt) return 'native';
  return isIosEnvironment(userAgent, platform, maxTouchPoints) ? 'share' : 'guide';
}
