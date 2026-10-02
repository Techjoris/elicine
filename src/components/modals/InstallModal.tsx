import React, { useEffect, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import {
  checkIsStandalone,
  describeInstallEnvironment,
  hasNativeInstallPrompt,
  promptNativeInstall,
  subscribeToInstallPrompt
} from '../../hooks/usePWAInstall';
import type { InstallDiagnostic } from '../../hooks/usePWAInstall';
import { isIosEnvironment } from '../../lib/pwaInstallMode';

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
  isWindows: boolean;
  isInAppBrowser: boolean;
  recommendedTab: InstallTab;
}

/** Les libellés du navigateur servent uniquement à guider les gestes manuels. */
export const detectBrowserInfo = (
  userAgent?: string,
  platform?: string,
  maxTouchPoints?: number
): BrowserInfo => {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const currentPlatform = platform ?? (typeof navigator !== 'undefined' ? navigator.platform || '' : '');
  const touchPoints = maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);
  const isIOS = isIosEnvironment(ua, currentPlatform, touchPoints);
  const isAndroid = /Android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;
  const isWindows = /Windows/i.test(ua);
  const isInAppBrowser = /Instagram|FBAN|FBAV|FB_IAB|; wv\)|Line\//i.test(ua);
  const isSamsungBrowser = /SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /Edg|Edge/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua) && !isSamsungBrowser && !isEdge;
  const isSafari = /Safari/i.test(ua) && !isChrome && !isEdge && !isFirefox && !isSamsungBrowser;

  let browserName = 'votre navigateur';
  let recommendedTab: InstallTab = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  if (isInAppBrowser) {
    browserName = 'navigateur intégré';
  } else if (isIOS) {
    browserName = isChrome ? 'Chrome sur iPhone' : isEdge ? 'Edge sur iPhone'
      : isFirefox ? 'Firefox sur iPhone' : 'Safari sur iPhone';
  } else if (isSamsungBrowser) {
    browserName = 'Samsung Internet';
    recommendedTab = 'samsung';
  } else if (isFirefox) {
    browserName = isAndroid ? 'Firefox sur Android' : 'Firefox sur ordinateur';
    recommendedTab = 'firefox';
  } else if (isAndroid) {
    browserName = isEdge ? 'Edge sur Android' : isChrome ? 'Chrome sur Android' : 'votre navigateur Android';
  } else {
    browserName = isSafari ? 'Safari sur Mac' : isEdge ? 'Edge sur ordinateur'
      : isChrome ? 'Chrome sur ordinateur' : 'votre navigateur sur ordinateur';
  }
  return { browserName, isSamsungBrowser, isIOS, isAndroid, isFirefox, isChrome, isEdge, isDesktop, isWindows, isInAppBrowser, recommendedTab };
};

export const detectDeviceType = (): InstallTab => detectBrowserInfo().recommendedTab;

export interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: InstallTab;
}

export function installSteps(info: BrowserInfo, tab: InstallTab): string[] {
  if (info.isInAppBrowser) {
    return [
      'Ouvrez le menu de cette page et choisissez « Ouvrir dans le navigateur ».',
      'Dans le navigateur ouvert, utilisez son menu « Installer » ou « Ajouter à l’écran d’accueil ».'
    ];
  }
  if (tab === 'ios') {
    if (info.isChrome && info.isIOS) {
      return [
        'Touchez Partager à droite de la barre d’adresse de Chrome.',
        'Choisissez « Ajouter à l’écran d’accueil ».',
        'Confirmez avec « Ajouter ».'
      ];
    }
    return [
      info.isIOS && !info.isChrome && info.browserName !== 'Safari sur iPhone'
        ? 'Ouvrez le menu Partager de votre navigateur. Si « Ajouter à l’écran d’accueil » manque, ouvrez cette page dans Safari.'
        : 'Dans Safari, touchez Partager (parfois dans le menu « … »).',
      'Choisissez « Sur l’écran d’accueil » ou « Ajouter à l’écran d’accueil ».',
      'Touchez « Ajouter » et, si proposé, « Ouvrir comme app ».'
    ];
  }
  if (tab === 'firefox') {
    if (info.isAndroid) {
      return [
        'Ouvrez le menu ⋮ de Firefox.',
        'Touchez « Installer » ou « Ajouter à l’écran d’accueil ».',
        'Confirmez l’ajout sur l’écran d’accueil.'
      ];
    }
    return info.isWindows
      ? [
        'Sur Firefox pour Windows, cliquez sur l’icône d’application dans la barre d’adresse.',
        'Si cette icône n’apparaît pas, ouvrez Éliciné dans Chrome ou Edge et choisissez « Installer » dans la barre d’adresse.'
      ]
      : ['Sur Mac ou Linux, ouvrez Éliciné dans Chrome ou Edge, puis choisissez « Installer » dans la barre d’adresse.'];
  }
  if (tab === 'samsung') {
    return [
      'Ouvrez le menu de Samsung Internet.',
      'Choisissez « Ajouter la page à » puis « Écran d’accueil », ou « Installer l’application » si cette option apparaît.',
      'Confirmez avec « Ajouter » ou « Installer ».'
    ];
  }
  if (tab === 'android') {
    return [
      'Ouvrez le menu ⋮ de votre navigateur.',
      'Touchez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
      'Confirmez en touchant « Installer » ou « Ajouter ».'
    ];
  }
  if (/Safari sur Mac/.test(info.browserName)) {
    return ['Dans Safari, ouvrez le menu Fichier.', 'Choisissez « Ajouter au Dock » et confirmez.'];
  }
  return [
    'Cliquez sur l’icône Installer à droite de la barre d’adresse.',
    'Si elle n’apparaît pas, ouvrez le menu ⋮ du navigateur et choisissez « Installer Éliciné ».'
  ];
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose, defaultTab }) => {
  const [browserInfo, setBrowserInfo] = useState(detectBrowserInfo);
  const [activeTab, setActiveTab] = useState<InstallTab>(() => defaultTab || detectDeviceType());
  const [canInstallNatively, setCanInstallNatively] = useState(hasNativeInstallPrompt);
  const [diagnostic, setDiagnostic] = useState<InstallDiagnostic | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => subscribeToInstallPrompt(() => setCanInstallNatively(hasNativeInstallPrompt())), []);

  useEffect(() => {
    if (!isOpen) return;
    const info = detectBrowserInfo();
    setBrowserInfo(info);
    setActiveTab(defaultTab || info.recommendedTab);
    setCanInstallNatively(hasNativeInstallPrompt());
  }, [isOpen, defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    describeInstallEnvironment().then(value => {
      if (active) setDiagnostic(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [isOpen, canInstallNatively]);

  useEffect(() => {
    if (!isOpen) return;
    const onInstalled = () => onClose();
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const installed = checkIsStandalone() || Boolean(diagnostic?.alreadyInstalled);
  const steps = installSteps(browserInfo, activeTab);
  const guidanceLabel = activeTab === browserInfo.recommendedTab
    ? browserInfo.browserName
    : {
      ios: 'iPhone ou iPad',
      android: 'Android',
      samsung: 'Samsung Internet',
      firefox: 'Firefox',
      desktop: 'ordinateur'
    }[activeTab];
  const handleInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') onClose();
      setCanInstallNatively(hasNativeInstallPrompt());
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-white dark:bg-[#171719] text-slate-900 dark:text-white shadow-2xl p-5 sm:p-6"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 id="install-modal-title" className="text-lg font-bold">Installer Éliciné</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">{typeof window !== 'undefined' ? window.location.hostname : 'elicine.app'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        {installed ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            <Check size={18} className="shrink-0" />
            Éliciné est déjà installée. Ouvrez-la depuis votre écran d’accueil ou le menu des applications.
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-slate-600 dark:text-zinc-300">
              Retrouvez Éliciné sur votre écran d’accueil, comme une application.
            </p>
            {canInstallNatively && (
              <button
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-3 font-semibold text-white"
              >
                <Download size={18} />
                {isInstalling ? 'Installation en cours…' : 'Installer'}
              </button>
            )}
            <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-zinc-900 p-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                {canInstallNatively ? 'Autre méthode' : `Installation avec ${guidanceLabel}`}
              </p>
              <ol className="mt-3 space-y-3">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm text-slate-700 dark:text-zinc-200">
                    <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-bold">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
              Autre navigateur
              <select
                value={activeTab}
                onChange={event => setActiveTab(event.target.value as InstallTab)}
                className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-slate-700 dark:text-zinc-200"
              >
                <option value="ios">iPhone / iPad</option>
                <option value="android">Android</option>
                <option value="samsung">Samsung Internet</option>
                <option value="firefox">Firefox</option>
                <option value="desktop">Ordinateur</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
};

export default InstallModal;
