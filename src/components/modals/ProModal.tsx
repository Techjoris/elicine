import React from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { processMonerooCheckout, extractMonerooRedirectUrl } from '../../services/payment';
import { Currency } from '../../types';

export const ProModal: React.FC = () => {
  const { 
    isProModalOpen, 
    setIsProModalOpen, 
    user, 
    showToast 
  } = useApp();

  if (!isProModalOpen) return null;

  const handleMonerooCheckout = async (payload?: CheckoutPayload) => {
    try {
      showToast('Initialisation du paiement Moneroo sécurisé...');
      const name = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';
      const cleanAmount = payload ? Number(payload.amount.replace(/\s+/g, '').replace(',', '.')) : 2500;
      const cleanCurrency = (payload?.currency as Currency) || 'XAF';

      const result = await processMonerooCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'pro',
        billingCycle: payload?.plan || 'monthly',
        email: user?.email || 'contact@elicine.com',
        name,
        description: `Pass Pro Éliciné (${cleanAmount} ${cleanCurrency} - ${payload?.plan === 'yearly' ? 'Annuel' : 'Mensuel'})`,
        returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/?payment_status=success&type=pro`,
        openInNewTab: false
      });

      console.log('[ProModal] Objet JSON Moneroo reçu :', result);

      const redirectUrl = 
        result.checkout_url || 
        result.link || 
        result.url || 
        result.paymentUrl || 
        (result as any)?.data?.checkout_url || 
        (result as any)?.data?.link || 
        (result as any)?.data?.url ||
        extractMonerooRedirectUrl(result);

      if (redirectUrl) {
        showToast('Redirection vers la passerelle de paiement Moneroo...');
        if (typeof window !== 'undefined') {
          window.location.assign(redirectUrl);
        }
      } else {
        showToast(result.message || "Impossible de générer le lien de paiement Moneroo.");
      }
    } catch (err: any) {
      console.error('[ProModal Moneroo]', err);
      showToast("Erreur lors de l'initialisation du paiement Moneroo.");
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
      onOpenMoneroo={handleMonerooCheckout}
      onOpenNotchPay={handleMonerooCheckout}
      onOpenPayPal={handlePayPalCheckout}
    />
  );
};

export default ProModal;
