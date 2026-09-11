import React from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { 
  processSaspayCheckout, 
  extractSaspayRedirectUrl, 
  getSaspayDefaultCurrency, 
  isAfricanCurrency,
  formatPaymentErrorMessage 
} from '../../services/payment';
import { Currency } from '../../types';

export const ProModal: React.FC = () => {
  const { 
    isProModalOpen, 
    setIsProModalOpen, 
    user, 
    showToast 
  } = useApp();

  if (!isProModalOpen) return null;

  const handleSaspayCheckout = async (payload?: CheckoutPayload) => {
    try {
      showToast('Initialisation du paiement mobile SasPay sécurisé...');
      const name = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';
      const defaultCurr = getSaspayDefaultCurrency();
      const isYearly = payload?.plan === 'yearly';

      const reqCurrency = (payload?.currency as Currency) || defaultCurr;
      const cleanCurrency = isAfricanCurrency(reqCurrency) ? reqCurrency : defaultCurr;
      const cleanAmount = isYearly ? 20000 : 2500;

      const data = await processSaspayCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'pro',
        billingCycle: payload?.plan || 'monthly',
        email: user?.email || 'contact@elicine.com',
        name,
        description: `Pass Pro Éliciné (${cleanAmount.toLocaleString()} FCFA - ${isYearly ? 'Annuel' : 'Mensuel'})`,
        returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/?payment_status=success&type=pro`,
        openInNewTab: false,
        skipRedirect: true
      });

      console.log('REPONSE SASPAY :', data);

      if (!data || data.success === false) {
        const exactError = formatPaymentErrorMessage(data?.message || data?.error || data, "Échec de l'initialisation du paiement SasaPay.");
        console.error('[ProModal] Échec SasaPay :', exactError, data);
        showToast(exactError);
        alert(`Erreur SasaPay : ${exactError}`);
        return;
      }

      const urlTrouvee = 
        data?.checkout_url || 
        data?.link || 
        data?.data?.checkout_url || 
        data?.data?.link || 
        data?.url || 
        data?.paymentUrl || 
        extractSaspayRedirectUrl(data);

      if (urlTrouvee) {
        showToast('Redirection vers la passerelle de paiement SasPay...');
        if (typeof window !== 'undefined') {
          window.location.href = urlTrouvee;
        }
      } else {
        const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
        const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
        const missingLinkError = `Lien de redirection SasaPay introuvable (checkout_url manquant). ${propsDetail}. Réponse reçue : ${typeof data === 'object' ? JSON.stringify(data) : data}`;
        console.error('[ProModal]', missingLinkError);
        showToast(`Lien manquant. Propriétés : [${receivedProps}]`);
        alert(`Erreur de redirection SasaPay :\n${missingLinkError}`);
      }
    } catch (err: any) {
      console.error('[ProModal SasaPay]', err);
      const exactError = formatPaymentErrorMessage(err, "Erreur lors de l'initialisation du paiement SasaPay.");
      showToast(`Erreur : ${exactError}`);
      alert(`Erreur SasaPay : ${exactError}`);
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
      onOpenSaspay={handleSaspayCheckout}
      onOpenMoneroo={handleSaspayCheckout}
      onOpenNotchPay={handleSaspayCheckout}
      onOpenPayPal={handlePayPalCheckout}
    />
  );
};

export default ProModal;
