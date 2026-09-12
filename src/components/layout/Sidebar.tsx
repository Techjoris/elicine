import React, { useState, useEffect } from 'react';
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
  Tv,
  PanelLeftClose,
  Plus,
  X,
  LogIn,
  Settings,
  Download
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ActiveView } from '../../types';
import { ElicineLogo } from '../ElicineLogo';
import { LanguageSelector } from '../LanguageSelector';
import { InstallModal } from '../modals/InstallModal';

export interface SidebarProps {
  onGoHome?: () => void;
  onOpenDevModal?: () => void;
  onOpenSupport?: () => void;
  onOpenTip?: () => void;
  onOpenSettings?: () => void;
  onNavigateTerms?: (section?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  onGoHome, 
  onOpenDevModal, 
  onOpenSupport,
  onOpenTip,
  onOpenSettings,
  onNavigateTerms 
}) => {
  const { user } = useAuth();
  const {
    user: appUser,
    activeView,
    setActiveView,
    searchHistory,
    clearHistory,
    watchlist,
    quota,
    showToast,
    setIsProModalOpen,
    setIsAuthModalOpen,
    setIsTipModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const handleOpenTip = onOpenTip || onOpenSupport || (() => setIsTipModalOpen(true));
  const handleOpenSettings = onOpenSettings || (() => setIsSettingsModalOpen(true));
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any)?.standalone === true;
    return Boolean(isDisplayStandalone || isIosStandalone);
  });

  useEffect(() => {
    const checkStandalone = () => {
      if (typeof window === 'undefined') return false;
      const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIosStandalone = (window.navigator as any)?.standalone === true;
      return Boolean(isDisplayStandalone || isIosStandalone);
    };

    setIsStandalone(checkStandalone());

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsStandalone(true);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleDisplayModeChange);
    }

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
        console.warn('Erreur prompt installation PWA native (Sidebar) :', err);
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
    // (iOS Safari, Firefox, etc.) -> ouvrir modale
    setIsInstallModalOpen(true);
  };

  const SHOW_DEV_PANEL = (import.meta as any).env?.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('elicine_show_dev') === 'true');

  const navItems = [
    { id: 'home' as ActiveView, label: 'Accueil', icon: Home, count: null },
    { id: 'trending' as ActiveView, label: 'Tendances', icon: Flame, count: null },
    { id: 'catalog' as ActiveView, label: 'Catalogue & Genres', icon: Disc, count: null },
    { id: 'platforms' as ActiveView, label: 'Streaming', icon: Tv, count: null },
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
            className="cursor-pointer hover:opacity-90 transition-opacity select-none text-slate-900 dark:text-white"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="md" variant="full" />
          </div>

          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Masquer la barre latérale"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Action Button: + Nouvelle Recherche IA */}
        <button
          onClick={handleNewAiSearch}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-bold text-xs transition-all flex items-center justify-center gap-2 select-none shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Nouvelle Recherche</span>
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group cursor-pointer ${
                  isActive
                    ? 'bg-slate-200/80 dark:bg-white/[0.08] text-slate-900 dark:text-white border border-slate-300/80 dark:border-white/15 font-bold'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[#e50914]' : 'text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300'}`} />
                  <span>{item.label}</span>
                </div>

                {item.count !== null && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-white/10">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Section HISTORIQUE IA */}
        <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
              Historique
            </span>
            {searchHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[10px] font-medium text-slate-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                Vider
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {searchHistory.length === 0 ? (
              <p className="px-1 text-xs text-slate-400 dark:text-zinc-500 italic">Aucune recherche récente</p>
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
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer transition-colors truncate"
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
      <div className="space-y-2.5 pt-3 border-t border-slate-200/80 dark:border-white/[0.08]">
        
        {/* Quota Badge */}
        <div 
          onClick={() => setIsProModalOpen(true)}
          title="Pass Pro : Quotas IA illimités, filtres avancés & alertes personnalisées"
          className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex items-center justify-between cursor-pointer hover:border-slate-300 dark:hover:border-white/20 transition-all"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Crédits IA</span>
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 bg-slate-200 dark:bg-white/[0.08] border border-slate-300 dark:border-white/10 px-2 py-0.5 rounded-full">
            Illimité
          </span>
        </div>

        {/* Bouton Soutenir le projet (Don unifié) */}
        <button
          type="button"
          onClick={() => {
            handleOpenTip();
            setIsMobileMenuOpen(false);
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.03] hover:bg-slate-200 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] transition-all cursor-pointer select-none"
          title="Soutenir le projet Éliciné"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">☕</span>
            <span>Soutenir le projet</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold bg-slate-200 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
            Don
          </span>
        </button>

        {/* Bouton Installer l'application (Masqué si l'application est déjà installée en mode autonome) */}
        {!isStandalone && (
          <button
            type="button"
            onClick={() => {
              handleInstallClick();
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.03] hover:bg-slate-200 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] transition-all cursor-pointer select-none group"
            title="Installer l'application Éliciné sur cet appareil"
          >
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
              <span>Installer l'application</span>
            </div>
            <span className="text-[10px] text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">
              PWA
            </span>
          </button>
        )}

        {/* Bouton Paramètres (Accès direct, visible et permanent) */}
        <button
          type="button"
          onClick={() => {
            handleOpenSettings();
            setIsMobileMenuOpen(false);
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.03] hover:bg-slate-200 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] transition-all cursor-pointer select-none group"
          title="Paramètres de visionnage & préférences"
          aria-label="Ouvrir les paramètres"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
            <span>Paramètres</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold bg-slate-200 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
            Options
          </span>
        </button>

        {/* Sélecteur de langue (accessible dans le menu tiroir mobile) */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
          <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Langue</span>
          <LanguageSelector compact={true} />
        </div>

        {/* Carte Profil Utilisateur Connecté */}
        {(() => {
          const activeUser = user || appUser;
          const isConnected = Boolean(activeUser && (activeUser.email || activeUser.id));

          if (isConnected) {
            return (
              <div 
                onClick={() => {
                  setIsAuthModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.03] hover:bg-slate-200 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 cursor-pointer transition-all flex items-center justify-between group select-none"
                title="Gérer mon profil"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Round Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-sm ${
                    (activeUser as any)?.isPro
                      ? 'bg-amber-400 text-black ring-1 ring-amber-400/50'
                      : 'bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-white border border-slate-300 dark:border-white/10'
                  }`}>
                    {(activeUser as any)?.user_metadata?.full_name 
                      ? (activeUser as any).user_metadata.full_name.slice(0, 2).toUpperCase() 
                      : (activeUser.email ? activeUser.email.slice(0, 2).toUpperCase() : 'EC')}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-slate-700 dark:group-hover:text-zinc-200 transition-colors">
                      {(activeUser as any)?.user_metadata?.full_name || activeUser.email || (activeUser as any)?.name || 'Cinéphile'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">
                      {activeUser.email}
                    </span>
                  </div>
                </div>

                {/* Badge */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 flex-shrink-0 ${
                  (activeUser as any)?.isPro
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 border border-slate-300 dark:border-white/10'
                }`}>
                  {(activeUser as any)?.isPro && <Crown className="w-2.5 h-2.5" />}
                  {(activeUser as any)?.isPro ? 'Pro' : 'Gratuit'}
                </span>
              </div>
            );
          }

          return (
            <div className="md:hidden pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsAuthModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-bold transition-all cursor-pointer select-none"
              >
                <LogIn className="w-3.5 h-3.5 text-current" />
                <span>Se connecter</span>
              </button>
            </div>
          );
        })()}

        {/* CONTRÔLE VISIBILITÉ DEV */}
        {SHOW_DEV_PANEL && (
          <button
            type="button"
            onClick={() => {
              if (onOpenDevModal) onOpenDevModal();
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-xl bg-slate-100 dark:bg-white/[0.02] hover:bg-slate-200 dark:hover:bg-white/[0.05] border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 text-xs font-medium transition-all cursor-pointer select-none"
          >
            <span>🛠️</span>
            <span>Console Développeur</span>
            <span className="ml-auto text-[9px] bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-700 dark:text-zinc-300 font-bold">DEV</span>
          </button>
        )}

        {/* Lien discret Conditions & Confidentialité */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => {
              if (onNavigateTerms) {
                onNavigateTerms();
              } else {
                setActiveView('terms');
              }
              setIsMobileMenuOpen(false);
            }}
            className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer select-none"
          >
            Conditions &amp; Confidentialité
          </button>
        </div>

      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="w-64 flex-shrink-0 hidden md:flex flex-col border-r border-slate-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-2xl p-4 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto transition-colors">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          <div 
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm"
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-[#0a0a0a] border-r border-slate-200/80 dark:border-white/[0.08] p-4 z-10 overflow-y-auto shadow-2xl transition-colors">
            {sidebarBody}
          </div>
        </div>
      )}

      {/* Modale d'aide contextuelle pour l'installation manuelle PWA */}
      <InstallModal 
        isOpen={isInstallModalOpen} 
        onClose={() => setIsInstallModalOpen(false)} 
      />
    </>
  );
};
