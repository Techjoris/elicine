import React, { useMemo, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { CreditCard } from 'lucide-react';
import { PricingBillingCycle } from '../../types';

export interface PayPalButtonProps {
  amount?: number;
  currency?: string;
  billingCycle: PricingBillingCycle;
  onSuccess: (orderId: string) => Promise<void> | void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  onClick?: () => boolean | void;
  onValidationStart?: () => void;
  disabled?: boolean;
  disableCard?: boolean; // Optionnel : passer à true pour forcer "disable-funding": "card"
}

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount,
  currency = 'USD',
  billingCycle,
  onSuccess,
  onError,
  onCancel,
  onClick,
  onValidationStart,
  disabled = false,
  disableCard = false
}) => {
  const isYearly = billingCycle === 'yearly';

  // Hardcodage strict du montant de l'abonnement Pro : 1.99 USD (ou 15.99 USD si annuel)
  // Écrase toute conversion FCFA/USD défaillante
  const orderAmount = isYearly ? '15.99' : '1.99';

  // Récupération stricte du Client ID via process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  const clientId = (
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    (typeof import.meta !== 'undefined' ? (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_CLIENT_ID || (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID : '') ||
    ''
  )?.trim();

  // Sécurité : bloquer le rendu si Client ID absent
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

  // 1. Désactivation du bouton natif PayPal défaillant :
  // Le paramètre "disable-funding": "card,credit,paylater" force le SDK à ne rendre QUE le bouton jaune principal PayPal
  const initialOptions = useMemo(() => {
    const opts: any = {
      clientId: clientId,
      'client-id': clientId,
      currency: 'USD',
      intent: 'capture',
      commit: true,
      vault: false,
      components: 'buttons',
      'disable-funding': 'card,credit,paylater',
      disableFunding: 'card,credit,paylater',
      dataSdkIntegrationSource: 'react-paypal-js'
    };

    return opts;
  }, [clientId]);

  return (
    <div className={`w-full flex flex-col gap-2 relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <PayPalScriptProvider 
        key={`paypal-provider-${clientId}-USD${disableCard ? '-nocard' : ''}`}
        options={initialOptions}
      >
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
          forceReRender={[orderAmount, 'USD', billingCycle, clientId, disableCard]}
          onClick={(data, actions) => {
            console.log('[PayPal SDK React] 🖱️ Clic utilisateur sur bouton PayPal/CB :', {
              source: data?.fundingSource || 'standard',
              currency: 'USD',
              amount: orderAmount
            });
            if (onClick) {
              const allow = onClick();
              if (allow === false) {
                return actions.reject();
              }
            }
            return actions.resolve();
          }}
          createOrder={(data, actions) => {
            console.log('[PayPal SDK React] 📦 Création d\'ordre de paiement unique strict :', {
              currency_code: 'USD',
              value: orderAmount
            });

            // 2. Hardcodage strict du montant et suppression des déclencheurs anti-fraude :
            // - Aucun objet payment_source ni attribut de vault (sauvegarde)
            // - application_context avec shipping_preference: "NO_SHIPPING"
            // - Payload purchase_units épuré sans breakdown conflictuel
            return actions.order.create({
              intent: 'CAPTURE',
              purchase_units: [
                {
                  amount: {
                    currency_code: 'USD',
                    value: orderAmount
                  }
                }
              ],
              application_context: {
                shipping_preference: 'NO_SHIPPING'
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

        {/* 2 & 3. Bouton UI de substitution factice pour la carte bancaire */}
        <button
          type="button"
          disabled={true}
          aria-disabled="true"
          className="w-full h-[44px] rounded flex items-center justify-center gap-2.5 bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold text-xs sm:text-sm border border-gray-300/80 dark:border-gray-700/80 opacity-60 cursor-not-allowed select-none shadow-none"
          title="Paiement par carte bancaire temporairement indisponible dans cette région"
        >
          <CreditCard className="w-4 h-4 opacity-75 shrink-0" />
          <span>Carte bancaire (Bientôt disponible)</span>
        </button>
      </PayPalScriptProvider>
    </div>
  );
};

export default PayPalButton;
