import crypto from 'crypto';

export default async function handler(req, res) {
  // Priorité absolue aux variables d'environnement Live / Production NotchPay
  const filterLiveKey = (key) => {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.startsWith('pk_test_') || trimmed.startsWith('test_') || trimmed.startsWith('sk_test_')) return '';
    return trimmed;
  };

  const notchKey = (
    filterLiveKey(process.env.NOTCHPAY_PUBLIC_KEY) ||
    filterLiveKey(process.env.NOTCH_PAY_PUBLIC_KEY) ||
    filterLiveKey(process.env.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY) ||
    filterLiveKey(process.env.VITE_NOTCHPAY_PUBLIC_KEY) ||
    filterLiveKey(process.env.NOTCHPAY_SECRET_KEY) ||
    filterLiveKey(process.env.NOTCHPAY_PRIVATE_KEY) ||
    filterLiveKey(req.headers['x-public-key']) ||
    filterLiveKey(req.headers['x-notch-key']) ||
    process.env.NOTCHPAY_PUBLIC_KEY ||
    process.env.NOTCH_PAY_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY ||
    process.env.VITE_NOTCHPAY_PUBLIC_KEY ||
    process.env.NOTCHPAY_SECRET_KEY ||
    process.env.NOTCHPAY_PRIVATE_KEY ||
    ''
  ).trim();

  const hashKey = process.env.NOTCHPAY_HASH_KEY;

  if (process.env.NODE_ENV !== 'production') {
    const keyPrefix = notchKey ? `${notchKey.slice(0, 8)}...` : '(non configurée)';
    console.log(`[API NotchPay LIVE] Mode PRODUCTION forcé - Clé chargée : ${keyPrefix} | Base URL: https://api.notchpay.co/payments`);
  }

  // 1. GET : Vérification sécurisée du statut d'une transaction
  if (req.method === 'GET') {
    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ error: 'Référence de transaction manquante' });
    }

    if (!notchKey) {
      return res.status(500).json({ error: 'Clé NotchPay manquante sur le serveur Vercel' });
    }

    try {
      const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': notchKey.trim(),
          'Accept': 'application/json',
        },
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. POST : Initialisation de paiement ou Webhook
  if (req.method === 'POST') {
    // A. Gestion Webhook NotchPay avec signature HMAC
    const signature = req.headers['x-notch-signature'];
    if (signature && hashKey) {
      try {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const computedSignature = crypto
          .createHmac('sha256', hashKey)
          .update(rawBody)
          .digest('hex');

        if (signature !== computedSignature) {
          return res.status(401).json({ error: 'Signature webhook NotchPay invalide' });
        }

        console.log('[NotchPay Webhook] Événement validé :', req.body?.event);
        return res.status(200).json({ received: true });
      } catch (e) {
        return res.status(400).json({ error: 'Erreur validation webhook' });
      }
    }

    // B. Initialisation sécurisée de paiement
    const body = req.body || {};
    const {
      amount,
      currency = 'XAF',
      email,
      name,
      description,
      callback,
      callbackUrl,
      reference,
      action,
    } = body;

    if (action === 'verify' && reference) {
      if (!notchKey) return res.status(500).json({ error: 'Clé NotchPay manquante sur le serveur Vercel' });
      try {
        const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
          headers: { 'Authorization': notchKey.trim(), 'Accept': 'application/json' },
        });
        const data = await response.json();
        return res.status(response.status).json(data);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (!notchKey) {
      return res.status(500).json({ error: 'Clé NotchPay manquante sur le serveur Vercel' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const formattedCurrency = currency === 'XOF' || currency === 'XAF' ? 'XAF' : currency;
    const finalAmount = (formattedCurrency === 'XAF') ? Math.round(numAmount) : numAmount;

    const callbackTarget = callback || callbackUrl || 'https://elicine.vercel.app/?payment_status=success';

    const payload = {
      amount: Math.round(Number(amount)),
      currency: formattedCurrency || 'XAF',
      email: email || 'contact@elicine.com',
      description: description || 'Soutien au projet Éliciné',
      reference: reference || ('elc_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
      callback: callbackTarget,
      return_url: callbackTarget
    };

    const authHeader = (process.env.NOTCHPAY_PUBLIC_KEY?.trim()) || notchKey.trim() || '';

    try {
      const response = await fetch('https://api.notchpay.co/payments', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Détails rejet NotchPay:", errText);
        let parsedErr = {};
        try {
          parsedErr = JSON.parse(errText);
        } catch {
          parsedErr = { message: errText };
        }
        return res.status(response.status).json({
          error: parsedErr.message || `Erreur NotchPay (${response.status})`,
          details: errText
        });
      }

      const data = await response.json();
      const authUrl = data.authorization_url || 
                      data.transaction?.authorization_url || 
                      data.data?.authorization_url;

      return res.status(200).json({
        ...data,
        authorization_url: authUrl
      });
    } catch (err) {
      console.error("Détails rejet NotchPay:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
