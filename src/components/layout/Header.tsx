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

const checkIsStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any)?.standalone === true;
  return Boolean(isDisplayStandalone || isIosStandalone);
};

export const Header: React.FC<HeaderProps> = ({ 
  onGoHome, 
  onOpenSettings, 
  onOpenTip,
  onOpenInstallModal
}) => {
  const { user } = useAuth();
  const {
    user: appUser,
    watchlist,
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

  // Gestion PWA : prompt natif direct & modale de guidage manuel universel
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());

  useEffect(() => {
    setIsStandalone(checkIsStandalone());

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

    // 1. Écoute et stockage de l'événement beforeinstallprompt
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

    // Détection de l'installation terminée
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
    // Récupération de deferredPrompt (variable globale ou état)
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? ((window as any).deferredPrompt || (window as any).deferredPWAInstallPrompt) : null);

    // CONDITION A (Installation native directe) : Si deferredPrompt est présent
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        // Attendre le choix de l'utilisateur
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch (err) {
        console.warn('Erreur lors du prompt d\'installation native :', err);
      } finally {
        // Réinitialiser deferredPrompt = null
        setDeferredPrompt(null);
        if (typeof window !== 'undefined') {
          (window as any).deferredPrompt = null;
          (window as any).deferredPWAInstallPrompt = null;
        }
      }
      // Ne rien afficher d'autre (aucune modale)
      return;
    }

    // CONDITION B (Secours universel / Guide manuel) : Si deferredPrompt n'est PAS disponible
    // (iOS Safari, Firefox, ou si Chrome a déjà consommé/bloqué l'événement) -> ouvrir modale
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
