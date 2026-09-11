import React, { useState, useEffect } from 'react';
import { Menu, X, LogIn, Download, Coffee } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ElicineLogo } from '../ElicineLogo';
import { LanguageSelector } from '../LanguageSelector';
import { ProfileMenu } from './ProfileMenu';

interface HeaderProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTip?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onGoHome, onOpenSettings, onOpenTip }) => {
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

  // Gestion de l'installation PWA native
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    // Vérifie si le prompt a déjà été intercepté au niveau global (ex: main.tsx)
    if (typeof window !== 'undefined' && (window as any).deferredPWAInstallPrompt) {
      setDeferredPrompt((window as any).deferredPWAInstallPrompt);
      setShowInstallBtn(true);
    }

    // Écoute l'événement d'installation PWA
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    const handleAppInstalled = () => {
      setShowInstallBtn(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-install-ready', () => {
      if ((window as any).deferredPWAInstallPrompt) {
        setDeferredPrompt((window as any).deferredPWAInstallPrompt);
        setShowInstallBtn(true);
      }
    });
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-install-ready', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? (window as any).deferredPWAInstallPrompt : null);
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
      if (typeof window !== 'undefined') {
        (window as any).deferredPWAInstallPrompt = null;
      }
    }
    setDeferredPrompt(null);
  };

  return (
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

        {/* Actions de droite (Soutenir, Langue, Installer, Connexion) */}
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

          {/* Bouton Installer PWA (apparaît s'il est disponible) */}
          {showInstallBtn && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 transition cursor-pointer"
              title="Installer l'application"
            >
              <Download size={14} className="text-red-500" />
              <span className="hidden md:inline">Installer</span>
            </button>
          )}

          {/* Sélecteur de langue compact */}
          <div className="flex-shrink-0">
            <LanguageSelector compact={true} />
          </div>

          {/* Bouton Connexion (Version compacte sur mobile avec icône, texte sur desktop) ou Profil si connecté */}
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
  );
};

export default Header;
