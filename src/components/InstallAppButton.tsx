import React from 'react';

export interface InstallAppButtonProps {
  className?: string;
  variant?: 'auto' | 'header' | 'sidebar' | 'pill' | 'card' | 'minimal' | 'link';
  showBadge?: boolean;
}

export const detectOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, isDesktop: true };
  }
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /ipad|iphone|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isDesktop = !isAndroid && !isIOS;
  return { isIOS, isAndroid, isDesktop };
};

/**
 * Composant de bannière / guide d'installation PWA retiré de l'interface visuelle
 * pour offrir une expérience utilisateur totalement épurée sur mobile et desktop.
 * La logique PWA native (manifest.json et Service Worker) reste active en arrière-plan.
 */
export const InstallAppButton: React.FC<InstallAppButtonProps> = () => {
  return null;
};

export default InstallAppButton;
