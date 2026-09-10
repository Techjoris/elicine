import React, { useState, useRef, useEffect } from 'react';
import { 
  Crown, 
  LogOut, 
  LogIn, 
  ChevronDown, 
  User, 
  Heart, 
  Shield,
  Settings
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';

interface ProfileMenuProps {
  onOpenSettings: () => void;
  onOpenPro: () => void;
  onOpenTip?: () => void;
  onOpenApiKeys?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  onOpenSettings,
  onOpenPro,
  onOpenTip
}) => {
  const { user, loading, signOut } = useAuth();
  const { user: appUser, setIsAuthModalOpen, setActiveView, watchlist, setIsTipModalOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeUser = user || appUser;
  const isConnected = Boolean(activeUser && (activeUser.email || activeUser.id));
  const displayAvatar = (activeUser as any)?.user_metadata?.avatar_url || (activeUser as any)?.user_metadata?.picture || (activeUser as any)?.avatar;

  useEffect(() => {
    setImgError(false);
  }, [displayAvatar]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  // Si en cours de chargement initial sans utilisateur : afficher un squelette compact
  if (loading && !activeUser) {
    return (
      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
    );
  }

  const activeUserFullName = (activeUser as any)?.user_metadata?.full_name || (activeUser as any)?.user_metadata?.name || (activeUser as any)?.name;
  const activeDisplayName = activeUserFullName || activeUser?.email;
  const displayName = isConnected ? (activeDisplayName || 'Ivan Joris') : 'Cinéphile Invité';
  const isGoogle = (activeUser as any)?.app_metadata?.provider === 'google' || Boolean((activeUser as any)?.user_metadata?.avatar_url);

  const initials = isConnected
    ? (
        activeUserFullName
          ? activeUserFullName.slice(0, 2).toUpperCase()
          : (activeUser?.email ? activeUser.email.slice(0, 2).toUpperCase() : 'IJ')
      )
    : 'CI';

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button: Avatar with Pro border or subtle glow */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center sm:gap-2 p-0.5 sm:p-1 sm:pl-1.5 sm:pr-2 rounded-full sm:rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer group select-none shadow-sm flex-shrink-0"
        title="Menu Profil & Paramètres"
      >
        <div className={`w-8 h-8 rounded-full sm:w-7 sm:h-7 sm:rounded-lg overflow-hidden flex items-center justify-center font-black text-[11px] flex-shrink-0 shadow-sm ${
          (activeUser as any)?.isPro
            ? 'ring-1 ring-amber-400/60'
            : 'ring-1 ring-slate-900/10 dark:ring-white/10'
        }`}>
          {displayAvatar && !imgError ? (
            <img 
              src={displayAvatar} 
              alt={displayName} 
              className="w-full h-full object-cover" 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              (activeUser as any)?.isPro
                ? 'bg-[#1a1500] text-amber-300 border border-amber-500/40 font-black'
                : 'bg-slate-100 dark:bg-[#1e1e1e] text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-white/10'
            }`}>
              {initials}
            </div>
          )}
        </div>

        <div className="hidden xl:flex flex-col text-left leading-none max-w-[100px]">
          <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
            {displayName}
          </span>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {isConnected ? ((activeUser as any)?.isPro ? '👑 Pro' : '⚡ Connecté') : 'Invité'}
          </span>
        </div>

        <ChevronDown className={`hidden sm:block w-3 h-3 text-slate-400 dark:text-zinc-400 group-hover:text-slate-700 dark:group-hover:text-white transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Card */}
      {open && (
        <>
          {/* Backdrop overlay for outside tap/click closing */}
          <div 
            className="fixed inset-0 z-[105] bg-black/40 md:bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-hidden="true"
          />

          <div 
            className="absolute right-0 mt-2 w-64 sm:w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-2xl p-2 z-[110] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            
            {/* User Info & Quota Header */}
            <div className="p-3 bg-slate-50 dark:bg-[#18181b] rounded-xl border border-slate-200 dark:border-white/10 mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {displayAvatar && !imgError ? (
                  <img 
                    src={displayAvatar} 
                    alt={displayName} 
                    className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/15 flex-shrink-0" 
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-[#27272a] text-slate-800 dark:text-white font-black text-xs flex items-center justify-center flex-shrink-0 ring-1 ring-slate-300 dark:ring-white/10">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <span>{displayName}</span>
                    {isGoogle && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-white/10 font-semibold">Google</span>
                    )}
                  </p>
                  {isConnected ? (
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-[10px] text-slate-600 dark:text-zinc-400 font-semibold truncate">
                        Connecté
                      </span>
                      {activeUser?.email && (
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">
                          • {activeUser.email}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                      Non connecté
                    </p>
                  )}
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${
                (activeUser as any)?.isPro
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-white/10'
              }`}>
                {(activeUser as any)?.isPro ? '👑 PRO' : (isConnected ? '✅ Actif' : '⚡ Invité')}
              </span>
            </div>

            {/* Action Items */}
            <div className="space-y-0.5 text-xs">
              
              {/* 👤 Mon Profil */}
              {isConnected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAuthModalOpen(true);
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
                >
                  <User className="w-4 h-4 text-slate-500 dark:text-zinc-400 flex-shrink-0" />
                  <span className="font-semibold text-xs">Mon Profil</span>
                </button>
              )}

              {/* 🛡️ Console Administrateur (Visible pour créateur/admin) */}
              {authService.isAdmin(user as any) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView('admin');
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[#e50914] hover:bg-[#e50914]/10 transition-colors text-left cursor-pointer font-bold border border-[#e50914]/20"
                >
                  <Shield className="w-4 h-4 text-[#e50914] flex-shrink-0" />
                  <span className="text-xs">Console Admin</span>
                </button>
              )}

              {/* ❤️ Ma Liste */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveView('watchlist');
                  setOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-[#e50914] flex-shrink-0" />
                  <span className="font-medium text-xs">Ma Liste</span>
                </div>
                {watchlist.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#e50914]/15 text-[#e50914] text-[10px] font-bold">
                    {watchlist.length}
                  </span>
                )}
              </button>

              {/* ⚙️ Paramètres */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings();
                  setOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-zinc-400 flex-shrink-0" />
                <span className="font-medium text-xs">Paramètres</span>
              </button>

              {/* 👑 Passer à Éliciné Pro */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onOpenPro();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 hover:bg-amber-500/10 transition-colors text-left cursor-pointer"
              >
                <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <span className="font-bold text-xs">{(activeUser as any)?.isPro ? 'Gérer mon Pass Pro' : 'Passer à Éliciné Pro'}</span>
              </button>

              {/* ☕ Soutenir le projet */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (onOpenTip) onOpenTip();
                  else setIsTipModalOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <span className="text-sm leading-none flex-shrink-0">☕</span>
                <span className="font-medium text-xs">Soutenir le projet</span>
              </button>

              <div className="my-1 border-t border-slate-200 dark:border-white/10" />

              {/* 🚪 Connexion / Déconnexion */}
              {isConnected ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-[#e50914] hover:bg-[#e50914]/10 transition-colors text-left cursor-pointer font-semibold"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Se déconnecter</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAuthModalOpen(true);
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-extrabold hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors text-left cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-white dark:text-black flex-shrink-0" />
                  <span className="text-xs">Se connecter</span>
                </button>
              )}

            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default ProfileMenu;
