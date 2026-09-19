import { paypalRecordPaymentSchema } from './_security.js';
import { activateUserPassPro, supabaseAdmin } from './_pro-activation.js';

/**
 * URLs de base officielles de l'API PayPal
 */
const PAYPAL_LIVE_API_BASE = 'https://api-m.paypal.com';
const PAYPAL_SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';

/**
 * Récupère l'URL de base de l'API PayPal en fonction de l'environnement réel
 * Aligne strictement le serveur sur l'environnement du Client ID (Live vs Sandbox)
 */
function getPayPalApiBase(modeOverride = null) {
  const clientId = (
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID ||
    process.env.VITE_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_ID ||
    ''
  ).trim();

  const mode = (
    modeOverride ||
    process.env.PAYPAL_MODE ||
    process.env.NEXT_PUBLIC_PAYPAL_MODE ||
    process.env.VITE_PAYPAL_MODE ||
    process.env.VITE_PAYPAL_ENV ||
    process.env.PAYPAL_ENV ||
    ''
  ).trim().toLowerCase();

  // Détection automatique du mode Sandbox (si le client ID est 'sb', commence par 'sb-', ou mode explicitement sandbox)
  if (
    mode === 'sandbox' ||
    mode === 'test' ||
    clientId === 'sb' ||
    clientId.startsWith('sb-') ||
    clientId.toLowerCase().includes('sandbox')
  ) {
    return PAYPAL_SANDBOX_API_BASE;
  }

  // Par défaut strict : mode LIVE (Production)
  return PAYPAL_LIVE_API_BASE;
}

/**
 * Obtient un Bearer Token OAuth2 auprès de l'API PayPal
 */
async function getPayPalAccessToken(modeOverride = null) {
  const clientId = (
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID ||
    process.env.VITE_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_ID ||
    ''
  ).trim();

  // Support prioritaire de PAYPAL_SECRET (recommandé)
  const secret = (
    process.env.PAYPAL_SECRET ||
    process.env.PAYPAL_CLIENT_SECRET ||
    process.env.PAYPAL_SECRET_KEY ||
    ''
  ).trim();

  if (!clientId || !secret) {
    const errorMsg = {
      message: "Variables d'environnement manquantes : NEXT_PUBLIC_PAYPAL_CLIENT_ID ou PAYPAL_SECRET absent dans process.env.",
      hasClientId: Boolean(clientId),
      hasSecret: Boolean(secret)
    };
    console.error("PayPal Error Details:", errorMsg);
    return null;
  }

  const base = getPayPalApiBase(modeOverride);
  const basicAuth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const fetchToken = async (targetBase) => {
    try {
      console.log(`[PayPal API] 🔑 Demande token OAuth2 sur ${targetBase}/v1/oauth2/token...`);
      const res = await fetch(`${targetBase}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!res.ok) {
        const errText = await res.text();
        let errData;
        try { errData = JSON.parse(errText); } catch (_) { errData = { message: errText }; }
        console.error("PayPal Error Details:", errData);
        return { ok: false, status: res.status, body: errText, data: errData };
      }

      const data = await res.json();
      return { ok: true, token: data.access_token, base: targetBase };
    } catch (err) {
      console.error("PayPal Error Details:", err);
      return { ok: false, status: 500, body: err?.message || String(err) };
    }
  };

  let tokenRes = await fetchToken(base);

  // Fallback automatique si 401 Unauthorized (inversion sandbox / live des clés)
  if (!tokenRes.ok && tokenRes.status === 401) {
    const altBase = base.includes('sandbox') ? PAYPAL_LIVE_API_BASE : PAYPAL_SANDBOX_API_BASE;
    console.warn(`[PayPal API] ⚠️ Erreur 401 sur ${base}, tentative de repli sur ${altBase}...`);
    const altRes = await fetchToken(altBase);
    if (altRes.ok && altRes.token) {
      tokenRes = altRes;
      console.log(`[PayPal API] ✅ Authentification réussie sur l'environnement alternatif : ${altBase}`);
    }
  }

  if (!tokenRes.ok || !tokenRes.token) {
    return null;
  }

  return { token: tokenRes.token, base: tokenRes.base };
}

/**
 * Validation cryptographique de la signature d'un webhook PayPal
 * Appelle l'endpoint officiel PayPal /v1/notifications/verify-webhook-signature
 */
async function verifyPayPalWebhookSignature(req, rawBody) {
  const webhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
  const authAlgo = req.headers['paypal-auth-algo'] || req.headers['PAYPAL-AUTH-ALGO'];
  const certUrl = req.headers['paypal-cert-url'] || req.headers['PAYPAL-CERT-URL'];
  const transmissionId = req.headers['paypal-transmission-id'] || req.headers['PAYPAL-TRANSMISSION-ID'];
  const transmissionSig = req.headers['paypal-transmission-sig'] || req.headers['PAYPAL-TRANSMISSION-SIG'];
  const transmissionTime = req.headers['paypal-transmission-time'] || req.headers['PAYPAL-TRANSMISSION-TIME'];

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { valid: false, reason: "En-têtes de signature cryptographique PayPal manquants." };
  }

  // Vérification de sécurité de l'URL du certificat (protection anti-SSRF)
  try {
    const parsedCert = new URL(certUrl);
    if (parsedCert.protocol !== 'https:' || !parsedCert.hostname.endsWith('.paypal.com')) {
      return { valid: false, reason: "URL de certificat non autorisée (doit provenir de *.paypal.com)." };
    }
  } catch (_) {
    return { valid: false, reason: "URL de certificat PayPal malformée." };
  }

  const authData = await getPayPalAccessToken();
  if (!authData) {
    console.warn('[PayPal Webhook] ⚠️ Impossible de vérifier la signature (PAYPAL_CLIENT_SECRET manquant sur le serveur).');
    return { valid: false, reason: "Identifiants API PayPal manquants sur le serveur pour vérifier la signature." };
  }

  const eventPayload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

  const verifyPayload = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: webhookId,
    webhook_event: eventPayload
  };

  try {
    const verifyRes = await fetch(`${authData.base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(verifyPayload)
    });

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return { valid: false, reason: `Échec API PayPal verify: ${verifyRes.status} ${errText}` };
    }

    const verifyData = await verifyRes.json();
    const isSuccess = verifyData.verification_status === 'SUCCESS';
    return {
      valid: isSuccess,
      status: verifyData.verification_status
    };
  } catch (err) {
    return { valid: false, reason: err?.message || "Erreur de validation de signature." };
  }
}

/**
 * Vérifie l'état d'un ordre auprès de l'API PayPal en mode direct
 */
async function verifyPayPalOrderWithApi(orderId, modeOverride = null) {
  const authData = await getPayPalAccessToken(modeOverride);
  if (!authData) return null;

  try {
    const res = await fetch(`${authData.base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      }
    });

    const rawText = await res.text();
    if (!res.ok) {
      console.warn(`[PayPal Verify Order] HTTP ${res.status} pour l'ordre ${orderId} sur ${authData.base}:`, rawText);
      return null;
    }

    return JSON.parse(rawText);
  } catch (err) {
    console.error('[PayPal Verify Order] Exception:', err);
    return null;
  }
}

/**
 * Crée un ordre de paiement auprès de l'API PayPal v2 (/v2/checkout/orders)
 * Respecte rigoureusement le schéma v2 officiel de PayPal, la devise autorisée (USD/EUR)
 * et le montant formaté en chaîne avec exactement 2 décimales.
 */
async function createPayPalOrderWithApi({ plan, amount, currency, description, modeOverride = null }) {
  const authData = await getPayPalAccessToken(modeOverride);
  if (!authData) {
    const hasId = Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID || process.env.PAYPAL_ID);
    const hasSecret = Boolean(process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET_KEY);
    const errorDetails = {
      message: "Variables d'environnement PayPal manquantes ou invalides (OAuth impossible sur le serveur)",
      hasClientId: hasId,
      hasSecret: hasSecret
    };
    console.error("PayPal Error Details:", errorDetails);
    return { ok: false, status: 503, error: errorDetails.message, details: errorDetails };
  }

  // 1. DEVISE & MONTANT (CRITIQUE) :
  // PayPal NE SUPPORTE PAS le FCFA / XAF / XOF.
  // Le payload doit impérativement déclarer une devise acceptée (ex: "USD" ou "EUR").
  const isYearly = plan === 'yearly';
  let targetCurrency = (currency || 'USD').toUpperCase().trim();
  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
  if (!supportedCurrencies.includes(targetCurrency) || targetCurrency === 'XOF' || targetCurrency === 'XAF') {
    targetCurrency = 'USD';
  }

  // La valeur (value) doit être une chaîne formatée avec exactement 2 décimales (ex: "1.99").
  // Ne jamais envoyer de valeur entière en FCFA (comme 1200) ni de float non arrondi.
  let numericVal = Number(amount);
  if (isNaN(numericVal) || numericVal <= 0) {
    numericVal = isYearly ? 15.99 : 1.99;
  } else if (numericVal >= 100 && targetCurrency === 'USD') {
    // Si un montant en FCFA (ex: 1200 ou 9600) a été envoyé par erreur avec USD
    numericVal = Number((numericVal / 600).toFixed(2));
    if (numericVal < 1.0) {
      numericVal = isYearly ? 15.99 : 1.99;
    }
  }
  const formattedValue = numericVal.toFixed(2);

  // 4. CODE ATTENDU DANS createOrder :
  // Schéma v2 strict attendu par PayPal
  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: targetCurrency,
          value: formattedValue
        },
        description: description || "Abonnement Éliciné Pro"
      }
    ]
  };

  try {
    console.log(`[PayPal API] 🚀 Création d'ordre sur ${authData.base}/v2/checkout/orders :`, JSON.stringify(orderPayload));
    const res = await fetch(`${authData.base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      },
      body: JSON.stringify(orderPayload)
    });

    const rawText = await res.text();
    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = { raw: rawText };
    }

    if (!res.ok) {
      // 3. GESTION DES LOGS D'ERREUR :
      // Logger la réponse exacte de l'API PayPal (notamment details ou message)
      console.error("PayPal Error Details:", data);
      return {
        ok: false,
        status: res.status,
        error: data?.message || data?.name || "Échec de création de l'ordre PayPal",
        details: data
      };
    }

    console.log(`[PayPal API] ✅ Ordre créé avec succès (${data.id}) sur ${authData.base}`);
    return { ok: true, status: 200, data };
  } catch (err) {
    console.error("PayPal Error Details:", err);
    return { ok: false, status: 500, error: err?.message || String(err) };
  }
}

/**
 * Capture un ordre auprès de l'API PayPal en mode direct (Server-side capture)
 */
async function capturePayPalOrderWithApi(orderId, modeOverride = null) {
  let authData = await getPayPalAccessToken(modeOverride);
  if (!authData) return null;

  try {
    console.log(`[PayPal Server] 🚀 Envoi de la capture pour l'ordre ${orderId} sur ${authData.base}/v2/checkout/orders/${orderId}/capture...`);
    const res = await fetch(`${authData.base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      }
    });

    const rawText = await res.text();
    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = { raw: rawText };
    }

    if (!res.ok) {
      console.error("PayPal Error Details:", data);

      // Si l'ordre est déjà capturé (capture préalable)
      if (data?.details?.some(d => d.issue === 'ORDER_ALREADY_CAPTURED') || data?.name === 'ORDER_ALREADY_CAPTURED') {
        console.log(`[PayPal Capture] Ordre ${orderId} déjà capturé, vérification du statut...`);
        return await verifyPayPalOrderWithApi(orderId, modeOverride);
      }

      // Si 404 RESOURCE_NOT_FOUND (mismatch sandbox / live)
      if (res.status === 404 || data?.name === 'RESOURCE_NOT_FOUND') {
        const altBaseMode = authData.base.includes('sandbox') ? 'live' : 'sandbox';
        console.warn(`[PayPal Capture] ⚠️ Ordre ${orderId} non trouvé sur ${authData.base}, test sur l'autre environnement (${altBaseMode})...`);
        const altAuth = await getPayPalAccessToken(altBaseMode);
        if (altAuth) {
          try {
            const altRes = await fetch(`${altAuth.base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${altAuth.token}`,
                'Content-Type': 'application/json'
              }
            });
            const altRaw = await altRes.text();
            if (altRes.ok) {
              console.log(`[PayPal Capture] ✅ Capture réussie sur l'environnement alternatif : ${altAuth.base}`);
              return JSON.parse(altRaw);
            } else {
              let altData;
              try { altData = JSON.parse(altRaw); } catch (_) { altData = { message: altRaw }; }
              console.error("PayPal Error Details:", altData);
            }
          } catch (altErr) {
            console.error("PayPal Error Details:", altErr);
          }
        }
      }

      return { failed: true, data, status: res.status };
    }

    return data;
  } catch (err) {
    console.error("PayPal Error Details:", err);
    return null;
  }
}

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

  // Extraction intelligente de l'action (support query param, body param et sous-chemin d'URL)
  let action = req.query?.action || (req.body?.action) || '';
  if (!action && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const pathname = parsedUrl.pathname;
      const subpath = pathname.replace(/^\/api\/paypal\/?/, '').split('/')[0];
      if (subpath) {
        action = subpath;
      }
    } catch (_) {}
  }

  // ─── 1. Récupération de la configuration publique PayPal ─────────────────────
  if (req.method === 'GET' || action === 'config') {
    const clientId = (
      process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
      process.env.PAYPAL_CLIENT_ID ||
      process.env.VITE_PAYPAL_CLIENT_ID ||
      ''
    ).trim();

    const businessId = (
      process.env.VITE_PAYPAL_BUSINESS_ID ||
      process.env.PAYPAL_BUSINESS_ID ||
      'ivanjoris959@gmail.com'
    ).trim();

    const mode = (
      process.env.PAYPAL_MODE ||
      process.env.NEXT_PUBLIC_PAYPAL_MODE ||
      process.env.VITE_PAYPAL_MODE ||
      'live'
    ).trim().toLowerCase();

    return res.status(200).json({
      success: true,
      clientId,
      businessId,
      mode,
      currency: 'USD',
      monthlyAmount: 1.99,
      yearlyAmount: 15.99,
      guestCheckout: {
        enabled: true,
        solutionType: 'Sole',
        landingPage: 'NO_PREFERENCE',
        shippingPreference: 'NO_SHIPPING',
        supportedCurrencies: ['USD', 'EUR', 'CAD', 'GBP', 'AUD']
      }
    });
  }

  // ─── 1.5. Création officielle d'un ordre PayPal v2 (/api/paypal/create-order) ─
  if (req.method === 'POST' && (action === 'create-order' || action === 'create')) {
    try {
      const { plan, amount, currency, description, mode } = req.body || {};
      const result = await createPayPalOrderWithApi({
        plan,
        amount,
        currency,
        description,
        modeOverride: mode
      });

      if (!result.ok) {
        return res.status(result.status || 400).json({
          success: false,
          error: result.error,
          details: result.details
        });
      }

      return res.status(200).json({
        success: true,
        id: result.data.id,
        orderId: result.data.id,
        status: result.data.status
      });
    } catch (createErr) {
      console.error("PayPal Error Details:", createErr);
      return res.status(500).json({
        success: false,
        error: createErr?.message || "Erreur interne lors de la création de l'ordre PayPal."
      });
    }
  }

  // ─── 2. Enregistrement sécurisé avec capture et vérification PayPal réelle ───
  if (req.method === 'POST' && (action === 'record-payment' || action === 'capture-order' || !action)) {
    try {
      const validation = paypalRecordPaymentSchema.safeParse(req.body || {});
      if (!validation.success) {
        console.error('[PayPal API] Validation schema échouée :', validation.error.format());
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
        details,
        mode: clientMode,
        env: clientEnv
      } = validation.data;

      const effectiveMode = clientMode || clientEnv || null;

      console.log(`[PayPal Server] 💳 Réception de l'ordre ${orderId} pour capture et activation Pro...`, {
        email,
        plan,
        amount,
        effectiveMode
      });

      // 1. TENTATIVE DE CAPTURE SERVEUR AUPRÈS DE L'API PAYPAL
      let orderData = await capturePayPalOrderWithApi(orderId, effectiveMode);
      if (!orderData) {
        orderData = await verifyPayPalOrderWithApi(orderId, effectiveMode);
      }

      // Si le serveur n'a pas pu joindre PayPal (identifiants serveur manquants ou indisponibilité)
      if (!orderData) {
        const hasId = Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID || process.env.PAYPAL_ID);
        const hasSecret = Boolean(process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET_KEY);
        console.error(`[PayPal Server] ❌ Impossible de vérifier ou capturer l'ordre ${orderId} auprès de l'API PayPal. Diagnostic: NEXT_PUBLIC_PAYPAL_CLIENT_ID=${hasId ? 'OK' : 'MANQUANT'}, PAYPAL_SECRET=${hasSecret ? 'OK' : 'MANQUANT'}`);
        return res.status(503).json({
          success: false,
          error: hasSecret 
            ? "Service de validation PayPal indisponible. La capture n'a pas pu être exécutée par le serveur."
            : "Service de validation PayPal non configuré (PAYPAL_SECRET manquant dans les variables d'environnement Vercel).",
          hasClientId: hasId,
          hasSecret: hasSecret,
          orderId
        });
      }

      // Si le serveur a pu contacter PayPal et que la transaction a été rejetée
      if (orderData?.failed) {
        const detailsList = orderData.data?.details || [];
        const firstDetail = detailsList[0] || {};
        const issue = firstDetail.issue || orderData.data?.name || 'TRANSACTION_REJECTED';
        const description = firstDetail.description || orderData.data?.message || '';

        let humanMsg = "La carte bancaire ou le paiement a été refusé par PayPal ou votre établissement financier.";
        if (issue === 'INSTRUMENT_DECLINED') {
          humanMsg = "Votre carte a été refusée par votre banque (fonds insuffisants, plafond atteint ou restriction de carte). Veuillez utiliser une autre carte ou votre solde PayPal.";
        } else if (issue === 'TRANSACTION_REFUSED') {
          humanMsg = "La transaction a été refusée par l'émetteur de votre carte bancaire.";
        } else if (issue === 'PAYER_ACTION_REQUIRED') {
          humanMsg = "Une authentification 3D-Secure auprès de votre banque est requise pour valider le paiement.";
        } else if (issue === 'PERMISSION_DENIED' || issue === 'NOT_AUTHORIZED' || orderData.data?.name === 'PERMISSION_DENIED') {
          humanMsg = "Le compte marchand PayPal n'autorise pas cette transaction ou les paiements par carte invités. Veuillez utiliser un compte PayPal ou contacter le support.";
        } else if (description) {
          humanMsg = `Paiement refusé : ${description}`;
        }

        console.error("PayPal Error Details:", orderData.data);
        console.error(`[PayPal Server] ❌ Rejet capture pour ordre ${orderId} (${issue}) :`, orderData.data);
        return res.status(402).json({
          success: false,
          error: humanMsg,
          issue,
          details: orderData.data
        });
      }

      // VÉRIFICATION STRICTE DU STATUT RÉEL : Doit être obligatoirement COMPLETED
      const effectiveStatus = String(
        orderData?.status || 
        orderData?.purchase_units?.[0]?.payments?.captures?.[0]?.status || 
        ''
      ).toUpperCase();

      console.log(`[PayPal Server] Statut effectif de capture pour l'ordre ${orderId} : ${effectiveStatus}`);

      // CONDITION STRICTE ABSOLUE : SI ET SEULEMENT SI le statut est 'COMPLETED'
      if (effectiveStatus !== 'COMPLETED') {
        console.error(`[PayPal Server] ⛔ Refus d'activation : statut '${effectiveStatus}' non complété pour l'ordre ${orderId}`);
        return res.status(402).json({
          success: false,
          error: `Le paiement n'a pas été capturé par PayPal (Statut : ${effectiveStatus || 'NON_CAPTURÉ'}). Aucun débit effectué.`,
          status: effectiveStatus,
          orderId
        });
      }

      const targetSubId = subscriptionId || `sub_paypal_${orderId}`;
      let cleanEmail = (email || orderData?.payer?.email_address || '').trim().toLowerCase();
      
      // Si email manquant dans la requête, tenter la récupération depuis le profil Supabase
      if ((!cleanEmail || !cleanEmail.includes('@')) && userId && supabaseAdmin) {
        try {
          const { data: userProf } = await supabaseAdmin.from('profiles').select('email').eq('id', userId).maybeSingle();
          if (userProf?.email) {
            cleanEmail = userProf.email.trim().toLowerCase();
          }
        } catch (_) {}
      }

      const payerName = customerName || (orderData?.payer?.name?.given_name ? `${orderData.payer.name.given_name} ${orderData.payer.name.surname || ''}`.trim() : 'Cinéphile Pro');
      const captureUnit = orderData?.purchase_units?.[0]?.payments?.captures?.[0] || orderData?.purchase_units?.[0];
      let numericAmount = captureUnit?.amount?.value ? Number(captureUnit.amount.value) : Number(amount || (plan === 'yearly' ? 15.99 : 1.99));
      let effectiveCurrency = captureUnit?.amount?.currency_code || currency || 'USD';

      // Sécurité anti-bug conversion FCFA sur le serveur : si le montant en USD est >= 100, il s'agit d'un montant brut en FCFA (ex: 1200)
      if (effectiveCurrency === 'USD' && numericAmount >= 100) {
        console.warn(`[PayPal Server] ⚠️ Montant anormalement élevé détecté (${numericAmount} USD). Conversion FCFA -> USD (taux 600)...`);
        numericAmount = Number((numericAmount / 600).toFixed(2));
      }

      const isDonation = (
        (validation.data.plan === 'donation' || validation.data.plan === 'don') ||
        String(orderData?.purchase_units?.[0]?.description || '').toLowerCase().includes('don') ||
        String(req.body?.itemType || req.body?.type || '').toLowerCase() === 'donation' ||
        (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(validation.data.plan))
      );

      // ACTIVATION CENTRALE SUPABASE (profiles.is_pro = true & subscriptions.status = active) + Email Resend
      const activationResult = await activateUserPassPro(cleanEmail, {
        plan: isDonation ? 'donation' : (plan || 'monthly'),
        customerName: payerName,
        amount: numericAmount,
        currency: effectiveCurrency,
        gateway: 'paypal',
        paymentReference: orderId,
        subscriptionId: targetSubId,
        isDonation,
        userId
      });

      console.log(`[PayPal Server] 👑 Capture COMPLETED et Activation Pro réussie en base pour ${cleanEmail} (ordre ${orderId}) :`, activationResult);

      return res.status(200).json({
        success: true,
        isPro: true,
        status: 'COMPLETED',
        message: "Paiement PayPal validé et capturé avec succès ! Votre Pass Pro est actif.",
        subscriptionId: targetSubId,
        orderId,
        activation: activationResult
      });
    } catch (err) {
      console.error('[PayPal Server Exception]:', err);
      return res.status(500).json({
        success: false,
        error: "Erreur interne lors de la vérification du paiement PayPal."
      });
    }
  }

  // ─── 3. Webhook Officiel PayPal Sécurisé ───────────────────────────────────────
  // Déclenche l'activation Pro UNIQUEMENT après validation cryptographique et confirmation de paiement réel
  if (req.method === 'POST' && action === 'webhook') {
    try {
      const event = req.body || {};
      const eventType = String(event.event_type || '').toUpperCase();
      console.log(`[PayPal Webhook] 📩 Événement reçu : ${eventType}`);

      // 3.A. Validation Cryptographique de la Signature PayPal
      const signatureCheck = await verifyPayPalWebhookSignature(req, req.body);
      if (!signatureCheck.valid) {
        console.error('[PayPal Webhook] ⛔ Signature cryptographique rejetée :', signatureCheck.reason);
        return res.status(401).json({
          success: false,
          error: "Signature du webhook PayPal invalide ou non authentifiée.",
          details: signatureCheck.reason
        });
      }

      console.log('[PayPal Webhook] ✅ Signature cryptographique validée avec succès par PayPal API.');

      // 3.B. Gestion des événements de succès de paiement réel (Débit bancaire effectif)
      const isRealPaymentSuccess = (
        eventType === 'PAYMENT.SALE.COMPLETED' ||
        eventType === 'PAYMENT.CAPTURE.COMPLETED'
      );

      if (isRealPaymentSuccess) {
        const resource = event.resource || {};
        const orderId = resource.id || resource.supplementary_data?.related_ids?.order_id || `pp_${Date.now()}`;
        
        // Extraction de l'email PayPal
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

        const purchaseDesc = String(
          resource.purchase_units?.[0]?.description ||
          resource.purchase_units?.[0]?.items?.[0]?.name ||
          resource.custom_id ||
          ''
        ).toLowerCase();
        const isDonation = purchaseDesc.includes('don') || purchaseDesc.includes('soutien') || purchaseDesc.includes('tip');

        if (payerEmail) {
          console.log(`[PayPal Webhook] 👑 Activation du Pass Pro pour ${payerEmail} (Réf: ${orderId}, Montant: ${amountValue} ${currencyCode})`);
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

      // 3.C. Gestion des échecs, rejets et insuffisances de solde
      const isPaymentFailure = (
        eventType === 'PAYMENT.SALE.DENIED' ||
        eventType === 'PAYMENT.CAPTURE.DENIED' ||
        eventType === 'PAYMENT.CAPTURE.DECLINED' ||
        eventType === 'PAYMENT.SALE.REVERSED' ||
        eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
      );

      if (isPaymentFailure) {
        const resource = event.resource || {};
        const failedEmail = (
          resource.payer?.email_address ||
          resource.customer_email ||
          event.payer_email ||
          ''
        ).trim().toLowerCase();

        console.warn(`[PayPal Webhook] ❌ Échec ou refus de prélèvement pour ${failedEmail || 'inconnu'} (${eventType})`);

        if (failedEmail && supabaseAdmin) {
          await supabaseAdmin
            .from('profiles')
            .update({ is_pro: false, updated_at: new Date().toISOString() })
            .ilike('email', failedEmail);

          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('email', failedEmail);
        }
      }

      return res.status(200).json({ success: true, received: true, eventType });
    } catch (whErr) {
      console.error('[PayPal Webhook Exception]:', whErr);
      return res.status(500).json({ success: false, error: 'Erreur interne traitement webhook PayPal' });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
