import React, { useState } from 'react';
import { Menu, X, AlertTriangle, LogIn } from 'lucide-react';
import { useApp } from '../../context/AppContext';
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
  const {
    user,
    setIsAuthModalOpen,
    setIsProModalOpen,
    setIsTipModalOpen,
    setActiveView,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handleOpenSettings = onOpenSettings || (() => setIsSettingsOpen(true));
  const handleOpenTip = onOpenTip || (() => setIsTipModalOpen(true));

  return (
    <div className="sticky top-0 z-[60] w-full flex flex-col">
      {/* Main Top Navbar - Ultra Épurée */}
      <header className="h-16 w-full flex items-center justify-between md:justify-end px-4 sm:px-6 lg:px-8 bg-white/95 dark:bg-[#07090e]/95 border-b border-slate-200/80 dark:border-slate-800/40 relative transition-all">
        {/* Mobile-only Controls (Hamburger + Logo when sidebar is hidden) */}
        <div className="flex md:hidden items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-white dark:bg-[#0f141f] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1e293b] cursor-pointer shadow-sm transition-colors"
            title="Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div 
            onClick={onGoHome || (() => setActiveView('home'))}
            className="cursor-pointer hover:opacity-90 transition-opacity select-none"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="sm" />
          </div>
        </div>

        {/* Global Utilities Grouped to the Right */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Bouton d'installation élégant & compact */}
          <InstallAppButton variant="header" />

          {/* Bouton Soutenir le projet (Offrir un café / Don) */}
          <button
            type="button"
            onClick={handleOpenTip}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold whitespace-nowrap shadow-sm shadow-amber-500/10 transition-all cursor-pointer select-none flex-shrink-0"
            title="Soutenir le projet Éliciné (Pourboire)"
            aria-label="Soutenir le projet"
          >
            <span className="text-xs sm:text-sm leading-none select-none" aria-hidden="true">☕</span>
            <span className="inline sm:hidden font-semibold text-xs">Soutenir</span>
            <span className="hidden sm:inline font-semibold text-xs">Offrir un café</span>
          </button>

          {/* Sélecteur de langue compact (FR / EN / ES) */}
          <LanguageSelector />

          {/* Profil Utilisateur / Menu avec Paramètres */}
          <ProfileMenu
            onOpenSettings={handleOpenSettings}
            onOpenPro={() => setIsProModalOpen(true)}
          />

          {!user && (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-indigo-500/15 hover:from-cyan-500/25 hover:to-indigo-500/25 text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-white border border-cyan-500/40 hover:border-cyan-400 text-xs font-bold transition-all cursor-pointer shadow-sm select-none"
              title="Se connecter ou s'inscrire"
            >
              <LogIn className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
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
