import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { ElicineLogo } from '../ElicineLogo';

export const TermsConsentModal: React.FC = () => {
  const { activeView } = useApp();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(true);
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
    }, 180);
  };

  if (!isOpen || hasAccepted) return null;

  return (
    <div 
      className={`fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-200 select-none ${
        isClosing ? 'opacity-0' : 'opacity-100 animate-fade-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div 
        className={`w-full max-w-md bg-white dark:bg-[#0D0D0E] border border-zinc-200 dark:border-white/10 rounded-xl p-6 sm:p-7 shadow-2xl text-zinc-900 dark:text-white space-y-5 transition-all duration-200 transform ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
      >
        {/* En-tête minimaliste : Logo Éliciné */}
        <div className="flex items-center justify-between">
          <ElicineLogo variant="full" size="sm" />
        </div>

        {/* Hiérarchie typographique dynamique via store i18n */}
        <div className="space-y-2">
          <h2 
            id="terms-gate-title"
            className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-white tracking-tight"
          >
            {t.consentModal.title}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t.consentModal.description}
          </p>
        </div>

        {/* Lien dynamique vers les CGU */}
        <div>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white underline underline-offset-4 transition-colors inline-block font-medium"
          >
            {t.consentModal.readTermsLink}
          </a>
        </div>

        {/* Case à cocher & Bouton principal localisés */}
        <div className="space-y-4 pt-1">
          <label 
            htmlFor="cgu-checkbox"
            className="flex items-start gap-3 cursor-pointer select-none group"
          >
            <input
              id="cgu-checkbox"
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white accent-zinc-900 dark:accent-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-950 dark:group-hover:text-zinc-100 leading-snug">
              {t.consentModal.checkbox}
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={!isChecked}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-zinc-900 dark:disabled:hover:bg-white disabled:cursor-not-allowed font-medium text-xs sm:text-sm transition-colors cursor-pointer text-center select-none shadow-sm"
          >
            {t.consentModal.button}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsConsentModal;
