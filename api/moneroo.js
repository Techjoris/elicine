export default async function handler(req, res) {
  const secretKey = (
    process.env.MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_API_KEY ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();

  // 1. GET : Vérification d'un paiement Moneroo
  if (req.method === 'GET') {
    const paymentId = req.query?.id || req.query?.reference || req.query?.paymentId;
    if (!paymentId) {
      return res.status(400).json({ error: 'Identifiant de transaction Moneroo manquant' });
    }

    if (!secretKey) {
      return res.status(500).json({ error: 'Clé MONEROO_SECRET_KEY manquante sur le serveur' });
    }

    try {
      const response = await fetch(`https://api.moneroo.io/v1/payments/${encodeURIComponent(paymentId)}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      const rawStatus = data?.data?.status || data?.status || 'pending';
      const isSuccess = rawStatus === 'success' || rawStatus === 'successful' || rawStatus === 'completed';
      const isFailed = rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'rejected';

      return res.status(response.status).json({
        status: isSuccess ? 'complete' : (isFailed ? 'failed' : 'pending'),
        rawStatus,
        ...data
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. POST : Initialisation de paiement Moneroo
  if (req.method === 'POST') {
    if (!secretKey) {
      return res.status(500).json({ error: 'Clé MONEROO_SECRET_KEY manquante sur le serveur' });
    }

    const body = req.body || {};
    const {
      amount,
      currency = 'XAF',
      description = 'Paiement Éliciné',
      email = 'contact@elicine.com',
      name = 'Cinéphile',
      return_url,
      returnUrl,
      callbackUrl
    } = body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    // Gestion du nom client
    const nameParts = (name || 'Cinéphile').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Cinéphile';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const resolvedReturnUrl = return_url || returnUrl || callbackUrl || 'https://elicine.vercel.app/?payment_status=success';

    const payload = {
      amount: numAmount,
      currency: (currency === 'XOF' || currency === 'XAF') ? 'XAF' : currency.toString().toUpperCase(),
      description,
      customer: {
        email: email || 'contact@elicine.com',
        first_name: firstName,
        last_name: lastName
      },
      return_url: resolvedReturnUrl
    };

    try {
      const response = await fetch('https://api.moneroo.io/v1/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[Moneroo API] Erreur initialisation:', data);
        return res.status(response.status).json({
          error: data.message || `Erreur Moneroo (${response.status})`,
          details: data
        });
      }

      const checkoutUrl = data?.data?.checkout_url || data?.checkout_url;

      return res.status(200).json({
        success: true,
        checkout_url: checkoutUrl,
        data: data.data || data
      });
    } catch (err) {
      console.error('[Moneroo API] Exception:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
