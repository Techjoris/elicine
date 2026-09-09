import React, { useState } from 'react';
import { ElicineLogo } from './ElicineLogo';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export interface CheckoutPayload {
  currency: string;
  amount: string;
  plan: 'monthly' | 'yearly';
}

export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotchPay?: (payload: CheckoutPayload) => void;
  onOpenPayPal?: (payload: CheckoutPayload) => void;
}

const PRICING = {
  XAF: { symbol: 'FCFA', monthly: '2 500', yearly: '22 000', perMonthYearly: '1 830' },
  XOF: { symbol: 'FCFA', monthly: '2 500', yearly: '22 000', perMonthYearly: '1 830' },
  EUR: { symbol: '€', monthly: '3,80', yearly: '32,00', perMonthYearly: '2,66' },
  USD: { symbol: '$', monthly: '4.00', yearly: '34.00', perMonthYearly: '2.83' },
};

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onOpenNotchPay, 
  onOpenPayPal 
}) => {
  const { user, loginWithGoogle } = useApp();
  const [currency, setCurrency] = useState<'XAF' | 'XOF' | 'EUR' | 'USD'>('XAF');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'paypal_card'>('mobile_money');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) {
        console.error('[Google OAuth error in SubscriptionModal]', error);
      }
    } catch (err) {
      console.error('[Google OAuth exception in SubscriptionModal]', err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.EUR;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;

  const handleCurrencyChange = (newCurr: 'XAF' | 'XOF' | 'EUR' | 'USD') => {
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
      if (onOpenNotchPay) {
        onOpenNotchPay({ currency, amount: amountToPay, plan: billingCycle });
      }
    } else {
      if (onOpenPayPal) {
        onOpenPayPal({ currency, amount: amountToPay, plan: billingCycle });
      }
    }
    setTimeout(() => setIsProcessing(false), 1000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-slate-800 dark:text-slate-200 flex flex-col gap-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>

        {/* 1. Header Minimaliste */}
        <div className="text-center flex flex-col items-center gap-2 pt-1">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            👑 Pass Pro Illimité
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Vivez le cinéma sans aucune limite
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
            Recommandations IA en temps réel, alertes de disponibilité et accès aux catalogues du monde entier.
          </p>
        </div>

        {/* Bouton officiel Continuer avec Google lors de l'accès au Pass Pro */}
        {!user ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Associez votre compte pour retrouver votre Pass Pro sur tous vos écrans :
              </span>
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-zinc-900 border border-slate-200 dark:border-transparent font-bold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm select-none disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{isGoogleLoading ? 'Connexion en cours...' : 'Continuer avec Google'}</span>
            </button>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center leading-tight pt-0.5">
              En continuant, vous confirmez votre accord avec nos{' '}
              <a 
                href="/terms" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-cyan-600 dark:text-cyan-400 hover:underline underline-offset-2"
              >
                Conditions Générales d'Utilisation
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="text-slate-700 dark:text-slate-300 truncate">
                Compte : <strong>{user.email || user.name}</strong>
              </span>
            </div>
            {user.provider === 'google' ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 flex-shrink-0">
                ✓ Google lié
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                Lier Google ↗
              </button>
            )}
          </div>
        )}

        {/* 2. Sélecteur de Devise & Fréquence */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          {/* Devises */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full sm:w-auto justify-center">
            {(['XAF', 'XOF', 'EUR', 'USD'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCurrencyChange(c)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !isYearly ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
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

        {/* 3. Carte Tarif Récapitulative */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Formule {isYearly ? 'Annuelle' : 'Mensuelle'}</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{amountToPay}</span>
              <span className="text-xs text-sky-500 dark:text-sky-400 font-bold">{currentPrice.symbol}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/{isYearly ? 'an' : 'mois'}</span>
            </div>
          </div>
          {isYearly && (
            <div className="text-right">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">Économisez 30%</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Soit {currentPrice.perMonthYearly} {currentPrice.symbol}/mois</span>
            </div>
          )}
        </div>

        {/* 4. Sélection du Mode de Paiement (2 choix nets) */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Sélectionnez votre mode de règlement
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* OPTION 1 : Mobile Money via NotchPay */}
            <div
              onClick={() => setPaymentMethod('mobile_money')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                paymentMethod === 'mobile_money'
                  ? 'bg-sky-500/10 border-sky-500 shadow-sm ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">📱</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'mobile_money' ? 'border-sky-400 bg-sky-500' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {paymentMethod === 'mobile_money' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Mobile Money</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Orange Money, MTN MoMo, Wave</p>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 block">Propulsé par NotchPay</span>
              </div>
            </div>

            {/* OPTION 2 : PayPal & Cartes Bancaires */}
            <div
              onClick={() => setPaymentMethod('paypal_card')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                paymentMethod === 'paypal_card'
                  ? 'bg-sky-500/10 border-sky-500 shadow-sm ring-1 ring-sky-500/30'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-base">
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Visa, Mastercard, Compte PayPal</p>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 block">Paiement international sécurisé</span>
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
};

export default SubscriptionModal;
