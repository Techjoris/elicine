import React, { useState } from 'react';
import { X, ShieldCheck, Zap, Sparkles, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PayPalButton } from './PayPalButton';
import { subscriptionService } from '../../services/subscriptionService';
import { PricingBillingCycle } from '../../types';

export interface PayPalCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlan?: PricingBillingCycle;
}

export const PayPalCheckoutModal: React.FC<PayPalCheckoutModalProps> = ({
  isOpen,
  onClose,
  defaultPlan = 'monthly'
}) => {
  const { user, showToast, upgradeToPro, setIsProSuccessModalOpen } = useApp();
  const [billingCycle, setBillingCycle] = useState<PricingBillingCycle>(defaultPlan);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const isYearly = billingCycle === 'yearly';
  const amount = isYearly ? 15.99 : 1.99;
  const formattedPrice = isYearly ? '15.99 $ / an' : '1.99 $ / mois';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-[#0a0d14] border border-slate-800/80 rounded-3xl p-6 shadow-2xl shadow-sky-500/10 text-slate-100 flex flex-col gap-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec badge et bouton fermer */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Pass Pro • Paiement In-App Sécurisé</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Titre & Description */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Finaliser votre abonnement Pro
          </h2>
          <p className="text-xs text-slate-400">
            Payez directement via Carte bancaire (Visa, Mastercard, Virtuelles) ou compte PayPal sans quitter Éliciné.
          </p>
        </div>

        {/* Sélecteur de formule (Mensuel / Annuel) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800/60">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 cursor-pointer ${
              !isYearly 
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Mensuel</span>
            <span className="text-[11px] opacity-90">1.99 $ / mois</span>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 cursor-pointer relative ${
              isYearly 
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1">
              Annuel
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold uppercase">
                -33%
              </span>
            </span>
            <span className="text-[11px] opacity-90">15.99 $ / an</span>
          </button>
        </div>

        {/* Récapitulatif tarifaire */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-black text-sm">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {isYearly ? 'Accès 1 An Illimité' : 'Accès 30 Jours Illimité'}
              </p>
              <p className="text-[11px] text-slate-400">Paiement unique sans engagement</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-extrabold text-sky-400">{formattedPrice}</p>
          </div>
        </div>

        {/* Avantages inclus rapides */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>IA de recherche illimitée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Filtres plateformes VOD</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Badge Supporter Pro</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Support prioritaire 7j/7</span>
          </div>
        </div>

        {/* Conteneur officiel des boutons PayPal SDK */}
        <div className="pt-2 flex flex-col gap-2">
          <PayPalButton
            amount={amount}
            currency="USD"
            billingCycle={billingCycle}
            disabled={isProcessing}
            onSuccess={async (details, orderId) => {
              try {
                setIsProcessing(true);
                showToast('Validation sécurisée de votre transaction en cours...');

                const recordResult = await subscriptionService.recordPayPalPayment({
                  orderId,
                  userId: user?.id || `usr_${Date.now()}`,
                  email: user?.email || details?.payer?.email_address,
                  customerName: user?.name || (details?.payer?.name?.given_name ? `${details.payer.name.given_name} ${details.payer.name.surname || ''}`.trim() : 'Cinéphile Pro'),
                  plan: billingCycle,
                  amount,
                  currency: 'USD',
                  details
                });

                if (recordResult?.success) {
                  showToast('👑 Félicitations ! Votre Pass Pro Éliciné est désormais actif.');
                  upgradeToPro(billingCycle);
                  onClose();
                  if (setIsProSuccessModalOpen) {
                    setIsProSuccessModalOpen(true);
                  }
                } else {
                  const errorMsg = recordResult?.error || "Le paiement n'a pas pu être validé.";
                  showToast(`❌ ${errorMsg}`);
                }
              } catch (err: any) {
                console.error('[PayPalCheckoutModal] Exception validation :', err);
                showToast(`❌ Erreur validation : ${err?.message || 'Transaction non confirmée'}`);
              } finally {
                setIsProcessing(false);
              }
            }}
            onError={(err) => {
              console.error('[PayPalCheckoutModal] Erreur PayPal SDK :', err);
              showToast("Paiement refusé ou interrompu par l'émetteur de carte.");
            }}
            onCancel={() => {
              showToast("Paiement annulé. Aucun montant n'a été prélevé.");
            }}
          />
        </div>

        {/* Mentions de sécurité et réassurance */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Cryptage SSL 256 bits • Traitement officiel PayPal & Carte Bancaire</span>
        </div>
      </div>
    </div>
  );
};

export default PayPalCheckoutModal;
