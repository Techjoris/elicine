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

  // Normalisation de la devise pour PayPal : si la devise n'est pas acceptée (ex: XOF, XAF), on bascule sur USD à 1.99 $
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
    'sb'
  ).trim();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

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
                return actions.order.create({
                  purchase_units: [
                    {
                      description: `Pass Pro Éliciné (${billingCycle === 'yearly' ? 'Annuel' : 'Mensuel'})`,
                      amount: {
                        currency_code: normalizedCurrency,
                        value: formattedAmount
                      }
                    }
                  ],
                  application_context: {
                    brand_name: 'Éliciné',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW'
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
                  const msg = captureErr?.message || "Échec de la validation de la transaction PayPal.";
                  setErrorMessage(msg);
                  if (onError) onError(captureErr);
                } finally {
                  if (isMounted) setIsCapturing(false);
                }
              },
              onError: (err: any) => {
                console.error('[PayPalButton] SDK Error:', err);
                if (!isMounted) return;
                setHasError(true);
                setErrorMessage("Une erreur est survenue lors de l'affichage du paiement PayPal.");
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
          setErrorMessage("Impossible de charger le module de paiement PayPal (vérifiez votre connexion ou bloqueur de publicité).");
        }
      });

    return () => {
      isMounted = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [envClientId, normalizedCurrency, formattedAmount, billingCycle]);

  // Repli sécurisé : lien hébergé officiel si blocage SDK
  const handleFallbackClick = () => {
    if (typeof window !== 'undefined') {
      window.open('https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN', '_blank', 'noopener,noreferrer');
    }
  };

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
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center flex flex-col items-center gap-2">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errorMessage || "Le module PayPal n'a pas pu se charger."}
          </p>
          <button
            type="button"
            onClick={handleFallbackClick}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0070BA] hover:bg-[#005ea6] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>💳 Payer via le portail sécurisé PayPal ({formattedAmount} {normalizedCurrency}) →</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default PayPalButton;
