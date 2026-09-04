import React from 'react';
import { 
  Home, 
  Flame, 
  Disc, 
  Heart, 
  Sparkles, 
  Trash2, 
  Crown, 
  Zap, 
  Film, 
  PanelLeftClose,
  Plus,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ActiveView } from '../../types';
import { ElicineLogo } from '../ElicineLogo';
import { InstallAppButton } from '../InstallAppButton';

export interface SidebarProps {
  onGoHome?: () => void;
  onOpenDevModal?: () => void;
  onOpenSupport?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onGoHome, onOpenDevModal, onOpenSupport }) => {
  const {
    activeView,
    setActiveView,
    searchHistory,
    clearHistory,
    watchlist,
    user,
    quota,
    showToast,
    setIsProModalOpen,
    setIsAuthModalOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const SHOW_DEV_PANEL = (import.meta as any).env?.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('elicine_show_dev') === 'true');

  const navItems = [
    { id: 'home' as ActiveView, label: 'Accueil', icon: Home, count: null },
    { id: 'trending' as ActiveView, label: 'Tendances', icon: Flame, count: null },
    { id: 'catalog' as ActiveView, label: 'Catalogue & Genres', icon: Disc, count: null },
    { id: 'watchlist' as ActiveView, label: 'Ma Liste', icon: Heart, count: watchlist.length > 0 ? watchlist.length : null },
  ];

  const handleNavClick = (view: ActiveView) => {
    if (view === 'home' && onGoHome) {
      onGoHome();
    } else {
      setActiveView(view);
    }
    setIsMobileMenuOpen(false);
  };

  const handleNewAiSearch = () => {
    setActiveView('home');
    setIsMobileMenuOpen(false);
    // Scroll to search bar smoothly
    const el = document.getElementById('main-ai-search');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      el.focus();
    }
  };

  const sidebarBody = (
    <div className="flex flex-col justify-between h-full space-y-6">
      
      {/* Top Section */}
      <div className="space-y-5">
        
        {/* Header inside sidebar: Logo + Collapse Icon */}
        <div className="flex items-center justify-between px-1">
          <div 
            onClick={() => handleNavClick('home')}
            className="cursor-pointer hover:opacity-90 transition-opacity select-none"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="md" variant="full" />
          </div>

          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Masquer la barre latérale"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Action Button: + Nouvelle Recherche IA (Bright Blue Full Width Pill) */}
        <button
          onClick={handleNewAiSearch}
          className="w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-blue-600 via-[#2563eb] to-[#0ea5e9] hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs shadow-neon-blue hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Nouvelle Recherche IA</span>
        </button>

        {/* Menu Navigation */}
        <nav className="space-y-1 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                  isActive
                    ? 'bg-blue-600/20 text-[#0ea5e9] border border-blue-500/30 font-bold shadow-neon-blue'
                    : 'text-slate-300 hover:bg-[#0f141f] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[#0ea5e9]' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  <span>{item.label}</span>
                </div>

                {item.count !== null && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-cyan-300 border border-blue-500/30">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Section HISTORIQUE IA */}
        <div className="pt-4 border-t border-[#1e293b]/80 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              HISTORIQUE IA
            </span>
            {searchHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[11px] font-medium text-slate-500 hover:text-red-400 transition-colors"
              >
                Vider
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {searchHistory.length === 0 ? (
              <p className="px-1 text-xs text-slate-500 italic">Aucune recherche récente</p>
            ) : (
              searchHistory.map((item) => {
                const formattedQuery = item.query.startsWith('#') ? item.query : `# ${item.query}`;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      handleNavClick('home');
                      showToast(`Recherche : "${item.query}"`);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-cyan-300 hover:bg-[#0f141f] cursor-pointer transition-colors truncate"
                    title={item.query}
                  >
                    {formattedQuery}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Bottom Section: Quota & User Profile */}
      <div className="space-y-2.5 pt-3 border-t border-[#1e293b]">
        
        {/* Quota Badge */}
        <div 
          onClick={() => setIsProModalOpen(true)}
          className="p-2.5 rounded-xl bg-[#0f141f] border border-[#1e293b] flex items-center justify-between cursor-pointer hover:border-amber-500/40 transition-all"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-slate-300">Crédits IA</span>
          </div>
          <span className="text-xs font-black text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
            ⚡ {user?.isPro ? 'Illimité' : `${quota.remaining}/3 recherches`}
          </span>
        </div>

        {/* Bouton Installer l'application (PWA) */}
        <InstallAppButton className="w-full justify-between py-2" />

        {/* Bouton Soutenir le projet (PayPal) */}
        <button
          type="button"
          onClick={() => {
            if (onOpenSupport) onOpenSupport();
            setIsMobileMenuOpen(false);
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer select-none"
          title="Faire un don via PayPal"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">☕</span>
            <span>Soutenir le projet</span>
          </div>
          <span className="text-[10px] text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
            PayPal
          </span>
        </button>

        {/* User Profile Card */}
        <div 
          onClick={() => setIsAuthModalOpen(true)}
          className="p-2.5 rounded-2xl bg-[#0f141f] hover:bg-slate-850 border border-[#1e293b] cursor-pointer transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Round Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-sm ${
              user?.isPro
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 ring-1 ring-amber-400/50'
                : 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white'
            }`}>
              {user?.name 
                ? user.name.slice(0, 2).toUpperCase() 
                : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'ÉC')}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-white truncate">
                {user?.name || 'Cinéphile'}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                {user?.email || 'invite@elicine.app'}
              </span>
            </div>
          </div>

          {/* Gold Badge 👑 Pro */}
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-black flex items-center gap-1 flex-shrink-0 shadow-neon-gold">
            <Crown className="w-2.5 h-2.5" />
            {user?.isPro ? 'Pro' : 'Gratuit'}
          </span>
        </div>

        {/* CONTRÔLE VISIBILITÉ DEV : Mettre à false lors de la mise en production */}
        {SHOW_DEV_PANEL && (
          <button
            type="button"
            onClick={() => {
              if (onOpenDevModal) onOpenDevModal();
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-semibold transition-all cursor-pointer select-none"
          >
            <span>🛠️</span>
            <span>Console Développeur</span>
            <span className="ml-auto text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-400 font-bold">DEV</span>
          </button>
        )}

      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="w-64 flex-shrink-0 hidden md:flex flex-col border-r border-[#1e293b] bg-[#07090e]/95 backdrop-blur-2xl p-4 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          <div 
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-[#07090e] border-r border-[#1e293b] p-4 z-10 overflow-y-auto shadow-2xl">
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
};
