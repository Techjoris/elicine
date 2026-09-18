import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { subscriptionService } from '../../services/subscriptionService';
import { supabase } from '../../lib/supabase';
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  Crown, 
  RefreshCw, 
  ArrowRight, 
  Lock, 
  CheckCircle2,
  CreditCard,
  Smartphone
} from 'lucide-react';
import confetti from 'canvas-confetti';

type VerificationState = 'verifying' | 'active_confirmed' | 'pending_operator' | 'failed';

export type PaymentGatewayType = 
  | 'card' 
  | 'paypal' 
  | 'orangemoney' 
  | 'mtn' 
  | 'wave' 
  | 'moov' 
  | 'mobile_money'
  | 'generic';

interface GatewayConfig {
  name: string;
  badgeText: string;
  badgeClass: string;
  icon: 'card' | 'phone' | 'shield';
  networkBadges: { label: string; bg: string; text: string }[];
  verifyingTitle: string;
  verifyingDescription: string;
  verifyingStep2: string;
  pendingBadge: string;
  pendingTitle: string;
  pendingDescription: string;
  pendingNoticeTitle: string;
  pendingNoticePoints: string[];
  confirmedSubtitle: string;
}

const GATEWAY_CONFIGS: Record<PaymentGatewayType, GatewayConfig> = {
  card: {
    name: 'Carte Bancaire',
    badgeText: 'Paiement par Carte Bancaire',
    badgeClass: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
    icon: 'card',
    networkBadges: [
      { label: 'VISA', bg: 'bg-blue-600/20 border-blue-500/40', text: 'text-blue-400' },
      { label: 'Mastercard', bg: 'bg-rose-600/20 border-rose-500/40', text: 'text-rose-400' },
      { label: 'CB', bg: 'bg-emerald-600/20 border-emerald-500/40', text: 'text-emerald-400' },
      { label: '3D Secure', bg: 'bg-sky-600/20 border-sky-500/40', text: 'text-sky-300' }
    ],
    verifyingTitle: 'Validation de votre paiement par carte bancaire en cours...',
    verifyingDescription: 'Nous interrogeons le réseau bancaire (Visa / Mastercard) et vérifions l\'autorisation sécurisée 3D Secure...',
    verifyingStep2: '2. Contrôle de l\'autorisation 3D Secure et signature...',
    pendingBadge: 'Autorisation Bancaire en Cours',
    pendingTitle: 'Validation de votre paiement par carte bancaire en cours...',
    pendingDescription: 'Votre transaction a bien été transmise à votre établissement bancaire (Visa / Mastercard). La confirmation définitive de l\'autorisation prend généralement de quelques secondes à une minute.',
    pendingNoticeTitle: 'Sécurité Bancaire 3D Secure :',
    pendingNoticePoints: [
      'Authentification sécurisée : Si une invite de confirmation 3D Secure vous a été envoyée par SMS ou via l\'application de votre banque, veuillez la valider pour finaliser la transaction.',
      'Garantie zéro double débit : Si votre compte a été débité, votre accès Pro sera débloqué automatiquement dès réception de la confirmation bancaire.'
    ],
    confirmedSubtitle: 'Votre paiement par carte bancaire a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  orangemoney: {
    name: 'Orange Money',
    badgeText: 'Orange Money',
    badgeClass: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    icon: 'phone',
    networkBadges: [
      { label: 'Orange Money', bg: 'bg-orange-600/20 border-orange-500/40', text: 'text-orange-400' },
      { label: '#144# ou App Orange', bg: 'bg-amber-600/20 border-amber-500/40', text: 'text-amber-300' }
    ],
    verifyingTitle: 'Validation Orange Money en cours...',
    verifyingDescription: 'Nous interrogeons le serveur Orange Money pour confirmer la validation de votre transaction...',
    verifyingStep2: '2. Vérification du débit Orange Money (#144# ou App)...',
    pendingBadge: 'Validation Orange Money en Cours',
    pendingTitle: 'Validation opérateur en cours (Orange Money)...',
    pendingDescription: 'Votre demande de paiement a bien été envoyée à Orange Money. Si une invite USSD (#144#) ou une notification s\'affiche sur votre téléphone, veuillez valider avec votre code secret.',
    pendingNoticeTitle: 'Garantie Orange Money :',
    pendingNoticePoints: [
      'Validation sur mobile : Confirmez le débit sur votre ligne Orange Money pour débloquer votre abonnement.',
      'Débit sécurisé : Seul le montant convenu est prélevé. Dès saisie de votre code secret, votre Pass Pro est activé.'
    ],
    confirmedSubtitle: 'Votre paiement via Orange Money a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  mtn: {
    name: 'MTN Mobile Money',
    badgeText: 'MTN MoMo',
    badgeClass: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    icon: 'phone',
    networkBadges: [
      { label: 'MTN MoMo', bg: 'bg-yellow-500/20 border-yellow-400/40', text: 'text-yellow-400' },
      { label: 'Code PIN MoMo', bg: 'bg-amber-500/20 border-amber-400/40', text: 'text-amber-300' }
    ],
    verifyingTitle: 'Validation MTN Mobile Money en cours...',
    verifyingDescription: 'Nous attendons la confirmation de débit de votre compte MTN MoMo...',
    verifyingStep2: '2. Contrôle de la validation par code PIN MoMo...',
    pendingBadge: 'Validation MTN MoMo en Cours',
    pendingTitle: 'Validation opérateur en cours (MTN MoMo)...',
    pendingDescription: 'Votre demande a bien été envoyée à MTN Mobile Money. Veuillez approuver l\'invite sur votre téléphone avec votre code secret PIN MoMo.',
    pendingNoticeTitle: 'Garantie MTN Mobile Money :',
    pendingNoticePoints: [
      'Validation MoMo : Tapez votre code secret MTN pour autoriser le paiement sur votre mobile.',
      'Activation en temps réel : Dès confirmation de votre code PIN, vos privilèges Pro sont automatiquement débloqués.'
    ],
    confirmedSubtitle: 'Votre paiement via MTN MoMo a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  wave: {
    name: 'Wave',
    badgeText: 'Wave Mobile Money',
    badgeClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
    icon: 'phone',
    networkBadges: [
      { label: 'Wave', bg: 'bg-cyan-600/20 border-cyan-500/40', text: 'text-cyan-400' },
      { label: '0% Frais', bg: 'bg-sky-600/20 border-sky-500/40', text: 'text-sky-300' }
    ],
    verifyingTitle: 'Validation Wave en cours...',
    verifyingDescription: 'Nous interrogeons Wave pour confirmer la validation de votre paiement...',
    verifyingStep2: '2. Contrôle du transfert sécurisé Wave...',
    pendingBadge: 'Validation Wave en Cours',
    pendingTitle: 'Validation opérateur en cours (Wave)...',
    pendingDescription: 'Votre transaction a bien été transmise à Wave. Veuillez ouvrir votre application mobile Wave pour confirmer le paiement.',
    pendingNoticeTitle: 'Garantie Wave :',
    pendingNoticePoints: [
      'Paiement sans frais caché : Transaction instantanée et sécurisée via l\'application Wave.',
      'Dès validation dans l\'app Wave, votre compte Pro est synchronisé sans aucune action supplémentaire.'
    ],
    confirmedSubtitle: 'Votre paiement Wave a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  moov: {
    name: 'Moov Money',
    badgeText: 'Moov Money',
    badgeClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    icon: 'phone',
    networkBadges: [
      { label: 'Moov Money', bg: 'bg-blue-600/20 border-blue-500/40', text: 'text-blue-400' }
    ],
    verifyingTitle: 'Validation Moov Money en cours...',
    verifyingDescription: 'Nous interrogeons Moov Money pour confirmer la transaction en temps réel...',
    verifyingStep2: '2. Contrôle du signal de débit Moov Money...',
    pendingBadge: 'Validation Moov en Cours',
    pendingTitle: 'Validation opérateur en cours (Moov Money)...',
    pendingDescription: 'Votre transaction a été transmise à Moov Money. Veuillez valider le débit sur votre téléphone mobile.',
    pendingNoticeTitle: 'Garantie Moov Money :',
    pendingNoticePoints: [
      'Débit sécurisé par votre opérateur téléphonique.',
      'Votre Pass Pro s\'activera dès réception de la confirmation.'
    ],
    confirmedSubtitle: 'Votre paiement Moov Money a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  mobile_money: {
    name: 'Mobile Money',
    badgeText: 'Mobile Money Sécurisé',
    badgeClass: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
    icon: 'phone',
    networkBadges: [
      { label: 'Orange Money', bg: 'bg-orange-600/20 border-orange-500/40', text: 'text-orange-400' },
      { label: 'MTN', bg: 'bg-yellow-500/20 border-yellow-400/40', text: 'text-yellow-400' },
      { label: 'Wave', bg: 'bg-cyan-600/20 border-cyan-500/40', text: 'text-cyan-400' }
    ],
    verifyingTitle: 'Validation de votre paiement Mobile Money en cours...',
    verifyingDescription: 'Nous interrogeons votre opérateur téléphonique pour confirmer la transaction en temps réel...',
    verifyingStep2: '2. Contrôle du signal de validation de l\'opérateur...',
    pendingBadge: 'Validation Opérateur en Cours',
    pendingTitle: 'Validation opérateur en cours (Orange Money / MTN)...',
    pendingDescription: 'Votre transaction a bien été transmise à votre opérateur Mobile Money (Orange Money, MTN, Wave). Le traitement de la confirmation prend parfois quelques instants.',
    pendingNoticeTitle: 'Garantie Opérateur Mobile :',
    pendingNoticePoints: [
      'Débit maîtrisé : Seul votre opérateur téléphonique peut autoriser la transaction après saisie de votre code secret.',
      'Activation automatique : Dès réception du signal de confirmation, votre compte Pro est immédiatement débloqué.'
    ],
    confirmedSubtitle: 'Votre paiement Mobile Money a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  paypal: {
    name: 'PayPal',
    badgeText: 'Paiement Sécurisé PayPal',
    badgeClass: 'bg-blue-600/15 border-blue-500/30 text-sky-400',
    icon: 'card',
    networkBadges: [
      { label: 'PayPal', bg: 'bg-blue-600/20 border-blue-500/40', text: 'text-sky-300' },
      { label: 'Protection des Achats', bg: 'bg-emerald-600/20 border-emerald-500/40', text: 'text-emerald-300' }
    ],
    verifyingTitle: 'Validation de votre paiement PayPal en cours...',
    verifyingDescription: 'Nous interrogeons PayPal et validons la capture officielle et la signature de votre ordre...',
    verifyingStep2: '2. Capture et confirmation cryptographique de l\'ordre...',
    pendingBadge: 'Confirmation PayPal en Cours',
    pendingTitle: 'Validation de votre paiement PayPal en cours...',
    pendingDescription: 'Votre paiement PayPal a été transmis avec succès. La finalisation de l\'autorisation et de la capture est en cours de traitement par PayPal.',
    pendingNoticeTitle: 'Garantie & Protection PayPal :',
    pendingNoticePoints: [
      'Protection des Achats : Votre transaction bénéficie de l\'intégralité des garanties de sécurité PayPal.',
      'Validation automatique : Dès la capture de l\'ordre confirmée par PayPal, vos droits Pro sont immédiatement débloqués.'
    ],
    confirmedSubtitle: 'Votre paiement PayPal a été validé avec succès. Votre Pass Pro est immédiatement actif.'
  },
  generic: {
    name: 'Paiement Sécurisé',
    badgeText: 'Sécurité Bancaire Maximale',
    badgeClass: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
    icon: 'shield',
    networkBadges: [
      { label: 'Chiffrement SHA-256', bg: 'bg-sky-600/20 border-sky-500/40', text: 'text-sky-300' }
    ],
    verifyingTitle: 'Vérification Cryptographique du Paiement',
    verifyingDescription: 'Nous interrogeons la passerelle de paiement sécurisée et validons la signature de votre transaction...',
    verifyingStep2: '2. Contrôle de la signature du Webhook serveur...',
    pendingBadge: 'Validation en Cours',
    pendingTitle: 'Paiement en cours de validation',
    pendingDescription: 'Votre transaction a bien été initiée auprès de votre organisme financier. Le traitement de la confirmation prend parfois quelques instants.',
    pendingNoticeTitle: 'Garantie de sécurité Éliciné :',
    pendingNoticePoints: [
      'Aucun accès anticipé sans preuve : Votre compte Pro sera automatiquement débloqué dès confirmation officielle.',
      'Vous n\'avez pas besoin de repayer : Si votre compte a été débité, la synchronisation s\'effectuera en tâche de fond.'
    ],
    confirmedSubtitle: 'Votre transaction bancaire a été validée avec succès. Votre Pass Pro est immédiatement actif.'
  }
};

function detectGatewayType(raw: string | null | undefined): PaymentGatewayType {
  if (!raw) return 'generic';
  const clean = raw.toLowerCase().trim();

  // Carte bancaire (Visa, Mastercard, etc.)
  if (['card', 'credit_card', 'carte', 'carte_bancaire', 'visa', 'mastercard', 'cb', 'debit_card'].includes(clean)) {
    return 'card';
  }

  // PayPal
  if (['paypal', 'paypal_card', 'paypal_account'].includes(clean)) {
    return 'paypal';
  }

  // Orange Money
  if (['orange', 'orangemoney', 'orange_money', 'om'].includes(clean)) {
    return 'orangemoney';
  }

  // MTN Mobile Money
  if (['mtn', 'mtnmomo', 'mtn_momo', 'momo'].includes(clean)) {
    return 'mtn';
  }

  // Wave
  if (['wave', 'wave_money', 'wave_ci', 'wave_sn'].includes(clean)) {
    return 'wave';
  }

  // Moov
  if (['moov', 'moovmoney', 'moov_money', 'flooz'].includes(clean)) {
    return 'moov';
  }

  // Mobile Money général
  if (['mobile_money', 'mobile', 'momo_all', 'saspay', 'notchpay', 'cinetpay'].includes(clean)) {
    return 'mobile_money';
  }

  return 'generic';
}

export const PaymentCallbackView: React.FC = () => {
  const { user, setActiveView, refreshUserProStatus, setIsProModalOpen } = useApp();

  const [state, setState] = useState<VerificationState>('verifying');
  const [subId, setSubId] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [gatewayType, setGatewayType] = useState<PaymentGatewayType>('generic');
  const [plan, setPlan] = useState<string>('yearly');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isCardDecline, setIsCardDecline] = useState<boolean>(false);
  const [pollCount, setPollCount] = useState<number>(0);

  const isPollingRef = useRef<boolean>(false);
  const pollTimerRef = useRef<any>(null);

  // Extraction des paramètres d'URL de retour et détection contextuelle du moyen de paiement
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const extractedSubId = (
      params.get('subscription_id') || 
      params.get('subscriptionId') || 
      params.get('id') || 
      ''
    ).trim();

    const extractedRef = (
      params.get('reference') || 
      params.get('ref') || 
      params.get('order_id') || 
      params.get('session_id') || 
      params.get('transaction_id') || 
      ''
    ).trim();

    const rawGatewayParam = (
      params.get('gateway') || 
      params.get('method') || 
      params.get('payment_method') || 
      params.get('channel') || 
      params.get('provider') || 
      ''
    ).trim();

    const extractedPlan = params.get('plan') || params.get('cycle') || 'yearly';
    const isDonation = params.get('type') === 'donation' || params.get('donation') === 'true';

    // 1. Détection initiale à partir de l'URL
    let detected = detectGatewayType(rawGatewayParam);

    // 2. Si non spécifié dans l'URL, vérifier dans le sessionStorage
    if (detected === 'generic' && typeof sessionStorage !== 'undefined') {
      try {
        const sessionGateway = sessionStorage.getItem('checkout_gateway') || sessionStorage.getItem('payment_method');
        if (sessionGateway) {
          detected = detectGatewayType(sessionGateway);
        }
      } catch (_) {}
    }

    // 3. Repli sur le localStorage (souscription en attente)
    let pendingSub: any = null;
    if (typeof localStorage !== 'undefined') {
      try {
        pendingSub = subscriptionService.getPendingSubscription();
        if (detected === 'generic' && (pendingSub?.gateway || pendingSub?.paymentMethod)) {
          detected = detectGatewayType(pendingSub.gateway || pendingSub.paymentMethod);
        }
      } catch (_) {}
    }

    setSubId(extractedSubId);
    setReference(extractedRef);
    setGatewayType(detected);
    setPlan(extractedPlan);

    // 4. Détection immédiate d'un rejet banque / carte ou d'un échec depuis l'URL
    const urlStatus = (params.get('status') || params.get('payment_status') || '').toLowerCase().trim();
    const rawError = (params.get('error') || params.get('error_code') || params.get('errorCode') || '').toLowerCase().trim();
    const rawReason = (params.get('reason') || params.get('error_description') || params.get('message') || '').trim();
    const isCancelled = params.get('cancel') === 'true' || urlStatus === 'cancelled' || urlStatus === 'canceled';

    const hasFailureSignal = 
      ['failed', 'declined', 'rejected', 'card_declined', 'refused', 'denied'].includes(urlStatus) ||
      rawError.includes('decline') ||
      rawError.includes('reject') ||
      rawError.includes('fail') ||
      rawError.includes('denied') ||
      rawError.includes('refus') ||
      rawError.includes('insufficient') ||
      isCancelled;

    if (hasFailureSignal) {
      const isCard = detected === 'card' || rawError.includes('card') || urlStatus === 'card_declined';
      setState('failed');
      setIsCardDecline(isCard);
      setErrorMessage(
        "Échec du prélèvement : Solde insuffisant ou transaction refusée par PayPal. Aucun prélèvement n'a été effectué sur votre compte. L'accès au Pass Pro reste verrouillé. Veuillez réapprovisionner votre solde PayPal ou votre carte bancaire, puis retenter l'opération."
      );
      return;
    }

    // 5. Vérification serveur stricte : En attente de la confirmation par Webhook / API
    const targetEmail = (user?.email || params.get('email') || pendingSub?.email || '').trim().toLowerCase();
    verifyTransaction(extractedSubId, extractedRef, 0, detected, targetEmail, extractedPlan, isDonation);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [user]);

  const verifyTransaction = async (
    targetSubId: string,
    targetRef: string,
    currentCount: number,
    currentGateway: PaymentGatewayType,
    clientEmail?: string,
    targetPlan: string = 'yearly',
    isDonation: boolean = false
  ) => {
    if (isPollingRef.current && currentCount > 0) return;
    isPollingRef.current = true;
    setPollCount(currentCount);

    const PHASE1_MAX = 12;
    const TOTAL_MAX = 45;
    const PHASE1_INTERVAL = 3000;
    const PHASE2_INTERVAL = 8000;

    const scheduleNextPoll = (nextCount) => {
      const interval = nextCount < PHASE1_MAX ? PHASE1_INTERVAL : PHASE2_INTERVAL;
      pollTimerRef.current = setTimeout(() => {
        isPollingRef.current = false;
        verifyTransaction(targetSubId, targetRef, nextCount, currentGateway, clientEmail, targetPlan, isDonation);
      }, interval);
    };

    const handleSuccess = async (serverPlan, serverExpiresAt, _serverEmail) => {
      setState('active_confirmed');
      if (serverPlan) setPlan(serverPlan);
      if (serverExpiresAt) setExpiresAt(serverExpiresAt);
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.55 }, colors: ['#f59e0b', '#fbbf24', '#0ea5e9', '#38bdf8', '#ffffff'] });
      try { if (supabase?.auth) await supabase.auth.refreshSession(); } catch (_) {}
      await refreshUserProStatus();
      isPollingRef.current = false;
    };

    try {
      const result = await subscriptionService.verifySubscriptionStatus(targetSubId, targetRef);

      if (result.gateway) {
        const serverDetected = detectGatewayType(result.gateway);
        if (serverDetected !== 'generic') {
          setGatewayType(serverDetected);
          currentGateway = serverDetected;
        }
      }

      if (result.isPro && result.status === 'active') {
        await handleSuccess(result.plan, result.expiresAt, result.subscription?.email);
        return;
      }

      const resAny = result as any;
      if (resAny.status === 'failed' || resAny.status === 'cancelled' || resAny.status === 'declined') {
        setState('failed');
        const isCard = !!resAny.isCardDecline || currentGateway === 'card' || /carte|card|emetteur|issuer|decline|refus/i.test(result.message || '');
        setIsCardDecline(isCard);
        setErrorMessage(isCard ? "Paiement rejeté par l'émetteur de la carte" : (result.message || "La transaction a été rejetée ou annulée."));
        isPollingRef.current = false;
        return;
      }

      if (currentCount >= 2) {
        const emailToCheck = clientEmail || user?.email || '';
        if (emailToCheck) {
          try {
            const checkRes = await fetch(`/api/activate-pro?action=check-status&email=${encodeURIComponent(emailToCheck)}`, {
              headers: { 'Accept': 'application/json' }
            });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData?.isPro === true) {
                console.log('[PaymentCallbackView] Activation confirmée via API check-status');
                await handleSuccess(checkData.plan || targetPlan, checkData.expiresAt || undefined, emailToCheck);
                return;
              }
            }
          } catch (_) {}

          try {
            const { data: profData } = await supabase
              .from('profiles')
              .select('is_pro, expires_at')
              .ilike('email', emailToCheck)
              .maybeSingle();
            if (profData?.is_pro === true) {
              console.log('[PaymentCallbackView] Activation confirmée via Supabase profiles.is_pro');
              await handleSuccess(targetPlan, profData.expires_at || undefined, emailToCheck);
              return;
            }
          } catch (_) {}
        }
      }

      if (currentCount < TOTAL_MAX) {
        if (currentCount === PHASE1_MAX && currentGateway !== 'card') {
          setState('pending_operator');
        }
        scheduleNextPoll(currentCount + 1);
      } else {
        if (currentGateway === 'card') {
          setState('failed');
          setIsCardDecline(true);
          setErrorMessage("Paiement rejeté par l'émetteur de la carte");
        } else {
          setState('pending_operator');
        }
        isPollingRef.current = false;
      }
    } catch (err) {
      console.warn('[PaymentCallbackView] Erreur vérification:', err);
      if (currentCount < TOTAL_MAX) {
        scheduleNextPoll(currentCount + 1);
      } else {
        if (currentGateway === 'card') {
          setState('failed');
          setIsCardDecline(true);
          setErrorMessage("Paiement rejeté par l'émetteur de la carte");
        } else {
          setState('pending_operator');
        }
        isPollingRef.current = false;
      }
    }
  };
  const handleManualRetry = () => {
    setState('verifying');
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isDonation = params?.get('type') === 'donation' || params?.get('donation') === 'true';
    verifyTransaction(subId, reference, 0, gatewayType, user?.email || undefined, plan, isDonation);
  };

  const handleGoHome = async () => {
    try {
      if (supabase?.auth) {
        await supabase.auth.refreshSession();
      }
    } catch (_) {}
    await refreshUserProStatus();
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/');
    }
    setActiveView('home');
  };

  // Configuration contextuelle active
  const config = GATEWAY_CONFIGS[gatewayType] || GATEWAY_CONFIGS.generic;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 animate-fade-in">
      <div className="relative rounded-3xl overflow-hidden bg-slate-900/90 border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl text-center space-y-8">
        
        {/* Lueur d'ambiance dynamique */}
        <div className={`absolute -inset-1 rounded-3xl blur-2xl pointer-events-none opacity-40 transition-all duration-700 ${
          state === 'active_confirmed' ? 'bg-gradient-to-tr from-amber-500 via-yellow-400 to-sky-500' :
          state === 'verifying' ? 'bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 animate-pulse' :
          state === 'pending_operator' ? (
            gatewayType === 'card' ? 'bg-gradient-to-tr from-blue-600 to-sky-500' :
            gatewayType === 'orangemoney' ? 'bg-gradient-to-tr from-orange-500 to-amber-500' :
            gatewayType === 'mtn' ? 'bg-gradient-to-tr from-yellow-500 to-amber-500' :
            gatewayType === 'wave' ? 'bg-gradient-to-tr from-cyan-500 to-blue-500' :
            gatewayType === 'paypal' ? 'bg-gradient-to-tr from-blue-600 to-sky-500' :
            'bg-gradient-to-tr from-amber-500 to-orange-500'
          ) :
          'bg-gradient-to-tr from-rose-600 to-red-500'
        }`} />

        {/* ─── 1. ÉTAT : VÉRIFICATION EN COURS ─────────────────────────────── */}
        {state === 'verifying' && (
          <div className="relative space-y-6 animate-fade-in">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
              <div className="w-full h-full rounded-full flex items-center justify-center bg-sky-500/10 text-sky-400">
                {config.icon === 'card' ? (
                  <CreditCard className="w-10 h-10 animate-pulse" />
                ) : config.icon === 'phone' ? (
                  <Smartphone className="w-10 h-10 animate-pulse" />
                ) : (
                  <Lock className="w-10 h-10 animate-pulse" />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${config.badgeClass}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{config.badgeText}</span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {config.verifyingTitle}
              </h1>
              
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                {config.verifyingDescription}
              </p>

              {/* Badges d'authentification contextuels */}
              {config.networkBadges.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {config.networkBadges.map((b, idx) => (
                    <span 
                      key={idx} 
                      className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${b.bg} ${b.text}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Stepper de progression dynamique */}
            <div className="max-w-md mx-auto bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 text-left space-y-3">
              <div className="flex items-center gap-3 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>1. Transaction initiée et transmise</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-sky-400 font-semibold animate-pulse">
                <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
                <span>{config.verifyingStep2}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <Crown className="w-4 h-4 flex-shrink-0" />
                <span>3. Déblocage du statut Pro</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Vérification {pollCount + 1} • SHA-256</span>
            </div>
          </div>
        )}

        {/* ─── 2. ÉTAT : EN ATTENTE DE L'OPÉRATEUR OU DE LA BANQUE ────────── */}
        {state === 'pending_operator' && (
          <div className="relative space-y-6 animate-fade-in">
            <div className={`w-20 h-20 mx-auto rounded-3xl border flex items-center justify-center shadow-lg ${
              gatewayType === 'card' 
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 shadow-sky-500/10' :
              gatewayType === 'orangemoney' 
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-orange-500/10' :
              gatewayType === 'mtn' 
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 shadow-yellow-500/10' :
              gatewayType === 'wave' 
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-cyan-500/10' :
              gatewayType === 'paypal' 
                ? 'bg-blue-600/15 border-blue-500/30 text-sky-400 shadow-blue-500/10' :
                'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/10'
            }`}>
              {config.icon === 'card' ? (
                <CreditCard className="w-10 h-10 animate-pulse" />
              ) : (
                <Clock className="w-10 h-10 animate-bounce" />
              )}
            </div>

            <div className="space-y-3">
              <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${config.badgeClass}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>{config.pendingBadge}</span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {config.pendingTitle}
              </h1>
              
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {config.pendingDescription}
              </p>

              {/* Badges spécifiques au moyen de paiement */}
              {config.networkBadges.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {config.networkBadges.map((b, idx) => (
                    <span 
                      key={idx} 
                      className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${b.bg} ${b.text}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Avertissement et garanties ciblés */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-300 text-left space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>{config.pendingNoticeTitle}</span>
              </div>
              {config.pendingNoticePoints.map((point, idx) => (
                <p key={idx} className="leading-relaxed">
                  • {point}
                </p>
              ))}
            </div>

            {/* Sortie de secours immédiate pour carte bancaire (évite l'attente indéfinie) */}
            {gatewayType === 'card' && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Votre banque a rejeté la transaction ou le délai 3D Secure a expiré ?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setState('failed');
                    setIsCardDecline(true);
                    setErrorMessage("Paiement rejeté par l'émetteur de la carte");
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 font-bold text-xs cursor-pointer whitespace-nowrap transition-colors"
                >
                  Voir le refus & Réessayer
                </button>
              </div>
            )}

            {(subId || reference) && (
              <div className="text-[11px] text-slate-500 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-left overflow-x-auto">
                <div>Moyen de paiement : <span className="text-sky-400 font-semibold">{config.name}</span></div>
                {subId && <div>Souscription : <span className="text-slate-300">{subId}</span></div>}
                {reference && <div>Réf. Transaction : <span className="text-slate-300">{reference}</span></div>}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleManualRetry}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Vérifier à nouveau</span>
              </button>

              <button
                type="button"
                onClick={handleGoHome}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-all border border-slate-700 cursor-pointer"
              >
                <span>Retour à l'accueil</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── 3. ÉTAT : CONFIRMÉ ET ACTIVÉ ──────────────────────────────── */}
        {state === 'active_confirmed' && (
          <div className="relative space-y-6 animate-fade-in">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full bg-amber-400/25 blur-xl scale-125" />
              <div className="relative w-full h-full rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 p-0.5 shadow-xl">
                <div className="w-full h-full bg-[#07090e] rounded-[22px] flex items-center justify-center">
                  <Crown className="w-12 h-12 text-amber-400 fill-amber-400/30" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase tracking-widest shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Paiement Validé & Preuve Confirmée</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Bienvenue dans Éliciné Pro !
              </h1>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {config.confirmedSubtitle}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Règlement :</span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  {config.icon === 'card' ? <CreditCard className="w-3.5 h-3.5 text-sky-400" /> : <Smartphone className="w-3.5 h-3.5 text-amber-400" />}
                  {config.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Formule souscrite :</span>
                <span className="font-extrabold text-amber-400 uppercase tracking-wider">
                  Pass {plan === 'yearly' ? 'Annuel (365 jours)' : 'Mensuel (30 jours)'}
                </span>
              </div>
              {expiresAt && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Expiration :</span>
                  <span className="text-slate-200">{new Date(expiresAt).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-400">
                <span>Sécurité :</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Signature vérifiée
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGoHome}
                className="w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm transition-all shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Accéder à mes privilèges Pro illimités</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── 4. ÉTAT : ÉCHEC OU REJET (AVEC GESTION EXPLICITE DU REJET CARTE) ─ */}
        {state === 'failed' && (
          <div className="relative space-y-6 animate-fade-in">
            {isCardDecline || gatewayType === 'card' ? (
              <>
                <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/15">
                  <CreditCard className="w-10 h-10" />
                </div>

                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-black uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Autorisation Bancaire Refusée</span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Paiement rejeté par l'émetteur de la carte
                  </h1>

                  <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                    Votre établissement bancaire a refusé l'autorisation de débit pour cette transaction.
                    <span className="text-emerald-400 font-semibold block mt-1.5">✓ Aucun montant n'a été prélevé sur votre compte.</span>
                  </p>
                </div>

                {/* Boîte de diagnostic bancaire familier et réaliste */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 text-left space-y-3 max-w-md mx-auto">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Motifs fréquents de refus bancaire :</span>
                  </div>
                  <div className="space-y-2 text-slate-400">
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span><strong>Plafond d'achat ou solde :</strong> Le plafond de paiement en ligne de votre carte est peut-être atteint.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span><strong>Validation 3D Secure :</strong> Le délai de confirmation dans l'application de votre banque a peut-être expiré.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span><strong>Paiements en ligne / internationaux :</strong> Vérifiez dans votre application bancaire que les paiements par Internet et en devises sont autorisés.</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleGoHome();
                      setIsProModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-black text-xs transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Réessayer (ou utiliser une autre carte)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleGoHome();
                      setIsProModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-bold text-xs transition-all border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Payer avec Mobile Money</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs transition-all border border-slate-700 cursor-pointer"
                  >
                    <span>Retour à l'accueil</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
                  <AlertTriangle className="w-10 h-10" />
                </div>

                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Échec de la transaction</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Paiement non confirmé
                  </h1>
                  <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                    {errorMessage || `La transaction via ${config.name} a été annulée ou refusée.`}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleGoHome();
                      setIsProModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Réessayer de s'abonner</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-all border border-slate-700 cursor-pointer"
                  >
                    <span>Retour à l'accueil</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default PaymentCallbackView;
