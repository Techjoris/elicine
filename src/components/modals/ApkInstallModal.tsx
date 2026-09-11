import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { detectOS } from '../InstallAppButton';
import { IosInstallModal } from '../pwa';

export const ApkInstallModal: React.FC = () => {
  const { 
    isApkModalOpen, 
    setIsApkModalOpen, 
    canInstallPwa, 
    installPwa, 
    triggerApkDownload,
    showToast 
  } = useApp();

  const { isIOS, isAndroid } = detectOS();

  useEffect(() => {
    if (!isApkModalOpen) return;

    // Si ouvert sur Android, déclencher directement le téléchargement APK et fermer sans modal
    if (isAndroid) {
      if (triggerApkDownload) {
        triggerApkDownload();
      } else {
        const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
        const link = document.createElement('a');
        link.href = apkUrl;
        link.setAttribute('download', 'elicine.apk');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setIsApkModalOpen(false);
      return;
    }

    // Si ouvert sur Desktop, tenter l'installation PWA directe
    if (!isIOS) {
      if (canInstallPwa) {
        installPwa();
      } else {
        showToast("💡 Utilisez l'icône d'installation dans la barre d'adresse de votre navigateur.");
      }
      setIsApkModalOpen(false);
    }
  }, [isApkModalOpen, isAndroid, isIOS, canInstallPwa, installPwa, showToast, setIsApkModalOpen]);

  return null;
};

export default ApkInstallModal;

