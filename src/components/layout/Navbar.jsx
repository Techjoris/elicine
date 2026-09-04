import React from 'react';
import InstallAppButton from '../InstallAppButton';
import LanguageSelector from '../LanguageSelector';

export default function Navbar({ onOpenSettings }) {
  return (
    <header className="h-16 w-full flex items-center justify-end px-6 py-3 bg-transparent relative z-30">
      <div className="flex items-center gap-3">
        {/* Installation PWA avec détection d'OS */}
        <InstallAppButton />

        {/* Sélecteur de langue compact */}
        <LanguageSelector />

        {/* Bouton Paramètres rapide */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all backdrop-blur-md cursor-pointer"
          title="Paramètres de visionnage"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
