import React, { useState, useEffect } from 'react';
import { Menu, X, LogIn, Download, Coffee } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { LanguageSelector } from '../LanguageSelector';
import { ProfileMenu } from './ProfileMenu';
import { InstallModal } from '../modals/InstallModal';

interface HeaderProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTip?: () => void;
  onOpenInstallModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onGoHome, 
  onOpenSettings, 
  onOpenTip,
  onOpenInstallModal
}) => {
  const { user } = useAuth();
  const {
    user: appUser,
    setIsAuthModalOpen,
    setIsProModalOpen,
    setIsTipModalOpen,
    setActiveView,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const activeUser = user || appUser;
  const isConnected = Boolean(activeUser && (activeUser.email || activeUser.id));

  const handleOpenTip = onOpenTip || (() => setIsTipModalOpen(true));

  // Gestion PWA : prompt natif direct & modale de guidage manuel
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Détection d'environnement : Vérifie si l'application est exécutée en mode autonome (standalone / PWA installée)
    const checkStandalone = () => {
      if (typeof window === 'undefined') return false;
      const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIosStandalone = (window.navigator as any)?.standalone === true;
      return Boolean(isDisplayStandalone || isIosStandalone);
    };

    setIsStandalone(checkStandalone());

    // Écoute dynamique du changement de mode d'affichage
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsStandalone(true);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleDisplayModeChange);
    }

    // Vérifie si le prompt a déjà été intercepté
    if (typeof window !== 'undefined' && ((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt)) {
      setDeferredPrompt((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt);
    }

    // Écoute de l'événement natif d'installation PWA
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (typeof window !== 'undefined') {
        (window as any).deferredPrompt = e;
        (window as any).deferredPWAInstallPrompt = e;
      }
    };

    const handlePromptReady = () => {
      if (typeof window !== 'undefined' && ((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt)) {
        setDeferredPrompt((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setIsInstallModalOpen(false);
      if (typeof window !== 'undefined') {
        (window as any).deferredPrompt = null;
        (window as any).deferredPWAInstallPrompt = null;
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-install-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if ((mediaQuery as any).removeListener) {
        (mediaQuery as any).removeListener(handleDisplayModeChange);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // S'assurer que window.deferredPrompt est synchronisé
    if (typeof window !== 'undefined' && !(window as any).deferredPrompt) {
      if (deferredPrompt) {
        (window as any).deferredPrompt = deferredPrompt;
      } else if ((window as any).deferredPWAInstallPrompt) {
        (window as any).deferredPrompt = (window as any).deferredPWAInstallPrompt;
      }
    }

    // Étape 1 & Étape 2 : Vérifier si window.deferredPrompt existe, appeler IMMÉDIATEMENT prompt() sans ouvrir la modale
    if (typeof window !== 'undefined' && (window as any).deferredPrompt) {
      try {
        await (window as any).deferredPrompt.prompt();
        // Étape 3 : Attendre la réponse window.deferredPrompt.userChoice
        const choice = await (window as any).deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch (err) {
        console.warn('Erreur prompt installation PWA native :', err);
      } finally {
        // Vider la variable
        (window as any).deferredPrompt = null;
        (window as any).deferredPWAInstallPrompt = null;
        setDeferredPrompt(null);
      }
      return; // Ne PAS ouvrir la modale
    }

    // Étape 4 : S'il n'existe PAS (iOS Safari ou navigateurs incompatibles) : ouvrir modale explicative
    if (onOpenInstallModal) {
      onOpenInstallModal();
    } else {
      setIsInstallModalOpen(true);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-[60] w-full flex flex-col">
        {/* Barre de navigation principale */}
        <header className="sticky top-0 z-50 w-full h-14 px-3 sm:px-6 flex items-center justify-between backdrop-blur-xl bg-white/90 dark:bg-black/90 border-b border-slate-200/80 dark:border-zinc-800 transition-colors">
          {/* Menu burger / Logo */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1 text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition cursor-pointer"
              title="Menu"
              aria-label="Ouvrir le menu"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div 
              onClick={onGoHome || (() => setActiveView('home'))}
              className="flex items-center space-x-1.5 font-bold text-lg cursor-pointer hover:opacity-90 transition select-none text-black dark:text-white"
              title="Retour à l'accueil"
            >
              <span className="bg-red-600 px-1.5 py-0.5 rounded text-white text-xs font-black">É</span>
              <span>Éliciné</span>
            </div>
          </div>

          {/* Actions de droite (Soutenir, Installer, Langue, Connexion / Profil) */}
          <div className="flex items-center space-x-2">
            {/* Bouton Soutenir (masqué sur très petit écran ou réduit) */}
            <button
              type="button"
              onClick={handleOpenTip}
              className="hidden sm:flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 transition cursor-pointer"
              title="Soutenir"
            >
              <Coffee size={14} className="text-amber-500" />
              <span>Soutenir</span>
            </button>

            {/* Bouton Installer PWA : Masqué dynamiquement en mode autonome (standalone) */}
            {!isStandalone && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 transition cursor-pointer"
                title="Installer l'application"
                aria-label="Installer l'application sur votre appareil"
              >
                <Download size={14} className="text-red-500" />
                <span className="hidden md:inline">Installer</span>
              </button>
            )}

            {/* Sélecteur de langue compact */}
            <div className="flex-shrink-0">
              <LanguageSelector compact={true} />
            </div>

            {/* Bouton Connexion ou Profil si connecté */}
            {isConnected ? (
              <div className="flex-shrink-0">
                <ProfileMenu
                  onOpenPro={() => setIsProModalOpen(true)}
                  onOpenTip={handleOpenTip}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center justify-center bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer shadow-sm"
                title="Connexion"
              >
                <LogIn size={14} className="sm:mr-1.5" />
                <span className="hidden sm:inline">Connexion</span>
              </button>
            )}
          </div>
        </header>
      </div>

      {/* Modale d'aide contextuelle pour l'installation manuelle PWA */}
      <InstallModal 
        isOpen={isInstallModalOpen} 
        onClose={() => setIsInstallModalOpen(false)} 
      />
    </>
  );
};

export default Header;
