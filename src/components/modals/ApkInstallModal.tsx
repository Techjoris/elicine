import React from 'react';
import { useApp } from '../../context/AppContext';
import { InstallModal } from './InstallModal';

/**
 * Compatibilité avec les anciens points d'entrée « APK » : ils ouvrent
 * désormais le même parcours PWA que le bouton Installer principal.
 */
export const ApkInstallModal: React.FC = () => {
  const { isApkModalOpen, setIsApkModalOpen } = useApp();
  return <InstallModal isOpen={isApkModalOpen} onClose={() => setIsApkModalOpen(false)} />;
};

export default ApkInstallModal;
