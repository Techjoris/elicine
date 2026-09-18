// Edge Function Supabase: capture-paypal
// Rôle: Capture sécurisée server-side d'un ordre PayPal via /v2/checkout/orders/{orderID}/capture
// Condition stricte: Mise à jour is_pro = true UNIQUEMENT si le statut retourné est COMPLETED

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, userId, email, customerName, plan, amount, currency, mode: clientMode } = body;

    if (!orderId || typeof orderId !== "string" || orderId.trim().length < 3) {
      console.error("[Edge Function capture-paypal] ❌ orderId manquant ou invalide dans le body :", body);
      return new Response(JSON.stringify({
        success: false,
        error: "Identifiant de commande PayPal (orderId) manquant ou invalide."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[Edge Function capture-paypal] 💳 Réception ordre ${orderId} pour capture serveur...`, {
      userId,
      email,
      plan,
      amount,
      clientMode
    });

    // 1. Récupération des identifiants et variables d'environnement Supabase
    const clientId = (
      Deno.env.get("NEXT_PUBLIC_PAYPAL_CLIENT_ID") ||
      Deno.env.get("PAYPAL_CLIENT_ID") ||
      Deno.env.get("VITE_PAYPAL_CLIENT_ID") ||
      Deno.env.get("PAYPAL_ID") ||
      ""
    ).trim();

    // Support prioritaire de PAYPAL_SECRET (recommandé)
    const clientSecret = (
      Deno.env.get("PAYPAL_SECRET") ||
      Deno.env.get("PAYPAL_CLIENT_SECRET") ||
      Deno.env.get("PAYPAL_SECRET_KEY") ||
      ""
    ).trim();

    // URL de production stricte (LIVE)
    const base = "https://api-m.paypal.com";

    console.log(`[Edge Function capture-paypal] Configuration PayPal : Mode=LIVE (${base}), ClientID=${clientId ? clientId.substring(0, 8) + '...' : 'MANQUANT'}, Secret=${clientSecret ? 'PRÉSENT (' + clientSecret.length + ' chars)' : 'MANQUANT'}`);

    if (!clientId || !clientSecret) {
      console.error("[Edge Function capture-paypal] ❌ Variables d'environnement manquantes : PAYPAL_CLIENT_ID ou PAYPAL_SECRET non trouvé dans Deno.env.");
      return new Response(JSON.stringify({
        success: false,
        error: "Identifiants PayPal serveur non configurés. Veuillez définir PAYPAL_CLIENT_ID et PAYPAL_SECRET dans les secrets Supabase.",
        hasClientId: Boolean(clientId),
        hasSecret: Boolean(clientSecret)
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Authentification OAuth2 obligatoire (/v1/oauth2/token)
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    let accessToken = "";

    const fetchTokenForBase = async (apiBase: string) => {
      try {
        console.log(`[Edge Function capture-paypal] 🔑 Demande de token OAuth2 sur ${apiBase}/v1/oauth2/token...`);
        const res = await fetch(`${apiBase}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: "grant_type=client_credentials"
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.error(`[Edge Function capture-paypal] ❌ Échec OAuth2 PayPal (HTTP ${res.status}) sur ${apiBase}/v1/oauth2/token :`, errBody);
          return { ok: false, status: res.status, body: errBody };
        }

        const data = await res.json();
        return { ok: true, token: data.access_token };
      } catch (err: any) {
        console.error(`[Edge Function capture-paypal] ❌ Exception réseau OAuth2 sur ${apiBase} :`, err);
        return { ok: false, status: 500, body: err?.message || String(err) };
      }
    };

    let tokenResult = await fetchTokenForBase(base);

    // Repli automatique d'environnement en cas d'erreur 401 (si identifiants sandbox vs live inversés)
    if (!tokenResult.ok && tokenResult.status === 401) {
      const fallbackBase = isSandbox ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      console.warn(`[Edge Function capture-paypal] ⚠️ Erreur 401 sur ${base}, essai automatique sur environnement alternatif : ${fallbackBase}`);
      const fallbackToken = await fetchTokenForBase(fallbackBase);
      if (fallbackToken.ok && fallbackToken.token) {
        tokenResult = fallbackToken;
        base = fallbackBase;
        console.log(`[Edge Function capture-paypal] ✅ Authentification réussie sur l'environnement alternatif : ${base}`);
      }
    }

    if (!tokenResult.ok || !tokenResult.token) {
      console.error("[Edge Function capture-paypal] ❌ Impossible d'obtenir un access_token PayPal valide.");
      return new Response(JSON.stringify({
        success: false,
        error: `Échec d'authentification auprès de l'API PayPal (HTTP ${tokenResult.status}).`,
        rawError: tokenResult.body
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    accessToken = tokenResult.token;

    // 3. Exécution de la capture réelle des fonds (/v2/checkout/orders/{orderID}/capture)
    console.log(`[Edge Function capture-paypal] 🚀 Envoi de la capture pour l'ordre ${orderId} sur ${base}/v2/checkout/orders/${orderId}/capture...`);
    
    let captureRes: Response;
    try {
      captureRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
    } catch (netErr: any) {
      console.error(`[Edge Function capture-paypal] ❌ Erreur réseau lors de la capture de l'ordre ${orderId} :`, netErr);
      return new Response(JSON.stringify({
        success: false,
        error: `Erreur réseau lors de la communication avec PayPal: ${netErr?.message || netErr}`
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawCaptureText = await captureRes.text();
    let captureData: any = {};
    try {
      captureData = JSON.parse(rawCaptureText);
    } catch (_) {
      captureData = { raw: rawCaptureText };
    }

    if (!captureRes.ok) {
      console.error(`[Edge Function capture-paypal] ❌ Erreur retournée par PayPal Capture (HTTP ${captureRes.status}) pour ordre ${orderId} :`, rawCaptureText);

      // Cas 1 : Ordre déjà capturé précédemment
      const isAlreadyCaptured = 
        captureData?.details?.some((d: any) => d.issue === "ORDER_ALREADY_CAPTURED") ||
        captureData?.name === "ORDER_ALREADY_CAPTURED";

      if (isAlreadyCaptured) {
        console.log(`[Edge Function capture-paypal] ℹ️ L'ordre ${orderId} a déjà été capturé. Vérification de l'état actuel auprès de PayPal...`);
        try {
          const verifyRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });
          const rawVerifyText = await verifyRes.text();
          if (verifyRes.ok) {
            captureData = JSON.parse(rawVerifyText);
          } else {
            console.error(`[Edge Function capture-paypal] ❌ Échec vérification ordre existant (HTTP ${verifyRes.status}) :`, rawVerifyText);
          }
        } catch (verifyErr) {
          console.error(`[Edge Function capture-paypal] ❌ Exception vérification ordre ${orderId} :`, verifyErr);
        }
      } 
      // Cas 2 : Mauvais environnement (ex: ordre créé en Sandbox mais capturé en Live, ou inversement -> 404 RESOURCE_NOT_FOUND)
      else if (captureRes.status === 404 || captureData?.name === "RESOURCE_NOT_FOUND") {
        const altBase = isSandbox ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
        console.warn(`[Edge Function capture-paypal] ⚠️ Ordre non trouvé sur ${base}. Tentative sur l'environnement alternatif ${altBase}...`);
        const altTokenResult = await fetchTokenForBase(altBase);
        if (altTokenResult.ok && altTokenResult.token) {
          try {
            const altCaptureRes = await fetch(`${altBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${altTokenResult.token}`,
                "Content-Type": "application/json"
              }
            });
            const altRawText = await altCaptureRes.text();
            if (altCaptureRes.ok) {
              captureData = JSON.parse(altRawText);
              base = altBase;
              console.log(`[Edge Function capture-paypal] ✅ Capture réussie sur l'environnement alternatif : ${altBase}`);
            } else {
              console.error(`[Edge Function capture-paypal] ❌ Échec également sur ${altBase} (HTTP ${altCaptureRes.status}) :`, altRawText);
            }
          } catch (altErr) {
            console.error(`[Edge Function capture-paypal] ❌ Exception sur ${altBase} :`, altErr);
          }
        }
      }
      // Cas 3 : Rejet bancaire ou carte refusée
      else {
        const detailsList = captureData?.details || [];
        const firstDetail = detailsList[0] || {};
        const issue = firstDetail.issue || captureData?.name || "TRANSACTION_REJECTED";
        const description = firstDetail.description || captureData?.message || "";

        let humanMsg = "La carte bancaire ou le paiement a été refusé par PayPal ou votre banque.";
        if (issue === "INSTRUMENT_DECLINED") {
          humanMsg = "Votre carte a été refusée par votre banque (solde insuffisant, plafond atteint ou restriction). Veuillez utiliser une autre carte ou votre solde PayPal.";
        } else if (issue === "PAYER_ACTION_REQUIRED") {
          humanMsg = "Une vérification 3D-Secure auprès de votre établissement bancaire est requise.";
        } else if (issue === "TRANSACTION_REFUSED") {
          humanMsg = "La transaction a été refusée par l'émetteur de votre carte.";
        } else if (description) {
          humanMsg = `Paiement refusé : ${description}`;
        }

        return new Response(JSON.stringify({
          success: false,
          error: humanMsg,
          issue,
          details: captureData
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 4. Conditionnement strict de l'activation : status === 'COMPLETED'
    const status = String(
      captureData?.status ||
      captureData?.purchase_units?.[0]?.payments?.captures?.[0]?.status ||
      ""
    ).toUpperCase();

    console.log(`[Edge Function capture-paypal] 📋 Statut officiel PayPal pour ordre ${orderId} : ${status}`);

    if (status !== "COMPLETED") {
      console.error(`[Edge Function capture-paypal] ⛔ Refus d'activation : statut '${status}' non complété. Aucun privilège accordé.`);
      return new Response(JSON.stringify({
        success: false,
        error: `Le paiement n'a pas été capturé par PayPal (Statut : ${status || 'NON_CAPTURÉ'}). Aucun débit effectué.`,
        status,
        orderId,
        details: captureData
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. Mise à jour de la base de données Supabase (Service Role)
    const supabaseUrl = (
      Deno.env.get("SUPABASE_URL") ||
      Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ||
      "https://xwhrxtzbxvakqjlajjlc.supabase.co"
    ).trim();

    const supabaseKey = (
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      ""
    ).trim();

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Edge Function capture-paypal] ❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
      return new Response(JSON.stringify({
        success: false,
        error: "Configuration base de données serveur manquante (SUPABASE_SERVICE_ROLE_KEY).",
        status: "COMPLETED",
        orderId
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const cleanEmail = (email || captureData?.payer?.email_address || "").trim().toLowerCase();
    const cleanName = customerName || (captureData?.payer?.name?.given_name ? `${captureData.payer.name.given_name} ${captureData.payer.name.surname || ''}`.trim() : 'Cinéphile Pro');
    const isYearly = plan === "yearly";
    const durationDays = isYearly ? 365 : 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const targetSubId = `sub_paypal_${orderId}`;

    if (cleanEmail) {
      console.log(`[Edge Function capture-paypal] 👑 Activation du Pass Pro pour ${cleanEmail}...`);
      // Mise à jour de la table profiles (is_pro = true)
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          is_pro: true,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .ilike("email", cleanEmail);

      if (profileErr) {
        console.warn("[Edge Function capture-paypal] Note mise à jour profiles :", profileErr);
      }

      // Enregistrement dans subscriptions (status = 'active')
      const { error: subErr } = await supabase
        .from("subscriptions")
        .upsert({
          id: targetSubId,
          user_id: userId || `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: cleanEmail,
          customer_name: cleanName,
          plan: isYearly ? "yearly" : "monthly",
          amount: Number(amount || (isYearly ? 15.99 : 1.99)),
          currency: (currency || "USD").toUpperCase(),
          status: "active",
          payment_reference: orderId,
          payment_provider: "paypal",
          terms_accepted: true,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (subErr) {
        console.warn("[Edge Function capture-paypal] Note upsert subscriptions :", subErr);
      }
    }

    // 6. Envoi de l'e-mail de bienvenue via Resend si configuré
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && cleanEmail) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Éliciné <support@elicine.app>",
            to: [cleanEmail],
            subject: "👑 Bienvenue dans Éliciné Pro ! Vos fonctionnalités illimitées sont actives",
            html: `
              <div style="font-family: sans-serif; padding: 24px; color: #1e293b;">
                <h1 style="color: #0284c7;">Bienvenue dans Éliciné Pro, ${cleanName} !</h1>
                <p>Votre paiement a été validé et capturé avec succès par PayPal.</p>
                <p><strong>Référence de transaction :</strong> ${orderId}</p>
                <p><strong>Formule :</strong> ${isYearly ? 'Pass Pro Annuel (365 jours)' : 'Pass Pro Mensuel (30 jours)'}</p>
                <p><strong>Expiration :</strong> ${new Date(expiresAt).toLocaleDateString('fr-FR')}</p>
                <p>Profitez dès maintenant de vos recherches IA illimitées et de vos alertes de sorties de films !</p>
                <p style="margin-top: 24px; font-size: 12px; color: #64748b;">Éliciné - Le moteur de recherche cinéma intelligent</p>
              </div>
            `
          })
        });
        console.log(`[Edge Function capture-paypal] ✉️ E-mail de confirmation envoyé à ${cleanEmail}`);
      } catch (mailErr) {
        console.warn("[Edge Function capture-paypal] Note envoi e-mail :", mailErr);
      }
    }

    console.log(`[Edge Function capture-paypal] ✅ Terminé avec succès : compte ${cleanEmail} activé Pro (ordre ${orderId})`);

    // 7. Signal de succès au frontend pour afficher la modale de bienvenue
    return new Response(JSON.stringify({
      success: true,
      isPro: true,
      status: "COMPLETED",
      orderId,
      subscriptionId: targetSubId,
      message: "Capture PayPal validée et Pass Pro activé avec succès !"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[Edge Function capture-paypal] ❌ Exception non interceptée :", err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || "Erreur interne serveur lors de la capture PayPal."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
