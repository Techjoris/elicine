-- ==============================================================================
-- Migration & Sécurisation Supabase pour Éliciné (Master Admin & RLS)
-- E-mail Master Admin : ivanjoris959@gmail.com
-- ==============================================================================

-- 1. Ajout des colonnes d'administration et rôles sur la table profiles si nécessaires
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_pro') THEN
    ALTER TABLE public.profiles ADD COLUMN is_pro BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. Attribution automatique et permanente des droits Master Admin pour ivanjoris959@gmail.com
UPDATE public.profiles
SET 
  role = 'admin',
  is_admin = true,
  is_pro = true,
  updated_at = NOW()
WHERE email = 'ivanjoris959@gmail.com';

-- 3. Fonction & Trigger automatique lors de toute nouvelle inscription
CREATE OR REPLACE FUNCTION public.handle_admin_role_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'email est l'adresse du créateur / master admin
  IF LOWER(NEW.email) = 'ivanjoris959@gmail.com' THEN
    NEW.role := 'admin';
    NEW.is_admin := true;
    NEW.is_pro := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Suppression du trigger s'il existe déjà pour réapplication propre
DROP TRIGGER IF EXISTS tr_assign_admin_role ON public.profiles;

CREATE TRIGGER tr_assign_admin_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_admin_role_assignment();

-- 4. Configuration Row Level Security (RLS) pour la console d'administration
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre à l'administrateur principal de tout lire et modifier
DROP POLICY IF EXISTS "Admin Full Access Profiles" ON public.profiles;
CREATE POLICY "Admin Full Access Profiles"
ON public.profiles
FOR ALL
USING (
  auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com' 
  OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

DROP POLICY IF EXISTS "Admin Full Access Subscriptions" ON public.subscriptions;
CREATE POLICY "Admin Full Access Subscriptions"
ON public.subscriptions
FOR ALL
USING (
  auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com' 
  OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);
