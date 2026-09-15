import { createClient } from '@supabase/supabase-js';
import { paypalRecordPaymentSchema } from './_security.js';
import { sendProWelcomeEmail, sendDonationThankYouEmail } from './_email.js';

const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY ||
  '';

const supabase = (supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 20)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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

      const now = new Date().toISOString();
      const targetSubId = subscriptionId || `sub_paypal_${orderId}`;
      const cleanEmail = (email || details?.payer?.email_address || '').trim().toLowerCase();
      const cleanName = customerName || (details?.payer?.name?.given_name ? `${details.payer.name.given_name} ${details.payer.name.surname || ''}`.trim() : 'Cinéphile Pro');
      const numericAmount = Number(amount || (plan === 'yearly' ? 15.99 : 1.99));

      const expiresDate = new Date();
      if (plan === 'yearly') {
        expiresDate.setFullYear(expiresDate.getFullYear() + 1);
      } else {
        expiresDate.setDate(expiresDate.getDate() + 30);
      }
      const expiresAt = expiresDate.toISOString();

      if (supabase) {
        try {
          await supabase.from('subscriptions').upsert({
            id: targetSubId,
            user_id: userId || `usr_${Date.now()}`,
            email: cleanEmail,
            customer_name: cleanName,
            plan: plan || 'monthly',
            currency: currency || 'USD',
            amount: numericAmount,
            status: 'active',
            payment_reference: orderId,
            terms_accepted: true,
            created_at: now,
            updated_at: now,
            expires_at: expiresAt
          });

          // Activation is_pro dans profiles
          if (cleanEmail) {
            await supabase.from('profiles').update({
              is_pro: true,
              updated_at: now
            }).eq('email', cleanEmail);
          }
        } catch (sbErr) {
          console.warn('[PayPal Server] Erreur upsert Supabase:', sbErr);
        }
      }

      // Détection don vs abonnement Pro
      const isDonation = (
        (validation.data.plan === 'donation' || validation.data.plan === 'don') ||
        String(validation.data.details?.purchase_units?.[0]?.description || '').toLowerCase().includes('don') ||
        String(req.body?.itemType || req.body?.type || '').toLowerCase() === 'donation' ||
        (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(validation.data.plan))
      );

      // Envoi email de bienvenue Pro ou remerciement don (silencieux en cas d'échec réseau)
      if (cleanEmail) {
        if (isDonation) {
          sendDonationThankYouEmail(cleanEmail, {
            customerName: cleanName,
            amount: String(numericAmount)
          }).catch(e => console.warn('[PayPal Server] Erreur email remerciement don:', e?.message || e));
        } else {
          sendProWelcomeEmail(cleanEmail, { customerName: cleanName, plan }).catch(e => {
            console.warn('[PayPal Server] Erreur envoi email bienvenue:', e?.message || e);
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: "Paiement PayPal enregistré avec succès et souscription activée.",
        subscriptionId: targetSubId,
        orderId
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
      const event = req.body || {};
      const eventType = event.event_type || '';
      console.log(`[PayPal Webhook] Événement reçu : ${eventType}`);

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
        const resource = event.resource || {};
        const orderId = resource.id || resource.supplementary_data?.related_ids?.order_id;
        const payerEmail = (resource.payer?.email_address || '').trim().toLowerCase();
        const amountValue = resource.amount?.value ? Number(resource.amount.value) : 1.99;
        const currencyCode = resource.amount?.currency_code || 'USD';

        if (orderId && supabase) {
          const now = new Date().toISOString();
          const targetSubId = `sub_paypal_${orderId}`;

          await supabase.from('subscriptions').upsert({
            id: targetSubId,
            email: payerEmail || null,
            amount: amountValue,
            currency: currencyCode,
            status: 'active',
            payment_reference: orderId,
            terms_accepted: true,
            updated_at: now
          });

          if (payerEmail) {
            const payerName = resource.payer?.name?.given_name || 'Cinéphile';
            const detectedPlan = amountValue > 10 ? 'yearly' : 'monthly';

            // Détection don vs abonnement (items custom_fields ou montant non standard)
            const purchaseDesc = String(
              resource.purchase_units?.[0]?.description ||
              resource.purchase_units?.[0]?.items?.[0]?.name ||
              ''
            ).toLowerCase();
            const isDonation = purchaseDesc.includes('don') || purchaseDesc.includes('soutien') || purchaseDesc.includes('tip');

            await supabase.from('profiles').update({
              is_pro: !isDonation,
              updated_at: now
            }).eq('email', payerEmail);

            if (isDonation) {
              sendDonationThankYouEmail(payerEmail, {
                customerName: payerName,
                amount: String(amountValue)
              }).catch(() => console.warn('[PayPal Webhook] Erreur email remerciement don.'));
            } else {
              sendProWelcomeEmail(payerEmail, {
                customerName: payerName,
                plan: detectedPlan
              }).catch(() => console.warn('[PayPal Webhook] Erreur email bienvenue Pro.'));
            }
          }
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
