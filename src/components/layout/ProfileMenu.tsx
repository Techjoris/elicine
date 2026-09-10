import React, { useState, useRef, useEffect } from 'react';
import { 
  Crown, 
  LogOut, 
  LogIn, 
  ChevronDown, 
  User, 
  Heart, 
  Shield
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';

interface ProfileMenuProps {
  onOpenSettings?: () => void;
  onOpenPro: () => void;
  onOpenTip?: () => void;
  onOpenApiKeys?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
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
        title="Menu Profil"
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

        {/* User Display Name */}
        <div className="hidden sm:flex flex-col text-left min-w-0 pr-1">
          <span className="text-xs font-bold text-slate-900 dark:text-zinc-200 group-hover:text-slate-800 dark:group-hover:text-white transition-colors truncate max-w-[110px]">
            {displayName}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-zinc-500 truncate max-w-[110px]">
            {isConnected ? (activeUser?.email || 'Connecté') : 'Non connecté'}
          </span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 transition-transform duration-200 hidden sm:block ${
          open ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div 
            className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-2 z-50 animate-scale-up text-slate-800 dark:text-zinc-100"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            
            {/* Header Profil */}
            <div className="p-3 mb-1.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.06] flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-sm ${
                (activeUser as any)?.isPro
                  ? 'bg-amber-400 text-black ring-2 ring-amber-400/40'
                  : 'bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-white'
              }`}>
                {displayAvatar && !imgError ? (
                  <img 
                    src={displayAvatar} 
                    alt={displayName} 
                    className="w-full h-full object-cover rounded-full" 
                    onError={() => setImgError(true)}
                  />
                ) : initials}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {displayName}
                  </span>
                  {(activeUser as any)?.isPro && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5">
                      <Crown className="w-2.5 h-2.5" />
                      Pro
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {isConnected ? (activeUser?.email || 'Compte actif') : 'Invité'}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div className="space-y-0.5">

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
