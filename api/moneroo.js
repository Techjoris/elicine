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
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    body = body || {};

    const effectiveSecretKey = (
      secretKey ||
      body?.secretKey ||
      ''
    ).trim();

    if (!effectiveSecretKey) {
      console.error('[Moneroo API] Clé secrète absente dans process.env.MONEROO_SECRET_KEY');
      return res.status(500).json({ 
        error: 'Clé secrète MONEROO_SECRET_KEY non configurée sur le serveur. Veuillez définir MONEROO_SECRET_KEY dans les variables d’environnement.' 
      });
    }
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
          'Authorization': `Bearer ${effectiveSecretKey}`,
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
      console.log("REPONSE MONEROO :", data);
      console.log('[Moneroo API JSON Response]:', JSON.stringify(data, null, 2));

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

      // Extraction multi-chemins exhaustive du lien de redirection selon toutes les variantes possibles :
      // - response.data.checkout_url
      // - response.checkout_url
      // - response.link
      // - response.data.link
      // - response.payment_url / response.data.payment_url
      // - response.url / response.data.url
      let checkoutUrl = 
        data?.data?.checkout_url || 
        data?.checkout_url || 
        data?.link || 
        data?.data?.link || 
        data?.payment_url || 
        data?.data?.payment_url || 
        data?.paymentUrl || 
        data?.data?.paymentUrl || 
        data?.url || 
        data?.data?.url ||
        data?.data?.data?.checkout_url ||
        data?.data?.data?.link;

      // Si aucun lien direct trouvé dans les propriétés standard, recherche récursive
      if (!checkoutUrl) {
        console.warn('[Moneroo API] Recherche récursive d\'une URL dans l\'objet JSON :', data);
        const searchUrl = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 3) return null;
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === 'string' && v.startsWith('http') && (k.toLowerCase().includes('url') || k.toLowerCase().includes('link') || k.toLowerCase().includes('checkout'))) {
              return v;
            }
            if (v && typeof v === 'object') {
              const res = searchUrl(v, depth + 1);
              if (res) return res;
            }
          }
          return null;
        };
        checkoutUrl = searchUrl(data);
      }

      if (!checkoutUrl) {
        const errorMsg = "L'API Moneroo n'a pas renvoyé d'URL de redirection valide (checkout_url, link ou url introuvable).";
        console.error('[Moneroo API Missing Checkout URL]. Objet reçu :', data);
        return res.status(502).json({
          error: errorMsg,
          message: errorMsg,
          details: data
        });
      }

      console.log(`[Moneroo Serverless] ✓ Checkout URL extraite avec succès :`, checkoutUrl);

      return res.status(200).json({
        success: true,
        checkout_url: checkoutUrl,
        link: checkoutUrl,
        paymentUrl: checkoutUrl,
        url: checkoutUrl,
        reference: data?.data?.id || data?.id || data?.data?.reference || data?.reference,
        data: {
          ...(typeof data.data === 'object' && data.data !== null ? data.data : {}),
          checkout_url: checkoutUrl,
          link: checkoutUrl
        },
        raw: data
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
