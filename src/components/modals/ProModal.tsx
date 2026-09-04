import React from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { processNotchPayCheckout } from '../../services/payment';
import { Currency, PricingBillingCycle } from '../../types';

export const ProModal: React.FC = () => {
  const { 
    isProModalOpen, 
    setIsProModalOpen, 
    user, 
    upgradeToPro, 
    apiSettings,
    showToast 
  } = useApp();

  if (!isProModalOpen) return null;

  const handleOpenNotchPay = async ({ currency, amount, plan }: CheckoutPayload) => {
    try {
      const numAmount = currency === 'XAF' || currency === 'XOF' 
        ? (plan === 'yearly' ? 22000 : 2500)
        : (plan === 'yearly' ? (currency === 'EUR' ? 32 : 34) : (currency === 'EUR' ? 3.8 : 4));

      const result = await processNotchPayCheckout({
        amount: numAmount,
        currency: (currency as Currency) || 'XAF',
        paymentType: 'pro',
        paymentMethod: 'mobile',
        billingCycle: plan as PricingBillingCycle,
        email: user?.email || 'user@cineia.com',
        name: user?.name || 'Cinéphile',
        description: `Éliciné Pass Pro — Formule ${plan === 'yearly' ? 'Annuelle' : 'Mensuelle'} (Mobile Money NotchPay)`,
        publicKey: apiSettings.notchPayPublicKey,
        hashKey: apiSettings.notchPayHashKey,
        isTestMode: false,
        onSuccessRedirect: () => upgradeToPro(plan as PricingBillingCycle)
      });

      if (result.paymentUrl) {
        showToast('Redirection sécurisée vers Notch Pay...');
      } else {
        upgradeToPro(plan as PricingBillingCycle);
        showToast(result.message);
      }
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la redirection vers Notch Pay.');
    }
  };

  const handleOpenPayPal = ({ currency, amount, plan }: CheckoutPayload) => {
    showToast('Ouverture du paiement sécurisé PayPal...');
    window.open('https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN', '_blank');
  };

  return (
    <SubscriptionModal
      isOpen={isProModalOpen}
      onClose={() => setIsProModalOpen(false)}
      onOpenNotchPay={handleOpenNotchPay}
      onOpenPayPal={handleOpenPayPal}
    />
  );
};

export default ProModal;
