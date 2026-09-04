import React, { useState, useEffect } from 'react';

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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Capture de l'installation PWA native (Chrome, Android, Edge, Desktop)
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = () => {
    const userAgent = navigator.userAgent || (navigator as any).vendor || (window as any).opera || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

    // 1. Détection iOS (Safari ne supporte pas l'invite automatique PWA)
    if (isIOS) {
      setShowIosGuide(true);
      return;
    }

    // 2. Détection Android / Desktop avec invite PWA native
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('Application installée');
        }
        setDeferredPrompt(null);
      });
      return;
    }

    // 3. Fallback direct (Instructions rapides)
    alert("Pour installer l'application Éliciné sur votre appareil, ajoutez ce site à votre écran d'accueil depuis les options de votre navigateur.");
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        type="button"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:text-sky-200 text-xs font-semibold transition-all shadow-sm cursor-pointer select-none ${className}`}
        title="Installer Éliciné sur cet appareil"
      >
        <span>📲</span>
        <span className="hidden sm:inline">Installer l'application</span>
      </button>

      {/* Guide automatique pour iPhone/iPad si détecté */}
      {showIosGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowIosGuide(false)}
        >
          <div 
            className="bg-slate-950 border border-slate-800 p-5 rounded-2xl max-w-sm text-center flex flex-col items-center gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-3xl">🍏</span>
            <h3 className="text-sm font-bold text-white">Installer sur votre iPhone / iPad</h3>
            <p className="text-xs text-slate-300 leading-relaxed text-left">
              1. Appuyez sur le bouton <strong>Partager</strong> (icône carré avec flèche montante ⎋) en bas de Safari.<br />
              2. Faites défiler vers le bas et sélectionnez <strong>« Sur l'écran d'accueil »</strong> ⊞.
            </p>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-2 w-full py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
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
