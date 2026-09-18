import React, { useEffect, useRef, useState } from 'react';
import { PricingBillingCycle } from '../../types';
import { getPayPalProCheckoutUrl } from '../../services/paypalService';

declare global {
  interface Window {
    paypal?: any;
  }
}

export interface PayPalButtonProps {
  amount: number;
  currency?: string;
  billingCycle: PricingBillingCycle;
  onSuccess: (details: any, orderId: string) => Promise<void> | void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  onClick?: () => boolean | void;
  disabled?: boolean;
}

// Devises nativement supportées par PayPal Checkout
const PAYPAL_SUPPORTED_CURRENCIES = ['USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CHF'];

let sdkScriptPromise: Promise<void> | null = null;
let currentLoadedCurrency = '';
let currentLoadedClientId = '';

/**
 * Charge dynamiquement le script PayPal JavaScript SDK
 */
function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // Si déjà chargé avec les mêmes paramètres
  if (window.paypal && currentLoadedCurrency === currency && currentLoadedClientId === clientId) {
    return Promise.resolve();
  }

  // Si un script différent était déjà présent, le remplacer
  const existingScript = document.getElementById('paypal-sdk-script');
  if (existingScript && (currentLoadedCurrency !== currency || currentLoadedClientId !== clientId)) {
    existingScript.remove();
    sdkScriptPromise = null;
    if (window.paypal) {
      delete window.paypal;
    }
  }

  if (sdkScriptPromise) {
    return sdkScriptPromise;
  }

  sdkScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&enable-funding=card`;
    script.async = true;

    script.onload = () => {
      currentLoadedCurrency = currency;
      currentLoadedClientId = clientId;
      resolve();
    };

    script.onerror = (err) => {
      sdkScriptPromise = null;
      reject(err);
    };

    document.head.appendChild(script);
  });

  return sdkScriptPromise;
}

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount,
  currency = 'USD',
  billingCycle,
  onSuccess,
  onError,
  onCancel,
  onClick,
  disabled = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Normalisation de la devise pour PayPal : si la devise n'est pas acceptée (ex: XOF, XAF), on bascule sur USD
  const normalizedCurrency = PAYPAL_SUPPORTED_CURRENCIES.includes(currency.toUpperCase())
    ? currency.toUpperCase()
    : 'USD';

  // Montant normalisé selon le cycle et la devise
  const numericValue = normalizedCurrency === 'USD'
    ? (billingCycle === 'yearly' ? 15.99 : 1.99)
    : Number(amount || 1.99);

  const formattedAmount = numericValue.toFixed(2);

  // Récupération et détection de l'environnement Client PayPal (Live prioritaire)
  const envClientId = (
    (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
    (import.meta as any).env?.PAYPAL_CLIENT_ID ||
    ''
  ).trim();

  const explicitMode = (
    (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_MODE ||
    (import.meta as any).env?.VITE_PAYPAL_MODE ||
    (import.meta as any).env?.PAYPAL_MODE ||
    (import.meta as any).env?.VITE_PAYPAL_ENV ||
    (import.meta as any).env?.PAYPAL_ENV ||
    'live'
  ).trim().toLowerCase();

  const isSandbox = explicitMode === 'sandbox';
  const isLiveSdkAvailable = Boolean(envClientId && envClientId.length > 0 && envClientId !== 'sb');

  useEffect(() => {
    let isMounted = true;

    // Diagnostic console initial
    console.group('[PayPal SDK Debug] 🛠️ Initialisation du widget PayPal Éliciné');
    console.log('Client ID configuré :', envClientId ? `${envClientId.substring(0, Math.min(8, envClientId.length))}... (longueur: ${envClientId.length})` : '(non défini)');
    console.log('Mode d\'environnement :', isSandbox ? '🧪 SANDBOX (Mode Test)' : '🚀 LIVE (Mode Production)');
    console.log('Montant :', formattedAmount, normalizedCurrency, `(Cycle: ${billingCycle})`);
    console.groupEnd();

    // Si aucun Client ID valide n'est configuré
    if (!envClientId) {
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

    const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://elicine.app';

    console.log('[PayPal SDK Debug] Chargement du script PayPal SDK JS...');

    loadPayPalSdk(envClientId, normalizedCurrency)
      .then(() => {
        if (!isMounted) return;
        setIsLoading(false);

        if (!containerRef.current || !window.paypal) {
          console.error('[PayPal SDK Debug] containerRef ou window.paypal non disponible après chargement');
          return;
        }

        console.log('[PayPal SDK Debug] Script SDK PayPal chargé avec succès. Initialisation des boutons...');

        // Vider tout bouton précédent pour éviter les doublons lors des re-renders
        containerRef.current.innerHTML = '';

        try {
          window.paypal
            .Buttons({
              style: {
                layout: 'vertical',
                color: 'gold',
                shape: 'rect',
                label: 'pay',
                height: 44,
                tagline: false
              },
              onClick: (data: any, actions: any) => {
                const funding = data?.fundingSource || 'standard';
                console.log('[PayPal SDK Debug] 🖱️ Clic utilisateur sur le bouton PayPal :', funding);

                if (onClick) {
                  const allow = onClick();
                  if (allow === false) {
                    console.warn('[PayPal SDK Debug] ⛔ onClick handler a renvoyé false, transaction rejetée avant création.');
                    return actions.reject();
                  }
                }
                return actions.resolve();
              },
              createOrder: (data: any, actions: any) => {
                const isYearly = billingCycle === 'yearly';
                const itemDescription = `Pass Pro Éliciné - Accès ${isYearly ? '1 An' : '30 Jours'} (Paiement unique)`;
                const itemRef = `ELICINE_PASS_${isYearly ? '365D' : '30D'}_ONETIME`;

                const orderPayload: any = {
                  intent: 'CAPTURE', // Encaissement unique immédiat (One-Time Payment)
                  purchase_units: [
                    {
                      reference_id: itemRef,
                      description: itemDescription,
                      amount: {
                        currency_code: normalizedCurrency,
                        value: formattedAmount,
                        breakdown: {
                          item_total: {
                            currency_code: normalizedCurrency,
                            value: formattedAmount
                          }
                        }
                      },
                      items: [
                        {
                          name: `Pass Pro Éliciné - Accès ${isYearly ? '1 An' : '30 Jours'}`,
                          description: 'Paiement unique sans prélèvement automatique obligatoire',
                          unit_amount: {
                            currency_code: normalizedCurrency,
                            value: formattedAmount
                          },
                          quantity: '1'
                        }
                      ]
                    }
                  ],
                  application_context: {
                    brand_name: 'Éliciné',
                    landing_page: 'BILLING',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    return_url: `${origin}/payment-callback?gateway=paypal&status=success&plan=${billingCycle}`,
                    cancel_url: `${origin}/?payment=cancelled`
                  }
                };

                return actions.order.create(orderPayload);
              },
              onApprove: async (data: any, actions: any) => {
                console.group('[PayPal SDK Debug] 🎯 onApprove déclenché !');
                console.log('Données d\'approbation reçues :', data);
                try {
                  setIsCapturing(true);
                  console.log('[PayPal SDK Debug] Début de la capture de l\'ordre via actions.order.capture()...');
                  const details = await actions.order.capture();
                  console.log('[PayPal SDK Debug] ✅ Capture réussie ! Détails complets :', details);

                  // Vérification stricte du statut de capture
                  const captureStatus = String(
                    details?.status || 
                    details?.purchase_units?.[0]?.payments?.captures?.[0]?.status || 
                    ''
                  ).toUpperCase();

                  if (captureStatus && captureStatus !== 'COMPLETED') {
                    throw new Error(`Le prélèvement n'a pas pu être validé par PayPal (statut : ${captureStatus}). Votre compte n'a pas été débité. Veuillez réapprovisionner votre moyen de paiement.`);
                  }

                  const capturedOrderId = details?.id || data?.orderID || `paypal_${Date.now()}`;
                  await onSuccess(details || data, capturedOrderId);
                  console.groupEnd();
                } catch (captureErr: any) {
                  console.error('[PayPal SDK Debug] ❌ Échec lors de la capture :', captureErr);
                  console.groupEnd();
                  const issue = captureErr?.details?.[0]?.issue || captureErr?.name || '';
                  let userMsg = "Solde insuffisant ou prélèvement refusé par PayPal. Votre compte n'a pas pu être débité. Veuillez réapprovisionner votre solde PayPal ou votre carte bancaire, puis réessayer.";

                  if (issue === 'INSTRUMENT_DECLINED') {
                    userMsg = "Solde insuffisant ou carte refusée par votre établissement bancaire. Veuillez réapprovisionner votre moyen de paiement (solde PayPal ou carte bancaire).";
                  } else if (captureErr?.message) {
                    userMsg = captureErr.message;
                  }

                  setErrorMessage(userMsg);
                  setHasError(true);
                  if (onError) onError(captureErr);
                } finally {
                  if (isMounted) setIsCapturing(false);
                }
              },
              onError: (err: any) => {
                console.error('[PayPal SDK Debug] ⚠️ Événement onError déclenché par le SDK PayPal:', err);
                if (!isMounted) return;
                setHasError(true);
                const userNotice = "Échec du prélèvement : Solde insuffisant ou moyen de paiement refusé par PayPal. Veuillez approvisionner votre compte ou utiliser une autre carte bancaire.";
                setErrorMessage(userNotice);
                if (onError) onError(err);
              },
              onCancel: (data: any) => {
                console.log('[PayPal SDK Debug] 🛑 Annulation par l\'utilisateur :', data);
                if (onCancel) onCancel();
              }
            })
            .render(containerRef.current);
        } catch (renderErr: any) {
          console.error('[PayPal SDK Debug] ❌ Erreur Buttons.render :', renderErr);
          if (isMounted) {
            setHasError(true);
            setErrorMessage("Impossible d'initialiser les boutons de paiement PayPal.");
          }
        }
      })
      .catch((loadErr) => {
        console.error('[PayPal SDK Debug] ❌ Échec de chargement du SDK PayPal :', loadErr);
        if (isMounted) {
          setIsLoading(false);
          setHasError(true);
          setErrorMessage("Impossible de charger le module de paiement PayPal.");
        }
      });

    return () => {
      isMounted = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [envClientId, normalizedCurrency, formattedAmount, billingCycle, isLiveSdkAvailable, isSandbox]);

  // Redirection sécurisée PayPal
  const handleDirectCheckout = () => {
    console.log('[PayPal SDK Debug] Clic redirection directe portail PayPal');
    const paypalUrl = getPayPalProCheckoutUrl({
      plan: billingCycle,
      amount: numericValue,
      currency: normalizedCurrency
    });

    if (typeof window !== 'undefined') {
      window.open(paypalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Si aucun SDK n'est chargé
  if (!isLiveSdkAvailable) {
    return (
      <div className={`w-full flex flex-col gap-2 relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <button
          type="button"
          onClick={handleDirectCheckout}
          className="w-full py-3.5 px-6 rounded-2xl bg-[#0070BA] hover:bg-[#005ea6] text-white font-extrabold text-sm sm:text-base transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer text-center active:scale-[0.98]"
        >
          <span>💳 Payer avec PayPal & CB ({formattedAmount} {normalizedCurrency}) →</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col gap-2 relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* État de chargement élégant */}
      {isLoading && (
        <div className="w-full h-24 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-2 animate-pulse">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Chargement sécurisé de PayPal ({formattedAmount} {normalizedCurrency})...
          </span>
        </div>
      )}

      {/* Capture en cours */}
      {isCapturing && (
        <div className="w-full py-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Validation de votre paiement PayPal en cours...
          </span>
        </div>
      )}

      {/* Conteneur DOM où le SDK PayPal injecte les boutons */}
      <div 
        ref={containerRef} 
        className={`w-full min-h-[44px] ${isLoading || isCapturing ? 'hidden' : 'block'}`}
      />

      {/* Gestion des erreurs & Bouton de repli automatique */}
      {hasError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center flex flex-col items-center gap-2.5">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errorMessage || "Le module de paiement a rencontré un problème."}
          </p>
          <div className="w-full flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                setHasError(false);
                setErrorMessage('');
              }}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
            >
              🔄 Réessayer
            </button>
            <button
              type="button"
              onClick={handleDirectCheckout}
              className="flex-1 py-2 px-3 rounded-xl bg-[#0070BA] hover:bg-[#005ea6] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>💳 Portail sécurisé PayPal →</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayPalButton;

