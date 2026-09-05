import React, { useContext } from 'react';
import { Download } from 'lucide-react';
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

  // Masquer automatiquement si déjà en mode standalone PWA
  if (isStandalone) {
    return null;
  }

  const { isIOS, isAndroid } = detectOS();
  const isSidebarMode = variant === 'sidebar' || variant === 'link';

  const handleDirectInstall = async () => {
    // CAS 1 : Android / Desktop avec prompt système ready -> 1-tap direct
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

    // CAS 2 : Android fallback (téléchargement direct APK sans modale)
    if (isAndroid) {
      if (appContext?.showToast) {
        appContext.showToast("Téléchargement de l'application en cours...");
      }
      const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
      const link = document.createElement('a');
      link.href = apkUrl;
      link.download = 'elicine.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // CAS 3 : iOS Safari -> Déclenche la bottom-sheet Apple
    if (isIOS) {
      if (appContext?.setIsApkModalOpen) {
        appContext.setIsApkModalOpen(true);
      }
      return;
    }

    // CAS 4 : Desktop sans prompt -> Toast informatif discret
    if (appContext?.showToast) {
      appContext.showToast("💡 Utilisez l'icône d'installation dans la barre d'adresse de votre navigateur.");
    }
  };

  if (isSidebarMode) {
    return (
      <button
        onClick={handleDirectInstall}
        type="button"
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900/60 transition-colors cursor-pointer select-none group ${className}`}
        title="Installer l'application sur cet appareil"
      >
        <div className="flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
          <span>Installer l'application</span>
        </div>
        <span className="text-[10px] text-slate-500 group-hover:text-slate-400 font-mono">
          {isAndroid ? 'APK' : isIOS ? 'iOS' : 'PWA'}
        </span>
      </button>
    );
  }

  // Pillule sobre et chic pour le Header / Navbar
  return (
    <button
      onClick={handleDirectInstall}
      type="button"
      className={`text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center gap-1.5 backdrop-blur-md transition-all active:scale-95 cursor-pointer select-none ${className}`}
      title="Installer l'application"
    >
      <Download className="w-3.5 h-3.5 text-white/90" />
      <span>Installer</span>
    </button>
  );
};

export default InstallAppButton;
