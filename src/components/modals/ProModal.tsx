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
    openAuthModal,
    user, 
    showToast 
  } = useApp();

  const [isProcessing, setIsProcessing] = useState(false);

  // Exécution du paiement avec gestion de l'interception et de la sécurité
  const handlePay = async (payload: CheckoutPayload) => {
    // 0. Exemption Administrateur Principal (Accès illimité permanent)
    if (user?.email && user.email.toLowerCase() === 'ivanjoris959@gmail.com') {
      showToast("👑 Compte Administrateur : Vous bénéficiez déjà d'un accès illimité permanent.");
      setIsProModalOpen(false);
      return;
    }

    // 1. Interception par l'authentification si non connecté
    if (!user) {
      const isPaypal = payload.paymentMethod === 'paypal' || payload.paymentMethod === 'paypal_card';
      const isCard = payload.paymentMethod === 'card';
      const isPaddle = payload.paymentMethod === 'paddle';
      const paymentMethodStr = isPaddle ? 'paddle' : (isCard ? 'card' : (isPaypal ? 'paypal' : 'sasapay'));
      const chosenGateway = isPaddle ? 'paddle' : (isCard ? 'card' : (isPaypal ? 'paypal' : 'mobile_money'));
      const provider = isPaddle ? 'paddle' : ((isPaypal || isCard) ? 'paypal' : 'saspay');

      // Sauvegarde dans sessionStorage selon l'instruction technique
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pending_checkout', 'true');
          sessionStorage.setItem('payment_method', paymentMethodStr);
          sessionStorage.setItem('checkout_gateway', chosenGateway);
          sessionStorage.setItem('checkout_plan', payload.plan);
          sessionStorage.setItem('checkout_currency', payload.currency);
          sessionStorage.setItem('checkout_amount', payload.amount);
          sessionStorage.setItem('checkout_numeric_amount', String(payload.numericAmount));
        }
      } catch (e) {
        console.warn('[ProModal] Erreur sauvegarde sessionStorage:', e);
      }

      subscriptionService.setPendingCheckoutIntent({
        plan: payload.plan,
        currency: payload.currency,
        amount: payload.amount,
        numericAmount: payload.numericAmount,
        paymentMethod: payload.paymentMethod,
        provider,
        gateway: chosenGateway,
        timestamp: Date.now()
      });

      setIsProModalOpen(false);
      openAuthModal('pro_upgrade');
      showToast('👑 Connectez-vous ou créez votre compte pour finaliser votre abonnement Pro.');
      return;
    }

    // 2. Utilisateur connecté : Déclenchement selon la méthode de paiement
    const isPaypal = payload.paymentMethod === 'paypal' || payload.paymentMethod === 'paypal_card';
    const isCard = payload.paymentMethod === 'card';
    const isPaddle = payload.paymentMethod === 'paddle';

    // Paddle, PayPal & Carte Bancaire : Le paiement est géré directement par l'Overlay Paddle ou le widget PayPal
    // à l'intérieur de la SubscriptionModal.
    if (isPaypal || isCard || isPaddle) {
      console.log('[ProModal] Mode Paddle/PayPal/CB intégré : paiement géré dans la modale.');
      return;
    }

    // Mobile Money (SasPay) : Initialisation en base et redirection vers la passerelle
    setIsProcessing(true);
    showToast('Sécurisation et initialisation de votre abonnement Pro...');

    try {
      const chosenGateway = 'mobile_money';

      const result = await subscriptionService.executeCheckoutWithIntent({
        plan: payload.plan,
        currency: payload.currency,
        amount: payload.amount,
        numericAmount: payload.numericAmount,
        paymentMethod: payload.paymentMethod as any,
        provider: 'saspay',
        gateway: chosenGateway,
        timestamp: Date.now()
      }, user);

      if (result.success && result.redirectUrl) {
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('pending_checkout');
            sessionStorage.removeItem('payment_method');
            sessionStorage.removeItem('checkout_plan');
            sessionStorage.removeItem('checkout_currency');
            sessionStorage.removeItem('checkout_amount');
            sessionStorage.removeItem('checkout_numeric_amount');
          }
        } catch (_) {}

        showToast('Redirection vers le paiement sécurisé Mobile Money (SasPay)...');
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
        // Pour Paddle, PayPal et Cartes bancaires, l'utilisateur connecté voit directement les options dans la modale
        if (pendingIntent.paymentMethod === 'paddle' || pendingIntent.paymentMethod === 'paypal' || pendingIntent.paymentMethod === 'card' || pendingIntent.paymentMethod === 'paypal_card' || pendingIntent.provider === 'paypal' || pendingIntent.provider === 'paddle') {
          subscriptionService.clearPendingCheckoutIntent();
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem('pending_checkout');
            }
          } catch (_) {}
          return;
        }

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
