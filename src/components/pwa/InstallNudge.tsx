import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { checkIsStandalone, isAppAlreadyInstalled, promptNativeInstall } from '../../hooks/usePWAInstall';
import {
  INSTALL_NUDGE_COOLDOWN_MS,
  INSTALL_NUDGE_DURATION_MS,
  isMobileEnvironment,
  shouldShowInstallNudge
} from '../../lib/installNudge';
import { InstallModal } from '../modals/InstallModal';

const STORAGE_KEY = 'elicine_install_nudge_at';

/**
 * Rappel discret d'installation, réservé aux visiteurs mobiles qui n'ont pas
 * encore l'application. Il s'affiche deux secondes puis s'efface, revient au
 * plus une fois par heure, et sans attendre après une reconnexion.
 */
export const InstallNudge: React.FC = () => {
  const { user } = useAuth();
  const { user: appUser } = useApp();
  const [isVisible, setIsVisible] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (already) return;
      rememberShown();
      setIsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setIsVisible(false), INSTALL_NUDGE_DURATION_MS);
    }).catch(() => { /* silencieux */ });
  }, []);

  // Une fois au chargement, en respectant le délai d'une heure.
  useEffect(() => {
    const timer = setTimeout(() => show(false), 2500);
    return () => clearTimeout(timer);
  }, [show]);

  // Une reconnexion déclenche le rappel sans attendre.
  useEffect(() => {
    const id = user?.id || appUser?.id || null;
    const wasEmpty = lastUserId.current === null;
    lastUserId.current = id;
    if (id && !wasEmpty) show(true);
  }, [user?.id, appUser?.id, show]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const handleOpen = async () => {
    setIsVisible(false);
    const outcome = await promptNativeInstall();
    if (outcome === 'unavailable') setIsGuideOpen(true);
  };

  return (
    <>
      {isVisible && (
        <div
          className="fixed left-3 right-3 top-16 sm:left-auto sm:right-6 sm:w-80 z-[150] animate-slide-up"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/95 dark:bg-zinc-900/95 border border-red-500/40 shadow-2xl shadow-black/50">
            <button
              type="button"
              onClick={handleOpen}
              className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
              title="Installer Éliciné"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white font-black flex-shrink-0">
                É
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-white truncate">Installer Éliciné</span>
                <span className="block text-[11px] text-zinc-400 truncate">Accès direct, plein écran, un seul geste</span>
              </span>
              <Download className="w-4 h-4 text-red-400 flex-shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
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
