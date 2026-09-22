import React, { useEffect, useRef, useState } from 'react';
import { Heart, Loader2, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  SUPPORTER_TIERS, SupporterTier, formatSupporterAmount, isSupporterTierAvailable, openSupporterCheckout
} from '../../services/supporterService';

type Stage = 'choose' | 'processing' | 'success' | 'error';

/**
 * Soutien ponctuel via Paddle (« Eliciné Supporter »).
 * Paiement unique : ce parcours n'active jamais le Pass Pro et ne touche à aucun abonnement.
 */
export const SupporterModal: React.FC = () => {
  const {
    isSupporterModalOpen,
    setIsSupporterModalOpen,
    setIsTipModalOpen,
    user,
    showToast,
    refreshUserProStatus
  } = useApp();

  const [stage, setStage] = useState<Stage>('choose');
  const [selected, setSelected] = useState<SupporterTier | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const completedRef = useRef(false);

  const availableTiers = SUPPORTER_TIERS.filter(isSupporterTierAvailable);
  const alreadySupporter = Boolean((user as any)?.is_supporter);

  const handleClose = () => {
    setStage('choose');
    setSelected(null);
    setErrorMessage('');
    setIsSupporterModalOpen(false);
  };

  useEffect(() => {
    if (!isSupporterModalOpen) return;
    setStage('choose');
    setSelected(null);
    setErrorMessage('');
    completedRef.current = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupporterModalOpen]);

  const handleSelect = async (tier: SupporterTier) => {
    setSelected(tier);
    setErrorMessage('');
    setStage('processing');
    let handledByCallback = false;
    const opened = await openSupporterCheckout(tier, user, {
      onSuccess: () => {
        handledByCallback = true;
        completedRef.current = true;
        setStage('success');
        Promise.resolve(refreshUserProStatus?.()).catch(() => { /* le badge se rafraîchira au prochain passage */ });
      },
      onCancel: () => {
        handledByCallback = true;
        // Paddle ferme aussi l'overlay après un paiement réussi : on ne revient à la grille
        // que si l'utilisateur n'a réellement rien réglé.
        if (!completedRef.current) setStage('choose');
      },
      onError: (error: any) => {
        handledByCallback = true;
        completedRef.current = false;
        setErrorMessage(typeof error?.message === 'string' ? error.message : 'Le paiement n’a pas pu être ouvert.');
        setStage('error');
      }
    });
    if (!opened && !handledByCallback) {
      setErrorMessage('Le module de paiement sécurisé Paddle est momentanément indisponible.');
      setStage('error');
    }
  };

  const handleMobileMoney = () => {
    setIsSupporterModalOpen(false);
    setIsTipModalOpen(true);
    showToast('Soutien par Mobile Money (FCFA)');
  };

  if (!isSupporterModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="supporter-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg mx-auto my-auto rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101014] shadow-2xl text-slate-800 dark:text-slate-100"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer"
        >
          <span className="text-base font-bold leading-none select-none">✕</span>
        </button>

        {/* Bandeau premium */}
        <div className="px-6 sm:px-8 pt-8 pb-6 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent border-b border-slate-200/70 dark:border-white/[0.08]">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
            <Sparkles className="w-3.5 h-3.5" /> Éliciné Supporter
          </div>
          <h2 id="supporter-modal-title" className="mt-3 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Soutenir le projet
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md leading-relaxed">
            Un geste ponctuel, sans abonnement et sans engagement : votre soutien finance directement
            l’infrastructure de recherche et l’indépendance d’Éliciné.
          </p>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5">
          {stage === 'success' && (
            <div className="text-center space-y-4 py-4 animate-fade-in">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Heart className="w-8 h-8" fill="currentColor" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Merci infiniment 💛</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Votre soutien {selected ? <strong>{formatSupporterAmount(selected.amount)} — {selected.label}</strong> : null} a bien été reçu.
                  Vous faites partie de celles et ceux qui gardent Éliciné libre et indépendant.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Votre reçu Paddle vous parvient par e-mail. Ce soutien n’active pas le Pass Pro et ne modifie aucun abonnement.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-sm font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-300 text-xs font-semibold flex items-start gap-2.5">
                <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Le paiement n’a pas abouti</p>
                  <p className="text-[11px] font-medium opacity-90 break-words">{errorMessage}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => { setStage('choose'); setErrorMessage(''); }}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white text-sm font-bold transition-all cursor-pointer"
                >
                  Choisir un autre montant
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-sm font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {(stage === 'choose' || stage === 'processing') && (
            <>
              {alreadySupporter && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-2.5">
                  <Heart className="w-4 h-4 flex-shrink-0" fill="currentColor" />
                  <span>Vous êtes déjà Supporter d’Éliciné. Merci — vous pouvez soutenir à nouveau si vous le souhaitez.</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {SUPPORTER_TIERS.map((tier) => {
                  const available = isSupporterTierAvailable(tier);
                  const isProcessing = stage === 'processing' && selected?.amount === tier.amount;
                  return (
                    <button
                      key={tier.amount}
                      type="button"
                      disabled={stage === 'processing' || !available}
                      onClick={() => handleSelect(tier)}
                      className={`relative rounded-2xl border px-3 py-3.5 text-left transition-all disabled:cursor-not-allowed ${
                        isProcessing
                          ? 'border-amber-400 bg-amber-500/15'
                          : available
                            ? 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] hover:border-amber-400/70 hover:bg-amber-500/[0.08] cursor-pointer'
                            : 'border-slate-200/60 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02] opacity-55'
                      } ${stage === 'processing' && !isProcessing ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-slate-900 dark:text-white">{formatSupporterAmount(tier.amount)}</span>
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : null}
                      </div>
                      <span className="mt-0.5 block text-[11px] font-bold text-amber-700 dark:text-amber-400">{tier.label}</span>
                      <span className="mt-1 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                        {available ? tier.tagline : 'Bientôt disponible'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {stage === 'processing' && (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  Ouverture du paiement sécurisé Paddle…
                </div>
              )}

              {availableTiers.length === 0 && (
                <p className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Les soutiens par carte (Paddle) seront activés dans quelques instants. En attendant, le soutien
                  par Mobile Money reste disponible ci-dessous.
                </p>
              )}
            </>
          )}

          {stage !== 'success' && (
            <div className="pt-1 space-y-3 border-t border-slate-200/70 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Paiement sécurisé Paddle
                </span>
                <span>•</span>
                <span>Paiement unique, sans abonnement</span>
                <span>•</span>
                <span>N’active pas le Pass Pro</span>
              </div>
              <button
                type="button"
                onClick={handleMobileMoney}
                className="w-full text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 underline underline-offset-4 transition-colors cursor-pointer"
              >
                Vous préférez Mobile Money (FCFA) ? Soutenir autrement
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupporterModal;
