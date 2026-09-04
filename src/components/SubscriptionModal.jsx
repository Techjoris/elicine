import React, { useState } from 'react';
import { ElicineLogo } from './ElicineLogo';

const PRICING = {
  XAF: { symbol: 'FCFA', monthly: '2 500', yearly: '22 000', perMonthYearly: '1 830' },
  XOF: { symbol: 'FCFA', monthly: '2 500', yearly: '22 000', perMonthYearly: '1 830' },
  EUR: { symbol: '€', monthly: '3,80', yearly: '32,00', perMonthYearly: '2,66' },
  USD: { symbol: '$', monthly: '4.00', yearly: '34.00', perMonthYearly: '2.83' },
};

export function SubscriptionModal({ isOpen, onClose, onOpenNotchPay, onOpenPayPal }) {
  const [currency, setCurrency] = useState('XAF');
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [paymentMethod, setPaymentMethod] = useState('mobile_money'); // 'mobile_money' | 'paypal_card'
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.EUR;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;

  const handleCurrencyChange = (newCurr) => {
    setCurrency(newCurr);
    if (newCurr === 'XAF' || newCurr === 'XOF') {
      setPaymentMethod('mobile_money');
    } else {
      setPaymentMethod('paypal_card');
    }
  };

  const handleCheckout = () => {
    setIsProcessing(true);
    if (paymentMethod === 'mobile_money') {
      // Déclenche le flux NotchPay existant
      if (onOpenNotchPay) {
        onOpenNotchPay({ currency, amount: amountToPay, plan: billingCycle });
      }
    } else {
      // Déclenche le flux PayPal existant
      if (onOpenPayPal) {
        onOpenPayPal({ currency, amount: amountToPay, plan: billingCycle });
      }
    }
    setTimeout(() => setIsProcessing(false), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl p-6 sm:p-8 text-slate-200 flex flex-col gap-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>

        {/* 1. Header Minimaliste */}
        <div className="text-center flex flex-col items-center gap-2 pt-1">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            👑 Pass Pro Illimité
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Vivez le cinéma sans aucune limite
          </h2>
          <p className="text-xs text-slate-400 max-w-sm">
            Recommandations IA en temps réel, alertes de disponibilité et accès aux catalogues du monde entier.
          </p>
        </div>

        {/* 2. Sélecteur de Devise & Fréquence */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          {/* Devises */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 w-full sm:w-auto justify-center">
            {['XAF', 'XOF', 'EUR', 'USD'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCurrencyChange(c)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currency === c 
                    ? 'bg-sky-500 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Cycle (Mensuel / Annuel) */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !isYearly ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                isYearly ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Annuel</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded-md">
                -30%
              </span>
            </button>
          </div>
        </div>

        {/* 3. Carte Tarif Récapitulative */}
        <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">Formule {isYearly ? 'Annuelle' : 'Mensuelle'}</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-white">{amountToPay}</span>
              <span className="text-xs text-sky-400 font-bold">{currentPrice.symbol}</span>
              <span className="text-xs text-slate-400">/{isYearly ? 'an' : 'mois'}</span>
            </div>
          </div>
          {isYearly && (
            <div className="text-right">
              <span className="text-[11px] text-emerald-400 font-medium block">Économisez 30%</span>
              <span className="text-[10px] text-slate-400">Soit {currentPrice.perMonthYearly} {currentPrice.symbol}/mois</span>
            </div>
          )}
        </div>

        {/* 4. Sélection du Mode de Paiement (2 choix nets) */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Sélectionnez votre mode de règlement
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* OPTION 1 : Mobile Money via NotchPay */}
            <div
              onClick={() => setPaymentMethod('mobile_money')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                paymentMethod === 'mobile_money'
                  ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">📱</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'mobile_money' ? 'border-sky-400 bg-sky-500' : 'border-slate-600'
                }`}>
                  {paymentMethod === 'mobile_money' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-white">Mobile Money</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Orange Money, MTN MoMo, Wave</p>
                <span className="text-[9px] text-slate-400 mt-1 block">Propulsé par NotchPay</span>
              </div>
            </div>

            {/* OPTION 2 : PayPal & Cartes Bancaires */}
            <div
              onClick={() => setPaymentMethod('paypal_card')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                paymentMethod === 'paypal_card'
                  ? 'bg-sky-500/10 border-sky-500 shadow-md ring-1 ring-sky-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-base">
                  <span>💳</span>
                  <span className="text-xs font-bold text-[#0079C1]">PayPal</span>
                </div>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'paypal_card' ? 'border-sky-400 bg-sky-500' : 'border-slate-600'
                }`}>
                  {paymentMethod === 'paypal_card' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-white">PayPal & Cartes</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Visa, Mastercard, Compte PayPal</p>
                <span className="text-[9px] text-slate-400 mt-1 block">Paiement international sécurisé</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Bouton d'action et Réassurance */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={isProcessing}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                Sécurisation...
              </span>
            ) : (
              <span>
                Activer mon accès Pro ({amountToPay} {currentPrice.symbol}) →
              </span>
            )}
          </button>

          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400">
            <span>🔒 Chiffrement SSL 256-bit</span>
            <span>•</span>
            <span>⚡ Activation instantanée</span>
            <span>•</span>
            <span>✕ Annulable en 1 clic</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionModal;
