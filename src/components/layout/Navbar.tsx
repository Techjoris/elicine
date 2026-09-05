import React from 'react';
import { Header } from './Header';

export interface NavbarProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTip?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onGoHome, onOpenSettings, onOpenTip }) => {
  return <Header onGoHome={onGoHome} onOpenSettings={onOpenSettings} onOpenTip={onOpenTip} />;
};

export default Navbar;
