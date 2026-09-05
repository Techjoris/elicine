import React, { useContext } from 'react';
import { 
  Smartphone, 
  Download, 
  Sparkles, 
  Share, 
  PlusSquare, 
  CheckCircle2, 
  ChevronRight, 
  X, 
  Layers, 
  ShieldCheck,
  Apple,
  Laptop
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppContext } from '../context/AppContext';

export interface InstallAppButtonProps {
  className?: string;
  variant?: 'auto' | 'header' | 'sidebar' | 'pill' | 'card' | 'minimal';
  showBadge?: boolean;
}

export const detectOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, isDesktop: true };
  }
  const userAgent = navigator.userAgent || (navigator as any).vendor || (window as any).opera || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  const isAndroid = /Android/i.test(userAgent);
  const isDesktop = !isIOS && !isAndroid;
  return { isIOS, isAndroid, isDesktop };
};

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ 
  className = '', 
  variant = 'auto' 
}) => {
  const appContext = useContext(AppContext);
  const {
    isStandalone,
    showManualInstallGuide,
    setShowManualInstallGuide,
    handleInstallClick,
    deferredPrompt
  } = usePWAInstall();

  // Si l'application tourne déjà en mode autonome / PWA installée, masquer le bouton
  if (isStandalone) {
    return null;
  }

  const { isIOS, isAndroid } = detectOS();
  const isSidebarMode = variant === 'sidebar' || variant === 'card' || className.includes('w-full');

  const handleClick = async () => {
    // 1. Si le prompt natif du navigateur est disponible, déclencher l'installation 1-tap directe
    if (deferredPrompt) {
      const installed = await handleInstallClick();
      if (installed) {
        if (appContext?.showToast) {
          appContext.showToast('🎉 Éliciné a été installée avec succès !');
        }
        return;
      }
    }

    // 2. Si non supporté directement (iOS Safari, navigateur sans prompt), ouvrir la modale hybride complète
    if (appContext?.setIsApkModalOpen) {
      appContext.setIsApkModalOpen(true);
      return;
    }

    // 3. Fallback autonome si utilisé hors AppContext
    setShowManualInstallGuide(true);
  };

  const handleDownloadApk = () => {
    const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = 'elicine.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (appContext?.showToast) {
      appContext.showToast("🚀 Téléchargement de l'APK Éliciné démarré !");
    }
  };

  return (
    <>
      {isSidebarMode ? (
        /* ─── VARIANT SIDEBAR / DRAWER : BANNIÈRE PREMIUM ─── */
        <button
          onClick={handleClick}
          type="button"
          className={`group relative overflow-hidden w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-sky-950/40 via-[#0c1322] to-indigo-950/30 hover:from-sky-900/40 hover:via-[#101b30] hover:to-indigo-900/40 border border-sky-500/30 hover:border-sky-400/60 shadow-[0_0_20px_rgba(14,165,233,0.12)] hover:shadow-[0_0_30px_rgba(14,165,233,0.25)] transition-all duration-300 cursor-pointer select-none text-left ${className}`}
          title="Installer Éliciné sur cet appareil (PWA & APK)"
        >
          {/* Lueur de balayage dynamique au survol */}
          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500/20 to-blue-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-105 group-hover:text-sky-200 transition-all shadow-sm">
              <Smartphone className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
            </div>

            <div>
              <div className="text-xs font-black text-white group-hover:text-sky-200 transition-colors flex items-center gap-1.5">
                <span>Installer l'application</span>
                <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Plein écran • Mode hors-ligne
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300">
              PWA / APK
            </span>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-sky-300 group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>
      ) : (
        /* ─── VARIANT HEADER / PILL : BOUTON CHIC CYBER-CINÉMA ─── */
        <button
          onClick={handleClick}
          type="button"
          className={`group relative overflow-hidden flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-900/90 via-sky-950/40 to-slate-900/90 hover:from-sky-900/30 hover:via-sky-800/20 hover:to-indigo-900/30 border border-sky-500/30 hover:border-sky-400/70 text-sky-300 hover:text-sky-100 text-xs font-bold transition-all duration-300 shadow-[0_0_15px_rgba(14,165,233,0.12)] hover:shadow-[0_0_25px_rgba(14,165,233,0.3)] cursor-pointer select-none active:scale-[0.98] ${className}`}
          title="Installer Éliciné sur cet appareil (PWA & APK)"
        >
          {/* Lueur de balayage dynamique */}
          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

          {/* Balise néon pulsante */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>

          <Download className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />

          <span className="inline">
            <span className="sm:hidden">Installer</span>
            <span className="hidden sm:inline">Installer l'application</span>
          </span>

          <span className="hidden lg:inline text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
            PWA
          </span>
        </button>
      )}

      {/* Modale d'aide intégrée (fallback si utilisée hors AppContext) */}
      {showManualInstallGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowManualInstallGuide(false)}
        >
          <div 
            className="bg-[#0c111e] border border-sky-500/30 p-6 sm:p-7 rounded-3xl max-w-sm w-full text-center flex flex-col items-center gap-5 shadow-[0_0_50px_rgba(14,165,233,0.2)] relative"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setShowManualInstallGuide(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xs font-bold border border-slate-800 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-blue-600/20 border border-sky-500/30 flex items-center justify-center text-2xl shadow-lg">
              {isIOS ? <Apple className="w-7 h-7 text-sky-400" /> : isAndroid ? <Smartphone className="w-7 h-7 text-emerald-400" /> : <Laptop className="w-7 h-7 text-purple-400" />}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-black text-white">
                Installer <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">Éliciné</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Accédez instantanément à votre catalogue en plein écran, sans barre d'adresse ni pub.
              </p>
            </div>

            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-3 text-left">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Appuyez sur le bouton <strong>Partager</strong> <Share className="w-3.5 h-3.5 text-sky-400 inline mx-1" /> en bas de Safari.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Faites défiler vers le bas et touchez <strong>« Sur l'écran d'accueil »</strong> <PlusSquare className="w-3.5 h-3.5 text-sky-400 inline mx-1" />.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Touchez <strong>Ajouter</strong> en haut à droite pour valider l'installation.</span>
                  </div>
                </>
              ) : isAndroid ? (
                <div className="space-y-3">
                  <button
                    onClick={handleDownloadApk}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger le fichier APK (.apk)</span>
                  </button>
                  <div className="text-[11px] text-slate-400 text-center">
                    Ou via votre navigateur : appuyez sur <strong>⋮</strong> puis <em>« Installer l'application »</em>.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Cliquez sur l'icône <strong>⊕</strong> dans la barre d'adresse de votre navigateur.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Confirmez <strong>« Installer »</strong> pour lancer Éliciné en plein écran.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Garanti sans publicité ni pistage</span>
            </div>

            <button
              type="button"
              onClick={() => setShowManualInstallGuide(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppButton;

