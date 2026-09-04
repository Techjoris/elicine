import React, { useEffect } from 'react';
import { 
  X, 
  Crown, 
  Coffee, 
  Heart, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight 
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'pro' | 'tip';
}

export const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, type }) => {
  useEffect(() => {
    if (isOpen) {
      // Fire festive confetti animation
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#0ea5e9', '#2563eb', '#f59e0b', '#10b981', '#ffffff']
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0f141f] border border-sky-500/30 shadow-[0_0_60px_-10px_rgba(14,165,233,0.35)] overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6 text-center">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Glow */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-tr from-sky-500 via-blue-600 to-amber-400 p-0.5 shadow-neon-cyan flex items-center justify-center">
          <div className="w-full h-full bg-[#07090e] rounded-[22px] flex items-center justify-center">
            {type === 'pro' ? (
              <Crown className="w-10 h-10 text-amber-400 animate-bounce" />
            ) : (
              <Heart className="w-10 h-10 text-red-500 fill-red-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Paiement Confirmé avec Succès</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
            🎉 Un immense merci !
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
            {type === 'pro' ? (
              <span>
                Votre abonnement <strong>CinéIA Pass Pro</strong> est désormais actif. Vous profitez de recherches IA illimitées, de filtres cinéma exclusifs et d'un accès direct à tout le streaming mondial.
              </span>
            ) : (
              <span>
                Votre pourboire et votre générosité touchent toute l'équipe de CinéIA au cœur ! Vous contribuez directement au maintien des serveurs IA et au développement des fonctionnalités gratuites.
              </span>
            )}
          </p>
        </div>

        {/* Feature Pill Highlights */}
        {type === 'pro' && (
          <div className="p-3.5 rounded-2xl bg-[#07090e] border border-[#1e293b] space-y-2 text-left">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Badge VIP Pro débloqué sur votre profil</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span>Plus aucune limite quotidienne de requêtes IA</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm shadow-neon-blue flex items-center justify-center gap-2 uppercase transition-all"
        >
          <span>Commencer à explorer</span>
          <ArrowRight className="w-4 h-4" />
        </button>

      </div>

    </div>
  );
};
