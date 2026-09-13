import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SubscriptionModal, CheckoutPayload } from '../SubscriptionModal';
import { subscriptionService } from '../../services/subscriptionService';
import { formatPaymentErrorMessage } from '../../services/payment';
import { Currency } from '../../types';

export const ProModal: React.FC = () => {
  const { 
    isProModalOpen, 
    setIsProModalOpen, 
    setIsAuthModalOpen,
    user, 
    showToast 
  } = useApp();

  const [isProcessing, setIsProcessing] = useState(false);

  // Exécution du paiement avec gestion de l'interception et de la sécurité
  const handlePay = async (payload: CheckoutPayload) => {
    // 1. Interception par l'authentification si non connecté
    if (!user) {
      subscriptionService.setPendingCheckoutIntent({
        plan: payload.plan,
        currency: payload.currency,
        amount: payload.amount,
        numericAmount: payload.numericAmount,
        paymentMethod: payload.paymentMethod,
        provider: payload.paymentMethod === 'mobile_money' ? 'saspay' : 'paypal',
        timestamp: Date.now()
      });
      setIsProModalOpen(false);
      setIsAuthModalOpen(true);
      showToast(`Connectez-vous pour finaliser votre abonnement Pro (${payload.amount} ${payload.currency === 'USD' ? '$' : payload.currency}).`);
      return;
    }

    // 2. Utilisateur connecté : Initialisation en base et déclenchement immédiat
    setIsProcessing(true);
    showToast('Sécurisation et initialisation de votre abonnement Pro...');

    try {
      const result = await subscriptionService.executeCheckoutWithIntent({
        plan: payload.plan,
        currency: payload.currency,
        amount: payload.amount,
        numericAmount: payload.numericAmount,
        paymentMethod: payload.paymentMethod,
        provider: payload.paymentMethod === 'mobile_money' ? 'saspay' : 'paypal',
        timestamp: Date.now()
      }, user);

      if (result.success && result.redirectUrl) {
        showToast('Redirection vers le paiement sécurisé SasaPay...');
        if (typeof window !== 'undefined') {
          window.location.href = result.redirectUrl;
        }
      } else if (!result.success) {
        const errorMsg = result.error || "Échec de l'initialisation du paiement.";
        showToast(errorMsg);
        alert(`Erreur : ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('[ProModal] Exception checkout:', err);
      const exactError = formatPaymentErrorMessage(err);
      showToast(`Erreur : ${exactError}`);
      alert(`Erreur : ${exactError}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reprise automatique si l'utilisateur vient de se connecter et ouvre la modale Pro
  useEffect(() => {
    if (user && isProModalOpen) {
      const pendingIntent = subscriptionService.getPendingCheckoutIntent();
      if (pendingIntent) {
        handlePay({
          currency: pendingIntent.currency as Currency,
          amount: pendingIntent.amount,
          numericAmount: pendingIntent.numericAmount,
          plan: pendingIntent.plan,
          paymentMethod: pendingIntent.paymentMethod
        });
      }
    }
  }, [user, isProModalOpen]);

  if (!isProModalOpen) return null;

  return (
    <SubscriptionModal
      isOpen={isProModalOpen}
      onClose={() => setIsProModalOpen(false)}
      onPay={handlePay}
      isProcessing={isProcessing}
    />
  );
};

export default ProModal;
