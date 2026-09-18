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
    const { orderId, userId, email, customerName, plan, amount, currency } = body;

    if (!orderId || typeof orderId !== "string" || orderId.trim().length < 3) {
      return new Response(JSON.stringify({
        success: false,
        error: "Identifiant de commande PayPal (orderId) manquant ou invalide."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[Edge Function capture-paypal] Réception ordre ${orderId} pour capture serveur...`);

    // 1. Authentification auprès de l'API PayPal
    const clientId = (Deno.env.get("PAYPAL_CLIENT_ID") || Deno.env.get("VITE_PAYPAL_CLIENT_ID") || "").trim();
    const clientSecret = (Deno.env.get("PAYPAL_CLIENT_SECRET") || "").trim();
    const mode = (Deno.env.get("PAYPAL_MODE") || "live").toLowerCase().trim();
    const base = mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

    if (!clientId || !clientSecret) {
      console.error("[Edge Function capture-paypal] ❌ PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET manquant.");
      return new Response(JSON.stringify({
        success: false,
        error: "Identifiants PayPal serveur non configurés."
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Edge Function capture-paypal] Échec OAuth2 PayPal:", tokenRes.status, errText);
      return new Response(JSON.stringify({
        success: false,
        error: "Échec de l'authentification avec l'API PayPal."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Exécution de la capture des fonds côté serveur
    const captureRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    let captureData = await captureRes.json().catch(() => ({}));

    // Si déjà capturé, vérifier le statut existant
    if (!captureRes.ok) {
      if (captureData?.details?.some((d: any) => d.issue === "ORDER_ALREADY_CAPTURED")) {
        console.log(`[Edge Function capture-paypal] Ordre ${orderId} déjà capturé, vérification statut...`);
        const verifyRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });
        captureData = await verifyRes.json().catch(() => ({}));
      } else {
        const issue = captureData?.details?.[0]?.issue || captureData?.name || "TRANSACTION_REJECTED";
        let humanMsg = "La carte bancaire ou la transaction a été refusée par PayPal.";
        if (issue === "INSTRUMENT_DECLINED") {
          humanMsg = "Votre carte a été refusée par votre banque (solde insuffisant, plafond atteint ou restriction).";
        } else if (issue === "PAYER_ACTION_REQUIRED") {
          humanMsg = "Une vérification 3D-Secure auprès de votre banque est requise pour valider le paiement.";
        }
        console.error(`[Edge Function capture-paypal] ❌ Échec capture pour ordre ${orderId}:`, captureData);
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

    // 3. Conditionnement strict de l'activation : status === 'COMPLETED'
    const status = String(
      captureData?.status ||
      captureData?.purchase_units?.[0]?.payments?.captures?.[0]?.status ||
      ""
    ).toUpperCase();

    console.log(`[Edge Function capture-paypal] Statut officiel PayPal pour ordre ${orderId} : ${status}`);

    if (status !== "COMPLETED") {
      console.error(`[Edge Function capture-paypal] ⛔ Refus d'activation : statut '${status}' non complété`);
      return new Response(JSON.stringify({
        success: false,
        error: `Le paiement n'a pas été capturé par PayPal (Statut : ${status || 'NON_CAPTURÉ'}). Aucun débit effectué.`,
        status,
        orderId
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Mise à jour de la base de données Supabase (Service Role)
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "").trim();
    const supabaseKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Edge Function capture-paypal] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
      return new Response(JSON.stringify({
        success: false,
        error: "Configuration base de données serveur manquante."
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
      // Mise à jour de profiles (is_pro = true)
      await supabase
        .from("profiles")
        .update({
          is_pro: true,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .ilike("email", cleanEmail);

      // Enregistrement dans subscriptions (status = 'active')
      await supabase
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
    }

    // 5. Envoi d'email via Resend si clé présente
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
                <p><strong>Référence :</strong> ${orderId}</p>
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
        console.warn("[Edge Function capture-paypal] Note envoi e-mail:", mailErr);
      }
    }

    console.log(`[Edge Function capture-paypal] 👑 Succès : compte ${cleanEmail} activé Pro (ordre ${orderId})`);

    // 6. Signal de succès au frontend pour afficher la modale de bienvenue
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
    console.error("[Edge Function capture-paypal] Exception:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || "Erreur interne serveur lors de la capture PayPal."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
