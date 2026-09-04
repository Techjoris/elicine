import React from 'react';
import { Header } from './Header';

export interface NavbarProps {
  onGoHome?: () => void;
  onOpenSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onGoHome, onOpenSettings }) => {
  return <Header onGoHome={onGoHome} onOpenSettings={onOpenSettings} />;
};

export default Navbar;
