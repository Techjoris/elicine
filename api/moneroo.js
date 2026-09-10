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
    // Récupération de la devise par défaut configurée (défaut : XOF - Franc CFA UEMOA natif Moneroo)
    const defaultCurrency = (
      process.env.MONEROO_DEFAULT_CURRENCY ||
      process.env.VITE_MONEROO_DEFAULT_CURRENCY ||
      'XOF'
    ).trim().toUpperCase();

    const {
      amount,
      currency,
      description = 'Soutien au projet Éliciné',
      email = 'contact@elicine.com',
      name = 'Cinéphile Bienfaiteur',
      return_url,
      redirect_url,
      returnUrl,
      callbackUrl
    } = body;

    // Validation et conversion du montant
    let numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ 
        error: 'Le montant du paiement doit être supérieur à 0.' 
      });
    }

    // Normalisation intelligente de la devise :
    // Si la devise demandée est EUR, USD ou CAD, convertir vers la devise par défaut Moneroo (ex: XOF)
    // car les passerelles Mobile Money de Moneroo n'acceptent pas les devises occidentales.
    let cleanCurrency = String(currency || defaultCurrency).trim().toUpperCase();
    if (cleanCurrency === 'EUR' || cleanCurrency === 'USD' || cleanCurrency === 'CAD') {
      const descLower = String(description || '').toLowerCase();
      if (descLower.includes('pass pro') || descLower.includes('abonnement')) {
        numAmount = descLower.includes('annuel') || descLower.includes('yearly') ? 20000 : 2500;
      } else {
        const rates = { EUR: 655.957, USD: 610.0, CAD: 450.0 };
        const rate = rates[cleanCurrency] || 655.957;
        const converted = Math.max(500, Math.round(numAmount * rate));
        numAmount = Math.ceil(converted / 50) * 50;
      }
      cleanCurrency = defaultCurrency;
    }

    // Normalisation stricte du montant pour l'API Moneroo :
    // Pour XOF/XAF, Moneroo exige un nombre entier strict sans décimale et au minimum 100 FCFA.
    const finalAmount = (cleanCurrency === 'XAF' || cleanCurrency === 'XOF') 
      ? Math.max(100, Math.round(numAmount)) 
      : Number(Number(numAmount).toFixed(2));

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

    // Fonction d'envoi vers l'API Moneroo
    const makeInitializeRequest = async (curr, amt) => {
      const reqPayload = {
        amount: amt,
        currency: curr,
        description: String(description || 'Soutien au projet Éliciné').trim(),
        customer: {
          email: (email || '').trim() || 'contact@elicine.com',
          first_name: firstName,
          last_name: lastName
        },
        return_url: resolvedReturnUrl,
        redirect_url: resolvedReturnUrl
      };

      console.log(`[Moneroo Serverless] Appel initialisation POST https://api.moneroo.io/v1/payments/initialize :`, {
        amount: reqPayload.amount,
        currency: reqPayload.currency,
        return_url: reqPayload.return_url
      });

      const resp = await fetch('https://api.moneroo.io/v1/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveSecretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(reqPayload)
      });

      const respText = await resp.text();
      let resJson = {};
      try {
        resJson = JSON.parse(respText);
      } catch (_) {
        resJson = { message: respText };
      }

      return { resp, resJson, payload: reqPayload };
    };

    try {
      let { resp: response, resJson: data, payload } = await makeInitializeRequest(cleanCurrency, finalAmount);
      console.log("REPONSE MONEROO :", data);
      console.log('[Moneroo API JSON Response]:', JSON.stringify(data, null, 2));

      // Repli dynamique : si Moneroo renvoie "No payment methods enabled for this currency",
      // tenter automatiquement avec l'autre devise CFA (XOF <-> XAF)
      const errorText = String(data?.message || data?.error || '').toLowerCase();
      const isPaymentMethodNotEnabled = 
        errorText.includes('no payment methods enabled') ||
        errorText.includes('payment methods for this currency') ||
        errorText.includes('method not activated');

      if (!response.ok && isPaymentMethodNotEnabled) {
        const alternateCurrency = cleanCurrency === 'XAF' ? 'XOF' : (cleanCurrency === 'XOF' ? 'XAF' : null);
        if (alternateCurrency) {
          console.warn(`[Moneroo Serverless] Devise ${cleanCurrency} non activée dans Moneroo. Tentative automatique de repli avec ${alternateCurrency}...`);
          const fallback = await makeInitializeRequest(alternateCurrency, finalAmount);
          if (fallback.resp.ok) {
            response = fallback.resp;
            data = fallback.resJson;
            payload = fallback.payload;
            console.log(`[Moneroo Serverless] Repli réussi avec la devise ${alternateCurrency} !`);
          }
        }
      }

      if (!response.ok) {
        let errorMsg = data?.message || data?.error || (data?.errors ? JSON.stringify(data.errors) : `Erreur Moneroo (HTTP ${response.status})`);
        if (isPaymentMethodNotEnabled) {
          errorMsg = `Aucune méthode de paiement n'est activée pour la devise ${payload.currency} dans votre tableau de bord Moneroo. Veuillez activer vos modes de paiement (MTN MoMo, Moov, Orange, Wave...) sur https://app.moneroo.io ou configurer MONEROO_DEFAULT_CURRENCY.`;
        }
        console.error('[Moneroo API Error]', response.status, errorMsg, data);
        return res.status(response.status).json({
          error: errorMsg,
          message: errorMsg,
          status: response.status,
          currency: payload.currency,
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
