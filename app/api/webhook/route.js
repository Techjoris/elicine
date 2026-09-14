import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialisation du client Supabase administrateur (contourne les RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req) {
  try {
    const body = await req.json();

    // Récupération de l'e-mail de l'acheteur
    const email = body?.email || body?.data?.email || body?.customer_email || body?.payer_email;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Email de l’acheteur manquant ou invalide.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // Mise à jour du profil utilisateur dans la table profiles
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        is_pro: true,
        updated_at: new Date().toISOString()
      })
      .eq('email', cleanEmail);

    if (error) {
      console.error('[Webhook Supabase Error]:', error);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du profil utilisateur.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Webhook Internal Error]:', err);
    return NextResponse.json(
      { error: 'Erreur interne du serveur lors du traitement du webhook.' },
      { status: 500 }
    );
  }
}
