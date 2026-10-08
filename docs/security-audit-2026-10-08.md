# Sécurité et authentification — 8 octobre 2026

La vérification couvre les permissions Supabase, les routes d'authentification,
les abonnements, l'activation SasPay, les secrets exposés au navigateur et les
dépendances installées. Elle ne constitue pas une garantie d'absence de toute
vulnérabilité inconnue.

## Vérification et récupération par e-mail

Le réglage Supabase actif a été lu sur `/auth/v1/settings` :
`mailer_autoconfirm = false`, inscription ouverte et fournisseur e-mail actif.
Une inscription doit donc être confirmée par le lien envoyé par Supabase.
Cette confirmation d'adresse n'est pas une authentification MFA/TOTP.

L'interface reste sur un écran de confirmation après l'inscription et propose
de renvoyer le mail ou de corriger l'adresse. Aucun compte ou jeton local n'est
créé pour contourner cette étape. La route historique qui simulait un envoi a
été remplacée par un véritable appel `auth.resend`.

Après des identifiants incorrects, le message propose la réinitialisation par
e-mail. Les règles de création des nouveaux mots de passe ne bloquent pas la
vérification des mots de passe existants. Les demandes de récupération ne révèlent
pas si une adresse est enregistrée. Un lien absent, expiré ou consommé ne permet
pas de modifier le mot de passe. Une récupération réussie révoque les sessions
de rafraîchissement, et les API sensibles vérifient aussi que le `session_id` du
jeton validé est encore présent dans `auth.sessions`.

Les nouveaux mots de passe saisis sur le site comportent au moins huit caractères,
une majuscule et un chiffre. Les empreintes et anciens mots de passe du registre
local sont supprimés ; seul Supabase gère les identifiants.

## Corrections de sécurité

- Les secrets SasPay/Moneroo/Notch ne sont plus lus depuis les variables publiques
  ou le stockage du navigateur. La configuration Vite publie uniquement une liste
  explicite de variables publiques. Le repli de paiement directement depuis le
  navigateur avec une clé secrète a été supprimé.
- Les routes de paiement mobile demandent un compte confirmé. Le serveur impose
  l'identifiant et l'e-mail authentifiés, ainsi que les prix de l'offre. Chaque
  lecture de souscription vérifie son propriétaire.
- Une activation SasPay nécessite une session de paiement enregistrée, la preuve
  serveur du paiement et la correspondance du montant, de la devise et de la
  référence. Les notifications non signées sont refusées.
- La migration `20261008080535_secure_payment_binding.sql` a été appliquée au projet
  connecté. La fonction serveur verrouille les lignes et active le profil et la
  souscription dans une seule transaction. Une référence déjà utilisée ne prolonge
  pas une seconde fois l'abonnement. Les clients ne peuvent ni exécuter cette
  fonction ni lire le registre des paiements.
- Les adresses de retour des paiements sont limitées aux domaines du site. Les
  recherches de profils pour les activations utilisent une égalité exacte ou un
  identifiant UUID, et les champs des e-mails de support sont échappés.
- Les en-têtes de sécurité incluent CSP, interdiction d'intégration dans une iframe,
  `nosniff`, politique de référent et HSTS. Le script de démarrage du thème a été
  externalisé pour ne pas autoriser les scripts inline.
- Les dépendances vulnérables ont été remplacées. La compilation Tailwind utilise
  la version corrigée avec le thème existant. Le contrôle `npm audit` ne signale
  plus de vulnérabilité connue.

## Preuves et limites

Les 24 tests de sécurité passent, dont les contrôles PostgreSQL d'isolation,
de paiement répété, de compte non confirmé et de session révoquée. TypeScript et
la compilation de production passent. La vérification Chrome de la compilation
de production a couvert : identifiants incorrects, demande de récupération,
attente de confirmation, renvoi du mail, lien absent/expiré et lien valide suivi
du changement de mot de passe et de la déconnexion globale. Les réponses Auth
étaient contrôlées dans ces tests ; aucun e-mail réel n'a été envoyé par ce test.

Le dernier passage complet de la suite a réussi 809 tests sur 810 ; l'échec
préexistant de `tests/upcoming/releaseFeed.test.mjs:107` dépend de dates du
22 septembre 2026 désormais passées. Il est indépendant des modifications de
sécurité. Le contrôle des octets exacts de signature webhook a été ajouté après ce
passage, puis vérifié dans la suite de sécurité.

La réception dans une boîte réelle reste à vérifier avec une adresse de test
autorisée. Il faut aussi vérifier le transport SMTP et l'autorisation de l'URL
`/update-password` dans la configuration Auth. Le connecteur disponible permet
de lire les réglages publics mais pas de modifier cette configuration.

L'audit Supabase conserve un avertissement : **la protection contre les mots de
passe compromis est désactivée**. Ce réglage doit être activé dans la configuration
Auth du projet si le forfait le permet. Voir la
[documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Les informations RLS sur les quatre tables exclusivement réservées au serveur
sont intentionnelles : aucune permission cliente n'y est accordée.

L'accès au projet Vercel via le connecteur a été refusé (403) et aucun CLI Vercel
local n'est disponible. Les secrets et réglages de cet environnement n'ont donc
pas pu être audités ou modifiés. La publication GitHub et le résultat du
déploiement automatique doivent être vérifiés séparément.
