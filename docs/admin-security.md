# Droits administrateur — vérification du 7 octobre 2026

La source des permissions est `public.profiles.is_admin`. Chaque nouveau profil
reçoit `false`. Seul un opérateur Supabase ou un serveur utilisant `service_role`
peut modifier cette valeur. Les utilisateurs peuvent lire leur propre profil,
mais ne peuvent ni écrire ses permissions, ni lire ceux des autres membres.

Pour donner ou retirer un droit administrateur, ouvrir la table `profiles` dans
le [projet Supabase](https://supabase.com/dashboard/project/xwhrxtzbxvakqjlajjlc/editor),
identifier le compte par son `id` Auth et modifier `is_admin`. Le statut Pro reste
distinct : `is_pro` et `expires_at` déterminent sa validité. Le compte fondateur
existant a été autorisé une seule fois après vérification de son identité Auth.
Aucune inscription ou modification d'adresse n'attribue ce droit automatiquement.

## Corrections

- Suppression des codes publics et de l'en-tête `x-admin-secret`.
- Suppression des listes d'adresses qui donnaient automatiquement des privilèges.
- Suppression de la confiance dans `user_metadata`, les paramètres client et les
  comptes fictifs stockés dans le navigateur.
- Chaque accès à l'API admin valide le jeton avec Supabase Auth, puis lit le profil
  correspondant à l'identifiant authentifié. La révocation est relue à chaque
  requête. L'API de gestion des utilisateurs ne permet pas d'attribuer un droit admin.
- Protection de `profiles` et, lorsqu'elle existe, de `subscriptions` : lecture
  limitée au propriétaire et écritures réservées au serveur, y compris les anciens
  droits de colonnes et le droit `TRUNCATE`.
- Les routes de statut Pro exigent une session ; les activations et le cron
  exigent des secrets serveur. Les scripts historiques ne réintroduisent plus
  les règles basées sur des métadonnées ou des adresses.

Supabase explique pourquoi les métadonnées modifiables par l'utilisateur ne
conviennent pas aux permissions dans sa
[documentation RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Validation

La migration `20261007180019_lock_account_permissions.sql` a été appliquée sur le
projet connecté. Les contrôles sur la base active ont confirmé : un seul admin,
aucune lecture anonyme de `profiles`, aucune écriture de colonne autorisée aux
membres, aucun accès `TRUNCATE` anonyme, aucune politique reposant sur
`user_metadata`. Les simulations de rôle authentifié, avec de fausses métadonnées
admin et l'adresse du fondateur, ont été exécutées dans une transaction annulée.

`npm run test:security` couvre les anciennes clés, les faux rôles et identités,
la révocation, l'indisponibilité de la base et les refus d'écriture sur PostgreSQL.
Les huit tests passent. TypeScript et la compilation de production passent.
La suite complète passe 794 tests sur 795. L'échec indépendant dans
`tests/upcoming/releaseFeed.test.mjs:107` utilise des sorties calculées depuis le
22 septembre 2026 alors que la route utilise la date actuelle : son titre prévu
huit jours plus tard est désormais exclu des sorties futures. Cette route et
ce test n'ont pas été modifiés.

Les trois informations de l'audit Supabase sur les tables réservées au serveur
sans politique RLS sont intentionnelles. L'audit signale aussi que la protection
contre les mots de passe compromis est désactivée ; ce réglage Auth est distinct
des permissions administrateur et n'a pas été modifié.

## Mise en service

Les protections de base sont actives. Le code de l'application et de ses API doit
être déployé pour fermer les anciens contournements sur le site public. Si le
projet Vercel suit la branche GitHub `main`, sa publication déclenche le déploiement
automatique ; le succès du push GitHub et celui du déploiement sont deux vérifications
distinctes.
Le serveur doit disposer de `SUPABASE_SERVICE_ROLE_KEY`, conservée exclusivement
dans son environnement serveur. La fermeture des anciens contournements de l'API
sur le site public nécessite le déploiement de ce code.
