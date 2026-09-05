import React, { useEffect } from 'react';
import { X, Apple, Share, PlusSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { detectOS } from '../InstallAppButton';

export const ApkInstallModal: React.FC = () => {
  const { 
    isApkModalOpen, 
    setIsApkModalOpen, 
    canInstallPwa, 
    installPwa, 
    triggerApkDownload,
    showToast 
  } = useApp();

  const { isIOS, isAndroid } = detectOS();

  useEffect(() => {
    if (!isApkModalOpen) return;

    // Si ouvert sur Android, déclencher directement le téléchargement APK et fermer sans modal
    if (isAndroid) {
      if (triggerApkDownload) {
        triggerApkDownload();
      } else {
        const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
        const link = document.createElement('a');
        link.href = apkUrl;
        link.setAttribute('download', 'elicine.apk');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setIsApkModalOpen(false);
      return;
    }

    // Si ouvert sur Desktop, tenter l'installation PWA directe
    if (!isIOS) {
      if (canInstallPwa) {
        installPwa();
      } else {
        showToast("💡 Utilisez l'icône d'installation dans la barre d'adresse de votre navigateur.");
      }
      setIsApkModalOpen(false);
    }
  }, [isApkModalOpen, isAndroid, isIOS, canInstallPwa, installPwa, showToast, setIsApkModalOpen]);

  if (!isApkModalOpen || !isIOS) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div 
        className="fixed inset-0" 
        onClick={() => setIsApkModalOpen(false)} 
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950/95 border border-zinc-800/90 shadow-2xl backdrop-blur-2xl p-6 text-zinc-100 space-y-4 z-10 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
              <Apple className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">Installer sur iPhone</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsApkModalOpen(false)}
            className="p-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual Steps (Apple Style) */}
        <div className="space-y-3 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-xs">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
              1
            </div>
            <p className="text-zinc-300 leading-relaxed">
              Appuyez sur <strong className="text-white">Partager</strong> (icône <Share className="w-3.5 h-3.5 text-cyan-400 inline mx-1 -mt-0.5" /> dans Safari).
            </p>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
              2
            </div>
            <p className="text-zinc-300 leading-relaxed">
              Sélectionnez <strong className="text-white">« Sur l'écran d'accueil »</strong> (icône <PlusSquare className="w-3.5 h-3.5 text-cyan-400 inline mx-1 -mt-0.5" />).
            </p>
          </div>
        </div>

        {/* Single Action Button */}
        <button
          type="button"
          onClick={() => setIsApkModalOpen(false)}
          className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-98"
        >
          Compris
        </button>
      </div>
    </div>
  );
};

export default ApkInstallModal;
