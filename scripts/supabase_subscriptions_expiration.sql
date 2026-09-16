-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Migration Supabase : Durée d'abonnement Pro (30 jours),
-- Colonnes d'expiration, Rétrogradation automatique & Suivi des relances e-mail.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Ajout des colonnes de gestion temporelle dans la table `profiles`
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pass_status TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

-- 2. Ajout des colonnes d'expiration dans la table `subscriptions`
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- 3. Index optimisés pour les requêtes de vérification d'expiration & relances
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro_expires_at ON public.profiles(is_pro, expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_email_is_pro ON public.profiles(email, is_pro);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expires_at ON public.subscriptions(status, expires_at);

-- 4. Fonction PostgreSQL : Rétrogradation automatique des abonnements expirés
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS TABLE (
  downgraded_profiles_count INT,
  downgraded_subscriptions_count INT
) AS $$
DECLARE
  v_profiles_count INT := 0;
  v_subs_count INT := 0;
BEGIN
  -- A. Rétrogradation dans la table profiles (sauf compte créateur/fondateur)
  WITH updated_profiles AS (
    UPDATE public.profiles
    SET 
      is_pro = FALSE,
      pass_status = 'free',
      updated_at = NOW()
    WHERE is_pro = TRUE
      AND LOWER(email) != 'ivanjoris959@gmail.com'
      AND (
        (expires_at IS NOT NULL AND expires_at < NOW())
        OR (pro_expires_at IS NOT NULL AND pro_expires_at < NOW())
        OR (subscription_ends_at IS NOT NULL AND subscription_ends_at < NOW())
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_profiles_count FROM updated_profiles;

  -- B. Marquage 'expired' dans la table subscriptions
  WITH updated_subs AS (
    UPDATE public.subscriptions
    SET 
      status = 'expired',
      updated_at = NOW()
    WHERE status = 'active'
      AND LOWER(email) != 'ivanjoris959@gmail.com'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_subs_count FROM updated_subs;

  RETURN QUERY SELECT v_profiles_count, v_subs_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Vue pratique pour inspecter les jours restants de chaque abonné Pro
CREATE OR REPLACE VIEW public.vw_pro_subscribers_status AS
SELECT 
  id,
  email,
  username,
  is_pro,
  pass_status,
  expires_at,
  COALESCE(expires_at, pro_expires_at, subscription_ends_at) AS effective_expires_at,
  CASE 
    WHEN LOWER(email) = 'ivanjoris959@gmail.com' THEN 'Illimité (Fondateur)'
    WHEN COALESCE(expires_at, pro_expires_at, subscription_ends_at) IS NULL THEN 'Indéterminé'
    WHEN COALESCE(expires_at, pro_expires_at, subscription_ends_at) < NOW() THEN 'Expiré'
    ELSE CONCAT(
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(expires_at, pro_expires_at, subscription_ends_at) - NOW())) / 86400)), 
      ' jour(s) restant(s)'
    )
  END AS remaining_status,
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(expires_at, pro_expires_at, subscription_ends_at) - NOW())) / 86400))::INT AS days_remaining,
  last_reminder_sent_at,
  updated_at
FROM public.profiles
WHERE is_pro = TRUE;

-- 6. Droit d'exécution pour le rôle authentifié et le rôle de service (Service Role)
GRANT EXECUTE ON FUNCTION public.downgrade_expired_subscriptions() TO authenticated, service_role;
