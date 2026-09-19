import React, { useState } from 'react';
import { X, ShieldCheck, Zap, Sparkles, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PayPalButton } from './PayPalButton';
import { subscriptionService } from '../../services/subscriptionService';
import { getPayPalProHostedUrl } from '../../services/paypalService';
import { PricingBillingCycle } from '../../types';

export interface PayPalCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlan?: PricingBillingCycle;
}

function parsePayPalErrorMessage(err: any): string {
  if (!err) return "La transaction a été refusée ou interrompue par votre établissement bancaire ou PayPal.";
  if (typeof err === 'string') {
    const lower = err.toLowerCase();
    if (lower.includes('instrument_declined') || lower.includes('card_declined') || lower.includes('declined') || lower.includes('refus')) {
      return "Votre carte bancaire a été refusée par votre banque (solde insuffisant, plafond atteint ou restriction bancaire). Veuillez utiliser une autre carte ou votre compte PayPal.";
    }
    if (lower.includes('avs') || lower.includes('postal')) {
      return "Échec de validation de l'adresse de facturation (code postal erroné). Veuillez vérifier vos coordonnées de carte.";
    }
    if (lower.includes('cvv') || lower.includes('csc') || lower.includes('security code')) {
      return "Le code de sécurité CVV est incorrect. Veuillez vérifier les 3 chiffres au dos de votre carte.";
    }
    if (lower.includes('3d') || lower.includes('authentication') || lower.includes('payer_action_required')) {
      return "L'authentification 3D-Secure auprès de votre banque a échoué ou a été annulée.";
    }
    if (lower.includes('permission_denied') || lower.includes('not_authorized')) {
      return "Le compte marchand PayPal n'autorise pas cette transaction ou les cartes invitées. Veuillez payer avec votre compte PayPal.";
    }
    if (lower.includes('enregistrer') || lower.includes('vault') || lower.includes('sauvegard')) {
      return "Impossible d'enregistrer cette carte bancaire. Les cartes virtuelles et à usage unique ne peuvent pas être mémorisées. Veuillez utiliser votre compte PayPal.";
    }
    return err;
  }

  const rawMsg = err.message || err.description || err.name || '';
  const lower = rawMsg.toLowerCase();
  if (lower.includes('instrument_declined') || lower.includes('card_declined') || lower.includes('declined') || lower.includes('refus')) {
    return "Votre carte bancaire a été refusée par votre banque (solde insuffisant, plafond atteint ou restriction bancaire). Veuillez utiliser une autre carte ou votre solde PayPal.";
  }
  if (lower.includes('avs') || lower.includes('postal')) {
    return "Échec de vérification du code postal (AVS). Veuillez vérifier vos informations de facturation.";
  }
  if (lower.includes('cvv') || lower.includes('csc') || lower.includes('security code')) {
    return "Code de sécurité (CVV/CVC) invalide. Veuillez vérifier les 3 chiffres au dos de votre carte.";
  }
  if (lower.includes('expired') || lower.includes('expiration')) {
    return "La date d'expiration de votre carte bancaire est invalide ou dépassée.";
  }
  if (lower.includes('3d') || lower.includes('authentication') || lower.includes('payer_action_required')) {
    return "L'authentification bancaire 3D-Secure n'a pas pu être validée. Veuillez réessayer.";
  }
  if (lower.includes('permission_denied') || lower.includes('not_authorized')) {
    return "Le compte marchand PayPal n'autorise pas cette transaction ou les cartes invitées. Veuillez payer avec votre compte PayPal.";
  }
  if (lower.includes('enregistrer') || lower.includes('vault') || lower.includes('sauvegard')) {
    return "Impossible d'enregistrer cette carte bancaire. Les cartes virtuelles et à usage unique ne peuvent pas être mémorisées. Veuillez utiliser votre compte PayPal.";
  }
  if (lower.includes('popup close') || lower.includes('window closed') || lower.includes('user closed')) {
    return "La fenêtre de paiement a été fermée avant la finalisation de la transaction.";
  }

  return rawMsg || "Le paiement n'a pas pu aboutir. Veuillez vérifier vos informations bancaires ou utiliser une autre carte.";
}

export const PayPalCheckoutModal: React.FC<PayPalCheckoutModalProps> = ({
  isOpen,
  onClose,
  defaultPlan = 'monthly'
}) => {
  const { user, currency: appCurrency, showToast, upgradeToPro, setIsProSuccessModalOpen, setActiveView } = useApp();
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>(defaultPlan);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturingPro, setIsCapturingPro] = useState(false);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isYearly = billingCycle === 'yearly';
  const selectedCurrency = (appCurrency || 'USD').toUpperCase();
  const amount = selectedCurrency === 'EUR' ? (isYearly ? 15.00 : 1.85) : (isYearly ? 15.99 : 1.99);
  const currencySymbol = selectedCurrency === 'EUR' ? '€' : '$';
  const formattedPrice = isYearly ? `${amount} ${currencySymbol} / an` : `${amount} ${currencySymbol} / mois`;

  const handleSafeClose = () => {
    if (isCapturingPro) {
      console.warn('[PayPalCheckoutModal] ⛔ Fermeture bloquée : validation et capture PayPal en cours.');
      showToast('⏳ Validation de votre paiement en cours... Veuillez patienter.');
      return;
    }
    setPaymentErrorMessage(null);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleSafeClose}
    >
      <div 
        className="relative w-full max-w-md bg-[#0a0d14] border border-slate-800/80 rounded-3xl p-6 shadow-2xl shadow-sky-500/10 text-slate-100 flex flex-col gap-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec badge et bouton fermer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Pass Pro • Paiement In-App Sécurisé</span>
          </div>
          <button
            onClick={handleSafeClose}
            disabled={isCapturingPro}
            className={`p-1.5 rounded-full hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer ${
              isCapturingPro ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''
            }`}
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Titre & Description */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Finaliser votre abonnement Pro
          </h2>
          <p className="text-xs text-slate-400">
            Payez directement via Carte bancaire (Visa, Mastercard, Virtuelles) ou compte PayPal sans quitter Éliciné.
          </p>
        </div>

        {/* État de chargement 'Validation en cours...' - Bloque visuellement la modale */}
        {isCapturingPro && (
          <div className="p-4 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs flex items-center gap-3 animate-in fade-in duration-200">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
            <div className="flex-1">
              <p className="font-extrabold text-sm text-white">Validation en cours...</p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Sécurisation du prélèvement et activation de votre Pass Pro auprès de PayPal. Veuillez ne pas fermer cette fenêtre.
              </p>
            </div>
          </div>
        )}

        {/* Bannière d'erreur explicite en cas de rejet */}
        {paymentErrorMessage && !isCapturingPro && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
            <span className="text-lg shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-xs text-rose-200">Paiement non validé</p>
              <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">{paymentErrorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentErrorMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sélecteur de formule (Mensuel / Annuel) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800/60">
          <button
            type="button"
            disabled={isCapturingPro}
            onClick={() => setBillingCycle('monthly')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 cursor-pointer ${
              !isYearly 
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Mensuel</span>
            <span className="text-[11px] opacity-90">1.99 $ / mois</span>
          </button>

          <button
            type="button"
            disabled={isCapturingPro}
            onClick={() => setBillingCycle('yearly')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 cursor-pointer relative ${
              isYearly 
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1">
              Annuel
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold uppercase">
                -33%
              </span>
            </span>
            <span className="text-[11px] opacity-90">15.99 $ / an</span>
          </button>
        </div>

        {/* Récapitulatif tarifaire */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-black text-sm">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {isYearly ? 'Accès 1 An Illimité' : 'Accès 30 Jours Illimité'}
              </p>
              <p className="text-[11px] text-slate-400">Paiement unique sans engagement</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-extrabold text-sky-400">{formattedPrice}</p>
          </div>
        </div>

        {/* Avantages inclus rapides */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>IA de recherche illimitée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Filtres plateformes VOD</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Badge Supporter Pro</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Support prioritaire 7j/7</span>
          </div>
        </div>

        {/* Conteneur officiel des boutons PayPal SDK */}
        <div className="pt-2 flex flex-col gap-2">
          <PayPalButton
            amount={amount}
            currency={selectedCurrency}
            billingCycle={billingCycle}
            disabled={isProcessing || isCapturingPro}
            onValidationStart={() => {
              console.log('[PayPalCheckoutModal] ⏳ onApprove démarré : passage en validation');
              setIsCapturingPro(true);
              setPaymentErrorMessage(null);
            }}
            onClick={() => {
              setPaymentErrorMessage(null);
              return true;
            }}
            onSuccess={async (orderId) => {
              try {
                console.log('[PayPalCheckoutModal] 🎯 onApprove succès client. Envoi orderID au backend...', { orderId });
                setIsCapturingPro(true);
                setPaymentErrorMessage(null);
                showToast('⏳ Validation en cours... Sécurisation de votre Pass Pro.');

                const recordResult = await subscriptionService.recordPayPalPayment({
                  orderId,
                  userId: user?.id || `usr_${Date.now()}`,
                  email: user?.email,
                  customerName: user?.name || 'Cinéphile Pro',
                  plan: billingCycle,
                  amount,
                  currency: 'USD'
                });

                console.log('[PayPalCheckoutModal] Réponse backend :', recordResult);

                if (recordResult?.success && recordResult?.isPro) {
                  console.log('[PayPalCheckoutModal] 👑 Capture PayPal validée et Pass Pro activé !');
                  showToast('👑 Félicitations ! Votre Pass Pro Éliciné est désormais actif.');
                  upgradeToPro(billingCycle);
                  setIsCapturingPro(false);
                  onClose();
                  if (setIsProSuccessModalOpen) {
                    setIsProSuccessModalOpen(true);
                  }
                } else {
                  const errorMsg = recordResult?.error || "Le paiement n'a pas pu être capturé par PayPal (fonds insuffisants ou carte refusée).";
                  console.error('[PayPalCheckoutModal] ❌ Rejet capture :', { orderId, error: errorMsg, recordResult });
                  setIsCapturingPro(false);
                  setPaymentErrorMessage(errorMsg);
                  showToast(`❌ ${errorMsg}`);
                }
              } catch (err: any) {
                console.error('[PayPalCheckoutModal] ❌ Exception validation :', err);
                const parsedMsg = parsePayPalErrorMessage(err);
                setIsCapturingPro(false);
                setPaymentErrorMessage(parsedMsg);
                showToast(`❌ ${parsedMsg}`);
              }
            }}
            onError={(err) => {
              console.error('[PayPalCheckoutModal] ❌ onError remonté par PayPal SDK / Hosted Fields :', err);
              setIsCapturingPro(false);
              const parsedMsg = parsePayPalErrorMessage(err);
              setPaymentErrorMessage(parsedMsg);
              showToast(`❌ ${parsedMsg}`);
            }}
            onCancel={() => {
              console.log('[PayPalCheckoutModal] 🛑 Annulation transaction par l\'utilisateur.');
              setIsCapturingPro(false);
              showToast("Paiement annulé. Aucun montant n'a été prélevé.");
            }}
          />

          {paymentErrorMessage && (
            <div className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex flex-col gap-2 animate-in fade-in">
              <p>{paymentErrorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  const url = getPayPalProHostedUrl();
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="w-full py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>💳</span>
                <span>Payer via la page officielle hébergée PayPal Pro →</span>
              </button>
            </div>
          )}

          <div className="w-full flex items-center justify-center pt-0.5">
            <button
              type="button"
              onClick={() => {
                const url = getPayPalProHostedUrl();
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="text-[11px] text-sky-400 hover:text-sky-300 underline font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>↗</span>
              <span>Ou payer directement sur la page hébergée PayPal Pro</span>
            </button>
          </div>
        </div>

        {/* Mentions de sécurité et réassurance */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cryptage SSL 256 bits • Traitement officiel PayPal &amp; Carte Bancaire</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/terms#article-5');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
              setActiveView('terms');
            }}
            className="text-[10px] text-slate-400 hover:text-slate-200 underline transition-colors cursor-pointer"
            title="Consulter les CGU et la Politique de Remboursement 14 jours"
          >
            🛡️ Garantie satisfaction 14 jours • CGU / CGV &amp; Politique de Remboursement
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayPalCheckoutModal;
