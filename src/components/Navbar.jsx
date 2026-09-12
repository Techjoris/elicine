import { useState, useEffect } from 'react';
import { LogIn, Download, Coffee, Globe, Menu } from 'lucide-react';
import InstallModal from './modals/InstallModal';

export default function Navbar({ onOpenTip, onOpenSettings, onLogin, onToggleMenu }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Détection d'environnement : Vérifie si l'application est exécutée en mode autonome (standalone / PWA installée)
    const checkStandalone = () => {
      if (typeof window === 'undefined') return false;
      const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIosStandalone = window.navigator?.standalone === true;
      return Boolean(isDisplayStandalone || isIosStandalone);
    };

    setIsStandalone(checkStandalone());

    // Écoute dynamique du changement de mode d'affichage
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e) => {
      if (e.matches) {
        setIsStandalone(true);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    // Vérifie si le prompt natif a déjà été intercepté au niveau de la page
    if (typeof window !== 'undefined' && window.deferredPWAInstallPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
    }

    // 2. Événement natif d'installation PWA (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (typeof window !== 'undefined') {
        window.deferredPWAInstallPrompt = e;
      }
    };

    const handlePromptReady = () => {
      if (typeof window !== 'undefined' && window.deferredPWAInstallPrompt) {
        setDeferredPrompt(window.deferredPWAInstallPrompt);
      }
    };

    // 3. Événement appinstalled : masquer immédiatement le bouton après installation
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowInstallModal(false);
      if (typeof window !== 'undefined') {
        window.deferredPWAInstallPrompt = null;
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-install-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // 1. Vérification immédiate si deferredPrompt est disponible
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.deferredPWAInstallPrompt : null);

    // 2. Si disponible (cas de Chrome/Android natif), déclencher instantanément la boîte de dialogue native en 1 clic
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch (err) {
        console.warn('Erreur prompt installation PWA native, ouverture modale de secours :', err);
        setShowInstallModal(true);
      } finally {
        setDeferredPrompt(null);
        if (typeof window !== 'undefined') {
          window.deferredPWAInstallPrompt = null;
        }
      }
      return;
    }

    // 3. Uniquement si deferredPrompt est absent (iOS Safari ou navigateurs incompatibles) : ouvrir modale explicative
    setShowInstallModal(true);
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 bg-black text-white border-b border-zinc-800">
        {/* Menu burger / Logo */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={onToggleMenu}
            className="p-1 text-zinc-400 hover:text-white transition cursor-pointer"
            type="button"
            aria-label="Menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center space-x-1.5 font-bold text-lg cursor-pointer select-none">
            <span className="bg-red-600 px-1.5 py-0.5 rounded text-white text-xs font-black">É</span>
            <span>Éliciné</span>
          </div>
        </div>

        {/* Actions de droite (Soutenir, Installer, Langue, Connexion) */}
        <div className="flex items-center space-x-2">
          {/* Bouton Soutenir (masqué sur très petit écran ou réduit) */}
          <a 
            href="/soutenir" 
            onClick={(e) => {
              if (onOpenTip) {
                e.preventDefault();
                onOpenTip();
              }
            }}
            className="hidden sm:flex items-center space-x-1 text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-zinc-700 text-zinc-200 transition"
          >
            <Coffee size={14} className="text-amber-500" />
            <span>Soutenir</span>
          </a>

          {/* Bouton Installer PWA : Masqué dynamiquement en mode autonome (standalone) */}
          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex items-center space-x-1 text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-zinc-700 text-zinc-200 transition cursor-pointer"
              title="Installer l'application"
              type="button"
              aria-label="Installer l'application"
            >
              <Download size={14} className="text-red-500" />
              <span className="hidden md:inline">Installer</span>
            </button>
          )}

          {/* Sélecteur de langue compact */}
          <button 
            type="button"
            className="flex items-center space-x-1 text-xs bg-zinc-800 px-2 py-1.5 rounded-full border border-zinc-700 text-zinc-200"
          >
            <Globe size={14} />
            <span>FR</span>
          </button>

          {/* Bouton Connexion */}
          <a
            href="/login"
            onClick={(e) => {
              if (onLogin) {
                e.preventDefault();
                onLogin();
              }
            }}
            className="flex items-center justify-center bg-white text-black hover:bg-zinc-200 px-3 py-1.5 rounded-full text-xs font-semibold transition"
          >
            <LogIn size={14} className="sm:mr-1.5" />
            <span className="hidden sm:inline">Connexion</span>
          </a>
        </div>
      </header>

      {/* Modale d'aide universelle pour l'installation manuelle (iOS Safari / Android / Desktop) */}
      <InstallModal 
        isOpen={showInstallModal} 
        onClose={() => setShowInstallModal(false)} 
      />
    </>
  );
}
