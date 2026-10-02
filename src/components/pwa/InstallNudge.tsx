import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { checkIsStandalone, isAppAlreadyInstalled, promptNativeInstall } from '../../hooks/usePWAInstall';
import {
  isMobileEnvironment,
  shouldShowInstallNudge
} from '../../lib/installNudge';
import { InstallModal } from '../modals/InstallModal';

const STORAGE_KEY = 'elicine_install_nudge_at';

/**
 * Rappel discret d'installation, réservé aux visiteurs mobiles qui n'ont pas
 * encore l'application. Elle reste visible jusqu'au clic ou à la fermeture,
 * pour que l'action d'installation ne disparaisse pas avant d'être lue.
 */
export const InstallNudge: React.FC = () => {
  const { user } = useAuth();
  const { user: appUser } = useApp();
  const [isVisible, setIsVisible] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const lastUserId = useRef<string | null>(null);

  const readLastShown = (): number | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  };

  const rememberShown = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* facultatif */ }
  };

  const show = useCallback((force: boolean) => {
    if (document.getElementById('terms-gate-title')) return;
    const installed = checkIsStandalone();
    const eligible = shouldShowInstallNudge({
      now: Date.now(),
      lastShownAt: readLastShown(),
      isMobile: isMobileEnvironment(navigator.userAgent || '', window.innerWidth || 0),
      isInstalled: installed,
      force
    });
    if (!eligible) return;

    // L'application peut être installée sans être ouverte : on vérifie aussi
    // avant d'afficher, pour ne jamais relancer quelqu'un qui l'a déjà.
    isAppAlreadyInstalled().then(already => {
      if (already || document.getElementById('terms-gate-title')) return;
      rememberShown();
      setIsVisible(true);
    }).catch(() => { /* silencieux */ });
  }, []);

  // Une fois au chargement, en respectant le délai d'une heure.
  useEffect(() => {
    const showAfterConsent = () => {
      if (!document.getElementById('terms-gate-title')) show(false);
    };
    const timer = setTimeout(showAfterConsent, 2500);
    window.addEventListener('elicine-terms-accepted', showAfterConsent);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('elicine-terms-accepted', showAfterConsent);
    };
  }, [show]);

  // Une reconnexion déclenche le rappel sans attendre.
  useEffect(() => {
    const id = user?.id || appUser?.id || null;
    const wasEmpty = lastUserId.current === null;
    lastUserId.current = id;
    if (id && !wasEmpty) show(true);
  }, [user?.id, appUser?.id, show]);

  useEffect(() => {
    const hide = () => setIsVisible(false);
    window.addEventListener('appinstalled', hide);
    return () => window.removeEventListener('appinstalled', hide);
  }, []);

  const handleOpen = async () => {
    setIsVisible(false);
    const outcome = await promptNativeInstall();
    if (outcome === 'unavailable') setIsGuideOpen(true);
  };

  return (
    <>
      {isVisible && (
        <div className="fixed left-3 right-3 top-16 sm:left-auto sm:right-6 sm:w-80 z-[150] animate-slide-up">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#343434] text-white shadow-2xl shadow-black/40">
            <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl bg-white flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">Installer Éliciné</span>
              <span className="block text-xs text-zinc-300 truncate">{window.location.hostname}</span>
            </div>
            <button
              type="button"
              onClick={handleOpen}
              className="px-2 py-2 text-sm font-semibold hover:text-red-300"
            >
              Installer
            </button>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              aria-label="Masquer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <InstallModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};

export default InstallNudge;
