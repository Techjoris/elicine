import { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';

declare global {
  interface Window {
    deferredPWAInstallPrompt?: any;
  }
}

// Stockage global du prompt au niveau du module pour persister avant/après le montage
let globalDeferredPrompt: any = null;
let globalIsInstallable = false;
const listeners = new Set<(installable: boolean) => void>();

if (typeof window !== 'undefined') {
  // Capture de l'événement système beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Empêcher l'affichage de la mini-barre native par défaut du navigateur
    e.preventDefault();
    (window as any).deferredPWAInstallPrompt = e;
    globalDeferredPrompt = e;
    globalIsInstallable = true;
    window.dispatchEvent(new Event('pwa-install-ready'));
    listeners.forEach((cb) => cb(true));
  });

  // Détection de l'installation terminée
  window.addEventListener('appinstalled', () => {
    console.log("Éliciné a été installée avec succès");
    (window as any).deferredPWAInstallPrompt = null;
    globalDeferredPrompt = null;
    globalIsInstallable = false;
    window.dispatchEvent(new Event('pwa-installed'));
    listeners.forEach((cb) => cb(false));
  });
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isStandaloneMql = hasMatchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any)?.standalone === true;
    const isAndroidApp = typeof document !== 'undefined' && Boolean(document.referrer?.includes('android-app://'));
    const isSourcePwa = typeof window.location !== 'undefined' && Boolean(window.location.search?.includes('source=pwa'));
    return Boolean(isStandaloneMql || isIosStandalone || isAndroidApp || isSourcePwa);
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
    const prompt = (typeof window !== 'undefined' ? (window as any).deferredPWAInstallPrompt : null) || globalDeferredPrompt;

    if (!prompt) {
      // Cas iOS / Safari ou navigateur sans beforeinstallprompt disponible
      setShowManualInstallGuide(true);
      return false;
    }

    try {
      // Déclencher le prompt natif du navigateur
      prompt.prompt();
      const choiceResult = await prompt.userChoice;
      if (choiceResult?.outcome === 'accepted') {
        console.log("Installation acceptée par l'utilisateur !");
        try {
          confetti({
            particleCount: 90,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch {
          // confetti optional
        }
        (window as any).deferredPWAInstallPrompt = null;
        globalDeferredPrompt = null;
        globalIsInstallable = false;
        setIsInstallable(false);
        listeners.forEach((cb) => cb(false));
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Erreur déclenchement prompt installation PWA:", err);
      setShowManualInstallGuide(true);
      return false;
    }
  }, []);

  const currentPrompt = (typeof window !== 'undefined' ? (window as any).deferredPWAInstallPrompt : null) || globalDeferredPrompt;

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