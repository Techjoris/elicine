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
}

export const Header: React.FC<HeaderProps> = ({ onGoHome, onOpenSettings }) => {
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

  return (
    <div className="sticky top-0 z-40 w-full flex flex-col">
      {/* Main Top Navbar - Ultra Épurée */}
      <header className="h-16 w-full flex items-center justify-between md:justify-end px-4 sm:px-6 lg:px-8 bg-white/80 dark:bg-transparent backdrop-blur-md border-b border-slate-200/60 dark:border-transparent relative z-30 transition-all">
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

          {/* Sélecteur de langue compact (FR / EN / ES) */}
          <LanguageSelector />

          {/* Profil Utilisateur / Menu avec Paramètres */}
          <ProfileMenu
            onOpenSettings={handleOpenSettings}
            onOpenPro={() => setIsProModalOpen(true)}
            onOpenTip={() => setIsTipModalOpen(true)}
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
