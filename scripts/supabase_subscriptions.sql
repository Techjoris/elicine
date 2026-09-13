-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Schéma SQL pour la table des souscriptions Pro (Supabase)
-- Exécutez ce script dans l'éditeur SQL de votre Dashboard Supabase.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Création de la table des souscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  customer_name TEXT,
  phone TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  currency TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'active', 'cancelled', 'expired')),
  payment_reference TEXT,
  payment_provider TEXT DEFAULT 'saspay',
  terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Index pour recherches rapides par utilisateur, email et statut
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON public.subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 3. Activation de Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Politiques de sécurité (Lecture/Écriture pour utilisateurs authentifiés et service)
CREATE POLICY "Les utilisateurs peuvent lire leurs propres souscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid()::text = user_id OR email = auth.jwt()->>'email');

CREATE POLICY "Création et mise à jour des souscriptions autorisée"
  ON public.subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
