/**
 * Rappel d'installation pour les visiteurs mobiles qui n'ont pas l'application.
 *
 * Le rappel est volontairement discret : il ne s'affiche que sur mobile, jamais
 * quand Éliciné est déjà installée, au plus une fois par heure, et il s'efface
 * tout seul. Une reconnexion le déclenche sans attendre l'heure écoulée.
 */

export const INSTALL_NUDGE_COOLDOWN_MS = 60 * 60 * 1000;
/** Durée d'affichage demandée : deux secondes, puis disparition. */
export const INSTALL_NUDGE_DURATION_MS = 2000;
/** En dessous de cette largeur, l'appareil est traité comme un téléphone. */
export const MOBILE_VIEWPORT_MAX = 820;

export function isMobileEnvironment(userAgent = '', viewportWidth = 0): boolean {
  const ua = String(userAgent || '');
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return Number(viewportWidth) > 0 && Number(viewportWidth) <= MOBILE_VIEWPORT_MAX;
}

export interface InstallNudgeContext {
  now: number;
  /** Horodatage du dernier rappel affiché, ou null. */
  lastShownAt: number | null;
  isMobile: boolean;
  isInstalled: boolean;
  /** Une reconnexion force le rappel sans attendre la fin du délai. */
  force?: boolean;
}

export function shouldShowInstallNudge({
  now, lastShownAt, isMobile, isInstalled, force = false
}: InstallNudgeContext): boolean {
  if (!isMobile || isInstalled) return false;
  if (force) return true;
  // Aucun rappel enregistré : première visite mobile, on affiche tout de suite.
  if (lastShownAt === null || lastShownAt === undefined) return true;
  if (!Number.isFinite(Number(lastShownAt))) return true;
  return now - Number(lastShownAt) >= INSTALL_NUDGE_COOLDOWN_MS;
}
