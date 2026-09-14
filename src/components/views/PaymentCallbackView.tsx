import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { subscriptionService } from '../../services/subscriptionService';
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  Crown, 
  Sparkles, 
  RefreshCw, 
  ArrowRight, 
  Lock, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';

type VerificationState = 'verifying' | 'active_confirmed' | 'pending_operator' | 'failed';

export const PaymentCallbackView: React.FC = () => {
  const { setActiveView, refreshUserProStatus, setIsProModalOpen } = useApp();

  const [state, setState] = useState<VerificationState>('verifying');
  const [subId, setSubId] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [provider, setProvider] = useState<string>('saspay');
  const [plan, setPlan] = useState<string>('yearly');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pollCount, setPollCount] = useState<number>(0);

  const isPollingRef = useRef<boolean>(false);
  const pollTimerRef = useRef<any>(null);

  // Extraction des paramètres d'URL de retour
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

    const extractedProvider = (params.get('provider') || 'saspay').toLowerCase();
    const extractedPlan = params.get('plan') || params.get('cycle') || 'yearly';

    setSubId(extractedSubId);
    setReference(extractedRef);
    setProvider(extractedProvider);
    setPlan(extractedPlan);

    // Démarrage de la vérification
    verifyTransaction(extractedSubId, extractedRef, 0);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  const verifyTransaction = async (targetSubId: string, targetRef: string, currentCount: number) => {
    if (isPollingRef.current && currentCount > 0) return;
    isPollingRef.current = true;
    setPollCount(currentCount);

    try {
      const result = await subscriptionService.verifySubscriptionStatus(targetSubId, targetRef);

      if (result.isPro && result.status === 'active') {
        setState('active_confirmed');
        if (result.plan) setPlan(result.plan);
        if (result.expiresAt) setExpiresAt(result.expiresAt);

        // Déclencher les confettis dorés et bleus de célébration
        confetti({
          particleCount: 160,
          spread: 90,
          origin: { y: 0.55 },
          colors: ['#f59e0b', '#fbbf24', '#0ea5e9', '#38bdf8', '#ffffff']
        });

        // Synchroniser le contexte utilisateur global
        await refreshUserProStatus();
        isPollingRef.current = false;
        return;
      }

      if (result.status === 'failed') {
        setState('failed');
        setErrorMessage(result.message || "La transaction a été rejetée ou annulée.");
        isPollingRef.current = false;
        return;
      }

      // Toujours en attente (webhook en cours de transit ou opérateur mobile money)
      if (currentCount < 10) {
        // Continuer le polling toutes les 2.5 secondes
        pollTimerRef.current = setTimeout(() => {
          isPollingRef.current = false;
          verifyTransaction(targetSubId, targetRef, currentCount + 1);
        }, 2500);
      } else {
        // Fin de tentative automatique : passage à l'état d'attente opérateur
        setState('pending_operator');
        isPollingRef.current = false;
      }
    } catch (err: any) {
      console.warn('[PaymentCallbackView] Erreur vérification:', err);
      if (currentCount < 10) {
        pollTimerRef.current = setTimeout(() => {
          isPollingRef.current = false;
          verifyTransaction(targetSubId, targetRef, currentCount + 1);
        }, 2500);
      } else {
        setState('pending_operator');
        isPollingRef.current = false;
      }
    }
  };

  const handleManualRetry = () => {
    setState('verifying');
    verifyTransaction(subId, reference, 0);
  };

  const handleGoHome = () => {
    // Nettoyage de l'URL
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/');
    }
    setActiveView('home');
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 animate-fade-in">
      <div className="relative rounded-3xl overflow-hidden bg-slate-900/90 border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl text-center space-y-8">
        
        {/* Lueur d'ambiance dynamique */}
        <div className={`absolute -inset-1 rounded-3xl blur-2xl pointer-events-none opacity-40 transition-all duration-700 ${
          state === 'active_confirmed' ? 'bg-gradient-to-tr from-amber-500 via-yellow-400 to-sky-500' :
          state === 'verifying' ? 'bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 animate-pulse' :
          state === 'pending_operator' ? 'bg-gradient-to-tr from-amber-500 to-orange-500' :
          'bg-gradient-to-tr from-rose-600 to-red-500'
        }`} />

        {/* ─── 1. ÉTAT : VÉRIFICATION EN COURS ─────────────────────────────── */}
        {state === 'verifying' && (
          <div className="relative space-y-6 animate-fade-in">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
              <div className="w-full h-full rounded-full flex items-center justify-center bg-sky-500/10 text-sky-400">
                <Lock className="w-10 h-10 animate-pulse" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-black uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Sécurité Bancaire Maximale</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Vérification Cryptographique du Paiement
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Nous interrogeons la passerelle de paiement sécurisée et validons la signature de votre transaction...
              </p>
            </div>

            {/* Stepper de progression */}
            <div className="max-w-md mx-auto bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 text-left space-y-3">
              <div className="flex items-center gap-3 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>1. Transaction initiée et transmise</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-sky-400 font-semibold animate-pulse">
                <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
                <span>2. Contrôle de la signature du Webhook serveur...</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <Crown className="w-4 h-4 flex-shrink-0" />
                <span>3. Déblocage du statut Pro</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Tentative {pollCount + 1}/10 • Chiffrement SHA-256</span>
            </div>
          </div>
        )}

        {/* ─── 2. ÉTAT : EN ATTENTE DE L'OPÉRATEUR ────────────────────────── */}
        {state === 'pending_operator' && (
          <div className="relative space-y-6 animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Clock className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" />
                <span>Validation Opérateur en Cours</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Paiement en cours de validation
              </h1>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                Votre transaction a bien été initiée auprès de votre opérateur téléphonique (Orange Money, MTN, Wave, Moov ou PayPal). 
                Le traitement de la confirmation bancaire prend parfois quelques instants.
              </p>
            </div>

            {/* Avertissement de sécurité bienveillant */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200/90 text-left space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Garantie de sécurité Éliciné :</span>
              </div>
              <p>
                • <strong>Aucun accès anticipé sans débit réel :</strong> Votre compte Pro sera automatiquement débloqué dès que nous recevons la preuve officielle de votre banque.
              </p>
              <p>
                • <strong>Vous n'avez pas besoin de repayer :</strong> Si votre compte a été débité, la synchronisation s'effectuera en tâche de fond automatiquement.
              </p>
            </div>

            {(subId || reference) && (
              <div className="text-[11px] text-slate-500 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-left overflow-x-auto">
                <div>Souscription : <span className="text-slate-300">{subId || 'N/A'}</span></div>
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
                Votre transaction bancaire a été validée avec succès. Votre Pass Pro est immédiatement actif.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs">
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

        {/* ─── 4. ÉTAT : ÉCHEC OU REJET ──────────────────────────────────── */}
        {state === 'failed' && (
          <div className="relative space-y-6 animate-fade-in">
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
                {errorMessage || "La transaction a été annulée, refusée par votre opérateur ou le délai d'attente a expiré."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleGoHome();
                  setIsProModalOpen(true);
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-sky-500/20 cursor-pointer"
              >
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
          </div>
        )}

      </div>
    </div>
  );
};

export default PaymentCallbackView;
