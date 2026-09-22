# Alertes de sortie (J-2 et jour J) — exploitation

Colonne **Prochainement** et e-mails de rappel réservés aux comptes **Pass Pro**.

## Ce qui a été mis en place

| Élément | Rôle |
| --- | --- |
| `src/components/views/UpcomingView.tsx` | Colonne « Prochainement » : sorties des 6 prochains mois, films et séries, triées par date puis popularité |
| `src/services/upcomingService.ts` | Découverte TMDB indépendante du moteur de recommandation + compte à rebours Paris |
| `api/_release-alerts.js` | API d'abonnement (`GET`/`POST`/`DELETE`) et traitement du cron d'envoi |
| `api/_release-email.js` | Rendu des e-mails J-2 / jour J, envoi et relecture du statut chez Resend |
| `supabase/migrations/20260922010000_release_email_alerts.sql` | Table `release_email_deliveries`, RPC `subscribe_release_alert` et `claim_release_email`, durcissement RLS |
| `vercel.json` | Cron quotidien `/api/activate-pro?action=movie-alerts-cron` à 09:00 UTC (11:00 Paris) |

Le cron traite la fenêtre `aujourd'hui` et `aujourd'hui + 2 jours` en heure de Paris : un abonnement reçoit
au plus un e-mail J-2 et un e-mail jour J, jamais deux fois le même jalon.

## Ordre de mise en production

1. Appliquer les migrations dans l'ordre : `movie_alerts_setup.sql`, puis `20260922010000_release_email_alerts.sql`.
2. Vérifier les variables d'environnement Vercel :
   - `RESEND_API_KEY` (obligatoire, sans lui aucune alerte ne peut être activée ni envoyée) ;
   - `RESEND_FROM_EMAIL` (expéditeur vérifié chez Resend) ;
   - `CRON_SECRET` (obligatoire : Vercel l'envoie automatiquement dans l'en-tête `Authorization` du cron ; sans lui, le cron répond 401 et n'envoie rien) ;
   - `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ;
   - `TMDB_API_KEY` (vérification de la date de sortie et des visuels au moment de l'envoi).
3. Déployer, puis déclencher une fois `GET /api/activate-pro?action=movie-alerts-cron` avec
   `Authorization: Bearer $CRON_SECRET` et vérifier la réponse :
   `{ "success": true, "accepted": n, "delivered": n, "failed": 0, "unknown": 0, "deferred": 0 }`.

Un `accepted` non nul signifie que Resend a accepté le message ; le passage suivant relit le statut réel
(`delivered`, `bounced`, …) et le reporte dans `release_email_deliveries`.

## Garanties anti-doublon

- `claim_release_email` réserve le jalon `(alert_id, milestone)` en base avant tout envoi : deux exécutions
  concurrentes ne peuvent pas envoyer deux fois le même e-mail.
- Un échec ambigu côté fournisseur (réseau coupé, 5xx) est enregistré en `unknown` : l'e-mail n'est **jamais**
  renvoyé automatiquement, il doit être arbitré manuellement.
- Une date de sortie modifiée chez TMDB décale l'alerte au lieu d'envoyer une date erronée.
- Les comptes non Pro, expirés ou dont l'e-mail n'est pas confirmé sont ignorés à chaque exécution :
  l'alerte reste enregistrée et repart automatiquement si l'abonnement est réactivé avant la sortie.

## Durée d'exécution

`vercel.json` déclare `"maxDuration": 300` pour `api/activate-pro.js`. Sur un plan Vercel Hobby, la durée
maximale autorisée est de 60 s : si le déploiement refuse cette valeur, passer `maxDuration` à `60` et
exporter `RELEASE_ALERT_BUDGET_MS=45000` pour que le cron s'arrête proprement avant la coupure
(les envois non traités sont repris à l'exécution suivante).

## Tests

```bash
npm run test:alerts
```

Couvre le calcul des dates Paris (changements d'heure inclus), l'échappement HTML, le refus des identités
forgées, le cron qui échoue fermé, la base PostgreSQL réelle (unicité film/série, annulation, idempotence,
RLS en écriture), puis le pipeline d'envoi complet : J-2, jour J, compte gratuit, compte expiré,
e-mail non confirmé, dérive de date et échec fournisseur ambigu.
