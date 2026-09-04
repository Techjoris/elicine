import React, { useState } from 'react';
import { Menu, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { InstallAppButton } from '../InstallAppButton';
import { ElicineLogo } from '../ElicineLogo';
import { LanguageSelector } from '../LanguageSelector';
import { SettingsModal } from '../SettingsModal';

interface HeaderProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onGoHome, onOpenSettings }) => {
  const {
    setIsApiSettingsModalOpen,
    hasApiKeysConfigured,
    setActiveView,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handleOpenSettings = onOpenSettings || (() => setIsSettingsOpen(true));

  return (
    <div className="sticky top-0 z-40 w-full flex flex-col">
      {/* ⚠️ Discreet API Keys Missing Banner */}
      {!hasApiKeysConfigured && (
        <div 
          onClick={() => setIsApiSettingsModalOpen(true)}
          className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-semibold text-amber-300 hover:bg-amber-500/20 cursor-pointer transition-all flex items-center justify-center gap-2 select-none"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-pulse" />
          <span>⚠️ Clés API non configurées : Cliquez pour activer la recherche TMDB et IA en direct</span>
        </div>
      )}

      {/* Main Top Navbar - Ultra Épurée */}
      <header className="h-16 w-full flex items-center justify-between md:justify-end px-4 sm:px-6 lg:px-8 bg-transparent backdrop-blur-md relative z-30 transition-all">
        {/* Mobile-only Controls (Hamburger + Logo when sidebar is hidden) */}
        <div className="flex md:hidden items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-[#0f141f] hover:bg-slate-800 text-slate-300 border border-[#1e293b] cursor-pointer"
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
        <div className="flex items-center gap-3">
          {/* Installation PWA avec détection d'OS */}
          <InstallAppButton />

          {/* Sélecteur de langue compact (FR / EN / ES) */}
          <LanguageSelector />

          {/* Bouton Paramètres rapide */}
          <button
            type="button"
            onClick={handleOpenSettings}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all backdrop-blur-md cursor-pointer select-none text-sm"
            title="Paramètres de visionnage"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Header;
