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

/**
 * Le navigateur peut-il annoncer une installation native, même tardivement ?
 *
 * C'est le cas des navigateurs dérivés de Chromium. Ils n'émettent pas
 * `beforeinstallprompt` au même moment : mesuré sur cette application, Chrome
 * l'annonce vers 7 secondes et Edge vers 13. Tant que ce délai court, il serait
 * faux de dire que le navigateur ne propose pas l'installation.
 */
export function canAwaitNativeInstall(userAgent = ''): boolean {
  if (!userAgent) return false;
  return /Chrome|CriOS|Chromium|Edg|OPR|Opera|Brave|Vivaldi|SamsungBrowser|UCBrowser|MiuiBrowser/i.test(userAgent);
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
