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
  Plus,
  Flame
} from 'lucide-react';
import {
  describeInstallEnvironment,
  hasNativeInstallPrompt,
  openInstallShareSheet,
  promptNativeInstall,
  subscribeToInstallPrompt
} from '../../hooks/usePWAInstall';
import type { InstallDiagnostic } from '../../hooks/usePWAInstall';
import { pwaInstallMode } from '../../lib/pwaInstallMode';

export type InstallTab = 'ios' | 'samsung' | 'firefox' | 'android' | 'desktop';

export interface BrowserInfo {
  browserName: string;
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
 * pour sélectionner automatiquement les instructions sur-mesure
 */
export const detectBrowserInfo = (): BrowserInfo => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      browserName: 'Navigateur Web',
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
  // Les navigateurs dérivés de Chromium se déclarent aussi « Chrome » : l'ordre
  // de ces tests compte pour nommer correctement celui que la personne utilise.
  const isOpera = /\bOPR\/|\bOpera[ /]/i.test(ua);
  const isBrave = /Brave/i.test(ua);
  const isVivaldi = /Vivaldi/i.test(ua);
  const isUcBrowser = /UCBrowser|UC Browser/i.test(ua);
  const isMiBrowser = /MiuiBrowser|MiBrowser/i.test(ua);
  const isChromiumDerived = isSamsungBrowser || isEdge || isOpera || isBrave || isVivaldi
    || isUcBrowser || isMiBrowser;
  const isChrome = /Chrome|CriOS/i.test(ua) && !isChromiumDerived;
  const isDesktop = !isIOS && !isAndroid;
  // Safari ne se signale que par son moteur : utile pour macOS, où l'ajout se
  // fait par « Fichier → Ajouter au dock » et non par un menu de navigateur.
  const isDesktopSafari = isDesktop && /Safari/i.test(ua) && !isChrome && !isEdge
    && !isFirefox && !isOpera && !isBrave && !isVivaldi;

  let recommendedTab: InstallTab = 'android';
  let browserName = 'Navigateur Web';

  if (isSamsungBrowser) {
    recommendedTab = 'samsung';
    browserName = 'Samsung Internet';
  } else if (isIOS) {
    recommendedTab = 'ios';
    if (isFirefox) {
      browserName = 'Firefox (iOS)';
    } else if (isChrome) {
      browserName = 'Chrome (iOS)';
    } else {
      browserName = 'Safari (iOS)';
    }
  } else if (isFirefox) {
    recommendedTab = 'firefox';
    browserName = isAndroid ? 'Firefox pour Android' : 'Mozilla Firefox';
  } else if (isAndroid) {
    recommendedTab = 'android';
    browserName = isEdge ? 'Microsoft Edge (Android)'
      : isOpera ? 'Opera (Android)'
        : isBrave ? 'Brave (Android)'
          : isVivaldi ? 'Vivaldi (Android)'
            : isUcBrowser ? 'UC Browser'
              : isMiBrowser ? 'Mi Browser'
                : isChrome ? 'Google Chrome (Android)' : 'Navigateur Android';
  } else if (isDesktop) {
    recommendedTab = 'desktop';
    browserName = isEdge ? 'Microsoft Edge'
      : isOpera ? 'Opera'
        : isBrave ? 'Brave'
          : isVivaldi ? 'Vivaldi'
            : isChrome ? 'Google Chrome'
              : isDesktopSafari ? 'Safari (macOS)' : 'Ordinateur (PC / Mac)';
  }

  return {
    browserName,
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
  // Sélection automatique et instantanée dès le premier rendu pour éviter tout décalage
  const [activeTab, setActiveTab] = useState<InstallTab>(() => defaultTab || detectBrowserInfo().recommendedTab);
  // Le navigateur peut proposer l'installation après l'ouverture de cette fenêtre :
  // on écoute l'événement pour transformer le guide en installation en un clic.
  const [canInstallNatively, setCanInstallNatively] = useState<boolean>(() => hasNativeInstallPrompt());
  const [isInstalling, setIsInstalling] = useState(false);
  const [shareOpened, setShareOpened] = useState(false);
  // État réel du navigateur : il explique pourquoi l'installation ne se propose
  // pas, et distingue « déjà installée » d'un navigateur qui n'offre rien.
  const [diagnostic, setDiagnostic] = useState<InstallDiagnostic | null>(null);

  useEffect(() => subscribeToInstallPrompt(() => setCanInstallNatively(hasNativeInstallPrompt())), []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    describeInstallEnvironment()
      .then(result => { if (active) setDiagnostic(result); })
      .catch(() => { /* le diagnostic est un confort, jamais un obstacle */ });
    return () => { active = false; };
  }, [isOpen, canInstallNatively]);

  const handleOneClickInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') onClose();
      else setCanInstallNatively(hasNativeInstallPrompt());
    } finally {
      setIsInstalling(false);
    }
  };

  const handleShareSheet = async () => {
    const opened = await openInstallShareSheet();
    setShareOpened(opened);
  };

  // Une seule décision, testée à part : installation native, feuille de partage
  // sur iOS, ou guide pour les navigateurs qui n'offrent ni l'une ni l'autre.
  const installMode = pwaInstallMode({
    hasNativePrompt: canInstallNatively,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: typeof navigator !== 'undefined' ? String((navigator as any).platform || '') : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? Number((navigator as any).maxTouchPoints) || 0 : 0
  });

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
          Installez Éliciné sur votre appareil pour un lancement direct en plein écran, sans publicité et sans passer par un store.
        </p>

        {/* Installation directe : un seul geste dès que le navigateur le permet */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 p-3.5 space-y-2.5">
          {installMode === 'native' ? (
            <>
              <button
                type="button"
                onClick={handleOneClickInstall}
                disabled={isInstalling}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] disabled:opacity-70 text-white text-sm font-bold transition-colors cursor-pointer shadow-lg shadow-red-600/25"
              >
                <Download className="w-4 h-4" />
                <span>{isInstalling ? 'Installation en cours…' : 'Installer en 1 clic'}</span>
              </button>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 text-center leading-relaxed">
                Votre navigateur installe Éliciné directement. Aucune manipulation, rien à chercher dans les menus.
              </p>
            </>
          ) : installMode === 'share' ? (
            <>
              <button
                type="button"
                onClick={handleShareSheet}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-sm font-bold transition-colors cursor-pointer shadow-lg shadow-red-600/25"
              >
                <Share className="w-4 h-4" />
                <span>Ouvrir le menu de partage</span>
              </button>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 text-center leading-relaxed">
                {shareOpened
                  ? 'Choisissez « Sur l’écran d’accueil », puis « Ajouter » : Éliciné s’installe.'
                  : 'iOS interdit l’installation automatique. Le menu de partage s’ouvre pour vous : choisissez « Sur l’écran d’accueil », puis « Ajouter ».'}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                {diagnostic?.alreadyInstalled ? (
                  <>
                    <strong className="font-semibold text-slate-800 dark:text-zinc-200">
                      Éliciné est déjà installée sur cet appareil.
                    </strong>{' '}
                    Ouvrez-la depuis votre écran d’accueil, votre Dock ou votre menu Démarrer : le navigateur ne
                    repropose pas une installation déjà faite. Pour l’installer sur un autre appareil, utilisez les
                    étapes ci-dessous.
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-slate-800 dark:text-zinc-200">{browserInfo.browserName}</strong>{' '}
                    ne propose pas l’installation automatique. Cela arrive lorsque l’invite a déjà été refusée, ou
                    lorsque le navigateur ne gère pas l’installation (Firefox). Les étapes ci-dessous prennent dix
                    secondes.
                  </>
                )}
              </p>
              {diagnostic && (
                <details className="text-[10px] text-slate-500 dark:text-zinc-500">
                  <summary className="cursor-pointer select-none">Détails techniques</summary>
                  <ul className="mt-1.5 space-y-0.5 font-mono">
                    <li>invite d’installation reçue : {diagnostic.promptReceived ? 'oui' : 'non'}</li>
                    <li>déjà installée : {diagnostic.alreadyInstalled ? 'oui' : 'non'}</li>
                    <li>service worker actif : {diagnostic.serviceWorkerActive ? 'oui' : 'non'}</li>
                    <li>lancée comme application : {diagnostic.standalone ? 'oui' : 'non'}</li>
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Bannière de détection intelligente du navigateur */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-100/90 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs">
          <div className="w-8 h-8 rounded-xl bg-red-600/15 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
            <Compass className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white truncate">
              <span>Appareil détecté :</span>
              <span className="px-2 py-0.5 rounded-md bg-red-600/10 text-red-600 dark:text-red-400 font-bold text-[11px] truncate">
                {browserInfo.browserName}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
              Guide sur-mesure sélectionné automatiquement ci-dessous :
            </p>
          </div>
        </div>

        {/* Onglets de sélection du système & navigateur */}
        <div className="grid grid-cols-5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 gap-1 text-[10px] sm:text-xs">
          {/* Onglet iOS */}
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Apple className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">iOS</span>
            {browserInfo.recommendedTab === 'ios' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-zinc-900" title="Détecté" />
            )}
          </button>

          {/* Onglet Samsung Internet */}
          <button
            type="button"
            onClick={() => setActiveTab('samsung')}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'samsung'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 flex-shrink-0 text-indigo-500" />
            <span className="truncate">Samsung</span>
            {browserInfo.recommendedTab === 'samsung' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-zinc-900" title="Détecté" />
            )}
          </button>

          {/* Onglet Firefox */}
          <button
            type="button"
            onClick={() => setActiveTab('firefox')}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'firefox'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
            <span className="truncate">Firefox</span>
            {browserInfo.recommendedTab === 'firefox' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900" title="Détecté" />
            )}
          </button>

          {/* Onglet Android (Chrome / Navigateurs) */}
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 flex-shrink-0 text-red-500" />
            <span className="truncate">Android</span>
            {browserInfo.recommendedTab === 'android' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-900" title="Détecté" />
            )}
          </button>

          {/* Onglet Ordinateur */}
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
            <span className="truncate">PC/Mac</span>
            {browserInfo.recommendedTab === 'desktop' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" title="Détecté" />
            )}
          </button>
        </div>

        {/* CONTENU 1 : GUIDAGE iOS (SAFARI & WEBKIT) */}
        {activeTab === 'ios' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            {/* Étape 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Dans Safari, touchez le bouton </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Partager
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (Situé dans la barre d'outils en bas sur iPhone, ou en haut à droite sur iPad)
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
                <span>Faites défiler la liste vers le bas et sélectionnez </span>
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
                <span> en haut à droite pour valider. L'icône apparaîtra directement sur votre écran d'accueil.</span>
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

        {/* CONTENU 3 : GUIDAGE SPÉCIFIQUE FIREFOX */}
        {activeTab === 'firefox' && (
          <div className="space-y-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 text-xs">
            {browserInfo.isFirefox && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-medium mb-1">
                <Flame className="w-4 h-4 flex-shrink-0" />
                <span>Navigateur Firefox détecté. Suivez ces étapes simples :</span>
              </div>
            )}

            {/* Étape 1 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Appuyez sur le </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  Menu Firefox
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/10 dark:bg-amber-400/20 text-amber-600 dark:text-amber-400">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (Les 3 points verticaux situés en haut à droite ou en bas selon votre affichage)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 2 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Appuyez sur </span>
                <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1 font-semibold">
                  « Ajouter à l'écran d'accueil »
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                    <Download className="w-3.5 h-3.5" />
                  </span>
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  (Firefox installe un raccourci : Éliciné s'ouvrira depuis votre écran d'accueil)
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            {/* Étape 3 */}
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                3
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Touchez </span>
                <strong className="text-slate-900 dark:text-white font-semibold">« Ajouter »</strong>
                <span>. L'icône Éliciné apparaît aussitôt sur votre écran d'accueil.</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU 4 : GUIDAGE ANDROID STANDARD (CHROME & CHROMIUM SANS PROMPT NATIF) */}
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
                  (Les 3 points verticaux situés en haut à droite)
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

        {/* CONTENU 5 : GUIDAGE ORDINATEUR (PC / MAC / LINUX) */}
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

            <div className="border-t border-slate-200/60 dark:border-zinc-800/60 my-1" />

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-slate-500/15 text-slate-600 dark:text-zinc-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                <Laptop className="w-3.5 h-3.5" />
              </div>
              <div className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                <span>Sur </span>
                <strong className="text-slate-900 dark:text-white font-semibold">Safari macOS</strong>
                <span>, ouvrez le menu </span>
                <strong className="text-slate-900 dark:text-white font-semibold">Fichier → Ajouter au Dock</strong>
                <span>. Sur </span>
                <strong className="text-slate-900 dark:text-white font-semibold">Firefox</strong>
                <span>, l'installation d'application n'existe pas : ajoutez Éliciné à vos favoris, ou passez à un navigateur qui la propose.</span>
              </div>
            </div>
          </div>
        )}

        {/* Avantages PWA */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Lancement plein écran instantané, streaming sans latence et pas d'encombrement mémoire.</span>
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
