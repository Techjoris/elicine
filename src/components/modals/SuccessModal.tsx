import React, { useEffect } from 'react';
import { 
  X, 
  Star, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight 
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'pro' | 'tip';
}

export const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, type = 'tip' }) => {
  useEffect(() => {
    if (isOpen) {
      // Animation festive de confettis dorés et éclatants
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#fbbf24', '#0ea5e9', '#10b981', '#ffffff']
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-[#0f141f] border border-amber-500/30 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 p-6 sm:p-8 space-y-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Fermer"
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icône Dorée Étoilée & Halo */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-300 p-0.5 shadow-md flex items-center justify-center">
          <div className="w-full h-full bg-amber-50 dark:bg-[#07090e] rounded-[22px] flex items-center justify-center">
            <Star className="w-10 h-10 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400 animate-pulse" />
          </div>
        </div>

        {/* En-tête et Textes */}
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Paiement Confirmé avec Succès</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white font-['Outfit'] tracking-tight">
            Merci pour votre soutien au cinéma d'exception !
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
            Votre contribution aide directement à maintenir les serveurs IA, à financer les requêtes en temps réel et à préserver l'indépendance du projet Éliciné.
          </p>
        </div>

        {/* Détail spécifique si formule Pro */}
        {type === 'pro' && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2.5 text-left text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
              <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <span>Pass Pro Illimité actif sur votre profil</span>
            </div>
            <div className="space-y-1.5 pt-1 text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 font-bold flex-shrink-0">✓</span>
                <span><strong>Quotas illimités :</strong> Vos requêtes IA sont désormais sans aucune restriction quotidienne.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-sky-500 font-bold flex-shrink-0">✓</span>
                <span><strong>Filtres avancés :</strong> Affinez vos résultats post-recherche selon vos abonnements de plateformes ou les meilleures notes.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold flex-shrink-0">✓</span>
                <span><strong>Alertes personnalisées :</strong> Suivi et notifications e-mail activés pour vos films et séries favoris.</span>
              </div>
            </div>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm shadow-md flex items-center justify-center gap-2 uppercase tracking-wide transition-all cursor-pointer"
          >
            <span>Continuer à explorer</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700 text-sm font-semibold transition-all cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};

export const ThankYouModal = SuccessModal;
export default SuccessModal;
