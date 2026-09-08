import React from 'react';
import { useApp } from '../../context/AppContext';
import { ElicineLogo } from '../ElicineLogo';
import { ShieldCheck, Heart } from 'lucide-react';

interface FooterProps {
  onNavigateTerms?: (section?: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigateTerms }) => {
  const { setActiveView, setIsTipModalOpen, setIsProModalOpen } = useApp();

  const handleGoToTerms = (section?: string) => {
    if (onNavigateTerms) {
      onNavigateTerms(section);
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/terms${section ? `#${section}` : ''}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setActiveView('terms');
  };

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setActiveView('home');
  };

  return (
    <footer className="w-full mt-auto border-t border-white/10 bg-[#0a0a0a] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-zinc-400">
        
        {/* Left: Brand + Attribution */}
        <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <div 
            onClick={handleGoHome}
            className="cursor-pointer hover:opacity-80 transition-opacity select-none flex items-center gap-1.5"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="sm" variant="full" />
          </div>
          <span className="hidden sm:inline text-zinc-700">•</span>
          <p className="text-[11px] leading-relaxed max-w-sm text-zinc-400">
            Plateforme cinéphile propulsée par l'intelligence artificielle. Données et visuels fournis par TMDB.
          </p>
        </div>

        {/* Right: Discreet Legal & Action Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => handleGoToTerms()}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer select-none flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            <span>Conditions &amp; Confidentialité</span>
          </button>

          <span className="text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => setIsProModalOpen(true)}
            className="text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer select-none"
          >
            Pass Pro
          </button>

          <span className="text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => setIsTipModalOpen(true)}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer select-none flex items-center gap-1"
          >
            <span>☕ Soutenir</span>
          </button>

          <span className="text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => handleGoToTerms('contact')}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer select-none"
          >
            Contact
          </button>
        </div>

      </div>

      {/* Micro Copyright Bar */}
      <div className="border-t border-white/5 py-3 text-center text-[10px] text-zinc-600">
        © 2026 Éliciné. Tous droits réservés.
      </div>
    </footer>
  );
};

export default Footer;
