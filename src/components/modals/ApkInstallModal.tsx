import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Download, 
  ShieldCheck, 
  Layers, 
  Apple, 
  Sparkles,
  Share,
  PlusSquare,
  QrCode,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { detectOS } from '../common/InstallAppButton';

export const ApkInstallModal: React.FC = () => {
  const { 
    isApkModalOpen, 
    setIsApkModalOpen, 
    canInstallPwa, 
    installPwa, 
    showToast 
  } = useApp();

  const { isIOS, isAndroid, isDesktop } = detectOS();
  const [activeTab, setActiveTab] = useState<'auto' | 'android' | 'ios' | 'desktop'>('auto');

  if (!isApkModalOpen) return null;

  const currentView = activeTab === 'auto' 
    ? (isIOS ? 'ios' : isAndroid ? 'android' : 'desktop') 
    : activeTab;

  const handleDownloadApk = () => {
    const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/downloads/cineai-release.apk';
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = 'elicine-release.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('🚀 Téléchargement de l\'APK Éliciné démarré !');
  };

  const handleNativePwaInstall = async () => {
    if (canInstallPwa) {
      await installPwa();
      setIsApkModalOpen(false);
    } else {
      handleDownloadApk();
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://cineai.app';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentOrigin)}&bgcolor=0c111e&color=38bdf8&margin=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0c111e] border border-sky-500/30 shadow-[0_0_50px_rgba(14,165,233,0.2)] overflow-hidden text-slate-100 p-6 sm:p-8 space-y-5 my-auto">
        
        {/* Close Button */}
        <button
          onClick={() => setIsApkModalOpen(false)}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-2xl max-w-xs mx-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('android')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              currentView === 'android' 
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android</span>
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              currentView === 'ios' 
                ? 'bg-sky-500 text-white font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iPhone / iOS</span>
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              currentView === 'desktop' 
                ? 'bg-purple-500 text-white font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </button>
        </div>

        {/* ─── CAS 1 : VUE iOS (iPhone / iPad) ─── */}
        {currentView === 'ios' && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 p-0.5 mx-auto shadow-lg shadow-sky-500/20">
                <div className="w-full h-full bg-[#0c111e] rounded-[14px] flex items-center justify-center">
                  <Apple className="w-7 h-7 text-sky-400" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Installer Éliciné sur <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-300">iPhone &amp; iPad</span>
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Profitez de l'application native sans passer par l'App Store, en 3 étapes simples.
              </p>
            </div>

            {/* 3 Step Visual Guide */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Ouvrir le menu Partager</span>
                    <Share className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Dans Safari, touchez le bouton <strong>Partager</strong> en bas au centre de votre écran.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Sur l'écran d'accueil</span>
                    <PlusSquare className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Faites défiler vers le bas puis choisissez <strong>"Sur l'écran d'accueil (+)"</strong>.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Valider "Ajouter"</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Touchez <strong>Ajouter</strong> en haut à droite. Éliciné est maintenant installée comme une vraie appli !
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CAS 2 : VUE ANDROID ─── */}
        {currentView === 'android' && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 mx-auto shadow-lg shadow-emerald-500/20">
                <div className="w-full h-full bg-[#0c111e] rounded-[14px] flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-emerald-400" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Installer <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Éliciné Android</span>
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Téléchargez directement l'APK certifié sans publicité ni pistage.
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Bouton APK Direct */}
              <button
                onClick={handleDownloadApk}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-slate-950/20 flex items-center justify-center">
                    <Download className="w-5 h-5 text-slate-950" />
                  </div>
                  <div>
                    <div className="font-extrabold text-slate-950">Télécharger le fichier APK</div>
                    <div className="text-[11px] text-slate-900/80 font-medium">Pour tous smartphones Android (.apk direct)</div>
                  </div>
                </div>
                <span className="text-xs font-black bg-slate-950/20 px-2.5 py-1 rounded-lg">v1.2.0</span>
              </button>

              {/* Bouton PWA si supporté */}
              {canInstallPwa && (
                <button
                  onClick={handleNativePwaInstall}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span>Installer comme Progressive Web App (PWA)</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}

              {/* Conseil autorisation Android */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                💡 <strong className="text-slate-300">Astuce :</strong> Si votre smartphone bloque l'installation, appuyez sur <em>"Détails"</em> puis <em>"Installer quand même"</em>.
              </div>
            </div>
          </div>
        )}

        {/* ─── CAS 3 : VUE DESKTOP (PC / MAC) ─── */}
        {currentView === 'desktop' && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Ouvrir Éliciné sur votre <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">Smartphone</span>
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Scannez le QR code ci-dessous avec l'appareil photo de votre smartphone.
              </p>
            </div>

            {/* QR Code Card */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="p-3 bg-white rounded-2xl shadow-xl">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code Éliciné" 
                  className="w-36 h-36 object-contain rounded-lg"
                  loading="lazy"
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-sky-400" />
                <span>Compatible iOS &amp; Android (sans inscription requise)</span>
              </span>
            </div>

            {/* Secondary Option: Direct APK download for PC users to send to their phone */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadApk}
                className="flex-1 p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Télécharger l'APK sur PC</span>
              </button>

              {canInstallPwa && (
                <button
                  onClick={handleNativePwaInstall}
                  className="flex-1 p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Installer sur PC (PWA)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Security badge footer */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-850">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>Application 100% sécurisée, sans publicité intrusive ni pistage</span>
        </div>

      </div>

    </div>
  );
};
