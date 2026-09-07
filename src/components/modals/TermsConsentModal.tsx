import React, { useState, useEffect } from 'react';
import { ShieldCheck, ExternalLink, Check, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ElicineLogo } from '../ElicineLogo';

export const TermsConsentModal: React.FC = () => {
  const { activeView } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(true); // default true until verified to avoid flash
  const [isChecked, setIsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem('elicine_cgu_accepted');
      if (accepted === 'true') {
        setHasAccepted(true);
        setIsOpen(false);
      } else {
        setHasAccepted(false);
        // Si l'utilisateur n'est pas déjà sur /terms, afficher la modale
        if (activeView !== 'terms') {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      }
    } catch {
      setHasAccepted(true);
      setIsOpen(false);
    }
  }, [activeView]);

  const handleAccept = () => {
    if (!isChecked) return;
    try {
      localStorage.setItem('elicine_cgu_accepted', 'true');
    } catch (e) {
      console.error(e);
    }
    setIsClosing(true);
    setTimeout(() => {
      setHasAccepted(true);
      setIsOpen(false);
      setIsClosing(false);
    }, 250);
  };

  if (!isOpen || hasAccepted) return null;

  return (
    <div 
      className={`fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-opacity duration-200 select-none ${
        isClosing ? 'opacity-0' : 'opacity-100 animate-fade-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div 
        className={`relative w-full max-w-lg bg-[#0b0f19] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white space-y-6 transition-all duration-200 transform ${
          isClosing ? 'scale-95' : 'scale-100 animate-scale-in'
        }`}
      >
        {/* Glow effect */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-br from-blue-600/30 to-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header: Logo & Badge */}
        <div className="flex flex-col items-center text-center space-y-3 pt-1">
          <ElicineLogo variant="full" size="md" />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-cyan-400 text-[11px] font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Protection &amp; Transparence</span>
          </div>

          <h2 
            id="terms-gate-title"
            className="text-xl sm:text-2xl font-black tracking-tight text-white"
          >
            Bienvenue sur Éliciné
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
            Pour profiter de la découverte cinématographique intelligente et de nos recommandations personnalisées, veuillez accepter nos conditions d'utilisation et notre politique de protection des données.
          </p>
        </div>

        {/* Link to full legal document */}
        <div className="p-3.5 rounded-2xl bg-[#0f1523] border border-slate-800 text-center">
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors cursor-pointer"
          >
            <span>Consulter l'intégralité des CGU et de la Politique de Confidentialité</span>
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
          </a>
        </div>

        {/* Checkbox and Accept Action */}
        <div className="space-y-4 pt-1">
          <label 
            htmlFor="cgu-checkbox"
            className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
          >
            <div className="relative flex items-center justify-center flex-shrink-0 mt-0.5">
              <input
                id="cgu-checkbox"
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                className="sr-only peer"
              />
              <div 
                className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                  isChecked 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm ring-2 ring-blue-500/30' 
                    : 'bg-slate-900/80 border-slate-700 peer-focus:border-cyan-400'
                }`}
              >
                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>

            <span className="text-xs text-slate-300 leading-snug">
              J'ai lu et j'accepte les Conditions Générales d'Utilisation et la Politique de Confidentialité.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={!isChecked}
            className={`w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
              isChecked
                ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 hover:from-blue-500 hover:to-teal-300 text-slate-950 shadow-cyan-500/25 cursor-pointer transform hover:-translate-y-0.5'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${isChecked ? 'text-slate-950' : 'text-slate-500'}`} />
            <span>Accepter et continuer</span>
          </button>
        </div>

        {/* Micro reassurance footer */}
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
          <span>🔒 Authentification Google OAuth</span>
          <span>•</span>
          <span>Zéro revente de données</span>
        </div>
      </div>
    </div>
  );
};

export default TermsConsentModal;
