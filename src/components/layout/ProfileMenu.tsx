import React, { useState, useRef, useEffect } from 'react';
import { 
  Crown, 
  Coffee, 
  LogOut, 
  LogIn, 
  ChevronDown,
  User,
  Heart,
  Shield
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
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'CI');

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button: Avatar with Pro border or subtle glow */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer backdrop-blur-md group select-none shadow-sm"
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
          <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
            {user?.isPro ? '👑 Pro' : `⚡ ${quota.remaining}/3 IA`}
          </span>
        </div>

        <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Card */}
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white/98 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          
          {/* User Info & Quota Header */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatar && (
                <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-xl object-cover ring-1 ring-cyan-500/40 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                  <span>{user?.name || 'Cinéphile Invité'}</span>
                  {user?.provider === 'google' && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-cyan-600 dark:text-cyan-300 border border-cyan-400/30">Google</span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
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
            
            {/* 👤 Mon Compte & Profil */}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setIsAuthModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-left cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                <span className="font-semibold">Mon Profil</span>
              </button>
            )}

            {/* 🛡️ Console Administrateur (Visible pour créateur/admin) */}
            {authService.isAdmin(user) && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setActiveView('admin');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors text-left cursor-pointer font-bold border border-cyan-500/20"
              >
                <Shield className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                <span>Console Admin</span>
              </button>
            )}

            {/* ❤️ Ma Liste */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setActiveView('watchlist');
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Heart className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                <span className="font-medium">Ma Liste</span>
              </div>
              {watchlist.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-300 text-[10px] font-bold">
                  {watchlist.length}
                </span>
              )}
            </button>

            {/* ⚙️ Paramètres de visionnage */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-left cursor-pointer"
            >
              <span className="text-sm">⚙️</span>
              <span className="font-medium">Paramètres de visionnage</span>
            </button>

            {/* 👑 Passer à Éliciné Pro */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenPro();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 hover:bg-amber-500/10 transition-colors text-left cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="font-bold">{user?.isPro ? 'Gérer mon Pass Pro' : 'Passer à Éliciné Pro'}</span>
            </button>

            {/* 🎁 Soutenir le projet */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenTip();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-left cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
              <span className="font-medium">Soutenir le projet</span>
            </button>


            <div className="my-1 border-t border-slate-200 dark:border-slate-800/80" />

            {/* 🚪 Connexion / Déconnexion */}
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                <span className="font-medium">Déconnexion</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setIsAuthModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-500/10 transition-colors text-left cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                <span className="font-bold">Se connecter / S'inscrire</span>
              </button>
            )}

          </div>

        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
