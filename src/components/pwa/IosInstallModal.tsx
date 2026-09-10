import React from 'react';
import { X, Share, PlusSquare, Apple, CheckCircle2, Smartphone } from 'lucide-react';

/**
 * Détection précise des appareils iOS (iPhone, iPad, iPod Touch)
 * incluant iPadOS 13+ (qui signale MacIntel avec points tactiles multiples)
 */
export const detectIsIOS = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIosDevice = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIosDevice || isIPadOS;
};

/**
 * Détecte si l'application est déjà lancée en mode PWA autonome / plein écran
 */
export const detectIsStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneMql = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any)?.standalone === true;
    const isSourcePwa = Boolean(window.location.search?.includes('source=pwa'));
    return Boolean(isStandaloneMql || isIosStandalone || isSourcePwa);
  } catch {
    return false;
  }
};

export interface IosInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IosInstallModal: React.FC<IosInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 dark:bg-black/85 backdrop-blur-md animate-fade-in text-slate-900 dark:text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md rounded-3xl bg-white/95 dark:bg-[#121214]/95 border border-slate-200/90 dark:border-zinc-800 shadow-2xl backdrop-blur-2xl p-5 sm:p-6 text-left space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Apple Touch Icon & App Branding */}
        <div className="flex items-center gap-3.5 pr-8">
          <img 
            src="/apple-touch-icon.png" 
            alt="Éliciné" 
            className="w-12 h-12 rounded-2xl shadow-md border border-slate-200 dark:border-zinc-700 object-cover flex-shrink-0"
            onError={(e) => {
              // Fallback si l'image png ne charge pas
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 text-[10px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              <Apple className="w-3 h-3 text-slate-800 dark:text-white" />
              <span>iOS &amp; iPadOS Safari</span>
            </div>
            <h2 id="ios-install-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              Installer Éliciné sur iPhone / iPad
            </h2>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
          Ajoutez l'application directement à votre écran d'accueil pour une expérience plein écran instantanée, sans passer par l'App Store.
        </p>

        {/* Apple 3-Step Guided Walkthrough */}
        <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
              1
            </div>
            <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
              <span>Appuyez sur le bouton </span>
              <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                Partager
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400">
                  <Share className="w-3.5 h-3.5" />
                </span>
              </strong>
              <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                (Situé au centre de la barre d'outils en bas de Safari sur iPhone)
              </span>
            </div>
          </div>

          <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
              2
            </div>
            <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
              <span>Faites défiler le menu et sélectionnez </span>
              <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                « Sur l'écran d'accueil »
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                  <PlusSquare className="w-3.5 h-3.5" />
                </span>
              </strong>
            </div>
          </div>

          <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
              3
            </div>
            <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
              <span>Touchez </span>
              <strong className="text-slate-900 dark:text-white font-semibold">« Ajouter »</strong>
              <span> en haut à droite pour finaliser l'installation.</span>
            </div>
          </div>
        </div>

        {/* Benefits notice */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Lancement instantané, mode sombre natif et catalogue hors-ligne.</span>
        </div>

        {/* Safari Bottom Bar Pointer Animation for iPhone */}
        <div className="text-center pt-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center justify-center gap-1.5 animate-bounce">
            <span>↓</span>
            <span>Le bouton Partager se trouve dans la barre en bas de votre écran Safari</span>
          </p>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
        >
          J'ai compris
        </button>
      </div>
    </div>
  );
};

export default IosInstallModal;
