import React, { useState, useEffect } from 'react';
import { ElicineLogo } from './ElicineLogo';
import { useApp } from '../context/AppContext';
import { Currency, PricingBillingCycle } from '../types';

export interface CheckoutPayload {
  currency: Currency;
  amount: string;
  numericAmount: number;
  plan: PricingBillingCycle;
  paymentMethod: 'mobile_money' | 'paypal_card';
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

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onPay,
  isProcessing = false
}) => {
  const { currency: appCurrency, user } = useApp();
  const [currency, setCurrency] = useState<Currency>(() => (appCurrency || 'USD'));
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'paypal_card'>('mobile_money');

  // Restauration automatique de l'état mémorisé (méthode de paiement, plan, devise) lors de la réouverture
  useEffect(() => {
    if (isOpen && typeof sessionStorage !== 'undefined') {
      try {
        const savedMethod = sessionStorage.getItem('payment_method');
        const savedCurrency = sessionStorage.getItem('checkout_currency') as Currency;
        const savedPlan = sessionStorage.getItem('checkout_plan') as PricingBillingCycle;

        if (savedMethod === 'sasapay' || savedMethod === 'mobile_money') {
          setPaymentMethod('mobile_money');
        } else if (savedMethod === 'paypal' || savedMethod === 'paypal_card') {
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

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.USD;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;
  const numericAmount = isYearly ? currentPrice.rawYearly : currentPrice.rawMonthly;

  const handleCheckoutClick = () => {
    onPay({
      currency,
      amount: amountToPay,
      numericAmount,
      plan: billingCycle,
      paymentMethod
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 text-slate-800 dark:text-slate-200 flex flex-col gap-4 relative scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer z-10"
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
            Quotas IA illimités, filtres avancés par plateforme et alertes instantanées.
          </p>

          {/* Badge utilisateur connecté si disponible */}
          {user && (
            <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold mt-1">
              <span>✓ Compte actif : <strong>{user.name || user.email}</strong></span>
            </div>
          )}
        </div>

        {/* 2. Les 3 Avantages Essentiels (Très compact) */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1">
            <span className="text-base">⚡</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">Quotas IA Illimités</span>
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

        {/* 5. Sélection du Mode de Règlement */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Choisissez votre mode de paiement
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* OPTION 1 : Mobile Money & Cartes via SasaPay */}
            <div
              onClick={() => setPaymentMethod('mobile_money')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                paymentMethod === 'mobile_money'
                  ? 'bg-sky-500/10 border-sky-500 shadow-sm ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base">📱</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'mobile_money' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {paymentMethod === 'mobile_money' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Mobile Money (SasaPay)</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Orange, MTN, Wave, Moov, Carte</p>
              </div>
            </div>

            {/* OPTION 2 : PayPal */}
            <div
              onClick={() => setPaymentMethod('paypal_card')}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                paymentMethod === 'paypal_card'
                  ? 'bg-sky-500/10 border-sky-500 shadow-sm ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-base">
                  <span>💳</span>
                  <span className="text-xs font-bold text-[#0079C1]">PayPal</span>
                </div>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'paypal_card' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {paymentMethod === 'paypal_card' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">PayPal & Cartes</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Visa, Mastercard, Compte PayPal</p>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Bouton d'action direct & Réassurance */}
        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCheckoutClick}
            disabled={isProcessing}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                Traitement sécurisé...
              </span>
            ) : (
              <span>
                Payer avec {paymentMethod === 'mobile_money' ? 'SasaPay' : 'PayPal'} ({amountToPay} {currentPrice.symbol}) →
              </span>
            )}
          </button>

          <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400">
            <span>🔒 Chiffrement SSL 256-bit</span>
            <span>•</span>
            <span>⚡ Activation immédiate</span>
            <span>•</span>
            <span>✕ Annulable en 1 clic</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
