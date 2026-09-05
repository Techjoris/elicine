import React, { useState, useRef, useEffect } from 'react';
import { 
  Crown, 
  Coffee, 
  LogOut, 
  LogIn, 
  ChevronDown, 
  User, 
  Heart, 
  Shield,
  Settings
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';

interface ProfileMenuProps {
  onOpenSettings: () => void;
  onOpenPro: () => void;
  onOpenTip: () => void;
  onOpenApiKeys?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  onOpenSettings,
  onOpenPro,
  onOpenTip
}) => {
  const { user, quota, logout, setIsAuthModalOpen, setActiveView, watchlist } = useApp();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'CI');

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button: Avatar with Pro border or subtle glow */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer group select-none shadow-sm"
        title="Menu Profil & Paramètres"
      >
        <div className={`w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center font-black text-[11px] text-white flex-shrink-0 shadow-sm ${
          user?.isPro
            ? 'ring-1 ring-amber-400/60'
            : 'ring-1 ring-slate-300 dark:ring-slate-700'
        }`}>
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              user?.isPro
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-black'
                : 'bg-gradient-to-tr from-sky-600 to-cyan-500 text-white'
            }`}>
              {initials}
            </div>
          )}
        </div>

        <div className="hidden xl:flex flex-col text-left leading-none max-w-[100px]">
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
            {user?.name || (user ? 'Mon Compte' : 'Invité')}
          </span>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {user?.isPro ? '👑 Pro' : `⚡ ${quota.remaining}/3 IA`}
          </span>
        </div>

        <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Card */}
      {open && (
        <>
          {/* Backdrop overlay for outside tap/click closing */}
          <div 
            className="fixed inset-0 z-[105] bg-black/25 md:bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-hidden="true"
          />

          <div 
            className="absolute right-0 mt-2 w-64 sm:w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-slate-900/15 dark:shadow-black/70 p-2 z-[110] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            
            {/* User Info & Quota Header */}
            <div className="p-3 bg-slate-50 dark:bg-zinc-850/80 dark:bg-[#181a24] rounded-xl border border-slate-200 dark:border-zinc-800 mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {user?.avatar && (
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-xl object-cover ring-1 ring-cyan-500/40 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <span>{user?.name || 'Cinéphile Invité'}</span>
                    {user?.provider === 'google' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-cyan-600 dark:text-cyan-300 border border-cyan-400/30 font-semibold">Google</span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                    {user?.email || 'Non connecté'}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${
                user?.isPro
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 shadow-neon-gold'
                  : 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30'
              }`}>
                {user?.isPro ? '👑 PRO' : `⚡ ${quota.remaining}/3`}
              </span>
            </div>

            {/* Action Items */}
            <div className="space-y-0.5 text-xs">
              
              {/* 👤 Mon Profil */}
              {user && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAuthModalOpen(true);
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
                >
                  <User className="w-4 h-4 text-cyan-500 dark:text-cyan-400 flex-shrink-0" />
                  <span className="font-semibold text-xs">Mon Profil</span>
                </button>
              )}

              {/* 🛡️ Console Administrateur (Visible pour créateur/admin) */}
              {authService.isAdmin(user) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView('admin');
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors text-left cursor-pointer font-bold border border-cyan-500/30 dark:border-cyan-500/20"
                >
                  <Shield className="w-4 h-4 text-cyan-500 dark:text-cyan-400 flex-shrink-0" />
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
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                  <span className="font-medium text-xs">Ma Liste</span>
                </div>
                {watchlist.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-300 text-[10px] font-bold">
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
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-zinc-400 flex-shrink-0" />
                <span className="font-medium text-xs">Paramètres</span>
              </button>

              {/* 👑 Passer à Éliciné Pro */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPro();
                  setOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-left cursor-pointer"
              >
                <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <span className="font-bold text-xs">{user?.isPro ? 'Gérer mon Pass Pro' : 'Passer à Éliciné Pro'}</span>
              </button>

              {/* 🎁 Soutenir le projet */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTip();
                  setOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <Coffee className="w-4 h-4 text-orange-500 dark:text-orange-400 flex-shrink-0" />
                <span className="font-medium text-xs">Soutenir le projet</span>
              </button>

              <div className="my-1 border-t border-slate-200 dark:border-zinc-800" />

              {/* 🚪 Connexion / Déconnexion */}
              {user ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    logout();
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left cursor-pointer font-medium"
                >
                  <LogOut className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs">Déconnexion</span>
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
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-blue-600 dark:text-sky-400 hover:text-blue-700 dark:hover:text-sky-300 hover:bg-blue-50 dark:hover:bg-sky-950/30 transition-colors text-left cursor-pointer font-bold"
                >
                  <LogIn className="w-4 h-4 text-blue-600 dark:text-sky-400 flex-shrink-0" />
                  <span className="text-xs">Se connecter / S'inscrire</span>
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
