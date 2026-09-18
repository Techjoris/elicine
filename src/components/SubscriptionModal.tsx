import React, { useState, useEffect } from 'react';
import { ElicineLogo } from './ElicineLogo';
import { useApp } from '../context/AppContext';
import { Currency, PricingBillingCycle } from '../types';
import { PayPalButton } from './payment/PayPalButton';
import { subscriptionService } from '../services/subscriptionService';
import { Sparkles } from 'lucide-react';

export interface CheckoutPayload {
  currency: Currency;
  amount: string;
  numericAmount: number;
  plan: PricingBillingCycle;
  paymentMethod: 'mobile_money' | 'card' | 'paypal' | 'paypal_card';
  gateway?: string;
  subscriptionId?: string;
  customerName?: string;
  customerEmail?: string;
  phone?: string;
}

export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPay: (payload: CheckoutPayload) => void;
  isProcessing?: boolean;
}

const PRICING: Record<Currency, { symbol: string; monthly: string; yearly: string; perMonthYearly: string; rawMonthly: number; rawYearly: number }> = {
  USD: { symbol: '$', monthly: '1.99', yearly: '15.99', perMonthYearly: '1.33', rawMonthly: 1.99, rawYearly: 15.99 },
  EUR: { symbol: '€', monthly: '1,85', yearly: '15,00', perMonthYearly: '1,25', rawMonthly: 1.85, rawYearly: 15.00 },
  CAD: { symbol: 'CA$', monthly: '2.70', yearly: '21.50', perMonthYearly: '1.79', rawMonthly: 2.70, rawYearly: 21.50 },
  XOF: { symbol: 'FCFA', monthly: '1 200', yearly: '9 600', perMonthYearly: '800', rawMonthly: 1200, rawYearly: 9600 },
  XAF: { symbol: 'FCFA', monthly: '1 200', yearly: '9 600', perMonthYearly: '800', rawMonthly: 1200, rawYearly: 9600 },
};

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
    return err;
  }

  const rawMsg = err.message || err.description || err.name || '';
  const lower = rawMsg.toLowerCase();
  if (lower.includes('instrument_declined') || lower.includes('card_declined') || lower.includes('declined') || lower.includes('refus')) {
    return "Votre carte bancaire a été refusée par votre banque (solde insuffisant, plafond atteint ou restriction bancaire). Veuillez utiliser une autre carte ou votre solde PayPal.";
  }
  if (lower.includes('avs') || lower.includes('postal')) {
    return "Échec de vérification du code postal (AVS). Veuillez vérifier les informations de facturation.";
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
  if (lower.includes('popup close') || lower.includes('window closed') || lower.includes('user closed')) {
    return "La fenêtre de paiement a été fermée avant la finalisation de la transaction.";
  }

  return rawMsg || "Le paiement n'a pas pu aboutir. Veuillez vérifier vos informations bancaires ou utiliser une autre carte.";
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onPay,
  isProcessing = false
}) => {
  const { 
    currency: appCurrency, 
    user, 
    upgradeToPro, 
    setIsProSuccessModalOpen, 
    showToast 
  } = useApp();
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>('monthly');
  const [currency, setCurrency] = useState<Currency>(() => (appCurrency || 'USD'));
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'paypal_card'>('mobile_money');
  const [isCapturingPro, setIsCapturingPro] = useState<boolean>(false);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Fermeture sécurisée : strictement bloquée lorsque la capture et validation Pro sont en cours
  const handleSafeClose = () => {
    if (isCapturingPro) {
      console.warn('[SubscriptionModal] ⛔ Fermeture bloquée : validation et capture PayPal en cours.');
      showToast('⏳ Validation de votre paiement en cours... Veuillez patienter.');
      return;
    }
    setPaymentErrorMessage(null);
    onClose();
  };

  // Restauration automatique de l'état mémorisé (méthode de paiement, plan, devise) lors de la réouverture
  useEffect(() => {
    if (isOpen && typeof sessionStorage !== 'undefined') {
      try {
        const savedMethod = sessionStorage.getItem('payment_method');
        const savedCurrency = sessionStorage.getItem('checkout_currency') as Currency;
        const savedPlan = sessionStorage.getItem('checkout_plan') as PricingBillingCycle;

        if (savedMethod === 'sasapay' || savedMethod === 'mobile_money') {
          setPaymentMethod('mobile_money');
        } else if (savedMethod === 'card' || savedMethod === 'paypal' || savedMethod === 'paypal_card') {
          setPaymentMethod('paypal_card');
        }

        if (savedCurrency && PRICING[savedCurrency]) {
          setCurrency(savedCurrency);
        }

        if (savedPlan === 'yearly' || savedPlan === 'monthly') {
          setBillingCycle(savedPlan);
        }
      } catch (_) {}
    }
  }, [isOpen]);

  // Détection automatique de devise par défaut
  useEffect(() => {
    if (isOpen) {
      const detected = appCurrency || 'USD';
      setCurrency(detected);
      // Mode de paiement par défaut adapté à la région
      if (detected === 'XOF' || detected === 'XAF') {
        setPaymentMethod('mobile_money');
      } else {
        setPaymentMethod('paypal_card');
      }
    }
  }, [isOpen, appCurrency]);

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.USD;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;
  const numericAmount = isYearly ? currentPrice.rawYearly : currentPrice.rawMonthly;

  const handleCheckoutClick = () => {
    const isPaypalCard = paymentMethod === 'paypal_card';
    const chosenGateway = isPaypalCard ? 'card' : 'mobile_money';
    
    console.log('[SubscriptionModal Debug] handleCheckoutClick déclenché :', {
      paymentMethod,
      chosenGateway,
      currency,
      amountToPay,
      numericAmount,
      billingCycle
    });

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('checkout_gateway', chosenGateway);
        sessionStorage.setItem('payment_method', chosenGateway);
      } catch (_) {}
    }

    onPay({
      currency,
      amount: amountToPay,
      numericAmount,
      plan: billingCycle,
      paymentMethod,
      gateway: chosenGateway
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleSafeClose}
    >
      <div 
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 text-slate-800 dark:text-slate-200 flex flex-col gap-4 relative scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer - Désactivé pendant la validation en cours */}
        <button 
          type="button"
          onClick={handleSafeClose}
          disabled={isCapturingPro}
          aria-label="Fermer"
          className={`absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors z-10 ${
            isCapturingPro ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
          }`}
        >
          ✕
        </button>

        {/* 1. Header Épuré */}
        <div className="text-center flex flex-col items-center gap-1.5 pt-1">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            👑 Pass Pro Illimité
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Vivez le cinéma sans limite
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            Recherches illimitées, filtres avancés par plateforme et alertes instantanées.
          </p>

          {/* Badge utilisateur connecté si disponible */}
          {user && (
            <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold mt-1">
              <span>✓ Compte actif : <strong>{user.name || user.email}</strong></span>
            </div>
          )}
        </div>

        {/* État de chargement 'Validation en cours...' - Bloque visuellement la modale */}
        {isCapturingPro && (
          <div className="p-4 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs flex items-center gap-3 animate-in fade-in duration-200">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
            <div className="flex-1">
              <p className="font-extrabold text-sm text-slate-900 dark:text-white">Validation en cours...</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                Sécurisation du prélèvement et activation de votre Pass Pro auprès de PayPal. Veuillez ne pas fermer cette fenêtre.
              </p>
            </div>
          </div>
        )}

        {/* Bannière d'erreur explicite en cas de rejet (carte refusée, AVS mismatch, etc.) */}
        {paymentErrorMessage && !isCapturingPro && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
            <span className="text-lg shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-xs text-rose-800 dark:text-rose-300">Paiement non abouti</p>
              <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">{paymentErrorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentErrorMessage(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2. Les 3 Avantages Essentiels (Très compact) */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1">
            <span className="text-base">⚡</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">Recherches Illimitées</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1">
            <span className="text-base">🎯</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">Filtres Plateformes</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1">
            <span className="text-base">🔔</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">Alertes Sorties</span>
          </div>
        </div>

        {/* 3. Sélecteur de Devise & Cycle */}
        <div className="flex flex-col gap-2.5 pt-0.5">
          {/* Devises chips */}
          <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            {(['USD', 'EUR', 'XOF', 'XAF', 'CAD'] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currency === c 
                    ? 'bg-sky-500 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Cycle (Mensuel / Annuel) */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 justify-center">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !isYearly ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isYearly ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>Annuel</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded-md">
                -30%
              </span>
            </button>
          </div>
        </div>

        {/* 4. Récapitulatif du Tarif */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Formule {isYearly ? 'Annuelle' : 'Mensuelle'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{amountToPay}</span>
              <span className="text-xs text-sky-500 dark:text-sky-400 font-bold">{currentPrice.symbol}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/{isYearly ? 'an' : 'mois'}</span>
            </div>
          </div>
          {isYearly && (
            <div className="text-right">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">4 mois offerts</span>
              <span className="text-[10px] text-slate-400">{currentPrice.perMonthYearly} {currentPrice.symbol}/mois</span>
            </div>
          )}
        </div>

        {/* 5. Sélection du Mode de Règlement : 2 Options Principales */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Choisissez votre mode de paiement
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* OPTION 1 : Paiement Mobile (Orange, MTN, Wave, etc.) */}
            <div
              onClick={() => setPaymentMethod('mobile_money')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2.5 relative ${
                paymentMethod === 'mobile_money'
                  ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Sans carte
                  </span>
                </div>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  paymentMethod === 'mobile_money' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {paymentMethod === 'mobile_money' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 dark:text-white">Paiement Mobile</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Orange, MTN, Wave, etc.</p>
              </div>
            </div>

            {/* OPTION 2 : PayPal & Carte Bancaire */}
            <div
              onClick={() => setPaymentMethod('paypal_card')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2.5 relative ${
                paymentMethod === 'paypal_card'
                  ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">💳</span>
                  <span className="text-[10px] font-black text-[#0079C1] bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/25">
                    PayPal & CB
                  </span>
                </div>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  paymentMethod === 'paypal_card' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {paymentMethod === 'paypal_card' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 dark:text-white">PayPal & Carte Bancaire</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Visa, Mastercard, Virtuelles, Solde PayPal</p>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Boutons d'action : Appel à l'action Principal dynamique & Lien de don discret */}
        <div className="flex flex-col gap-3 pt-1">
          {paymentMethod === 'paypal_card' ? (
            /* Mode PayPal & Carte Bancaire -> Widget PayPal SDK officiel (Bouton CB & Bouton PayPal) */
            <div className="w-full flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Paiement sécurisé par Carte ou Compte PayPal
                </span>
                <span className="font-extrabold text-sky-600 dark:text-sky-400">
                  {amountToPay} {currentPrice.symbol}
                </span>
              </div>

              <PayPalButton
                amount={numericAmount}
                currency={currency}
                billingCycle={billingCycle}
                disabled={isProcessing || isCapturingPro}
                onValidationStart={() => {
                  console.log('[SubscriptionModal Debug] ⏳ onApprove démarré : blocage de la modale et passage en "Validation en cours..."');
                  setIsCapturingPro(true);
                  setPaymentErrorMessage(null);
                }}
                onClick={() => {
                  console.log('[SubscriptionModal Debug] 🖱️ Clic utilisateur sur le widget PayPalButton');
                  setPaymentErrorMessage(null);
                  return true;
                }}
                onSuccess={async (details, orderId) => {
                  try {
                    console.log('[SubscriptionModal Debug] 🎯 onApprove avec succès côté PayPal. Envoi orderID au backend...', { orderId, details });
                    setIsCapturingPro(true);
                    setPaymentErrorMessage(null);
                    showToast('⏳ Validation en cours... Sécurisation de votre Pass Pro.');
                    
                    const recordResult = await subscriptionService.recordPayPalPayment({
                      orderId,
                      userId: user?.id || `usr_${Date.now()}`,
                      email: user?.email || details?.payer?.email_address,
                      customerName: user?.name || (details?.payer?.name?.given_name ? `${details.payer.name.given_name} ${details.payer.name.surname || ''}`.trim() : 'Cinéphile Pro'),
                      plan: billingCycle,
                      amount: numericAmount,
                      currency,
                      details
                    });

                    console.log('[SubscriptionModal Debug] Réponse serveur recordPayPalPayment :', recordResult);

                    if (recordResult?.success && recordResult?.isPro) {
                      console.log('[SubscriptionModal Debug] 👑 Capture PayPal validée et Pass Pro activé en base !');
                      showToast('👑 Félicitations ! Votre paiement a été validé et votre Pass Pro est actif.');
                      upgradeToPro(billingCycle);
                      setIsCapturingPro(false);
                      onClose();
                      if (setIsProSuccessModalOpen) {
                        setIsProSuccessModalOpen(true);
                      }
                    } else {
                      // Échec de la capture serveur (ex: carte refusée, fonds insuffisants)
                      const errorMsg = recordResult?.error || "Le paiement n'a pas pu être capturé par PayPal (fonds insuffisants ou carte refusée).";
                      console.error('[SubscriptionModal Debug] ❌ Échec capture serveur PayPal :', {
                        orderId,
                        error: errorMsg,
                        recordResult
                      });
                      setIsCapturingPro(false);
                      setPaymentErrorMessage(errorMsg);
                      showToast(`❌ ${errorMsg}`);
                    }
                  } catch (err: any) {
                    console.error('[SubscriptionModal Debug] ❌ Exception critique lors de la validation/capture PayPal :', err);
                    const msg = parsePayPalErrorMessage(err);
                    setIsCapturingPro(false);
                    setPaymentErrorMessage(msg);
                    showToast(`❌ ${msg}`);
                  }
                }}
                onError={(err) => {
                  console.error('[SubscriptionModal Debug] ❌ onError remonté par le SDK PayPal / Hosted Fields :', err);
                  setIsCapturingPro(false);
                  const msg = parsePayPalErrorMessage(err);
                  setPaymentErrorMessage(msg);
                  showToast(`❌ ${msg}`);
                }}
                onCancel={() => {
                  console.log('[SubscriptionModal Debug] 🛑 Annulation transaction par l\'utilisateur.');
                  setIsCapturingPro(false);
                  showToast("Transaction annulée. Aucun prélèvement n'a été effectué.");
                }}
              />


              <p className="text-[10.5px] text-center text-slate-500 dark:text-slate-400 pt-1.5">
                Cartes bancaires (Visa, Mastercard, Virtuelles) et comptes PayPal acceptés • Paiement sécurisé • Aucun engagement
              </p>
            </div>
          ) : (
            /* Mode Paiement Mobile -> Déclencheur Saspay */
            <button
              type="button"
              onClick={handleCheckoutClick}
              disabled={isProcessing}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-sm sm:text-base transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  Traitement sécurisé en cours...
                </span>
              ) : (
                <span>
                  Payer avec Mobile Money ({amountToPay} {currentPrice.symbol}) →
                </span>
              )}
            </button>
          )}

          {/* Badges de réassurance */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400">
            <span>🔒 Chiffrement SSL 256-bit</span>
            <span>•</span>
            <span>⚡ Activation immédiate</span>
            <span>•</span>
            <span>✕ Sans engagement</span>
          </div>


        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
