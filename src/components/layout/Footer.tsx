import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ElicineLogo } from '../ElicineLogo';
import { ShieldCheck, Heart, Mail, Clapperboard, Crown } from 'lucide-react';

interface FooterProps {
  onNavigateTerms?: (section?: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigateTerms }) => {
  const { user: appUser, setActiveView, setIsTipModalOpen, setIsProModalOpen, openFeedbackModal } = useApp();
  const { user: authUser } = useAuth();

  const isPro = Boolean(
    (appUser?.email || authUser?.email)?.toLowerCase() === 'ivanjoris959@gmail.com' ||
    appUser?.isPro || (appUser as any)?.is_pro || (appUser as any)?.pass_status === 'pro' ||
    (authUser as any)?.isPro || (authUser as any)?.is_pro || (authUser as any)?.pass_status === 'pro'
  );

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
    <footer className="w-full mt-auto border-t border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0a0a0a] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-600 dark:text-zinc-400">
        
        {/* Left: Brand + Attribution */}
        <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <div 
            onClick={handleGoHome}
            className="cursor-pointer hover:opacity-80 transition-opacity select-none flex items-center gap-1.5"
            title="Retour à l'accueil"
          >
            <ElicineLogo size="sm" variant="full" />
          </div>
          <span className="hidden sm:inline text-slate-300 dark:text-zinc-700">•</span>
          <p className="text-[11px] leading-relaxed max-w-sm text-slate-500 dark:text-zinc-400">
            Plateforme cinéphile propulsée par l'intelligence artificielle. Données et visuels fournis par TMDB.
          </p>
        </div>

        {/* Right: Discreet Legal, Contact & Action Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => openFeedbackModal()}
            className="text-slate-600 hover:text-emerald-500 dark:text-zinc-300 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-bold"
            title="Ouvrir le formulaire de signalement et de suggestions"
          >
            <Clapperboard className="w-3.5 h-3.5 text-[#e50914]" />
            <span>Signalement &amp; Suggestions</span>
          </button>

          <span className="text-slate-300 dark:text-zinc-700">•</span>

          <a
            href="mailto:support@elicine.app"
            className="text-slate-600 hover:text-sky-600 dark:text-zinc-400 dark:hover:text-sky-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-medium"
            title="Contacter le support officiel Éliciné"
          >
            <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
            <span>support@elicine.app</span>
          </a>

          <span className="text-slate-300 dark:text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => handleGoToTerms()}
            className="text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
            <span>Conditions &amp; Confidentialité</span>
          </button>

          <span className="text-slate-300 dark:text-zinc-700">•</span>

          {/* Statut Pass Pro Actif ou Bouton Pass Pro */}
          {isPro ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1 select-none">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>Éliciné Pro Actif</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsProModalOpen(true)}
              className="text-slate-600 hover:text-amber-500 dark:text-zinc-400 dark:hover:text-amber-400 transition-colors cursor-pointer select-none"
            >
              Pass Pro
            </button>
          )}

          <span className="text-slate-300 dark:text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => setIsTipModalOpen(true)}
            className="text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none flex items-center gap-1"
          >
            <span>☕ Soutenir</span>
          </button>

          <span className="text-slate-300 dark:text-zinc-700">•</span>

          <button
            type="button"
            onClick={() => handleGoToTerms('contact')}
            className="text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none"
          >
            Contact
          </button>
        </div>

      </div>

      {/* Micro Copyright Bar */}
      <div className="border-t border-slate-200/60 dark:border-white/5 py-3 text-center text-[10px] text-slate-500 dark:text-zinc-600">
        © 2026 Éliciné. Tous droits réservés.
      </div>
    </footer>
  );
};

export default Footer;
