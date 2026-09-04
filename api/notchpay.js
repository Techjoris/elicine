import crypto from 'crypto';

export default async function handler(req, res) {
  // Priorité absolue aux variables d'environnement Live / Production NotchPay
  const filterLiveKey = (key) => {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.startsWith('pk_test_') || trimmed.startsWith('test_') || trimmed.startsWith('sk_test_')) return '';
    return trimmed;
  };

  const secretKey = filterLiveKey(process.env.NOTCHPAY_SECRET_KEY) ||
                    filterLiveKey(process.env.NOTCHPAY_PRIVATE_KEY) ||
                    filterLiveKey(process.env.NOTCHPAY_PUBLIC_KEY) ||
                    filterLiveKey(process.env.VITE_NOTCHPAY_SECRET_KEY) ||
                    filterLiveKey(process.env.VITE_NOTCHPAY_PUBLIC_KEY) ||
                    filterLiveKey(req.headers['x-public-key']) ||
                    process.env.NOTCHPAY_SECRET_KEY ||
                    process.env.NOTCHPAY_PRIVATE_KEY ||
                    process.env.NOTCHPAY_PUBLIC_KEY ||
                    process.env.VITE_NOTCHPAY_PUBLIC_KEY;

  const hashKey = process.env.NOTCHPAY_HASH_KEY;

  if (process.env.NODE_ENV !== 'production') {
    const keyPrefix = secretKey ? `${secretKey.slice(0, 8)}...` : '(non configurée)';
    console.log(`[API NotchPay LIVE] Mode PRODUCTION forcé - Clé chargée : ${keyPrefix} | Base URL: https://api.notchpay.co/`);
  }

  // 1. GET : Vérification sécurisée du statut d'une transaction
  if (req.method === 'GET') {
    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ error: 'Référence de transaction manquante' });
    }

    if (!secretKey) {
      return res.status(500).json({ error: 'Clé serveur NotchPay non configurée' });
    }

    try {
      const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': secretKey,
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
    const {
      amount,
      currency = 'XAF',
      email = 'client@elicine.app',
      name = 'Abonné Éliciné',
      description = 'Paiement Éliciné',
      callback,
      reference,
      action = 'initialize',
    } = req.body || {};

    if (action === 'verify' && reference) {
      if (!secretKey) return res.status(500).json({ error: 'Clé serveur NotchPay manquante' });
      try {
        const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
          headers: { 'Authorization': secretKey, 'Accept': 'application/json' },
        });
        const data = await response.json();
        return res.status(response.status).json(data);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    if (!secretKey) {
      return res.status(500).json({ error: 'Clé serveur NotchPay manquante' });
    }

    try {
      const payload = {
        amount: Number(amount),
        currency: currency === 'XOF' || currency === 'XAF' ? 'XAF' : currency,
        email,
        name,
        description,
        ...(callback ? { callback } : {}),
      };

      const response = await fetch('https://api.notchpay.co/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': secretKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
