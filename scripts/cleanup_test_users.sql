-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Nettoyage Définitif des Utilisateurs de Test / Fictifs
-- ══════════════════════════════════════════════════════════════════════════════
-- Ce script identifie et supprime en cascade tous les comptes de test
-- (ex: Sarah K., Alexandre Marcus, Mouloud B., Claire Girard, comptes test)
-- tout en protégeant de manière STRICTE les comptes administrateurs réels.
--
-- Exécutez ce script dans l'éditeur SQL de votre Dashboard Supabase :
-- https://supabase.com/dashboard/project/xwhrxtzbxvakqjlajjlc/sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Message de démarrage
DO $$
BEGIN
  RAISE NOTICE '>>> Démarrage du nettoyage sécurisé des utilisateurs de test Éliciné...';
END $$;

-- 2. Création d'une table temporaire des utilisateurs ciblés pour suppression
CREATE TEMP TABLE temp_users_to_delete AS
SELECT DISTINCT id, email
FROM (
  -- Recherche dans public.profiles
  SELECT id::text, email 
  FROM public.profiles
  WHERE LOWER(email) IN (
    'sarah.k@cinema.fr',
    'alex.marcus@gmail.com',
    'mouloud.b@orange.fr',
    'claire.girard@yahoo.com'
  )
  OR LOWER(email) LIKE '%@cinema.fr'
  OR LOWER(email) LIKE 'test_%@%'
  OR LOWER(email) LIKE '%_test@%'
  OR LOWER(email) LIKE 'seed_%@%'
  OR id LIKE 'usr_seed_%'
  
  UNION
  
  -- Recherche dans auth.users
  SELECT id::text, email
  FROM auth.users
  WHERE LOWER(email) IN (
    'sarah.k@cinema.fr',
    'alex.marcus@gmail.com',
    'mouloud.b@orange.fr',
    'claire.girard@yahoo.com'
  )
  OR LOWER(email) LIKE '%@cinema.fr'
  OR LOWER(email) LIKE 'test_%@%'
  OR LOWER(email) LIKE '%_test@%'
  OR LOWER(email) LIKE 'seed_%@%'
) targets
-- 🛡️ PROTECTION ABSOLUE ET INCONDITIONNELLE DES COMPTES RÉELS / FONDATEURS :
WHERE LOWER(email) NOT IN (
  'ivanjoris959@gmail.com',
  'techjoris@gmail.com',
  'admin@elicine.app',
  'joris@elicine.app'
)
AND email IS NOT NULL;

-- 3. Suppression en cascade dans les tables dépendantes publiques
-- a. Table des souscriptions (public.subscriptions)
DELETE FROM public.subscriptions
WHERE LOWER(email) IN (SELECT LOWER(email) FROM temp_users_to_delete WHERE email IS NOT NULL)
   OR user_id IN (SELECT id FROM temp_users_to_delete);

-- b. Table des recherches & quotas quotidiens (public.user_searches)
DELETE FROM public.user_searches
WHERE user_id IN (SELECT id FROM temp_users_to_delete);

-- c. Table des profils utilisateurs (public.profiles)
DELETE FROM public.profiles
WHERE id IN (SELECT id FROM temp_users_to_delete)
   OR LOWER(email) IN (SELECT LOWER(email) FROM temp_users_to_delete WHERE email IS NOT NULL);

-- 4. Suppression des comptes dans la table d'authentification Supabase (auth.users)
DELETE FROM auth.users
WHERE id IN (
  SELECT id::uuid FROM temp_users_to_delete 
  WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
OR LOWER(email) IN (SELECT LOWER(email) FROM temp_users_to_delete WHERE email IS NOT NULL);

-- 5. Bilan et affichage des comptes restants
DO $$
DECLARE
  v_remaining_profiles INTEGER;
  v_remaining_auth INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining_profiles FROM public.profiles;
  SELECT COUNT(*) INTO v_remaining_auth FROM auth.users;
  RAISE NOTICE '>>> Nettoyage terminé avec succès !';
  RAISE NOTICE '>>> Profils restants dans public.profiles : %', v_remaining_profiles;
  RAISE NOTICE '>>> Utilisateurs restants dans auth.users : %', v_remaining_auth;
END $$;

DROP TABLE temp_users_to_delete;

COMMIT;
