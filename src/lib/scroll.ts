/**
 * Défilement vers un élément sans jamais piéger le geste de l'utilisateur.
 *
 * `scrollIntoView({ behavior: 'smooth' })` démarre une animation native du fil
 * graphique. Sur une page lourde (grille d'affiches) et sur un écran étroit, le
 * déplacement peut durer plusieurs secondes : pendant toute l'animation,
 * Chromium ignore les gestes tactiles, et l'application paraît « figée »,
 * impossible à faire défiler. On réserve donc le défilement doux aux petits
 * déplacements sur grand écran, et on saute directement partout ailleurs.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Au-delà de cette distance, une animation de défilement se remarque trop. */
export const SMOOTH_SCROLL_MAX_DISTANCE_PX = 480;
/** En dessous de cette largeur, l'écran est traité comme celui d'un téléphone. */
export const NARROW_VIEWPORT_MAX = 820;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export interface ScrollTargetOptions {
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
}

/**
 * Décide du comportement de défilement : `true` pour une animation douce,
 * `false` pour un saut immédiat.
 */
export function shouldScrollSmoothly(options: {
  distance: number;
  viewportWidth: number;
  reducedMotion?: boolean;
  force?: ScrollBehavior;
}): boolean {
  const { distance, viewportWidth, reducedMotion = false, force } = options;
  if (force === 'auto') return false;
  if (force === 'smooth') return true;
  if (reducedMotion) return false;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= NARROW_VIEWPORT_MAX) return false;
  return Math.abs(Number(distance) || 0) <= SMOOTH_SCROLL_MAX_DISTANCE_PX;
}

export function scrollToElement(
  element: Element | null | undefined,
  { block = 'start', inline = 'nearest' }: ScrollTargetOptions = {}
): void {
  if (!element || typeof window === 'undefined') return;

  let distance = 0;
  try {
    distance = element.getBoundingClientRect().top;
  } catch {
    distance = 0;
  }

  const smooth = shouldScrollSmoothly({
    distance,
    viewportWidth: window.innerWidth || 0,
    reducedMotion: prefersReducedMotion()
  });

  try {
    element.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block, inline });
  } catch {
    // Navigateurs anciens : la signature objet n'est pas supportée.
    element.scrollIntoView();
  }
}

/**
 * Remontée en haut de page. Le retour instantané est préféré sur mobile : une
 * animation de plusieurs milliers de pixels bloque les gestes pendant tout son
 * déroulement et donne la même impression de gel.
 */
export function scrollToTop(): void {
  if (typeof window === 'undefined') return;
  const smooth = shouldScrollSmoothly({
    distance: window.scrollY || 0,
    viewportWidth: window.innerWidth || 0,
    reducedMotion: prefersReducedMotion()
  });
  try {
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    window.scrollTo(0, 0);
  }
}

export default scrollToElement;
