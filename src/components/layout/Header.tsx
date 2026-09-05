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
      {/* Main Top Navbar - Ultra Épurée & Compacte */}
      <header className="sticky top-0 z-50 w-full h-14 px-3 sm:px-6 flex items-center justify-between backdrop-blur-xl bg-white/90 dark:bg-zinc-950/85 border-b border-slate-200/80 dark:border-white/10 transition-colors">
        {/* ZONE GAUCHE: Burger + Logo */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer select-none"
            title="Menu"
            aria-label="Ouvrir le menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div 
            onClick={onGoHome || (() => setActiveView('home'))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity select-none"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="sm" />
          </div>
        </div>

        {/* ZONE DROITE: Actions compactes */}
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {/* Bouton d'installation (masqué sur mobile pour éviter l'encombrement, présent dans la sidebar) */}
          <div className="hidden md:flex flex-shrink-0">
            <InstallAppButton variant="header" />
          </div>

          {/* Bouton Soutenir Responsive */}
          <button
            type="button"
            onClick={handleOpenTip}
            className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-medium text-xs shadow-sm hover:bg-amber-500/25 active:scale-95 transition-all cursor-pointer select-none flex-shrink-0 whitespace-nowrap"
            title="Soutenir le projet Éliciné (Pourboire)"
            aria-label="Soutenir le projet"
          >
            <span className="text-sm leading-none">☕</span>
            <span className="text-[11px] sm:text-xs font-semibold">Soutenir</span>
          </button>

          {/* Sélecteur de langue compact */}
          <div className="flex-shrink-0">
            <LanguageSelector compact={true} />
          </div>

          {/* Profil Avatar */}
          <div className="flex-shrink-0">
            <ProfileMenu
              onOpenSettings={handleOpenSettings}
              onOpenPro={() => setIsProModalOpen(true)}
            />
          </div>

          {/* Connexion rapide pour visiteurs sur grand écran */}
          {!user && (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-indigo-500/15 hover:from-cyan-500/25 hover:to-indigo-500/25 text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-white border border-cyan-500/40 hover:border-cyan-400 text-xs font-bold transition-all cursor-pointer shadow-sm select-none"
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
