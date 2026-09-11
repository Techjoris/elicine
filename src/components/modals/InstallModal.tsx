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
  Sparkles 
} from 'lucide-react';

/**
 * Détection précise de l'appareil utilisateur
 */
export const detectDeviceType = (): 'ios' | 'android' | 'desktop' => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) return 'ios';
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) return 'android';
  return 'desktop';
};

export interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'ios' | 'android' | 'desktop';
}

export const InstallModal: React.FC<InstallModalProps> = ({ 
  isOpen, 
  onClose,
  defaultTab
}) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('android');

  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      } else {
        setActiveTab(detectDeviceType());
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

        {/* Onglets de sélection du système */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iOS (Safari)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-zinc-700/60'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Ordinateur</span>
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

        {/* CONTENU 2 : GUIDAGE ANDROID / AUTRES NAVIGATEURS */}
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

        {/* CONTENU 3 : GUIDAGE ORDINATEUR */}
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
