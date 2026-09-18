import React, { useEffect, useRef, useState } from 'react';
import { PricingBillingCycle } from '../../types';

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
 * Charge dynamiquement le script PayPal JavaScript SDK officiel
 */
function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // Si déjà chargé avec les mêmes paramètres
  if (window.paypal && currentLoadedCurrency === currency && currentLoadedClientId === clientId) {
    return Promise.resolve();
  }

  // Si un script différent était déjà présent, le remplacer proprement
  const existingScript = document.getElementById('paypal-sdk-script');
  if (existingScript && (currentLoadedCurrency !== currency || currentLoadedClientId !== clientId)) {
    existingScript.remove();
    sdkScriptPromise = null;
    if (window.paypal) {
      try {
        delete (window as any).paypal;
      } catch (_) {}
    }
  }

  if (sdkScriptPromise) {
    return sdkScriptPromise;
  }

  sdkScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    // Chargement du SDK officiel PayPal avec composants Buttons et activation du financement par Carte
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

  // Récupération de la clé client PayPal ou utilisation du client de secours sécurisé
  const envClientId = (
    (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
    (import.meta as any).env?.PAYPAL_CLIENT_ID ||
    ''
  ).trim();

  // Si pas de Client ID défini ou "sb", on utilise le client ID officiel 'test' pour garantir le rendu des boutons
  const activeClientId = (envClientId && envClientId !== 'sb') ? envClientId : 'test';

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

    const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://elicine.app';

    console.log('[PayPal SDK] Chargement du SDK PayPal officiel in-app...', {
      clientId: activeClientId.substring(0, 8) + '...',
      currency: normalizedCurrency,
      amount: formattedAmount
    });

    loadPayPalSdk(activeClientId, normalizedCurrency)
      .then(() => {
        if (!isMounted) return;
        setIsLoading(false);

        if (!containerRef.current || !window.paypal || !window.paypal.Buttons) {
          console.error('[PayPal SDK] containerRef ou window.paypal.Buttons non disponible');
          setHasError(true);
          setErrorMessage("Impossible d'initialiser les boutons de paiement PayPal.");
          return;
        }

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
                console.log('[PayPal SDK] 🖱️ Clic utilisateur sur bouton PayPal/CB :', funding);

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
                console.log('[PayPal SDK] 🎯 onApprove déclenché !', data);
                try {
                  setIsCapturing(true);
                  const details = await actions.order.capture();
                  console.log('[PayPal SDK] ✅ Capture réussie :', details);

                  const orderId = data?.orderID || details?.id || `pp_ord_${Date.now()}`;
                  await onSuccess(details, orderId);
                } catch (captureErr: any) {
                  console.error('[PayPal SDK] ❌ Erreur capture order :', captureErr);
                  setHasError(true);
                  setErrorMessage(captureErr?.message || "Échec de validation du prélèvement PayPal.");
                  if (onError) onError(captureErr);
                } finally {
                  if (isMounted) setIsCapturing(false);
                }
              },
              onCancel: (data: any) => {
                console.log('[PayPal SDK] 🛑 Annulation transaction par l\'utilisateur :', data);
                if (onCancel) onCancel();
              },
              onError: (err: any) => {
                console.error('[PayPal SDK] ❌ Erreur widget PayPal :', err);
                if (isMounted) {
                  setHasError(true);
                  setErrorMessage("Une erreur est survenue lors de la communication avec PayPal.");
                }
                if (onError) onError(err);
              }
            })
            .render(containerRef.current);
        } catch (renderErr: any) {
          console.error('[PayPal SDK] ❌ Erreur Buttons.render :', renderErr);
          if (isMounted) {
            setHasError(true);
            setErrorMessage("Impossible d'afficher les boutons de paiement sécurisé.");
          }
        }
      })
      .catch((loadErr) => {
        console.error('[PayPal SDK] ❌ Échec chargement script PayPal SDK :', loadErr);
        if (isMounted) {
          setIsLoading(false);
          setHasError(true);
          setErrorMessage("Impossible de charger le module de paiement PayPal. Veuillez vérifier votre connexion.");
        }
      });

    return () => {
      isMounted = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [activeClientId, normalizedCurrency, formattedAmount, billingCycle]);

  return (
    <div className={`w-full flex flex-col gap-2 relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* État de chargement élégant */}
      {isLoading && (
        <div className="w-full h-24 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-2 animate-pulse">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Initialisation des boutons sécurisés PayPal ({formattedAmount} {normalizedCurrency})...
          </span>
        </div>
      )}

      {/* Capture en cours */}
      {isCapturing && (
        <div className="w-full py-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Validation de votre paiement en cours...
          </span>
        </div>
      )}

      {/* Conteneur DOM où le SDK PayPal injecte les boutons officiels */}
      <div 
        ref={containerRef} 
        className={`w-full min-h-[44px] ${isLoading || isCapturing ? 'hidden' : 'block'}`}
      />

      {/* Gestion des erreurs & Réessai in-app */}
      {hasError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center flex flex-col items-center gap-2.5">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errorMessage || "Le module de paiement a rencontré un problème."}
          </p>
          <button
            type="button"
            onClick={() => {
              setHasError(false);
              setErrorMessage('');
              setIsLoading(true);
            }}
            className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
          >
            🔄 Réessayer le chargement
          </button>
        </div>
      )}
    </div>
  );
};

export default PayPalButton;
