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

  // Récupération stricte et dynamique du Client ID via process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  const clientId = (
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    (typeof import.meta !== 'undefined' ? (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_CLIENT_ID || (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID : '') ||
    ''
  )?.trim();

  // Sécurité stricte : si la variable est undefined ou non configurée, bloquer le rendu
  const isClientIdConfigured = Boolean(
    clientId &&
    clientId !== 'undefined' &&
    clientId !== 'null' &&
    clientId !== '' &&
    clientId !== 'sb'
  );

  if (!isClientIdConfigured) {
    console.error(
      '[PayPal SDK] ❌ Erreur critique : process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID est indéfini ou non configuré. Le rendu du bouton PayPal est strictement bloqué.'
    );

    return (
      <div className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex flex-col gap-1.5 animate-in fade-in duration-200">
        <div className="flex items-center gap-2 font-bold text-xs">
          <span className="text-base">⚠️</span>
          <span>Module de paiement PayPal indisponible</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
          La variable d'environnement publique <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> n'a pas été détectée. Veuillez configurer votre clé publique PayPal sur Vercel.
        </p>
      </div>
    );
  }

  // Configuration stricte du SDK officiel PayPal : Paiement unique (intent: 'capture'), boutons natifs et CB activée
  // intent=capture&commit=true&vault=false bloque toute tentative de sauvegarde de carte
  const initialOptions = useMemo(() => ({
    clientId: clientId,
    currency: normalizedCurrency,
    intent: 'capture' as const, // PAIEMENT UNIQUE STRICT (Orders API, pas de souscription récurrente)
    commit: true,               // Force le mode "Payer maintenant" direct sans création ni enregistrement de carte
    vault: false,              // DÉSACTIVE STRICTEMENT LE VAULTING (interdit tout enregistrement de carte)
    components: 'buttons',
    enableFunding: 'card',     // Active explicitement le bouton Carte Bancaire sans compte
    dataSdkIntegrationSource: 'react-paypal-js'
  }), [clientId, normalizedCurrency]);

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
          forceReRender={[formattedAmount, normalizedCurrency, billingCycle, clientId]}
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
            // Aucun objet payment_source.card.attributes.vault ni demande de sauvegarde de carte
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
                landing_page: 'NO_PREFERENCE',      // Évite de forcer l'enregistrement d'un compte PayPal ou de sauvegarder la carte
                shipping_preference: 'NO_SHIPPING', // Allège les contrôles de risque / anti-fraude de PayPal
                user_action: 'PAY_NOW'              // Bouton "Payer maintenant" immédiat
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
            const errDetails = {
              message: err?.message,
              name: err?.name,
              details: err?.details,
              stack: err?.stack,
              raw: String(err),
              full: err
            };
            console.error('[PayPal SDK React] ❌ Échec bouton PayPal / Carte bancaire (Payload complète) :', errDetails);

            // Diagnostic précis pour déceler INSTRUMENT_DECLINED ou PERMISSION_DENIED
            const errStr = (JSON.stringify(err || {}) + ' ' + (err?.message || '') + ' ' + (err?.name || '')).toUpperCase();
            if (errStr.includes('PERMISSION_DENIED')) {
              console.error('[PayPal SDK React] 🚫 PERMISSION_DENIED détecté : Le compte PayPal marchand restreint les paiements par carte invité (Guest Checkout) ou exige une validation d\'identité.');
            } else if (errStr.includes('INSTRUMENT_DECLINED')) {
              console.error('[PayPal SDK React] 💳 INSTRUMENT_DECLINED détecté : La banque émettrice a refusé le débit (solde insuffisant, carte virtuelle non autorisée ou restriction 3D-Secure).');
            } else if (errStr.includes('VAULT') || errStr.includes('SAVE')) {
              console.error('[PayPal SDK React] 🔒 Erreur d\'enregistrement de carte (Vaulting) détectée.');
            }

            if (onError) onError(err);
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
};

export default PayPalButton;
