import { paypalRecordPaymentSchema } from './_security.js';
import { activateUserPassPro } from './_pro-activation.js';

export default async function handler(req, res) {
  // Entêtes CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action || (req.body?.action) || '';

  // 1. Récupération de la configuration publique PayPal
  if (req.method === 'GET' || action === 'config') {
    const clientId = (
      process.env.VITE_PAYPAL_CLIENT_ID ||
      process.env.PAYPAL_CLIENT_ID ||
      'sb'
    ).trim();

    const businessId = (
      process.env.VITE_PAYPAL_BUSINESS_ID ||
      process.env.PAYPAL_BUSINESS_ID ||
      'ivanjoris959@gmail.com'
    ).trim();

    return res.status(200).json({
      success: true,
      clientId,
      businessId,
      currency: 'USD',
      monthlyAmount: 1.99,
      yearlyAmount: 15.99
    });
  }

  // 2. Enregistrement direct et validation d'un paiement PayPal complété
  if (req.method === 'POST' && (action === 'record-payment' || !action)) {
    try {
      const validation = paypalRecordPaymentSchema.safeParse(req.body || {});
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Données de paiement PayPal invalides",
          details: validation.error.format()
        });
      }

      const {
        orderId,
        subscriptionId,
        userId,
        email,
        customerName,
        plan,
        currency,
        amount,
        details
      } = validation.data;

      const targetSubId = subscriptionId || `sub_paypal_${orderId}`;
      const cleanEmail = (email || details?.payer?.email_address || '').trim().toLowerCase();
      const cleanName = customerName || (details?.payer?.name?.given_name ? `${details.payer.name.given_name} ${details.payer.name.surname || ''}`.trim() : 'Cinéphile Pro');
      const numericAmount = Number(amount || (plan === 'yearly' ? 15.99 : 1.99));

      // Détection don vs abonnement Pro
      const isDonation = (
        (validation.data.plan === 'donation' || validation.data.plan === 'don') ||
        String(validation.data.details?.purchase_units?.[0]?.description || '').toLowerCase().includes('don') ||
        String(req.body?.itemType || req.body?.type || '').toLowerCase() === 'donation' ||
        (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(validation.data.plan))
      );

      // Activation centralisée Supabase + E-mail Resend
      const activationResult = await activateUserPassPro(cleanEmail, {
        plan: isDonation ? 'donation' : (plan || 'monthly'),
        customerName: cleanName,
        amount: numericAmount,
        currency: currency || 'USD',
        gateway: 'paypal',
        paymentReference: orderId,
        subscriptionId: targetSubId,
        isDonation,
        userId
      });

      return res.status(200).json({
        success: true,
        message: "Paiement PayPal enregistré avec succès et souscription activée.",
        subscriptionId: targetSubId,
        orderId,
        activation: activationResult
      });
    } catch (err) {
      console.error('[PayPal Server Exception]:', err);
      return res.status(500).json({
        success: false,
        error: "Erreur interne lors de l'enregistrement du paiement PayPal."
      });
    }
  }

  // 3. Webhook PayPal (PAYMENT.CAPTURE.COMPLETED, CHECKOUT.ORDER.APPROVED)
  if (req.method === 'POST' && action === 'webhook') {
    try {
      console.log('WEBHOOK REÇU:', JSON.stringify(req.body, null, 2));
      const event = req.body || {};
      const eventType = event.event_type || '';
      console.log(`[PayPal Webhook] Événement reçu : ${eventType}`);

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
        const resource = event.resource || {};
        const orderId = resource.id || resource.supplementary_data?.related_ids?.order_id || `pp_${Date.now()}`;
        
        // Extraction robuste de l'email PayPal
        const payerEmail = (
          resource.payer?.email_address ||
          resource.customer_email ||
          resource.custom_fields?.email ||
          resource.email ||
          event.payer_email ||
          ''
        ).trim().toLowerCase();

        const amountValue = resource.amount?.value ? Number(resource.amount.value) : 1.99;
        const currencyCode = resource.amount?.currency_code || 'USD';
        const payerName = resource.payer?.name?.given_name ? `${resource.payer.name.given_name} ${resource.payer.name.surname || ''}`.trim() : 'Cinéphile Pro';
        const detectedPlan = amountValue > 10 ? 'yearly' : 'monthly';

        // Détection don vs abonnement (description de la commande ou custom field)
        const purchaseDesc = String(
          resource.purchase_units?.[0]?.description ||
          resource.purchase_units?.[0]?.items?.[0]?.name ||
          resource.custom_id ||
          ''
        ).toLowerCase();
        const isDonation = purchaseDesc.includes('don') || purchaseDesc.includes('soutien') || purchaseDesc.includes('tip');

        if (payerEmail) {
          await activateUserPassPro(payerEmail, {
            plan: isDonation ? 'donation' : detectedPlan,
            customerName: payerName,
            amount: amountValue,
            currency: currencyCode,
            gateway: 'paypal',
            paymentReference: orderId,
            subscriptionId: `sub_paypal_${orderId}`,
            isDonation
          });
        }
      }

      return res.status(200).json({ success: true, received: true });
    } catch (whErr) {
      console.error('[PayPal Webhook Exception]:', whErr);
      return res.status(200).json({ success: false, error: 'Webhook processing warning' });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
