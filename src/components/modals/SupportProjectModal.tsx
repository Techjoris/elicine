import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ElicineLogo } from '../ElicineLogo';
import { TipModal } from './TipModal';
import {
  SUPPORTER_TIERS, SupporterTier, formatSupporterAmount, isSupporterTierAvailable,
  openSupporterCheckout, resolveSupporterPrices
} from '../../services/supporterService';

type Stage = 'choose' | 'processing' | 'success' | 'error';
type Mode = 'paddle' | 'mobile';

/**
 * Fenêtre « Soutenir le projet ».
 * Même palette et mêmes composants que la modale Pass Pro : badge ambre, pastilles bleues,
 * cartes à sélection émeraude, grand bouton dégradé émeraude → cyan.
 * Sept soutiens ponctuels (1 à 50 €) et deux moyens de paiement : carte (Paddle) ou Mobile
 * Money (SASPay). Aucun de ces paiements n'active le Pass Pro.
 */
export const SupportProjectModal: React.FC = () => {
  const {
    isSupporterModalOpen,
    setIsSupporterModalOpen,
    user,
    refreshUserProStatus
  } = useApp();

  const [mode, setMode] = useState<Mode>('paddle');
  const [stage, setStage] = useState<Stage>('choose');
  const [selected, setSelected] = useState<SupporterTier>(SUPPORTER_TIERS[3]);
  const [paidTier, setPaidTier] = useState<SupporterTier | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [, setPriceRevision] = useState(0);
  const completedRef = useRef(false);

  const availableTiers = SUPPORTER_TIERS.filter(isSupporterTierAvailable);
  const chosen = isSupporterTierAvailable(selected) ? selected : availableTiers[0] || selected;
  const alreadySupporter = Boolean((user as any)?.is_supporter);
  const canPay = availableTiers.length > 0;

  const handleClose = () => {
    setStage('choose');
    setErrorMessage('');
    setIsSupporterModalOpen(false);
  };

  useEffect(() => {
    if (!isSupporterModalOpen) return;
    setStage('choose');
    setErrorMessage('');
    completedRef.current = false;

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

  const handleSupport = async () => {
    const tier = chosen;
    setErrorMessage('');
    setStage('processing');
    let handled = false;
    const opened = await openSupporterCheckout(tier, user, {
      onSuccess: () => {
        handled = true;
        completedRef.current = true;
        setPaidTier(tier);
        setStage('success');
        Promise.resolve(refreshUserProStatus?.()).catch(() => { /* rafraîchi au prochain passage */ });
      },
      onCancel: () => {
        handled = true;
        // Paddle ferme l'overlay juste après un paiement réussi : on ne revient au formulaire
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 text-slate-800 dark:text-slate-200 flex flex-col gap-4 relative"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors z-10 cursor-pointer"
        >
          ✕
        </button>

        {/* En-tête */}
        <div className="text-center flex flex-col items-center gap-1.5 pt-1">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            💛 Soutien ponctuel
          </div>
          <h2 id="support-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Gardez Éliciné indépendant
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            Un geste unique, sans abonnement : il finance directement les serveurs, la recherche IA
            et l’absence de publicité.
          </p>

          {user && (
            <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold mt-1">
              <span>
                ✓ {alreadySupporter ? 'Supporter' : 'Compte actif'} : <strong>{user.name || user.email}</strong>
              </span>
            </div>
          )}
        </div>

        {stage === 'success' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center flex flex-col items-center gap-1.5">
              <span className="text-2xl">💛</span>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Soutien enregistré — merci infiniment
              </p>
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {paidTier ? formatSupporterAmount(paidTier.amount) : ''}
              </p>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{paidTier?.label}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}reçu Paddle envoyé par e-mail
              </p>
            </div>
            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
              Votre nom rejoint celles et ceux qui gardent Éliciné libre. Ce soutien n’active pas le Pass Pro
              et ne modifie aucun abonnement.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2.5">
              <span className="text-lg shrink-0 mt-0.5">⚠️</span>
              <div className="flex-1">
                <p className="font-bold text-xs text-rose-800 dark:text-rose-300">Paiement non abouti</p>
                <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed break-words">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setStage('choose'); setErrorMessage(''); }}
              className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-sm transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {(stage === 'choose' || stage === 'processing') && (
          <>
            {/* 1. Les 3 raisons */}
            <div className="grid grid-cols-3 gap-2 py-1 text-center">
              {[
                { icon: '🖥️', label: 'Serveurs & IA' },
                { icon: '🚫', label: 'Aucune publicité' },
                { icon: '🎬', label: 'Cinéma indépendant' }
              ].map(benefit => (
                <div key={benefit.label} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1">
                  <span className="text-base">{benefit.icon}</span>
                  <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">{benefit.label}</span>
                </div>
              ))}
            </div>

            {/* 2. Montants — paliers Paddle uniquement : le Mobile Money reste un montant libre */}
            {mode === 'paddle' && (
            <>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Choisissez votre montant
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {SUPPORTER_TIERS.map(tier => {
                  const available = isSupporterTierAvailable(tier);
                  const active = chosen?.amount === tier.amount;
                  return (
                    <button
                      key={tier.amount}
                      type="button"
                      disabled={!available}
                      onClick={() => setSelected(tier)}
                      title={available ? tier.tagline : 'Bientôt disponible'}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                        tier.amount === 50 ? 'col-span-2' : ''
                      } ${
                        active
                          ? 'bg-sky-500 text-white shadow-sm cursor-pointer'
                          : available
                            ? 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer'
                            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      {formatSupporterAmount(tier.amount)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Récapitulatif */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  {chosen?.label || 'Soutien'}
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {chosen ? formatSupporterAmount(chosen.amount) : '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">/une fois</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">Sans engagement</span>
                <span className="text-[10px] text-slate-400">Paiement unique</span>
              </div>
            </div>
            </>
            )}

            {/* 4. Moyens de paiement */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Choisissez votre mode de paiement
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  onClick={() => setMode('mobile')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 relative ${
                    mode === 'mobile'
                      ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">📱</span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                      mode === 'mobile' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {mode === 'mobile' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Mobile Money</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Orange, MTN, Wave (SasPay)</p>
                  </div>
                </div>

                <div
                  onClick={() => setMode('paddle')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 relative ${
                    mode === 'paddle'
                      ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">💳</span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                      mode === 'paddle' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {mode === 'paddle' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Carte, Apple Pay &amp; plus</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Visa, Mastercard, Apple Pay, Google Pay, PayPal… (Paddle)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Action */}
            {mode === 'paddle' ? (
              <div className="flex flex-col gap-3">
                {alreadySupporter && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                    💛 Vous êtes déjà Supporter. Merci — rien ne vous oblige à recommencer.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSupport}
                  disabled={stage === 'processing' || !canPay}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm sm:text-base transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                >
                  {stage === 'processing' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Ouverture du paiement sécurisé...</span>
                    </>
                  ) : (
                    <span>
                      Soutenir Éliciné - {chosen ? formatSupporterAmount(chosen.amount) : ''} (Paiement Sécurisé)
                    </span>
                  )}
                </button>

                {loadingPrices && (
                  <p className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Récupération des montants Paddle…
                  </p>
                )}

                {!loadingPrices && !canPay && (
                  <p className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Les soutiens par carte ne sont pas encore ouverts côté Paddle. Le Mobile Money
                    reste disponible en sélectionnant « Mobile Money » ci-dessus.
                  </p>
                )}
              </div>
            ) : (
              <TipModal embedded onClose={handleClose} />
            )}

            <div className="text-center pt-1 border-t border-slate-200/60 dark:border-white/5">
              <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 flex-wrap">
                <span>🔒 Chiffrement SSL 256-bit</span>
                <span>•</span>
                <span>⚡ Reçu immédiat</span>
                <span>•</span>
                <span>✓ N’active pas le Pass Pro</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SupportProjectModal;
