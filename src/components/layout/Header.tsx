import React, { useState, useEffect } from 'react';
import { Menu, X, LogIn, Download, Coffee, Heart, Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { useTheme, INSTALL_ONBOARDING_KEY } from '../../context/ThemeContext';
import { LanguageSelector } from '../LanguageSelector';
import { ProfileMenu } from './ProfileMenu';
import { InstallModal } from '../modals/InstallModal';

export { INSTALL_ONBOARDING_KEY };

interface HeaderProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTip?: () => void;
  onOpenInstallModal?: () => void;
}

export const checkIsStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isDisplayFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const isDisplayMinimalUi = window.matchMedia('(display-mode: minimal-ui)').matches;
  const isIosStandalone = (window.navigator as any)?.standalone === true;
  const isAndroidReferrer = typeof document !== 'undefined' && document.referrer.includes('android-app://');
  return Boolean(isDisplayStandalone || isDisplayFullscreen || isDisplayMinimalUi || isIosStandalone || isAndroidReferrer);
};

export const Header: React.FC<HeaderProps> = ({ 
  onGoHome, 
  onOpenSettings, 
  onOpenTip,
  onOpenInstallModal
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { effectiveTheme, toggleTheme, showThemeOnboarding } = useTheme();
  const {
    user: appUser,
    watchlist,
    setIsAuthModalOpen,
    openAuthModal,
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

  // État onboarding d'installation PWA
  const [hasSeenInstallOnboarding, setHasSeenInstallOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(INSTALL_ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const dismissInstallOnboarding = () => {
    try {
      localStorage.setItem(INSTALL_ONBOARDING_KEY, 'true');
    } catch (e) {
      console.error('Erreur sauvegarde onboarding installation:', e);
    }
    setHasSeenInstallOnboarding(true);
  };

  // Condition d'affichage séquentielle :
  // 1. L'application n'est PAS déjà installée (non-standalone)
  // 2. L'utilisateur n'a pas encore cliqué sur le bouton d'installation
  // 3. La popup de thème est FERMÉE (séquentiel : thème d'abord, installation ensuite — jamais les 2 en même temps)
  const showInstallOnboarding = !isStandalone && !hasSeenInstallOnboarding && !showThemeOnboarding;

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
      dismissInstallOnboarding();
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
    // Marquer l'onboarding installation comme vu UNIQUEMENT lors du clic effectif
    dismissInstallOnboarding();

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
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Bouton d'appel à l'action "Soutenir le projet" / "Café" */}
            <button
              type="button"
              onClick={handleOpenTip}
              className="group relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold text-amber-900 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/60 shadow-sm hover:shadow-amber-500/10 active:scale-95 transition-all duration-200 cursor-pointer flex-shrink-0"
              title="Soutenir le projet Éliciné (Offrir un café)"
              aria-label="Soutenir le projet Éliciné"
            >
              <Coffee size={14} className="text-amber-600 dark:text-amber-400 group-hover:rotate-12 transition-transform duration-200 flex-shrink-0" />
              <span className="font-semibold tracking-tight">{t.supportBtn || 'Soutenir'}</span>
              <span className="hidden xl:inline text-amber-600/80 dark:text-amber-400/80 font-normal text-[11px]">le projet</span>
            </button>

            {/* Bouton Installer PWA & Bulle d'Onboarding ancrée (Masqué si PWA déjà installée) */}
            {!isStandalone && (
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  id="header-install-app-btn"
                  onClick={handleInstallClick}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer font-medium ${
                    showInstallOnboarding
                      ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/60 ring-2 ring-red-500/50 shadow-md shadow-red-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200'
                  }`}
                  title="Installer l'application"
                  aria-label="Installer l'application sur votre appareil"
                >
                  <Download size={14} className="text-red-500 flex-shrink-0" />
                  <span>Installer<span className="hidden lg:inline"> l'application</span></span>
                </button>

                {/* Bulle / Tooltip d'Onboarding Installation PWA (Séquentielle : affichée après fermeture du thème) */}
                {showInstallOnboarding && (
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2.5 z-50 w-64 sm:w-72 max-w-[calc(100vw-24px)] pointer-events-auto select-none animate-bounce-subtle"
                    role="tooltip"
                  >
                    {/* Flèche pointant vers le haut vers le bouton installer */}
                    <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rotate-45 bg-slate-950 dark:bg-zinc-900 border-t border-l border-red-500/50" />

                    {/* Corps de la bulle d'onboarding (fermeture au clic sur l'action d'installation) */}
                    <div 
                      onClick={handleInstallClick}
                      className="relative bg-slate-950/95 dark:bg-zinc-900/95 backdrop-blur-xl text-white p-3.5 rounded-2xl border border-red-500/40 shadow-2xl shadow-black/50 text-left cursor-pointer hover:border-red-400 transition-all group"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                          <Download size={14} className="text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                              Application
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                          </div>
                          <p className="text-xs font-semibold text-zinc-100 mt-1 leading-snug">
                            Installer l'application
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed group-hover:text-red-300 transition-colors">
                            Cliquez ici et suivez les instructions pour installer Éliciné sur votre appareil.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* Sélecteur de langue compact */}
            <div className="flex-shrink-0">
              <LanguageSelector compact={true} />
            </div>

            {/* Bouton Thème (Mode Clair / Sombre) & Bulle d'Onboarding ancrée */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                id="header-theme-toggle-btn"
                className={`p-1.5 sm:p-2 rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                  showThemeOnboarding
                    ? 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/60 ring-2 ring-amber-400/50 shadow-md shadow-amber-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={effectiveTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
                aria-label={effectiveTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              >
                {effectiveTheme === 'dark' ? (
                  <Sun size={15} className="text-amber-400 hover:rotate-45 transition-transform duration-300" />
                ) : (
                  <Moon size={15} className="text-slate-700 hover:-rotate-12 transition-transform duration-300" />
                )}
              </button>

              {/* Bulle / Tooltip d'Onboarding au premier chargement (Fermeture STRICTE au clic sur le bouton de thème) */}
              {showThemeOnboarding && (
                <div 
                  className="absolute right-0 top-full mt-2.5 z-50 w-64 sm:w-72 pointer-events-auto select-none animate-bounce-subtle"
                  role="tooltip"
                >
                  {/* Flèche pointant vers le haut vers le bouton thème */}
                  <div className="absolute right-3 -top-1.5 w-3 h-3 rotate-45 bg-slate-950 dark:bg-zinc-900 border-t border-l border-amber-500/50" />

                  {/* Corps de la bulle d'onboarding */}
                  <div 
                    onClick={toggleTheme}
                    className="relative bg-slate-950/95 dark:bg-zinc-900/95 backdrop-blur-xl text-white p-3.5 rounded-2xl border border-amber-500/40 shadow-2xl shadow-black/50 text-left cursor-pointer hover:border-amber-400 transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                        <Moon size={14} className="text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Thème
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        </div>
                        <p className="text-xs font-semibold text-zinc-100 mt-1 leading-snug">
                          Vous préférez le mode sombre ?
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed group-hover:text-amber-300 transition-colors flex items-center gap-1">
                          <span>Cliquez ici pour changer</span>
                          <span className="text-amber-400 font-bold">→</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                onClick={() => openAuthModal('login')}
                className="flex items-center gap-1.5 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer shadow-sm flex-shrink-0"
                title="Se connecter"
              >
                <LogIn size={14} className="flex-shrink-0" />
                <span>Connexion</span>
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
