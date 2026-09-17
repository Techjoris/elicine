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

  // Récupération de l'identifiant Client PayPal (Live / Sandbox)
  const envClientId = (
    (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
    (import.meta as any).env?.PAYPAL_CLIENT_ID ||
    ''
  ).trim();

  const isLiveSdkAvailable = Boolean(envClientId && envClientId !== 'sb' && envClientId.length > 10);

  useEffect(() => {
    let isMounted = true;

    // Si aucun Client ID de production n'est configuré, basculer directement sur le bouton de redirection sécurisé
    if (!isLiveSdkAvailable) {
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

    loadPayPalSdk(envClientId, normalizedCurrency)
      .then(() => {
        if (!isMounted) return;
        setIsLoading(false);

        if (!containerRef.current || !window.paypal) return;

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
                if (onClick) {
                  const allow = onClick();
                  if (allow === false) {
                    return actions.reject();
                  }
                }
                return actions.resolve();
              },
              createOrder: (data: any, actions: any) => {
                const isYearly = billingCycle === 'yearly';
                const itemDescription = `Pass Pro Éliciné (${isYearly ? 'Formule Annuelle - 1 an' : 'Formule Mensuelle - 1 mois'})`;

                return actions.order.create({
                  intent: 'CAPTURE',
                  purchase_units: [
                    {
                      reference_id: `ELICINE_PRO_${billingCycle.toUpperCase()}`,
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
                          name: `Pass Pro Éliciné (${isYearly ? 'Annuel' : 'Mensuel'})`,
                          description: 'Accès illimité aux recherches IA, filtres avancés et alertes de sorties',
                          unit_amount: {
                            currency_code: normalizedCurrency,
                            value: formattedAmount
                          },
                          quantity: '1',
                          category: 'DIGITAL_GOODS'
                        }
                      ]
                    }
                  ],
                  application_context: {
                    brand_name: 'Éliciné',
                    // Autorise et met en avant le paiement par carte sans compte (Guest Checkout)
                    landing_page: 'GUEST_CHECKOUT',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
                    return_url: `${origin}/payment-callback?gateway=paypal&status=success&plan=${billingCycle}`,
                    cancel_url: `${origin}/?payment=cancelled`
                  }
                });
              },
              onApprove: async (data: any, actions: any) => {
                try {
                  setIsCapturing(true);
                  const details = await actions.order.capture();
                  const capturedOrderId = details?.id || data?.orderID || `paypal_${Date.now()}`;
                  await onSuccess(details || data, capturedOrderId);
                } catch (captureErr: any) {
                  console.error('[PayPalButton] Capture failed:', captureErr);
                  const issue = captureErr?.details?.[0]?.issue || captureErr?.name || '';
                  let userMsg = "Échec de la validation de la transaction.";

                  if (issue === 'INSTRUMENT_DECLINED') {
                    userMsg = "Votre carte a été refusée par votre banque. Veuillez vérifier vos plafonds ou essayer une autre carte.";
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
                console.error('[PayPalButton] SDK Error:', err);
                if (!isMounted) return;
                setHasError(true);
                setErrorMessage("Une erreur est survenue lors de la communication sécurisée avec PayPal. Vous pouvez réessayer ou utiliser le lien direct.");
                if (onError) onError(err);
              },
              onCancel: (data: any) => {
                console.log('[PayPalButton] Annulation par l\'utilisateur:', data);
                if (onCancel) onCancel();
              }
            })
            .render(containerRef.current);
        } catch (renderErr: any) {
          console.error('[PayPalButton] Render error:', renderErr);
          if (isMounted) {
            setHasError(true);
            setErrorMessage("Impossible d'initialiser les boutons de paiement PayPal.");
          }
        }
      })
      .catch((loadErr) => {
        console.error('[PayPalButton] SDK loading failed:', loadErr);
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
  }, [envClientId, normalizedCurrency, formattedAmount, billingCycle, isLiveSdkAvailable]);

  // Redirection sécurisée PayPal
  const handleDirectCheckout = () => {
    const paypalUrl = getPayPalProCheckoutUrl({
      plan: billingCycle,
      amount: numericValue,
      currency: normalizedCurrency
    });

    if (typeof window !== 'undefined') {
      window.open(paypalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Si le SDK n'est pas configuré avec un Client ID réel en Live
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

