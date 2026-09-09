import React from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { handleMonerooPayment, processNotchPayCheckout } from '../../services/payment';
import { Currency } from '../../types';

export const ProModal: React.FC = () => {
  const { 
    isProModalOpen, 
    setIsProModalOpen, 
    user, 
    apiSettings,
    showToast 
  } = useApp();

  if (!isProModalOpen) return null;

  const handleNotchPayCheckout = async (payload?: CheckoutPayload) => {
    try {
      showToast('Initialisation du paiement Mobile Money sécurisé...');
      const name = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';
      const cleanAmount = payload ? Number(payload.amount.replace(/\s+/g, '').replace(',', '.')) : 2500;
      const cleanCurrency = (payload?.currency as Currency) || 'XAF';

      const result = await processNotchPayCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'pro',
        paymentMethod: 'mobile',
        billingCycle: payload?.plan || 'monthly',
        email: user?.email || 'contact@elicine.com',
        name,
        description: `Pass Pro Éliciné (${cleanAmount} ${cleanCurrency} - ${payload?.plan === 'yearly' ? 'Annuel' : 'Mensuel'})`,
        publicKey: apiSettings.notchPayPublicKey,
        hashKey: apiSettings.notchPayHashKey,
        isTestMode: false,
        openInNewTab: true
      });

      if (result.paymentUrl) {
        showToast('Redirection vers la passerelle Mobile Money...');
        if (typeof window !== 'undefined') {
          window.open(result.paymentUrl, '_blank');
        }
      } else {
        await handleMonerooPayment(user?.email || 'contact@elicine.com', name);
      }
    } catch (err) {
      console.error(err);
      const name = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';
      await handleMonerooPayment(user?.email || 'contact@elicine.com', name);
    }
  };

  const handlePayPalCheckout = async () => {
    showToast('Redirection vers le paiement PayPal sécurisé...');
    window.open('https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN', '_blank', 'noopener,noreferrer');
  };

  return (
    <SubscriptionModal
      isOpen={isProModalOpen}
      onClose={() => setIsProModalOpen(false)}
      onOpenNotchPay={handleNotchPayCheckout}
      onOpenPayPal={handlePayPalCheckout}
    />
  );
};

export default ProModal;
