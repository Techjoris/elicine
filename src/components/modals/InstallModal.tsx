import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share, 
  PlusSquare, 
  MoreVertical, 
  Download, 
  Apple, 
  Smartphone, 
  Laptop, 
  CheckCircle2, 
  Sparkles,
  Compass,
  Menu,
  Plus
} from 'lucide-react';

export type InstallTab = 'ios' | 'samsung' | 'android' | 'desktop';

export interface BrowserInfo {
  isSamsungBrowser: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isFirefox: boolean;
  isChrome: boolean;
  isEdge: boolean;
  isDesktop: boolean;
  recommendedTab: InstallTab;
}

/**
 * Détection précise de l'environnement et du navigateur de l'utilisateur
 */
export const detectBrowserInfo = (): BrowserInfo => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSamsungBrowser: false,
      isIOS: false,
      isAndroid: true,
      isFirefox: false,
      isChrome: true,
      isEdge: false,
      isDesktop: false,
      recommendedTab: 'android'
    };
  }

  const ua = navigator.userAgent || '';
  const isSamsungBrowser = ua.includes('SamsungBrowser') || /SamsungBrowser/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /EdgA?|Edge/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua) && !isSamsungBrowser && !isEdge;
  const isDesktop = !isIOS && !isAndroid;

  let recommendedTab: InstallTab = 'android';
  if (isSamsungBrowser) {
    recommendedTab = 'samsung';
  } else if (isIOS) {
    recommendedTab = 'ios';
  } else if (isDesktop) {
    recommendedTab = 'desktop';
  } else {
    recommendedTab = 'android';
  }

  return {
    isSamsungBrowser,
    isIOS,
    isAndroid,
    isFirefox,
    isChrome,
    isEdge,
    isDesktop,
    recommendedTab
  };
};

export const detectDeviceType = (): InstallTab => {
  return detectBrowserInfo().recommendedTab;
};

export interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: InstallTab;
}

export const InstallModal: React.FC<InstallModalProps> = ({ 
  isOpen, 
  onClose,
  defaultTab
}) => {
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo>(() => detectBrowserInfo());
  const [activeTab, setActiveTab] = useState<InstallTab>('android');

  useEffect(() => {
    if (isOpen) {
      const info = detectBrowserInfo();
      setBrowserInfo(info);
      if (defaultTab) {
        setActiveTab(defaultTab);
      } else {
        setActiveTab(info.recommendedTab);
      }
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 dark:bg-black/85 backdrop-blur-md animate-fade-in text-slate-900 dark:text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 shadow-2xl backdrop-blur-2xl p-5 sm:p-6 text-left space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* En-tête : Logo Éliciné & Titre */}
        <div className="flex items-center gap-3.5 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-lg shadow-red-600/30 font-black text-2xl flex-shrink-0 border border-white/20">
            É
          </div>
          <div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-3 h-3" />
              <span>Application Web Progressive</span>
            </div>
            <h2 id="install-modal-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              Installer Éliciné
            </h2>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
          Installez Éliciné pour profiter d'un lancement instantané en plein écran et d'une fluidité maximale sans passer par un store.
        </p>

        {/* Onglets de sélection du système & navigateur */}
        <div className="grid grid-cols-4 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 gap-1 text-[11px] sm:text-xs">
          {/* Onglet iOS */}
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`relative flex items-center justify-center gap-1 py-1.5 px-1 sm:px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Apple className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">iOS</span>
            {browserInfo.isIOS && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" title="Votre appareil" />
            )}
          </button>

          {/* Onglet Samsung Internet */}
          <button
            type="button"
            onClick={() => setActiveTab('samsung')}
            className={`relative flex items-center justify-center gap-1 py-1.5 px-1 sm:px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'samsung'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 flex-shrink-0 text-indigo-500" />
            <span className="truncate">Samsung</span>
            {browserInfo.isSamsungBrowser && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" title="Votre navigateur" />
            )}
          </button>

          {/* Onglet Android (Chrome / Navigateurs) */}
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`relative flex items-center justify-center gap-1 py-1.5 px-1 sm:px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Android</span>
            {browserInfo.isAndroid && !browserInfo.isSamsungBrowser && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="Votre appareil" />
            )}
          </button>

          {/* Onglet Ordinateur */}
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`relative flex items-center justify-center gap-1 py-1.5 px-1 sm:px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">PC/Mac</span>
            {browserInfo.isDesktop && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" title="Votre appareil" />
            )}
          </button>
        </div>

        {/* CONTENU 1 : GUIDAGE iOS (SAFARI) */}
        {activeTab === 'ios' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            {/* Étape 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Touchez le bouton </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Partager
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (Situé dans la barre en bas de Safari sur iPhone, ou en haut sur iPad)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 2 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Faites défiler vers le bas et sélectionnez </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  « Sur l'écran d'accueil »
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                    <PlusSquare className="w-3.5 h-3.5" />
                  </span>
                </strong>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 3 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                3
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Touchez </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« Ajouter »</strong>
                <span> en haut à droite pour valider.</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU 2 : GUIDAGE SPÉCIFIQUE SAMSUNG INTERNET */}
        {activeTab === 'samsung' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            {browserInfo.isSamsungBrowser && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-[11px] font-medium mb-1">
                <Compass className="w-4 h-4 flex-shrink-0" />
                <span>Navigateur Samsung Internet détecté. Suivez ces 3 étapes :</span>
              </div>
            )}

            {/* Étape 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Appuyez sur le </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Menu du navigateur
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-500/10 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-400">
                    <Menu className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (L'icône avec les 3 traits horizontaux ☰ située en bas à droite de votre écran)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 2 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Dans le volet d'options, appuyez sur </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  « Ajouter la page à »
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </strong>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 3 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                3
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Sélectionnez </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  « Écran d'accueil »
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-500/10 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-400">
                    <Smartphone className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span> puis validez sur </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« Ajouter »</strong>
                <span>. L'icône de l'application sera ajoutée directement.</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU 3 : GUIDAGE ANDROID STANDARD (CHROME, FIREFOX, EDGE) */}
        {activeTab === 'android' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            {/* Étape 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Appuyez sur le </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Menu du navigateur
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (Les 3 points verticaux situés en haut à droite ou en bas selon votre navigateur)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 2 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Appuyez sur </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  « Installer l'application »
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-500/10 dark:bg-red-400/20 text-red-600 dark:text-red-400">
                    <Download className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (ou « Ajouter à l'écran d'accueil »)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 3 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                3
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Confirmez en cliquant sur </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« Installer »</strong>
                <span>. L'icône apparaîtra parmi vos applications mobiles.</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU 4 : GUIDAGE ORDINATEUR */}
        {activeTab === 'desktop' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Dans Chrome, Edge ou Brave, cliquez sur l'icône </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Installer
                  <Download className="w-3.5 h-3.5 text-red-500" />
                </strong>
                <span> située à l'extrême droite de votre barre d'adresse.</span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Ou ouvrez le menu </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« ⋮ »</strong>
                <span> du navigateur &gt; sélectionnez </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« Installer Éliciné »</strong>.
              </div>
            </div>
          </div>
        )}

        {/* Avantages PWA */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Expérience fluide, mode plein écran instantané et catalogue accessible hors-ligne.</span>
        </div>

        {/* Bouton de confirmation */}
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

export default InstallModal;
