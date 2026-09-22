import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, CreditCard, Heart, Loader2, ShieldCheck, Smartphone, Sparkles, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TipModal } from './TipModal';
import {
  SUPPORTER_TIERS, SupporterTier, formatSupporterAmount, isSupporterTierAvailable,
  openSupporterCheckout, resolveSupporterPrices
} from '../../services/supporterService';

type Stage = 'choose' | 'processing' | 'success' | 'error';
type Tab = 'paddle' | 'mobile';

/**
 * Fenêtre unique « Soutenir le projet » : deux onglets, carte bancaire (Paddle, soutiens
 * ponctuels) et Mobile Money (SASPay, FCFA). Les montants Paddle sont alignés et la fenêtre
 * reste étroite pour tenir sur un téléphone comme sur un ordinateur.
 */
export const SupportProjectModal: React.FC = () => {
  const {
    isSupporterModalOpen,
    setIsSupporterModalOpen,
    user,
    refreshUserProStatus
  } = useApp();

  const [tab, setTab] = useState<Tab>('paddle');
  const [stage, setStage] = useState<Stage>('choose');
  const [selected, setSelected] = useState<SupporterTier | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [, setPriceRevision] = useState(0);
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

    // Les price_id Paddle sont résolus automatiquement si l'environnement ne les fournit pas.
    if (availableTiers.length < SUPPORTER_TIERS.length) {
      setLoadingPrices(true);
      resolveSupporterPrices()
        .then(() => setPriceRevision(revision => revision + 1))
        .catch(() => { /* la configuration statique reste la référence */ })
        .finally(() => setLoadingPrices(false));
    }

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
    let handled = false;
    const opened = await openSupporterCheckout(tier, user, {
      onSuccess: () => {
        handled = true;
        completedRef.current = true;
        setStage('success');
        Promise.resolve(refreshUserProStatus?.()).catch(() => { /* rafraîchi au prochain passage */ });
      },
      onCancel: () => {
        handled = true;
        // Paddle ferme l'overlay juste après un paiement réussi : on ne revient à la liste
        // que si rien n'a été réglé.
        if (!completedRef.current) setStage('choose');
      },
      onError: (error: any) => {
        handled = true;
        completedRef.current = false;
        setErrorMessage(typeof error?.message === 'string' ? error.message : 'Le paiement n’a pas pu être ouvert.');
        setStage('error');
      }
    });
    if (!opened && !handled) {
      setErrorMessage('Le module de paiement sécurisé Paddle est momentanément indisponible.');
      setStage('error');
    }
  };

  if (!isSupporterModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[430px] mx-auto my-auto rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101014] shadow-2xl text-slate-800 dark:text-slate-100"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer"
        >
          <span className="text-sm font-bold leading-none select-none">✕</span>
        </button>

        {/* En-tête compact */}
        <div className="px-5 sm:px-6 pt-6 pb-4 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent border-b border-slate-200/70 dark:border-white/[0.08]">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
            <Sparkles className="w-3 h-3" /> Éliciné Supporter
          </div>
          <h2 id="support-modal-title" className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            Soutenir le projet
          </h2>
          <p className="mt-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Geste ponctuel, sans abonnement : votre soutien finance l’infrastructure et
            l’indépendance d’Éliciné.
          </p>
        </div>

        {/* Onglets : carte (Paddle) / Mobile Money (SASPay) */}
        {stage === 'choose' && (
          <div role="tablist" aria-label="Moyen de soutien" className="grid grid-cols-2 gap-1.5 p-2 border-b border-slate-200/70 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            {([
              { id: 'paddle' as Tab, label: 'Carte bancaire', hint: 'Paddle · € ', Icon: CreditCard },
              { id: 'mobile' as Tab, label: 'Mobile Money', hint: 'SASPay · FCFA', Icon: Smartphone }
            ]).map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${
                  tab === id
                    ? 'bg-white dark:bg-white/10 shadow-sm border border-amber-400/60'
                    : 'border border-transparent hover:bg-white/70 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${tab === id ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="min-w-0">
                  <span className={`block text-[11px] font-bold truncate ${tab === id ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{label}</span>
                  <span className="block text-[9px] text-slate-500 dark:text-slate-400 truncate">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="px-5 sm:px-6 py-5 max-h-[58vh] overflow-y-auto">
          {stage === 'success' && (
            <div className="text-center space-y-4 py-2 animate-fade-in">
              <div className="mx-auto w-14 h-14 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Heart className="w-7 h-7" fill="currentColor" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Merci infiniment 💛</h3>
                <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Votre soutien{selected ? <> de <strong>{formatSupporterAmount(selected.amount)} — {selected.label}</strong></> : null} a bien été reçu.
                  Vous faites partie de celles et ceux qui gardent Éliciné libre et indépendant.
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Votre reçu Paddle vous parvient par e-mail. Ce soutien n’active pas le Pass Pro.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-[13px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-300 text-[11px] font-semibold flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Le paiement n’a pas abouti</p>
                  <p className="text-[10px] font-medium opacity-90 break-words">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setStage('choose'); setErrorMessage(''); }}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white text-[13px] font-bold transition-all cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          )}

          {(stage === 'choose' || stage === 'processing') && tab === 'paddle' && (
            <div className="space-y-3">
              {alreadySupporter && (
                <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  <Heart className="w-3.5 h-3.5 shrink-0" fill="currentColor" />
                  Vous êtes déjà Supporter. Merci — vous pouvez soutenir à nouveau si vous le souhaitez.
                </p>
              )}

              <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden divide-y divide-slate-200/80 dark:divide-white/[0.07]">
                {SUPPORTER_TIERS.map((tier) => {
                  const available = isSupporterTierAvailable(tier);
                  const busy = stage === 'processing' && selected?.amount === tier.amount;
                  return (
                    <button
                      key={tier.amount}
                      type="button"
                      disabled={stage === 'processing' || !available}
                      onClick={() => handleSelect(tier)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        busy ? 'bg-amber-500/15'
                          : available ? 'hover:bg-amber-500/[0.07] cursor-pointer'
                            : 'opacity-55 cursor-not-allowed'
                      } ${stage === 'processing' && !busy ? 'opacity-50' : ''}`}
                    >
                      <span className="w-14 shrink-0 text-right text-[15px] font-black tabular-nums text-slate-900 dark:text-white">
                        {formatSupporterAmount(tier.amount)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-400 truncate">{tier.label}</span>
                        <span className="block text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
                          {available ? tier.tagline : 'Bientôt disponible'}
                        </span>
                      </span>
                      {busy
                        ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-amber-500" />
                        : <ChevronRight className={`w-4 h-4 shrink-0 ${available ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'}`} />}
                    </button>
                  );
                })}
              </div>

              {stage === 'processing' && (
                <p className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> Ouverture du paiement sécurisé Paddle…
                </p>
              )}

              {loadingPrices && (
                <p className="flex items-center justify-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Récupération des montants Paddle…
                </p>
              )}

              {!loadingPrices && availableTiers.length === 0 && (
                <p className="rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 px-3 py-2.5 text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Les soutiens par carte ne sont pas encore ouverts côté Paddle. Le soutien par
                  Mobile Money reste disponible dans l’onglet ci-dessus.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[9.5px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-emerald-500" /> Paiement sécurisé Paddle</span>
                <span>•</span>
                <span>Paiement unique</span>
                <span>•</span>
                <span>N’active pas le Pass Pro</span>
              </div>
            </div>
          )}

          {stage === 'choose' && tab === 'mobile' && (
            <TipModal embedded onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportProjectModal;
