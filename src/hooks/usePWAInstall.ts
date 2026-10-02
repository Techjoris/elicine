import { useState, useEffect, useCallback } from 'react';
import { isIosEnvironment } from '../lib/pwaInstallMode';

declare global {
  interface Window {
    deferredPrompt?: any;
    deferredPWAInstallPrompt?: any;
  }
}

// Stockage global du prompt au niveau du module pour persister avant/après le montage
let globalDeferredPrompt: any = null;
let globalIsInstallable = false;
const listeners = new Set<(installable: boolean) => void>();
const promptListeners = new Set<() => void>();

/** Le navigateur a-t-il réellement proposé une installation native ? */
export function hasNativeInstallPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  const fromWindow = (window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt;
  return Boolean(globalDeferredPrompt || fromWindow);
}

/** Prévient dès que le navigateur devient installable (ou ne l'est plus). */
export function subscribeToInstallPrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => { promptListeners.delete(listener); };
}

const notifyPromptListeners = () => promptListeners.forEach(listener => listener());

if (typeof window !== 'undefined') {
  // Capture de l'événement système beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Empêcher l'affichage de la mini-barre native par défaut du navigateur
    e.preventDefault();
    (window as any).deferredPrompt = e;
    (window as any).deferredPWAInstallPrompt = e;
    globalDeferredPrompt = e;
    globalIsInstallable = true;
    notifyPromptListeners();
    window.dispatchEvent(new Event('pwa-install-ready'));
    listeners.forEach((cb) => cb(true));
  });

  // Détection de l'installation terminée
  window.addEventListener('appinstalled', () => {
    console.log("Éliciné a été installée avec succès");
    (window as any).deferredPrompt = null;
    (window as any).deferredPWAInstallPrompt = null;
    globalDeferredPrompt = null;
    globalIsInstallable = false;
    notifyPromptListeners();
    window.dispatchEvent(new Event('pwa-installed'));
    listeners.forEach((cb) => cb(false));
  });
}

export type NativeInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Le prompt doit être lancé pendant le geste utilisateur. Attendre plusieurs
 * secondes l'événement ferait expirer cette activation dans certains navigateurs.
 */
export async function promptNativeInstall(): Promise<NativeInstallOutcome> {
  const event = globalDeferredPrompt
    || (typeof window !== 'undefined' ? ((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt) : null);
  if (!event || typeof event.prompt !== 'function') return 'unavailable';

  try {
    await event.prompt();
  } catch {
    // L'événement n'a pas pu être présenté (activation expirée par exemple) :
    // on le garde pour une prochaine tentative au lieu de le consommer.
    return 'unavailable';
  }

  const choice = await event.userChoice;
  // L'événement est à usage unique : le navigateur en émettra un nouveau si
  // l'installation reste possible.
  if (typeof window !== 'undefined') {
    (window as any).deferredPrompt = null;
    (window as any).deferredPWAInstallPrompt = null;
  }
  globalDeferredPrompt = null;
  globalIsInstallable = false;
  notifyPromptListeners();
  listeners.forEach(cb => cb(false));
  return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

/**
 * iOS n'expose aucune installation programmatique : la seule voie est la
 * feuille de partage, qui contient « Sur l'écran d'accueil ».
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIosEnvironment(navigator.userAgent || '', (navigator as any).platform || '',
    Number((navigator as any).maxTouchPoints) || 0);
}

/**
 * Éliciné est-elle déjà installée sur cet appareil ?
 *
 * Chrome ne repropose plus l'installation d'une application déjà présente, ce
 * qui explique qu'un utilisateur voie les instructions manuelles alors que
 * tout est en règle. `getInstalledRelatedApps` répond à cette question quand le
 * manifeste déclare l'application web comme application liée.
 */
export async function isAppAlreadyInstalled(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (checkIsStandalone()) return true;
  const api = (navigator as any).getInstalledRelatedApps;
  if (typeof api !== 'function') return false;
  try {
    const apps = await api.call(navigator);
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

export interface InstallDiagnostic {
  /** Le navigateur a-t-il annoncé pouvoir installer l'application ? */
  promptReceived: boolean;
  /** L'application est-elle déjà installée sur cet appareil ? */
  alreadyInstalled: boolean;
  /** Un service worker actif contrôle-t-il la page ? */
  serviceWorkerActive: boolean;
  /** La page tourne-t-elle dans l'application installée ? */
  standalone: boolean;
}

/** État réel du navigateur, pour expliquer une installation qui ne se propose pas. */
export async function describeInstallEnvironment(): Promise<InstallDiagnostic> {
  const standalone = checkIsStandalone();
  return {
    promptReceived: hasNativeInstallPrompt(),
    alreadyInstalled: standalone || await isAppAlreadyInstalled(),
    serviceWorkerActive: typeof navigator !== 'undefined'
      && Boolean((navigator as any).serviceWorker?.controller),
    standalone
  };
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isStandaloneMql = hasMatchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any)?.standalone === true;
    const isAndroidApp = typeof document !== 'undefined' && Boolean(document.referrer?.includes('android-app://'));
    return Boolean(isStandaloneMql || isIosStandalone || isAndroidApp);
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());

  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const prompt = (window as any).deferredPWAInstallPrompt || globalDeferredPrompt;
    return !checkIsStandalone() && (globalIsInstallable || Boolean(prompt));
  });

  const [showManualInstallGuide, setShowManualInstallGuide] = useState<boolean>(false);

  useEffect(() => {
    setIsStandalone(checkIsStandalone());

    const updateInstallable = (val: boolean) => {
      setIsInstallable(val && !checkIsStandalone());
    };

    listeners.add(updateInstallable);

    const onInstallReady = () => {
      setIsInstallable(!checkIsStandalone());
    };

    const onInstalled = () => {
      setIsInstallable(false);
      setIsStandalone(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pwa-install-ready', onInstallReady);
      window.addEventListener('pwa-installed', onInstalled);
    }

    // Écouter les changements d'affichage (ex: passage en PWA standalone)
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const mql = window.matchMedia('(display-mode: standalone)');
        const handleMqlChange = (e: MediaQueryListEvent) => {
          setIsStandalone(e.matches);
        };
        mql.addEventListener?.('change', handleMqlChange);
        return () => {
          listeners.delete(updateInstallable);
          if (typeof window !== 'undefined') {
            window.removeEventListener('pwa-install-ready', onInstallReady);
            window.removeEventListener('pwa-installed', onInstalled);
          }
          mql.removeEventListener?.('change', handleMqlChange);
        };
      } catch {
        // Fallback silently if matchMedia listener fails
      }
    }

    return () => {
      listeners.delete(updateInstallable);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pwa-install-ready', onInstallReady);
        window.removeEventListener('pwa-installed', onInstalled);
      }
    };
  }, []);

  const handleInstallClick = useCallback(async (): Promise<boolean> => {
    const outcome = await promptNativeInstall();
    if (outcome === 'unavailable') setShowManualInstallGuide(true);
    return outcome === 'accepted';
  }, []);

  const currentPrompt = (typeof window !== 'undefined' ? ((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt) : null) || globalDeferredPrompt;

  return {
    isInstallable,
    isStandalone,
    showManualInstallGuide,
    setShowManualInstallGuide,
    handleInstallClick,
    deferredPrompt: currentPrompt
  };
}

export default usePWAInstall;
