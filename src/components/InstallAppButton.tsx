import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export interface InstallAppButtonProps {
  className?: string;
  variant?: string;
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

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ className = '' }) => {
  const {
    isStandalone,
    showManualInstallGuide,
    setShowManualInstallGuide,
    handleInstallClick
  } = usePWAInstall();

  // Si l'application est déjà lancée en mode autonome / standalone, masquer automatiquement le bouton
  if (isStandalone) {
    return null;
  }

  const { isIOS, isAndroid } = detectOS();

  return (
    <>
      <button
        onClick={handleInstallClick}
        type="button"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:text-sky-200 text-xs font-semibold transition-all shadow-sm cursor-pointer select-none ${className}`}
        title="Installer Éliciné sur cet appareil"
      >
        <span>📲</span>
        <span className={className.includes('w-full') ? 'inline' : 'hidden sm:inline'}>
          Installer l'application
        </span>
      </button>

      {/* Modale d'aide manuelle (iOS Safari ou navigateurs sans prompt automatique) */}
      {showManualInstallGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowManualInstallGuide(false)}
        >
          <div 
            className="bg-slate-950 border border-slate-800 p-6 rounded-2xl max-w-sm w-full text-center flex flex-col items-center gap-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setShowManualInstallGuide(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xs font-bold"
              aria-label="Fermer"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-2xl">
              {isIOS ? '🍏' : (isAndroid ? '🤖' : '💻')}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Installer l'application Éliciné
              </h3>
              <p className="text-xs text-slate-400">
                Accédez à vos films instantanément sans passer par le navigateur.
              </p>
            </div>

            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 text-left">
              {isIOS ? (
                <>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">1.</span>
                    <span>Appuyez sur le bouton <strong>Partager</strong> (icône carré avec flèche montante ⎋) en bas de Safari.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">2.</span>
                    <span>Faites défiler vers le bas et appuyez sur <strong>« Sur l'écran d'accueil »</strong> ⊞.</span>
                  </p>
                </>
              ) : isAndroid ? (
                <>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">1.</span>
                    <span>Appuyez sur les <strong>3 points</strong> ⋮ en haut à droite du navigateur.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">2.</span>
                    <span>Sélectionnez <strong>« Installer l'application »</strong> ou « Ajouter à l'écran d'accueil ».</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">1.</span>
                    <span>Cliquez sur l'icône d'installation <strong>⊕</strong> dans la barre d'adresse de votre navigateur.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-sky-400">2.</span>
                    <span>Confirmez pour installer Éliciné directement sur votre ordinateur.</span>
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowManualInstallGuide(false)}
              className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20 cursor-pointer"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppButton;
