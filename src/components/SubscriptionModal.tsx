import React, { useState, useEffect } from 'react';
import { ElicineLogo } from './ElicineLogo';
import { useApp } from '../context/AppContext';
import { Currency, PricingBillingCycle } from '../types';
import { subscriptionService } from '../services/subscriptionService';
import { checkSaspayAvailability, isSaspayCountry } from '../services/geoService';
import { 
  openPaddleCheckout, 
  initPaddle, 
  DEFAULT_PADDLE_PRICE_ID, 
  getPaddleClientToken 
} from '../services/paddleService';
import confetti from 'canvas-confetti';
import { authService } from '../services/authService';
import { Sparkles } from 'lucide-react';

export interface CheckoutPayload {
  currency: Currency;
  amount: string;
  numericAmount: number;
  plan: PricingBillingCycle;
  paymentMethod: 'mobile_money' | 'card' | 'paddle';
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
  defaultCurrency?: Currency;
}

const PRICING: Record<Currency, { symbol: string; monthly: string; yearly: string; perMonthYearly: string; rawMonthly: number; rawYearly: number }> = {
  EUR: { symbol: '€', monthly: '1,99', yearly: '17,90', perMonthYearly: '1,49', rawMonthly: 1.99, rawYearly: 17.90 },
  USD: { symbol: '$', monthly: '2,15', yearly: '18,00', perMonthYearly: '1,50', rawMonthly: 2.15, rawYearly: 18.00 },
  CAD: { symbol: 'CA$', monthly: '2,90', yearly: '24,50', perMonthYearly: '2,04', rawMonthly: 2.90, rawYearly: 24.50 },
  XOF: { symbol: 'FCFA', monthly: '1 300', yearly: '11 000', perMonthYearly: '917', rawMonthly: 1300, rawYearly: 11000 },
  XAF: { symbol: 'FCFA', monthly: '1 300', yearly: '11 000', perMonthYearly: '917', rawMonthly: 1300, rawYearly: 11000 },
};

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onPay,
  isProcessing = false,
  defaultCurrency = 'EUR'
}) => {
  const { 
    currency: appCurrency, 
    user, 
    upgradeToPro, 
    refreshUserProStatus,
    setIsProSuccessModalOpen, 
    showToast,
    setActiveView
  } = useApp();
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>('monthly');
  const [currency, setCurrency] = useState<Currency>(() => defaultCurrency || 'EUR');
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'paddle'>('paddle');
  const [isCapturingPro, setIsCapturingPro] = useState<boolean>(false);
  const [isPro, setIsPro] = useState<boolean>(() => Boolean(user?.isPro || user?.is_pro));
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Préchargement immédiat du SDK Paddle Billing v2 & initialisation de la devise par défaut (EUR) à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setCurrency(defaultCurrency || 'EUR');
      initPaddle().catch(() => {});
    }
  }, [isOpen, defaultCurrency]);

  // 1 & 2. Ciblage géographique strict pour SasPay ("Mobile Money & Carte Bancaire")
  const [isSaspayAvailable, setIsSaspayAvailable] = useState<boolean>(() => {
    if (typeof sessionStorage !== 'undefined') {
      const cached = sessionStorage.getItem('user_country_code') || sessionStorage.getItem('elicine_user_country');
      if (cached && cached.length === 2) {
        return isSaspayCountry(cached);
      }
    }
    return false;
  });
  const [isLoadingGeo, setIsLoadingGeo] = useState<boolean>(() => {
    if (typeof sessionStorage !== 'undefined') {
      const cached = sessionStorage.getItem('user_country_code') || sessionStorage.getItem('elicine_user_country');
      if (cached && cached.length === 2) {
        return false;
      }
    }
    return true;
  });

  // Détection du pays de l'utilisateur par IP (Edge Vercel + fallback ipapi.co)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    checkSaspayAvailability()
      .then(({ isSaspayAvailable: available }) => {
        if (!isMounted) return;
        setIsSaspayAvailable(available);
        setIsLoadingGeo(false);

        // Si le pays n'est pas dans la whitelist des 27 pays, forcer Paddle par défaut
        if (!available) {
          setPaymentMethod('paddle');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoadingGeo(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Fermeture sécurisée : strictement bloquée lorsque la capture et validation Pro sont en cours
  const handleSafeClose = () => {
    if (isCapturingPro) {
      console.warn('[SubscriptionModal] ⛔ Fermeture bloquée : validation en cours.');
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
        } else if (savedMethod === 'card' || savedMethod === 'paddle') {
          setPaymentMethod('paddle');
        }

        if (savedPlan === 'yearly' || savedPlan === 'monthly') {
          setBillingCycle(savedPlan);
        }
      } catch (_) {}
    }
  }, [isOpen]);

  // Détection automatique de devise par défaut et ajustement du mode de paiement
  useEffect(() => {
    if (isOpen) {
      // La vitrine du Pass Pro s'ouvre toujours sur le tarif de référence en euros (1,99 €) :
      // l'utilisateur peut ensuite changer de devise dans le sélecteur s'il le souhaite.
      setCurrency('EUR');
      // Mode de paiement par défaut adapté à la région et à la disponibilité de SasPay
      if (isSaspayAvailable && (appCurrency === 'XOF' || appCurrency === 'XAF')) {
        setPaymentMethod('mobile_money');
      } else {
        setPaymentMethod('paddle');
      }
    }
  }, [isOpen, appCurrency, isSaspayAvailable]);

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.EUR;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;
  const numericAmount = isYearly ? currentPrice.rawYearly : currentPrice.rawMonthly;

  const handlePaddleCheckout = async () => {
    setPaymentErrorMessage(null);
    const token = getPaddleClientToken();
    if (!token) {
      const warningMsg = "Configuration Paddle requise : veuillez renseigner VITE_PADDLE_CLIENT_TOKEN dans vos variables d'environnement Vercel / .env.";
      console.warn(`[SubscriptionModal] ${warningMsg}`);
      showToast("⚠️ " + warningMsg);
      return;
    }

    const activePriceId = billingCycle === 'yearly'
      ? 'pri_01m2x8yc8y1k9b5bej81me7dbd'
      : 'pri_01m2x2nctwa8k7cqazmebqnxm3';

    try {
      const currentUser = user || authService.getStoredUser();
      await openPaddleCheckout({
        priceId: activePriceId,
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        userId: currentUser?.id,
        customData: {
          plan: billingCycle,
          billing_cycle: billingCycle,
          price_id: activePriceId,
          amount: isYearly ? currentPrice.yearly : currentPrice.monthly,
          currency
        },
        onSuccess: async (paddleData) => {
          // 1. Optimistic UI : mise à jour de l'état local
          setIsPro(true);
          setIsCapturingPro(false);

          // 2. Notification de succès & Célébration confetti
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#0ea5e9', '#10b981', '#f59e0b', '#ffffff']
          });

          showToast('👑 Félicitations ! Votre Pass Pro Éliciné est maintenant actif.');
          if (setIsProSuccessModalOpen) {
            setIsProSuccessModalOpen(true);
          }

          // 3. Persistance locale du compte utilisateur avec statut Pro
          if (user) {
            const updated = {
              ...user,
              isPro: true,
              is_pro: true,
              pass_status: 'pro' as const,
              proPlanType: billingCycle,
              proPlanExpiresAt: new Date(Date.now() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString()
            };
            try {
              localStorage.setItem('cineia_user', JSON.stringify(updated));
            } catch (_) {}
            authService.saveLocalAccount(updated);
          }

          // 4. Synchronisation asynchrone avec la base de données
          refreshUserProStatus().catch(() => {});

          // 5. Fermeture de la fenêtre après notification et feedback
          onClose();
        },
        onClose: () => {
          console.log('[SubscriptionModal] Overlay Paddle fermé par l\'utilisateur.');
        },
        onError: (err: any) => {
          console.error('[SubscriptionModal] Erreur Paddle :', err);
          const msg = err?.message || "Une erreur est survenue lors de l'ouverture du paiement Paddle.";
          setPaymentErrorMessage(msg);
          showToast(`⚠️ ${msg}`);
        }
      });
    } catch (err: any) {
      console.error('[SubscriptionModal] Exception Paddle :', err);
      const msg = err?.message || "Erreur lors de l'ouverture de Paddle.";
      setPaymentErrorMessage(msg);
      showToast(`⚠️ ${msg}`);
    }
  };

  const handleCheckoutClick = () => {
    if (paymentMethod === 'paddle') {
      handlePaddleCheckout();
      return;
    }
    const chosenGateway = 'mobile_money';
    
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
                Sécurisation du prélèvement et activation de votre Pass Pro. Veuillez ne pas fermer cette fenêtre.
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
            {(['EUR', 'USD', 'CAD', 'XOF', 'XAF'] as Currency[]).map((c) => (
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
                -25%
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
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">3 mois offerts</span>
              <span className="text-[10px] text-slate-400">{currentPrice.perMonthYearly} {currentPrice.symbol}/mois</span>
            </div>
          )}
        </div>

        {/* 5. Sélection du Mode de Règlement : Rendu conditionnel strict par pays (27 pays SasPay) */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isSaspayAvailable ? 'Choisissez votre mode de paiement' : 'Mode de paiement sécurisé'}
          </label>
          
          {isLoadingGeo ? (
            /* Skeleton Placeholder discret évitant tout Layout Shift */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="h-[76px] rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 animate-pulse p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700/60 rounded-full"></div>
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700/60"></div>
                </div>
                <div className="space-y-1.5">
                  <div className="w-28 h-3 bg-slate-200 dark:bg-slate-700/60 rounded"></div>
                  <div className="w-36 h-2 bg-slate-200/70 dark:bg-slate-700/40 rounded"></div>
                </div>
              </div>
              <div className="h-[76px] rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 animate-pulse p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700/60 rounded-full"></div>
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700/60"></div>
                </div>
                <div className="space-y-1.5">
                  <div className="w-28 h-3 bg-slate-200 dark:bg-slate-700/60 rounded"></div>
                  <div className="w-36 h-2 bg-slate-200/70 dark:bg-slate-700/40 rounded"></div>
                </div>
              </div>
            </div>
          ) : isSaspayAvailable ? (
            /* Cas 1 : isSaspayAvailable est TRUE (Afrique de l'Ouest / Centrale) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* SasPay Mobile Money */}
              <div
                onClick={() => setPaymentMethod('mobile_money')}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 relative ${
                  paymentMethod === 'mobile_money'
                    ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">📱</span>
                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                    paymentMethod === 'mobile_money' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {paymentMethod === 'mobile_money' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Mobile Money</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Orange, MTN, Wave (SasPay)</p>
                </div>
              </div>

              {/* Paddle (Carte & Apple Pay) */}
              <div
                onClick={() => setPaymentMethod('paddle')}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 relative ${
                  paymentMethod === 'paddle'
                    ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">💳</span>
                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                    paymentMethod === 'paddle' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {paymentMethod === 'paddle' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Carte Bancaire &amp; Apple Pay</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Visa, Mastercard (Paddle)</p>
                </div>
              </div>
            </div>
          ) : (
            /* Cas 2 : isSaspayAvailable est FALSE -> Paddle (Carte Bancaire & Apple Pay) */
            <div className="w-full">
              <div
                onClick={() => setPaymentMethod('paddle')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 relative ${
                  paymentMethod === 'paddle'
                    ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💳</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Recommandé
                    </span>
                  </div>
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    paymentMethod === 'paddle' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {paymentMethod === 'paddle' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Carte Bancaire &amp; Apple Pay</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Visa, Mastercard, Apple Pay (Paiement Sécurisé Paddle)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6. Boutons d'action : Appel à l'action Principal dynamique */}
        <div className="flex flex-col gap-3 pt-1">
          {paymentMethod === 'paddle' ? (
            /* Mode Paddle -> Overlay Paddle.js v2 */
            <div className="w-full flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePaddleCheckout}
                disabled={isProcessing}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm sm:text-base transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                    Ouverture du paiement sécurisé...
                  </span>
                ) : (
                  <span>
                    {isYearly
                      ? `Pass Pro Éliciné Annuel - ${amountToPay} ${currentPrice.symbol} (Paiement Sécurisé)`
                      : `Pass Pro Éliciné - ${amountToPay} ${currentPrice.symbol} (Paiement Sécurisé)`}
                  </span>
                )}
              </button>
              <div className="flex items-center justify-center gap-2.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                <span>💳 Cartes bancaires</span>
                <span>•</span>
                <span>🍎 Apple Pay</span>
                <span>•</span>
                <span>⚡ Overlay Paddle</span>
              </div>
              {currency !== 'EUR' && (
                <p className="text-[10px] text-center text-slate-500 dark:text-slate-400">
                  Tarif de référence : {isYearly ? '17,90 € /an' : '1,99 € /mois'} — Paddle applique automatiquement la conversion dans votre devise bancaire locale ({currency}).
                </p>
              )}
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
                  Payer maintenant ({amountToPay} {currentPrice.symbol}) →
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

          {/* Garantie & Lien CGU / Politique de Remboursement */}
          <div className="text-center pt-1 border-t border-slate-200/60 dark:border-white/5">
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
              className="text-[10px] sm:text-[11px] text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline transition-colors cursor-pointer inline-flex items-center gap-1"
              title="Consulter les CGU et la Politique de Remboursement 14 jours"
            >
              <span>🛡️ Garantie de satisfaction 14 jours • CGU &amp; Politique de Remboursement</span>
            </button>
          </div>


        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
