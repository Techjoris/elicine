import React from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { handleMonerooPayment } from '../../services/payment';
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

  const handleCheckout = async () => {
    showToast('Initialisation du paiement sécurisé Moneroo...');
    const name = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';
    await handleMonerooPayment(user?.email || 'contact@elicine.com', name);
  };

  return (
    <SubscriptionModal
      isOpen={isProModalOpen}
      onClose={() => setIsProModalOpen(false)}
      onOpenNotchPay={handleCheckout}
      onOpenPayPal={handleCheckout}
    />
  );
};

export default ProModal;
