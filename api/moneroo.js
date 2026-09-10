/**
 * Endpoint serverless Moneroo (Initialisation et Vérification)
 * - POST : Initialise une transaction Moneroo (POST https://api.moneroo.io/v1/payments/initialize)
 * - GET  : Vérifie l'état d'une transaction Moneroo (GET https://api.moneroo.io/v1/payments/:id/verify)
 */
export default async function handler(req, res) {
  // 1. En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Récupération de la clé secrète Moneroo
  const secretKey = (
    process.env.MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_API_KEY ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.body?.secretKey ||
    ''
  ).trim();

  // 3. GET : Vérification d'un paiement Moneroo
  if (req.method === 'GET') {
    const paymentId = req.query?.id || req.query?.reference || req.query?.paymentId;
    if (!paymentId) {
      return res.status(400).json({ 
        error: 'Identifiant de transaction Moneroo manquant (paramètre id requis).' 
      });
    }

    if (!secretKey) {
      return res.status(500).json({ 
        error: 'Clé secrète MONEROO_SECRET_KEY manquante sur le serveur.' 
      });
    }

    try {
      const response = await fetch(`https://api.moneroo.io/v1/payments/${encodeURIComponent(paymentId)}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Accept': 'application/json'
        }
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (_) {
        data = { message: responseText };
      }

      const rawStatus = data?.data?.status || data?.status || 'pending';
      const isSuccess = rawStatus === 'success' || rawStatus === 'successful' || rawStatus === 'completed';
      const isFailed = rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'rejected';

      return res.status(response.status).json({
        status: isSuccess ? 'complete' : (isFailed ? 'failed' : 'pending'),
        rawStatus,
        ...data
      });
    } catch (err) {
      console.error('[Moneroo Verify Exception]:', err.message);
      return res.status(500).json({ 
        error: `Erreur lors de la vérification Moneroo : ${err.message}` 
      });
    }
  }

  // 4. POST : Initialisation de paiement Moneroo
  if (req.method === 'POST') {
    if (!secretKey) {
      console.error('[Moneroo API] Clé secrète absente dans process.env.MONEROO_SECRET_KEY');
      return res.status(500).json({ 
        error: 'Clé secrète MONEROO_SECRET_KEY non configurée sur le serveur. Veuillez définir MONEROO_SECRET_KEY dans les variables d’environnement.' 
      });
    }

    const body = req.body || {};
    const {
      amount,
      currency = 'XAF',
      description = 'Soutien au projet Éliciné',
      email = 'contact@elicine.com',
      name = 'Cinéphile Bienfaiteur',
      return_url,
      redirect_url,
      returnUrl,
      callbackUrl
    } = body;

    // Validation stricte du montant
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ 
        error: 'Le montant du don doit être supérieur à 0.' 
      });
    }

    // Normalisation de la devise (ISO uppercase)
    const cleanCurrency = String(currency || 'XAF').trim().toUpperCase();
    const finalAmount = (cleanCurrency === 'XAF' || cleanCurrency === 'XOF') ? Math.round(numAmount) : Number(numAmount);

    // Normalisation du nom client pour l'objet customer obligatoire de Moneroo
    const rawName = String(name || '').trim() || 'Cinéphile Bienfaiteur';
    const nameParts = rawName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Cinéphile';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Normalisation de l'URL de redirection retour
    const fallbackOrigin = typeof req.headers.origin === 'string' && req.headers.origin 
      ? req.headers.origin 
      : 'https://elicine.vercel.app';
      
    const resolvedReturnUrl = (
      return_url || 
      redirect_url || 
      returnUrl || 
      callbackUrl || 
      `${fallbackOrigin}/?payment_status=success&type=don`
    ).trim();

    // Payload complet conforme aux spécifications de l'API Moneroo
    const payload = {
      amount: finalAmount,
      currency: cleanCurrency,
      description: String(description || 'Soutien au projet Éliciné').trim(),
      customer: {
        email: (email || '').trim() || 'contact@elicine.com',
        first_name: firstName,
        last_name: lastName
      },
      return_url: resolvedReturnUrl,
      redirect_url: resolvedReturnUrl // Inclus pour compatibilité stricte
    };

    try {
      console.log(`[Moneroo Serverless] Appel initialisation POST https://api.moneroo.io/v1/payments/initialize :`, {
        amount: payload.amount,
        currency: payload.currency,
        return_url: payload.return_url
      });

      const response = await fetch('https://api.moneroo.io/v1/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (_) {
        data = { message: responseText };
      }

      if (!response.ok) {
        const errorMsg = data?.message || data?.error || (data?.errors ? JSON.stringify(data.errors) : `Erreur Moneroo (HTTP ${response.status})`);
        console.error('[Moneroo API Error]', response.status, errorMsg, data);
        return res.status(response.status).json({
          error: errorMsg,
          message: errorMsg,
          status: response.status,
          details: data
        });
      }

      const checkoutUrl = data?.data?.checkout_url || data?.checkout_url;
      if (!checkoutUrl) {
        const errorMsg = "L'API Moneroo n'a pas renvoyé d'URL de redirection (checkout_url).";
        console.error('[Moneroo API Missing Checkout URL]:', data);
        return res.status(500).json({
          error: errorMsg,
          message: errorMsg,
          details: data
        });
      }

      console.log(`[Moneroo Serverless] ✓ Checkout URL générée avec succès :`, checkoutUrl);

      return res.status(200).json({
        success: true,
        checkout_url: checkoutUrl,
        paymentUrl: checkoutUrl,
        reference: data?.data?.id || data?.id,
        data: data.data || data
      });
    } catch (err) {
      console.error('[Moneroo API Exception]:', err.message);
      return res.status(500).json({ 
        error: `Erreur de connexion réseau à l'API Moneroo : ${err.message}`,
        message: `Erreur de connexion réseau à l'API Moneroo : ${err.message}` 
      });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
