import { useState, useEffect } from 'react';
import { LogIn, Download, Coffee, Globe, Menu } from 'lucide-react';

export default function Navbar({ onOpenTip, onOpenSettings, onLogin, onToggleMenu }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    // Vérifie si le prompt a déjà été intercepté
    if (typeof window !== 'undefined' && window.deferredPWAInstallPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
      setShowInstallBtn(true);
    }

    // Écoute l'événement d'installation PWA
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.deferredPWAInstallPrompt : null);
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
      if (typeof window !== 'undefined') {
        window.deferredPWAInstallPrompt = null;
      }
    }
    setDeferredPrompt(null);
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-black text-white border-b border-zinc-800">
      {/* Menu burger / Logo */}
      <div className="flex items-center space-x-3">
        <button 
          onClick={onToggleMenu}
          className="p-1 text-zinc-400 hover:text-white transition"
          type="button"
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center space-x-1.5 font-bold text-lg cursor-pointer">
          <span className="bg-red-600 px-1.5 py-0.5 rounded text-white text-xs font-black">É</span>
          <span>Éliciné</span>
        </div>
      </div>

      {/* Actions de droite (Soutenir, Langue, Installer, Connexion) */}
      <div className="flex items-center space-x-2">
        {/* Bouton Soutenir (masqué sur très petit écran ou réduit) */}
        <a 
          href="/soutenir" 
          onClick={(e) => {
            if (onOpenTip) {
              e.preventDefault();
              onOpenTip();
            }
          }}
          className="hidden sm:flex items-center space-x-1 text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-zinc-700"
        >
          <Coffee size={14} className="text-amber-500" />
          <span>Soutenir</span>
        </a>

        {/* Bouton Installer PWA (apparaît s'il est disponible) */}
        {showInstallBtn && (
          <button
            onClick={handleInstallClick}
            className="flex items-center space-x-1 text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-full border border-zinc-700 text-zinc-200"
            title="Installer l'application"
            type="button"
          >
            <Download size={14} className="text-red-500" />
            <span className="hidden md:inline">Installer</span>
          </button>
        )}

        {/* Sélecteur de langue compact */}
        <button 
          type="button"
          className="flex items-center space-x-1 text-xs bg-zinc-800 px-2 py-1.5 rounded-full border border-zinc-700"
        >
          <Globe size={14} />
          <span>FR</span>
        </button>

        {/* Bouton Connexion (Version compacte sur mobile avec icône, texte sur desktop) */}
        <a
          href="/login"
          onClick={(e) => {
            if (onLogin) {
              e.preventDefault();
              onLogin();
            }
          }}
          className="flex items-center justify-center bg-white text-black hover:bg-zinc-200 px-3 py-1.5 rounded-full text-xs font-semibold transition"
        >
          <LogIn size={14} className="sm:mr-1.5" />
          <span className="hidden sm:inline">Connexion</span>
        </a>
      </div>
    </header>
  );
}
