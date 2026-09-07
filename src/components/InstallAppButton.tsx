import React, { useState, useContext } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppContext } from '../context/AppContext';

export interface InstallAppButtonProps {
  className?: string;
  variant?: 'auto' | 'header' | 'sidebar' | 'pill' | 'card' | 'minimal' | 'link';
  showBadge?: boolean;
}

export const detectOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, isDesktop: true };
  }
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isDesktop = !isAndroid && !isIOS;
  return { isIOS, isAndroid, isDesktop };
};

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ 
  className = '', 
  variant = 'header' 
}) => {
  const appContext = useContext(AppContext);
  const {
    isStandalone,
    handleInstallClick,
    deferredPrompt
  } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Masquer uniquement si déjà en mode standalone PWA (application installée)
  if (isStandalone) {
    return null;
  }

  const { isIOS, isAndroid } = detectOS();
  const isSidebarMode = variant === 'sidebar' || variant === 'link';

  const handleDirectInstall = async () => {
    // Si deferredPrompt est disponible (Android/Desktop/Chrome avec prompt ready) :
    if (deferredPrompt) {
      try {
        const installed = await handleInstallClick();
        if (installed && appContext?.showToast) {
          appContext.showToast('🎉 Éliciné a été installée avec succès !');
        }
        return;
      } catch (err) {
        console.warn('Erreur install prompt:', err);
      }
    }

    // Si deferredPrompt n'est pas encore disponible ou sur iOS Safari :
    // Afficher la boîte de dialogue explicative courte et le toast
    setShowGuideModal(true);
    if (appContext?.showToast) {
      appContext.showToast(
        "Pour installer Éliciné : appuyez sur le menu (⋮) de votre navigateur puis sur 'Ajouter à l'écran d'accueil' / 'Installer l'application'."
      );
    }
  };

  const guideModal = showGuideModal ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in text-slate-900 dark:text-white"
      onClick={(e) => {
        e.stopPropagation();
        setShowGuideModal(false);
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 shadow-2xl animate-scale-up text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Installer Éliciné</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          Pour installer Éliciné : appuyez sur le menu (<strong>⋮</strong>{isIOS ? ' ou Partager' : ''}) de votre navigateur puis sur{' '}
          <strong className="text-cyan-600 dark:text-cyan-400">'Ajouter à l'écran d'accueil'</strong> /{' '}
          <strong className="text-cyan-600 dark:text-cyan-400">'Installer l'application'</strong>.
        </p>
        <button
          type="button"
          onClick={() => setShowGuideModal(false)}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs shadow-md active:scale-98 transition-all cursor-pointer"
        >
          J'ai compris
        </button>
      </div>
    </div>
  ) : null;

  if (isSidebarMode) {
    return (
      <>
        <button
          onClick={handleDirectInstall}
          type="button"
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors cursor-pointer select-none group ${className}`}
          title="Installer l'application sur cet appareil"
        >
          <div className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Installer l'application</span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400 font-mono">
            {isAndroid ? 'APK' : isIOS ? 'iOS' : 'PWA'}
          </span>
        </button>
        {guideModal}
      </>
    );
  }

  // Pilule compacte et sobre pour le Header / Navbar
  return (
    <>
      <button
        onClick={handleDirectInstall}
        type="button"
        className={`text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-slate-900/90 dark:bg-zinc-800/90 hover:bg-slate-800 dark:hover:bg-zinc-700 border border-slate-700/80 dark:border-white/15 text-slate-100 dark:text-zinc-100 hover:text-white flex items-center gap-1 sm:gap-1.5 backdrop-blur-md transition-all active:scale-95 cursor-pointer select-none shadow-sm flex-shrink-0 whitespace-nowrap ${className}`}
        title="Installer l'application Éliciné"
      >
        <Download className="w-3.5 h-3.5 text-cyan-400 dark:text-cyan-300 flex-shrink-0" />
        <span>Installer</span>
      </button>
      {guideModal}
    </>
  );
};

export default InstallAppButton;
