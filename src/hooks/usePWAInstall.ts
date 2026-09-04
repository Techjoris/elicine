import { useState, useEffect, useCallback } from 'react';

// Stockage global du prompt au niveau du module pour persister avant/après le montage
let globalDeferredPrompt: any = null;
let globalIsInstallable = false;
const listeners = new Set<(installable: boolean) => void>();

if (typeof window !== 'undefined') {
  // Capture de l'événement système beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: any) => {
    // Empêcher l'affichage de la mini-barre native par défaut du navigateur
    e.preventDefault();
    globalDeferredPrompt = e;
    globalIsInstallable = true;
    listeners.forEach((cb) => cb(true));
  });

  // Détection de l'installation terminée
  window.addEventListener('appinstalled', () => {
    console.log("Éliciné a été installée avec succès");
    globalDeferredPrompt = null;
    globalIsInstallable = false;
    listeners.forEach((cb) => cb(false));
  });
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isStandaloneMql = hasMatchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any)?.standalone === true;
    const isAndroidApp = typeof document !== 'undefined' && document.referrer?.includes('android-app://');
    return Boolean(isStandaloneMql || isIosStandalone || isAndroidApp);
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());

  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !checkIsStandalone() && (globalIsInstallable || Boolean(globalDeferredPrompt));
  });

  const [showManualInstallGuide, setShowManualInstallGuide] = useState<boolean>(false);

  useEffect(() => {
    setIsStandalone(checkIsStandalone());

    const updateInstallable = (val: boolean) => {
      setIsInstallable(val && !checkIsStandalone());
    };

    listeners.add(updateInstallable);

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
          mql.removeEventListener?.('change', handleMqlChange);
        };
      } catch {
        // Fallback silently if matchMedia listener fails
      }
    }

    return () => {
      listeners.delete(updateInstallable);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!globalDeferredPrompt) {
      // Cas iOS / Safari ou navigateur ne supportant pas beforeinstallprompt
      // Afficher un petit toast ou une modale explicative
      setShowManualInstallGuide(true);
      return;
    }

    try {
      // Déclencher le prompt natif du navigateur
      globalDeferredPrompt.prompt();
      const { outcome } = await globalDeferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log("Installation acceptée par l'utilisateur");
      }
    } catch (err) {
      console.warn("Erreur déclenchement prompt installation PWA:", err);
    } finally {
      globalDeferredPrompt = null;
      globalIsInstallable = false;
      setIsInstallable(false);
      listeners.forEach((cb) => cb(false));
    }
  }, []);

  return {
    isInstallable,
    isStandalone,
    showManualInstallGuide,
    setShowManualInstallGuide,
    handleInstallClick,
    deferredPrompt: globalDeferredPrompt
  };
}

export default usePWAInstall;