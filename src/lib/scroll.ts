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

/**
 * Hauteur de l'en-tête collant. Une section visée pile en haut de la fenêtre
 * passerait dessous : on laisse donc toujours cette marge.
 */
export const STICKY_HEADER_HEIGHT_PX = 56;
/** Marge de confort entre l'en-tête et le titre de la section visée. */
export const SECTION_TOP_MARGIN_PX = 12;

function scrollWindowTo(top: number, smooth: boolean): void {
  try {
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    window.scrollTo(0, top);
  }
}

/** Position de défilement qui amène l'élément juste sous l'en-tête. */
export function offsetTopFor(element: Element): number {
  const rect = element.getBoundingClientRect();
  return Math.max(
    0,
    (window.scrollY || 0) + rect.top - STICKY_HEADER_HEIGHT_PX - SECTION_TOP_MARGIN_PX
  );
}

/**
 * Se rend sur une section qui n'existe pas encore forcément dans la page.
 *
 * Les résultats d'une recherche apparaissent après le clic : viser la page au
 * moment où la recherche se termine faisait atterrir l'utilisateur sur la
 * section suivante (les tendances), et il devait remonter à la main pour lire
 * ses résultats. On attend donc que la section soit mesurable, on s'y place,
 * puis on recale une dernière fois le temps que les affiches se chargent.
 */
export function scrollToSectionWhenReady(
  elementId: string,
  { timeoutMs = 3000, settleMs = 500 }: { timeoutMs?: number; settleMs?: number } = {}
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const startedAt = Date.now();

  const settle = (element: Element) => {
    const drift = Math.round(offsetTopFor(element) - (window.scrollY || 0));
    // Les images chargées ont déplacé la mise en page : on recale sans animation,
    // pour ne jamais laisser l'utilisateur ailleurs que sur ses résultats.
    if (Math.abs(drift) < 24) return;
    scrollWindowTo(offsetTopFor(element), false);
  };

  const attempt = () => {
    const element = document.getElementById(elementId);
    const usable = Boolean(element && element.getBoundingClientRect().height > 0);

    if (element && usable) {
      const target = offsetTopFor(element);
      scrollWindowTo(target, shouldScrollSmoothly({
        distance: target - (window.scrollY || 0),
        viewportWidth: window.innerWidth || 0,
        reducedMotion: prefersReducedMotion()
      }));
      window.setTimeout(() => settle(element), settleMs);
      return;
    }

    if (Date.now() - startedAt < timeoutMs) {
      window.requestAnimationFrame(attempt);
    }
  };

  attempt();
}

export default scrollToElement;
