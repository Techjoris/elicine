import React, { useState } from 'react';
import { Menu, X, AlertTriangle, LogIn } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ElicineLogo } from '../ElicineLogo';
import { LanguageSelector } from '../LanguageSelector';
import { SettingsModal } from '../SettingsModal';
import { ProfileMenu } from './ProfileMenu';
import { InstallAppButton } from '../InstallAppButton';

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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handleOpenSettings = onOpenSettings || (() => setIsSettingsOpen(true));
  const handleOpenTip = onOpenTip || (() => setIsTipModalOpen(true));

  return (
    <div className="sticky top-0 z-[60] w-full flex flex-col">
      {/* Main Top Navbar - Adaptative Clair & Sombre */}
      <header className="sticky top-0 z-50 w-full h-14 px-3 sm:px-6 flex items-center justify-between backdrop-blur-xl bg-white/90 dark:bg-[#0a0a0a]/90 border-b border-slate-200/80 dark:border-white/[0.08] transition-colors">
        {/* ZONE GAUCHE: Burger + Logo */}
        <div className="flex items-center justify-start gap-2 min-w-0 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-700 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer select-none"
            title="Menu"
            aria-label="Ouvrir le menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div 
            onClick={onGoHome || (() => setActiveView('home'))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity select-none text-slate-900 dark:text-white"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="sm" />
          </div>
        </div>

        {/* ZONE DROITE: Actions épurées : [Installer] [☕ Soutenir] [FR] [Profil OU Connexion] */}
        <div className="flex items-center justify-end gap-2 flex-shrink-0">
          {/* 1. Bouton PWA "Installer" */}
          <InstallAppButton variant="header" />

          {/* 2. Bouton Soutenir */}
          <button
            type="button"
            onClick={handleOpenTip}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.08] font-medium text-xs transition-all cursor-pointer select-none flex-shrink-0 whitespace-nowrap"
            title="Soutenir le projet Éliciné"
            aria-label="Soutenir le projet"
          >
            <span className="text-sm leading-none">☕</span>
            <span className="text-xs">Soutenir</span>
          </button>

          {/* 3. Sélecteur de langue compact */}
          <div className="flex-shrink-0">
            <LanguageSelector compact={true} />
          </div>

          {/* 4. Profil si connecté, ou Bouton Connexion */}
          {isConnected ? (
            <div className="flex-shrink-0">
              <ProfileMenu
                onOpenSettings={handleOpenSettings}
                onOpenPro={() => setIsProModalOpen(true)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-bold transition-all cursor-pointer select-none shadow-sm"
              title="Se connecter ou s'inscrire"
            >
              <LogIn className="w-3.5 h-3.5 text-current" />
              <span>Connexion</span>
            </button>
          )}
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Header;
