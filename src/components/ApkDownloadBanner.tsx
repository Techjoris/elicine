import React from 'react';
import { Package, Download, X, ArrowRight, Smartphone } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ApkDownloadBanner: React.FC = () => {
  const { 
    showOpenInstallerToast, 
    setShowOpenInstallerToast,
    showToast 
  } = useApp();

  if (!showOpenInstallerToast) return null;

  const handleOpenInstaller = () => {
    const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
    const link = document.createElement('a');
    link.href = apkUrl;
    link.setAttribute('download', 'elicine.apk');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Appuyez sur la notification Android pour finaliser l'installation.");
  };

  return (
    <div className="fixed bottom-4 sm:bottom-6 inset-x-3 sm:inset-x-auto sm:right-6 sm:max-w-md z-50 animate-slide-up">
      <div className="relative rounded-3xl bg-zinc-950/95 border border-cyan-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-2xl p-4 sm:p-5 text-zinc-100 space-y-3">
        
        {/* Top Row: Status + Close Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </div>
            <span className="text-xs sm:text-sm font-bold text-cyan-300">
              Téléchargement d'Éliciné lancé...
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowOpenInstallerToast(false)}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Helper Micro-copy */}
        <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
          Dès que le téléchargement se termine, appuyez sur la notification Android ou sur le bouton pour lancer l'installation.
        </p>

        {/* Primary Action Button: Ouvrir pour installer */}
        <button
          type="button"
          onClick={handleOpenInstaller}
          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
        >
          <Package className="w-4 h-4 text-white" />
          <span>Ouvrir pour installer</span>
          <ArrowRight className="w-3.5 h-3.5 text-white/80 ml-0.5" />
        </button>

      </div>
    </div>
  );
};

export default ApkDownloadBanner;
