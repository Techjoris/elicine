import React, { useMemo } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { PricingBillingCycle } from '../../types';

export interface PayPalButtonProps {
  amount: number;
  currency?: string;
  billingCycle: PricingBillingCycle;
  onSuccess: (orderId: string) => Promise<void> | void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  onClick?: () => boolean | void;
  onValidationStart?: () => void;
  disabled?: boolean;
}

// Devises acceptées nativement par l'API Orders de PayPal
const PAYPAL_SUPPORTED_CURRENCIES = ['USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CHF'];

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount,
  currency = 'USD',
  billingCycle,
  onSuccess,
  onError,
  onCancel,
  onClick,
  onValidationStart,
  disabled = false
}) => {
  // Normalisation de la devise pour PayPal : si la devise est locale (ex: XOF, XAF), on bascule sur USD pour PayPal
  const normalizedCurrency = PAYPAL_SUPPORTED_CURRENCIES.includes(currency.toUpperCase())
    ? currency.toUpperCase()
    : 'USD';

  // Montant normalisé : tarif Pass Pro ponctuel (Achat unique)
  const numericValue = normalizedCurrency === 'USD'
    ? (billingCycle === 'yearly' ? 15.99 : 1.99)
    : Number(amount || 1.99);

  const formattedAmount = numericValue.toFixed(2);

  // Récupération de la clé client PayPal ou utilisation du client de secours opérationnel
  const envClientId = (
    (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
    (import.meta as any).env?.PAYPAL_CLIENT_ID ||
    ''
  ).trim();

  // Si pas de Client ID défini ou "sb", on utilise le client ID officiel 'test' pour garantir le rendu immédiat des boutons in-app
  const activeClientId = (envClientId && envClientId !== 'sb') ? envClientId : 'test';

  // Configuration stricte du SDK officiel PayPal : Paiement unique (intent: 'capture'), boutons natifs et CB activée
  const initialOptions = useMemo(() => ({
    clientId: activeClientId,
    currency: normalizedCurrency,
    intent: 'capture' as const, // PAIEMENT UNIQUE STRICT (Orders API, pas de souscription récurrente)
    components: 'buttons',
    enableFunding: 'card', // Active explicitement le bouton Carte Bancaire sans compte
    dataSdkIntegrationSource: 'react-paypal-js'
  }), [activeClientId, normalizedCurrency]);

  const isYearly = billingCycle === 'yearly';

  return (
    <div className={`w-full flex flex-col gap-2 relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <PayPalScriptProvider options={initialOptions}>
        <PayPalButtons
          style={{
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay',
            height: 44,
            tagline: false
          }}
          disabled={disabled}
          forceReRender={[formattedAmount, normalizedCurrency, billingCycle, activeClientId]}
          onClick={(data, actions) => {
            console.log('[PayPal SDK React] 🖱️ Clic utilisateur sur bouton PayPal/CB :', data?.fundingSource || 'standard');
            if (onClick) {
              const allow = onClick();
              if (allow === false) {
                return actions.reject();
              }
            }
            return actions.resolve();
          }}
          createOrder={(data, actions) => {
            const itemDescription = `Pass Pro Éliciné - Accès ${isYearly ? '1 An' : '30 Jours'} (Paiement unique)`;
            const itemRef = `ELICINE_PASS_${isYearly ? '365D' : '30D'}_ONETIME`;

            console.log('[PayPal SDK React] 📦 Création d\'ordre de paiement unique (Orders API - CAPTURE) :', {
              amount: formattedAmount,
              currency: normalizedCurrency,
              itemRef
            });

            // STRICTEMENT PAIEMENT UNIQUE (Orders API avec intent: 'CAPTURE')
            // Aucun abonnement récurrent ni mandat de prélèvement automatique
            return actions.order.create({
              intent: 'CAPTURE',
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
                      description: 'Accès numérique instantané - Paiement unique sans engagement',
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
                landing_page: 'BILLING',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW'
              }
            });
          }}
          onApprove={async (data) => {
            console.log('[PayPal SDK React] 🎯 onApprove déclenché par le SDK ! Réception orderID :', data?.orderID);
            const orderId = data?.orderID;
            if (!orderId) {
              console.error('[PayPal SDK React] ❌ data.orderID manquant lors de onApprove');
              if (onError) onError(new Error("Identifiant de commande PayPal manquant."));
              return;
            }

            if (onValidationStart) {
              try {
                onValidationStart();
              } catch (_) {}
            }

            try {
              // Verrouillage frontend : STRICTEMENT AUCUNE logique d'activation locale, AUCUNE capture client.
              // Le frontend transmet UNIQUEMENT le data.orderID au backend pour exécution de la capture serveur.
              await onSuccess(orderId);
            } catch (err: any) {
              console.error('[PayPal SDK React] ❌ Erreur critique transmission backend :', err);
              if (onError) onError(err);
            }
          }}
          onCancel={(data) => {
            console.log('[PayPal SDK React] 🛑 Annulation transaction par l\'utilisateur :', data);
            if (onCancel) onCancel();
          }}
          onError={(err: any) => {
            console.error('[PayPal SDK React] ❌ Erreur détaillée remontée par PayPalButtons :', err);
            if (onError) onError(err);
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
};

export default PayPalButton;
