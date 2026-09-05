import React, { useEffect } from 'react';
import { X, Crown, Sparkles, ArrowRight, Zap, Infinity, Star } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ProSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProSuccessModal: React.FC<ProSuccessModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      // Confettis premium dorés + bleus Pro
      confetti({
        particleCount: 180,
        spread: 100,
        origin: { y: 0.55 },
        colors: ['#f59e0b', '#fbbf24', '#eab308', '#0ea5e9', '#2563eb', '#ffffff']
      });
      // Deuxième salve décalée pour effet cascade
      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.4, x: 0.3 },
          colors: ['#f59e0b', '#fbbf24', '#ffffff']
        });
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.4, x: 0.7 },
          colors: ['#0ea5e9', '#2563eb', '#ffffff']
        });
      }, 400);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl overflow-hidden text-slate-100 text-center my-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-success-title"
      >
        {/* Glow border gradient */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-amber-500/40 via-sky-500/20 to-amber-400/30 blur-xl pointer-events-none" />
        <div className="relative bg-[#07090e] border border-amber-500/40 rounded-3xl p-6 sm:p-9 space-y-6 shadow-[0_0_80px_-10px_rgba(245,158,11,0.45)]">

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Crown icon with halo */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-400/25 blur-2xl scale-150" />
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 p-0.5 shadow-[0_0_50px_rgba(245,158,11,0.55)]">
                <div className="w-full h-full bg-[#07090e] rounded-[22px] flex items-center justify-center">
                  <Crown className="w-11 h-11 text-amber-400 fill-amber-400/30" />
                </div>
              </div>
              {/* Orbiting sparkles */}
              <Star className="absolute -top-2 -right-2 w-5 h-5 text-yellow-300 fill-yellow-300 animate-pulse" />
              <Sparkles className="absolute -bottom-1 -left-2 w-4 h-4 text-sky-400 animate-pulse" />
            </div>

            {/* Pro badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-sky-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-widest shadow-sm">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Membre Éliciné Pro Activé</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h2
              id="pro-success-title"
              className="text-2xl sm:text-3xl font-black text-white tracking-tight"
            >
              Bienvenue dans l'expérience{' '}
              <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
                Éliciné Pro
              </span>{' '}
              !
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              Votre abonnement est actif. Profitez dès maintenant des recherches IA illimitées,
              de la synchronisation de vos favoris et de l'accès prioritaire aux nouveautés.
            </p>
          </div>

          {/* Benefits list */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            {[
              { icon: <Infinity className="w-4 h-4 text-sky-400" />, label: 'Recherches IA Illimitées', color: 'border-sky-500/30 bg-sky-500/10' },
              { icon: <Star className="w-4 h-4 text-amber-400 fill-amber-400/30" />, label: 'Streaming Mondial Débloqué', color: 'border-amber-500/30 bg-amber-500/10' },
              { icon: <Sparkles className="w-4 h-4 text-emerald-400" />, label: 'Nouveautés Prioritaires', color: 'border-emerald-500/30 bg-emerald-500/10' }
            ].map(({ icon, label, color }) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border ${color} text-xs font-semibold text-slate-200`}
              >
                {icon}
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm shadow-[0_0_35px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2.5 uppercase tracking-wide transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
            >
              <span>Commencer à explorer (Illimité)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto py-4 px-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              Fermer
            </button>
          </div>

          {/* Footer reassurance */}
          <p className="text-[10px] text-slate-500 mt-1">
            ✅ Abonnement actif · Renouvellement automatique · Annulable à tout moment
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProSuccessModal;
