import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, CreditCard, Heart, Loader2, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TipModal } from './TipModal';
import {
  SUPPORTER_TIERS, SupporterTier, formatSupporterAmount, isSupporterTierAvailable,
  openSupporterCheckout, resolveSupporterPrices
} from '../../services/supporterService';

type Stage = 'choose' | 'processing' | 'success' | 'error';
type Tab = 'paddle' | 'mobile';

/** Perforations de la bobine : petits trous réguliers sur les bords du cadre. */
const sprocketStyle: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.30) 0 5px, transparent 5px 15px)'
};

const Spockets: React.FC = () => (
  <>
    <span aria-hidden className="pointer-events-none absolute inset-y-3 left-1.5 w-1.5 rounded-full" style={sprocketStyle} />
    <span aria-hidden className="pointer-events-none absolute inset-y-3 right-1.5 w-1.5 rounded-full" style={sprocketStyle} />
  </>
);

/**
 * Fenêtre « Soutenir le projet » : une bobine de cinéma.
 * Deux onglets (carte bancaire Paddle / Mobile Money SASPay), sept séances = sept montants.
 * Aucun de ces paiements n'active le Pass Pro.
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
        // Paddle ferme l'overlay juste après un paiement réussi : on ne revient à la bobine
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[420px] mx-auto my-auto rounded-[26px] overflow-hidden border border-slate-200 dark:border-amber-500/20 bg-white dark:bg-[#0d0d11] shadow-2xl text-slate-800 dark:text-slate-100"
      >
        {/* Halo de projecteur */}
        <div aria-hidden className="pointer-events-none absolute -top-28 left-1/2 h-52 w-[140%] -translate-x-1/2 rounded-full bg-amber-400/25 blur-3xl dark:bg-amber-400/20" />

        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-white/70 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer backdrop-blur"
        >
          <span className="text-sm font-bold leading-none select-none">✕</span>
        </button>

        <header className="relative px-6 pt-7 pb-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">
            <span aria-hidden>✦</span> Éliciné Supporter
          </p>
          <h2 id="support-modal-title" className="mt-2.5 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Soutenir le projet
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-zinc-400">
            Chaque soutien est une place de cinéma offerte à Éliciné : un geste ponctuel,
            sans abonnement, qui finance l’infrastructure et l’indépendance de la plateforme.
          </p>
        </header>

        {stage === 'choose' && (
          <div role="tablist" aria-label="Moyen de soutien" className="relative mx-4 mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] p-1">
            {([
              { id: 'paddle' as Tab, label: 'Carte bancaire', hint: 'Paddle · €', Icon: CreditCard },
              { id: 'mobile' as Tab, label: 'Mobile Money', hint: 'SASPay · FCFA', Icon: Smartphone }
            ]).map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${
                  tab === id
                    ? 'bg-white dark:bg-white/[0.09] shadow-sm ring-1 ring-amber-400/60'
                    : 'hover:bg-white/60 dark:hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${tab === id ? 'text-amber-500' : 'text-slate-400 dark:text-zinc-500'}`} />
                <span className="min-w-0">
                  <span className={`block truncate text-[11px] font-bold ${tab === id ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-300'}`}>{label}</span>
                  <span className="block truncate text-[9px] text-slate-500 dark:text-zinc-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="relative px-4 sm:px-5 pb-5 max-h-[56vh] overflow-y-auto">
          {stage === 'success' && (
            <div className="animate-fade-in space-y-4">
              {/* Contremarque détachée */}
              <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-[#0b0b0f] px-5 py-6 text-center">
                <Spockets />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/30">
                  <Heart className="h-6 w-6" fill="currentColor" />
                </div>
                <p className="mt-3 text-[9.5px] font-black uppercase tracking-[0.3em] text-amber-400">Admis · Supporter</p>
                <p className="mt-1 text-3xl font-black text-white">
                  {selected ? formatSupporterAmount(selected.amount) : ''}
                </p>
                <p className="text-[11px] font-semibold text-zinc-300">{selected?.label}</p>
                <p className="mt-3 text-[10px] text-zinc-500">
                  {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <p className="text-center text-[12px] leading-relaxed text-slate-600 dark:text-zinc-300">
                Merci infiniment 💛 Votre nom rejoint celles et ceux qui gardent Éliciné libre et indépendant.
                Le reçu Paddle vous parvient par e-mail ; ce soutien n’active pas le Pass Pro.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-[12px] font-black uppercase tracking-wider text-slate-950 transition-all hover:from-amber-400 hover:to-orange-400 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="animate-fade-in space-y-4">
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/10 p-3.5 text-[11px] font-semibold text-red-600 dark:text-red-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-bold">Le paiement n’a pas abouti</p>
                  <p className="break-words text-[10px] font-medium opacity-90">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setStage('choose'); setErrorMessage(''); }}
                className="w-full rounded-xl bg-slate-100 py-3 text-[12px] font-bold text-slate-800 transition-all hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 cursor-pointer"
              >
                Revenir à la bobine
              </button>
            </div>
          )}

          {(stage === 'choose' || stage === 'processing') && tab === 'paddle' && (
            <div className="space-y-3">
              {alreadySupporter && (
                <p className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  <Heart className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
                  Vous êtes déjà Supporter. Merci — rien ne vous oblige à recommencer.
                </p>
              )}

              {/* La bobine : 7 séances, du coup de pouce au soutien exceptionnel */}
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0b0b0f] px-5 py-2">
                <Spockets />
                <div className="divide-y divide-dashed divide-white/10">
                  {SUPPORTER_TIERS.map((tier) => {
                    const available = isSupporterTierAvailable(tier);
                    const busy = stage === 'processing' && selected?.amount === tier.amount;
                    return (
                      <button
                        key={tier.amount}
                        type="button"
                        disabled={stage === 'processing' || !available}
                        onClick={() => handleSelect(tier)}
                        className={`group relative flex w-full items-center gap-3 py-2.5 text-left transition-all ${
                          busy ? 'bg-amber-400/10'
                            : available ? 'hover:bg-amber-400/[0.07] cursor-pointer'
                              : 'cursor-not-allowed opacity-45'
                        } ${stage === 'processing' && !busy ? 'opacity-45' : ''}`}
                      >
                        <span className="w-[62px] shrink-0 text-right text-[17px] font-black tabular-nums leading-none text-white">
                          {formatSupporterAmount(tier.amount)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[10.5px] font-bold uppercase tracking-[0.12em] ${busy ? 'text-amber-300' : 'text-amber-400/90'}`}>
                            {tier.label}
                          </span>
                          <span className="block truncate text-[9.5px] text-zinc-400">
                            {available ? tier.tagline : 'Bientôt disponible'}
                          </span>
                        </span>
                        {busy
                          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                          : <ChevronRight className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${available ? 'text-amber-400/70' : 'text-zinc-600'}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {stage === 'processing' && (
                <p className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" /> Séance en préparation · Paddle sécurisé
                </p>
              )}

              {loadingPrices && (
                <p className="flex items-center justify-center gap-2 text-[10px] text-slate-500 dark:text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement de la bobine…
                </p>
              )}

              {!loadingPrices && availableTiers.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-[10px] leading-relaxed text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                  Les séances carte bancaire ne sont pas encore ouvertes côté Paddle.
                  Le soutien par Mobile Money reste disponible dans l’onglet ci-dessus.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[9px] text-slate-500 dark:text-zinc-500">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-500" /> Paiement sécurisé Paddle</span>
                <span aria-hidden>·</span>
                <span>Paiement unique</span>
                <span aria-hidden>·</span>
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
