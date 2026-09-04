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
        className="relative w-full max-w-lg rounded-3xl bg-[#0f141f] border border-amber-500/30 shadow-[0_0_60px_-10px_rgba(245,158,11,0.35)] overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Fermer"
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icône Dorée Étoilée & Halo */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-300 p-0.5 shadow-[0_0_40px_rgba(245,158,11,0.45)] flex items-center justify-center">
          <div className="w-full h-full bg-[#07090e] rounded-[22px] flex items-center justify-center">
            <Star className="w-10 h-10 text-amber-400 fill-amber-400 animate-pulse" />
          </div>
        </div>

        {/* En-tête et Textes */}
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Paiement Confirmé avec Succès</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit'] tracking-tight">
            Merci pour votre soutien au cinéma d'exception !
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
            Votre contribution aide directement à maintenir les serveurs IA, à financer les requêtes en temps réel et à préserver l'indépendance du projet Éliciné.
          </p>
        </div>

        {/* Détail spécifique si formule Pro */}
        {type === 'pro' && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-left">
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Pass Pro Illimité actif sur votre profil</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span>Recherches IA illimitées & accès à tout le streaming mondial débloqués</span>
            </div>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm shadow-[0_0_30px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 uppercase tracking-wide transition-all cursor-pointer"
          >
            <span>Continuer à explorer</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-sm font-semibold transition-all cursor-pointer"
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
