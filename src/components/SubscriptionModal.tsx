import React, { useState, useEffect } from 'react';
import { ElicineLogo } from './ElicineLogo';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Currency, PricingBillingCycle, ProSubscription } from '../types';
import { subscriptionService } from '../services/subscriptionService';

export interface CheckoutPayload {
  currency: string;
  amount: string;
  plan: 'monthly' | 'yearly';
  subscriptionId?: string;
  customerName?: string;
  customerEmail?: string;
  phone?: string;
}

export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSaspay?: (payload: CheckoutPayload) => void;
  onOpenMoneroo?: (payload: CheckoutPayload) => void;
  onOpenNotchPay?: (payload: CheckoutPayload) => void;
  onOpenPayPal?: (payload: CheckoutPayload) => void;
}

const PRICING: Record<Currency, { symbol: string; monthly: string; yearly: string; perMonthYearly: string; rawMonthly: number; rawYearly: number }> = {
  USD: { symbol: '$', monthly: '1.99', yearly: '15.99', perMonthYearly: '1.33', rawMonthly: 1.99, rawYearly: 15.99 },
  EUR: { symbol: '€', monthly: '1,85', yearly: '15,00', perMonthYearly: '1,25', rawMonthly: 1.85, rawYearly: 15.00 },
  CAD: { symbol: 'CA$', monthly: '2.70', yearly: '21.50', perMonthYearly: '1.79', rawMonthly: 2.70, rawYearly: 21.50 },
  XOF: { symbol: 'FCFA', monthly: '1 200', yearly: '9 600', perMonthYearly: '800', rawMonthly: 1200, rawYearly: 9600 },
  XAF: { symbol: 'FCFA', monthly: '1 200', yearly: '9 600', perMonthYearly: '800', rawMonthly: 1200, rawYearly: 9600 },
};

type FunnelStep = 1 | 2 | 3;

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onOpenSaspay,
  onOpenMoneroo,
  onOpenNotchPay, 
  onOpenPayPal 
}) => {
  const { user, currency: appCurrency, loginWithCredentials, registerWithCredentials, showToast } = useApp();
  
  // Étape courante du tunnel
  const [currentStep, setCurrentStep] = useState<FunnelStep>(1);

  // Étape 1 : Paramètres de l'offre
  const [currency, setCurrency] = useState<Currency>(() => (appCurrency || 'USD'));
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>('monthly');

  // Étape 2 : Inscription / Profil Pro & Consentement
  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberPhone, setSubscriberPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  
  // Authentification inline si l'utilisateur n'est pas connecté
  const [authTab, setAuthTab] = useState<'register' | 'login'>('register');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // État de la souscription enregistrée en base
  const [isSubmittingSubscription, setIsSubmittingSubscription] = useState(false);
  const [registeredSubscription, setRegisteredSubscription] = useState<ProSubscription | null>(null);

  // Étape 3 : Mode de règlement
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'paypal_card'>('mobile_money');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Pré-remplissage du profil lorsque l'utilisateur est connecté
  useEffect(() => {
    if (user) {
      if (!subscriberName) {
        setSubscriberName(user.name || (user as any)?.user_metadata?.full_name || '');
      }
      if (!subscriberEmail) {
        setSubscriberEmail(user.email || '');
      }
    }
  }, [user]);

  // Réinitialiser les états à l'ouverture de la modale
  useEffect(() => {
    if (isOpen) {
      // Vérifier si une souscription est déjà en attente
      const pending = subscriptionService.getPendingSubscription();
      if (pending && pending.status === 'pending_payment') {
        setRegisteredSubscription(pending);
        // Si l'utilisateur a déjà initialisé une souscription valide, il peut aller directement au paiement ou réviser
        setSubscriberName(pending.customerName);
        setSubscriberEmail(pending.email);
        if (pending.phone) setSubscriberPhone(pending.phone);
        setTermsAccepted(pending.termsAccepted);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPrice = PRICING[currency] || PRICING.USD;
  const isYearly = billingCycle === 'yearly';
  const amountToPay = isYearly ? currentPrice.yearly : currentPrice.monthly;
  const numericAmount = isYearly ? currentPrice.rawYearly : currentPrice.rawMonthly;

  // ─── Actions Étape 2 : Authentification inline ─────────────────────────────
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) {
        setAuthError(error.message);
      }
    } catch (err: any) {
      setAuthError(err?.message || "Erreur lors de la connexion Google.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleInlineAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      if (authTab === 'register') {
        if (!subscriberName.trim()) {
          setAuthError("Veuillez saisir votre nom complet.");
          setIsAuthLoading(false);
          return;
        }
        if (!subscriberEmail.trim() || !subscriberEmail.includes('@')) {
          setAuthError("Veuillez saisir une adresse email valide.");
          setIsAuthLoading(false);
          return;
        }
        if (!authPassword || authPassword.length < 6) {
          setAuthError("Le mot de passe doit contenir au moins 6 caractères.");
          setIsAuthLoading(false);
          return;
        }

        const res = await registerWithCredentials(subscriberName.trim(), subscriberEmail.trim(), authPassword);
        if (!res.success) {
          setAuthError(res.error || "Échec de l'inscription.");
        } else {
          showToast("Compte créé avec succès ! Poursuivez votre souscription.");
        }
      } else {
        if (!subscriberEmail.trim()) {
          setAuthError("Veuillez saisir votre adresse email.");
          setIsAuthLoading(false);
          return;
        }
        const res = await loginWithCredentials(subscriberEmail.trim(), authPassword);
        if (!res.success) {
          setAuthError(res.error || "Identifiants incorrects.");
        } else {
          showToast("Connexion réussie !");
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || "Une erreur est survenue.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ─── Actions Étape 2 : Validation formelle de la souscription ────────────────
  const handleValidateSubscription = async () => {
    const finalEmail = (user?.email || subscriberEmail || '').trim().toLowerCase();
    const finalName = (user?.name || subscriberName || '').trim();

    if (!user && (!finalEmail || !finalName)) {
      showToast("Veuillez vous connecter ou renseigner vos coordonnées de compte.");
      return;
    }

    if (!finalEmail || !finalEmail.includes('@')) {
      showToast("Veuillez saisir une adresse email valide.");
      return;
    }

    if (!termsAccepted) {
      showToast("Veuillez accepter les conditions de l'abonnement Pro.");
      return;
    }

    setIsSubmittingSubscription(true);
    try {
      const res = await subscriptionService.initProSubscription({
        userId: user?.id || `usr_pro_${Date.now()}`,
        email: finalEmail,
        customerName: finalName || 'Cinéphile Pro',
        phone: subscriberPhone.trim() || undefined,
        plan: billingCycle,
        currency,
        amount: numericAmount,
        termsAccepted: true
      });

      if (res.success && res.subscription) {
        setRegisteredSubscription(res.subscription);
        showToast("✓ Inscription Pro enregistrée en attente de règlement !");
        // Déblocage et transition automatique vers l'Étape 3 (Paiement)
        setCurrentStep(3);
      } else {
        showToast(res.error || "Erreur lors de l'enregistrement de la souscription.");
      }
    } catch (err: any) {
      console.error('[SubscriptionModal] Erreur init subscription:', err);
      showToast("Erreur de communication lors de l'enregistrement.");
    } finally {
      setIsSubmittingSubscription(false);
    }
  };

  // ─── Actions Étape 3 : Déclenchement du paiement SasaPay ─────────────────────
  const handleTriggerPayment = () => {
    if (!registeredSubscription) {
      showToast("Erreur : Aucune souscription enregistrée trouvée. Veuillez valider l'étape 2.");
      setCurrentStep(2);
      return;
    }

    setIsProcessingPayment(true);
    const targetPayload: CheckoutPayload = {
      currency,
      amount: amountToPay,
      plan: billingCycle,
      subscriptionId: registeredSubscription.id,
      customerName: registeredSubscription.customerName,
      customerEmail: registeredSubscription.email,
      phone: registeredSubscription.phone
    };

    if (paymentMethod === 'mobile_money') {
      if (onOpenSaspay) {
        onOpenSaspay(targetPayload);
      } else if (onOpenMoneroo) {
        onOpenMoneroo(targetPayload);
      } else if (onOpenNotchPay) {
        onOpenNotchPay(targetPayload);
      }
    } else {
      if (onOpenPayPal) {
        onOpenPayPal(targetPayload);
      }
    }

    setTimeout(() => setIsProcessingPayment(false), 1200);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7 text-slate-800 dark:text-slate-200 flex flex-col gap-4 relative scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton Fermer */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer z-10"
        >
          ✕
        </button>

        {/* 1. Header Minimaliste */}
        <div className="text-center flex flex-col items-center gap-1 pt-1">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            👑 Abonnement Éliciné Pro
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {currentStep === 1 && "Vivez le cinéma sans aucune limite"}
            {currentStep === 2 && "Inscription & Validation du Compte Pro"}
            {currentStep === 3 && "Règlement Sécurisé SasaPay"}
          </h2>
        </div>

        {/* 2. Stepper Visuel du Tunnel (3 Étapes) */}
        <div className="grid grid-cols-3 gap-2 px-1 py-1 text-center select-none">
          {/* Étape 1 */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
              currentStep === 1 
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-600 dark:text-sky-400 font-bold' 
                : 'bg-slate-100 dark:bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black bg-current text-white dark:text-slate-950">
              1
            </span>
            <span className="text-[11px] font-medium leading-tight">1. Offre & Plan</span>
          </button>

          {/* Étape 2 */}
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
              currentStep === 2 
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-600 dark:text-sky-400 font-bold' 
                : (registeredSubscription ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900/60 text-slate-400 border border-transparent')
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black bg-current text-white dark:text-slate-950">
              {registeredSubscription ? '✓' : '2'}
            </span>
            <span className="text-[11px] font-medium leading-tight">2. Souscription</span>
          </button>

          {/* Étape 3 */}
          <button
            type="button"
            disabled={!registeredSubscription}
            onClick={() => registeredSubscription && setCurrentStep(3)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
              currentStep === 3 
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-600 dark:text-sky-400 font-bold' 
                : (registeredSubscription ? 'bg-slate-100 dark:bg-slate-900/60 text-slate-300 hover:text-white border border-transparent cursor-pointer' : 'bg-slate-100/50 dark:bg-slate-900/30 text-slate-500 border border-transparent opacity-50 cursor-not-allowed')
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black bg-current text-white dark:text-slate-950">
              3
            </span>
            <span className="text-[11px] font-medium leading-tight">3. Paiement</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            ÉTAPE 1 : CHOIX DE L'OFFRE & DU PLAN
        ══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Avantages exclusifs Pass Pro */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span>👑</span>
                  <span>Vos avantages exclusifs Pass Pro</span>
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Accès Illimité
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">⚡</div>
                  <div className="leading-tight">
                    <p className="font-bold text-slate-900 dark:text-white">Quotas illimités de requêtes IA</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Recherches, analyses cinéphiles et recommandations sans restriction.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">🎯</div>
                  <div className="leading-tight">
                    <p className="font-bold text-slate-900 dark:text-white">Filtres avancés plateformes & notes</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Filtrez vos films selon vos abonnements (Netflix, Canal+, Prime...) et les meilleures notes.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">🔔</div>
                  <div className="leading-tight">
                    <p className="font-bold text-slate-900 dark:text-white">Alertes de sorties personnalisées</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Soyez notifié dès qu'un film ou une série attendue devient disponible.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sélecteur de Devise & Fréquence */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              {/* Devises */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full sm:w-auto justify-center">
                {(['USD', 'EUR', 'XOF', 'XAF', 'CAD'] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
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

            {/* Carte Tarif Récapitulative */}
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

            {/* Bouton d'avancement vers l'Étape 2 */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continuer vers la souscription (Étape 2/3) →</span>
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Étape suivante obligatoire : Inscription formelle & création du profil Pro
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ÉTAPE 2 : PRÉREQUIS OBLIGATOIRE — INSCRIPTION & SOUSCRIPTION EN BASE
        ══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Bannière explicative obligatoire */}
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400">
              <span className="text-base flex-shrink-0">⚠️</span>
              <div className="leading-tight">
                <p className="font-bold">Prérequis obligatoire avant paiement</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Pour garantir le rattachement direct de votre Pass Pro et éviter tout paiement orphelin, votre inscription formelle doit être enregistrée en base de données.
                </p>
              </div>
            </div>

            {/* A. Cas 1 : Utilisateur déjà connecté */}
            {user ? (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-300 dark:border-slate-700" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {user.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full flex-shrink-0">
                  ✓ Compte vérifié
                </span>
              </div>
            ) : (
              /* B. Cas 2 : Utilisateur non connecté -> Inscription / Connexion Inline */
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Identifiez-vous pour votre compte Pro :
                  </span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAuthTab('register')}
                      className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-all ${
                        authTab === 'register' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Créer un compte
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthTab('login')}
                      className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-all ${
                        authTab === 'login' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Se connecter
                    </button>
                  </div>
                </div>

                {/* Option 1 : Google OAuth en 1 clic */}
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

                <div className="relative flex items-center justify-center my-0.5">
                  <div className="border-t border-slate-200 dark:border-slate-800 w-full"></div>
                  <span className="bg-slate-50 dark:bg-slate-950 px-2 text-[10px] text-slate-400 uppercase tracking-widest font-bold">ou par email</span>
                </div>

                {/* Option 2 : Formulaire inline Email & Mot de passe */}
                <form onSubmit={handleInlineAuthSubmit} className="space-y-2.5">
                  {authTab === 'register' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Nom complet du souscripteur
                      </label>
                      <input
                        type="text"
                        value={subscriberName}
                        onChange={(e) => setSubscriberName(e.target.value)}
                        placeholder="Ex: Alexandre Dupont"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Adresse email
                    </label>
                    <input
                      type="email"
                      value={subscriberEmail}
                      onChange={(e) => setSubscriberEmail(e.target.value)}
                      placeholder="nom@exemple.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Mot de passe {authTab === 'register' && '(min. 6 caractères)'}
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      required
                    />
                  </div>

                  {authError && (
                    <p className="text-[11px] text-rose-500 font-medium">{authError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isAuthLoading ? 'Validation du compte...' : (authTab === 'register' ? 'Créer mon compte et continuer' : 'Se connecter et continuer')}
                  </button>
                </form>
              </div>
            )}

            {/* Formulaire des coordonnées de souscription */}
            <div className="space-y-3 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 text-xs">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                <span>Détails du compte Pro :</span>
                <span className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                  {isYearly ? 'Formule Annuelle' : 'Formule Mensuelle'} ({amountToPay} {currentPrice.symbol})
                </span>
              </h3>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Numéro de téléphone pour Mobile Money (Optionnel — Orange, MTN, Wave, Moov)
                </label>
                <input
                  type="tel"
                  value={subscriberPhone}
                  onChange={(e) => setSubscriberPhone(e.target.value)}
                  placeholder="+225 07... / +229 97... / +237 6..."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Permet à SasaPay de pré-remplir votre opérateur Mobile Money lors du paiement.
                </p>
              </div>

              {/* Case à cocher obligatoire d'acceptation des conditions */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-sky-500 focus:ring-sky-400 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight">
                    J'accepte les{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">
                      Conditions Générales d'Utilisation
                    </a>{' '}
                    et souscris formellement au Pass Pro Éliciné ({amountToPay} {currentPrice.symbol} - {isYearly ? 'Annuel' : 'Mensuel'}). Je confirme l'exactitude de mes coordonnées.
                  </span>
                </label>
              </div>
            </div>

            {/* Actions Étape 2 : Navigation & Enregistrement en base */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                ← Modifier l'offre
              </button>

              <button
                type="button"
                onClick={handleValidateSubscription}
                disabled={isSubmittingSubscription || !termsAccepted || (!user && !subscriberEmail)}
                className="w-full flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-xs transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isSubmittingSubscription ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                    Enregistrement en base de données...
                  </span>
                ) : (
                  <span>
                    Valider mon inscription et préparer le paiement →
                  </span>
                )}
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              🔒 Le module de paiement SasaPay ne s'activera qu'après enregistrement formel de votre profil.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ÉTAPE 3 : PAIEMENT SÉCURISÉ SASAPAY (DÉBLOQUÉ SUITE À SOUSCRIPTION)
        ══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && registeredSubscription && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Récapitulatif officiel de la souscription enregistrée */}
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Souscription Enregistrée en Base</span>
                </span>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                  🟡 En attente de paiement
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 block">N° Référence Souscription</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white truncate block">
                    {registeredSubscription.id}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Montant à régler</span>
                  <span className="font-black text-sky-500 dark:text-sky-400 text-sm">
                    {amountToPay} {currentPrice.symbol}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-emerald-500/20">
                  <span className="text-[10px] text-slate-400 block">Titulaire de l'abonnement</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {registeredSubscription.customerName} ({registeredSubscription.email})
                  </span>
                </div>
              </div>
            </div>

            {/* Sélection du Mode de Paiement */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sélectionnez votre passerelle de règlement
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* OPTION 1 : Mobile Money & Cartes via SasPay */}
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
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Mobile Money & Cartes (SasaPay)</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Orange Money, MTN MoMo, Wave, Moov, Carte bancaire</p>
                    <span className="text-[9px] text-sky-600 dark:text-sky-400 font-medium mt-1 block">Règlement direct rattaché à votre souscription</span>
                  </div>
                </div>

                {/* OPTION 2 : PayPal */}
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
                    <p className="text-xs font-bold text-slate-900 dark:text-white">PayPal International</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Cartes Visa, Mastercard & Solde PayPal</p>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 block">Paiement international sécurisé</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bouton de déclenchement du paiement débloqué */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleTriggerPayment}
                disabled={isProcessingPayment}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                    Initialisation du paiement sécurisé SasaPay...
                  </span>
                ) : (
                  <span>
                    Payer avec {paymentMethod === 'mobile_money' ? 'SasaPay' : 'PayPal'} ({amountToPay} {currentPrice.symbol}) →
                  </span>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-slate-400 hover:text-white underline cursor-pointer text-[11px]"
                >
                  ← Modifier mes informations
                </button>
                <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-semibold">
                  🔒 Transaction rattachée au compte
                </span>
              </div>

              <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-1">
                <span>🔒 Chiffrement SSL 256-bit</span>
                <span>•</span>
                <span>⚡ Déblocage Pro immédiat</span>
                <span>•</span>
                <span>✕ Sans engagement</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionModal;
