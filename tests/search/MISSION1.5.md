# Mission 1.5 — Recall narratif, 21 septembre 2026

**Statut : correction de retrieval livrable, critère de succès de généralisation non atteint.**
Les six cas de développement progressent de 4/6 à 6/6 ; les seize cas indépendants
restent à 12/16. Aucun changement du ranking, des pourcentages, du resultBudget,
de l'UI ou de la personnalisation. Aucune Mission 2 ni interprétation par candidat.

## A. Cause principale

Le retrieval perdait de la précision avant même le ranking : concepts et motifs
étaient aplatis dans une liste `themes` limitée à dix éléments, puis huit termes
d'expansion (ou cinq termes sans expansion) pouvaient occuper toutes les recherches.
Discover réunissait au maximum trois IDs par OR et ne lisait pas directement le
SemanticIntentContext. Une page populaire issue de cet OR pouvait ne contenir
aucune œuvre cumulant les dimensions décrites.

## B. Signaux perdus

Les motifs en fin de liste, les personnes du contexte sémantique dans le document
vectoriel, la cooccurrence des concepts dans la recherche lexicale et les crédits
moins populaires au-delà du vingtième résultat. La source lexicale consultait
uniquement deux anciens catalogues de films, sans le catalogue commun `media_embeddings`.

Le diagnostic trace désormais contexte → concepts/motifs → termes → expansion →
résolution des keywords → paramètres envoyés → candidats par appel → pool fusionné.
Les traces détaillées restent internes aux diagnostics ; aucune clé ni embedding
brut n'est écrit dans les rapports ou réponses publiques.

## C. Retrieval multi-angle

`narrativeRetrieval.js` construit un plan déterministe. Les canaux concepts, motifs,
thèmes et keywords sont entrelacés, les genres génériques écartés des dimensions
discriminantes, les variantes équivalentes dédupliquées. Au maximum cinq angles :
deux intersections de keywords, un OR sur ces mêmes concepts, une formulation
lexicale multiconcepts et un document vectoriel complet. Le OR évite les faux
négatifs dus aux tags TMDB incomplets ; il ne remplace pas les concepts par un genre.

## D. TMDB keywords

Huit recherches de termes au maximum, trois IDs positifs conservés, quatre termes
d'exclusion au maximum. Résolution exacte ou flexion singulier/pluriel à granularité
identique ; rejet des identifiants ambigus. Deux combinaisons AND et un OR au maximum
par type de média. Les contraintes existantes sont conservées. Le budget partagé
reste de **30 appels TMDB**, résolution des entités comprise. Discover réserve sa
capacité avant les indications de titres historiques pouvant consommer dix appels.

TMDB documente les virgules comme AND et les barres verticales comme OR pour les
[films](https://developer.themoviedb.org/reference/discover-movie) et les
[séries](https://developer.themoviedb.org/reference/discover-tv).

## E. Vector retrieval

Le texte d'embedding inclut explicitement concepts, motifs, dimensions discriminantes,
personnes, keywords, thèmes et contexte existant. Un seul embedding de requête est
mémoïsé ; modèle, dimension, version d'index, seuil et RPC restent inchangés.
Le fonctionnement du transport et de la propagation du contexte est testé. La
couverture réelle du catalogue vectoriel de production n'a pas pu être vérifiée :
les accès correspondants sont absents du `.env` local indiqué par l'utilisateur.

## F. Lexical retrieval

Les intentions riches utilisent une expression de cooccurrence de deux concepts,
avec variantes lexicales bornées, sur les descriptions et les textes de profils.
Le filtre est limité à six dimensions et 12 000 caractères après encodage URL.
Les notes ne sélectionnent plus les premiers candidats de ces requêtes. Au maximum
50 lignes par table sont comparées localement, puis 20 candidats sont retenus pour
la source. `media_embeddings` est consulté avant les anciens catalogues de films.
Limites : correspondances ILIKE, variantes bilingues incomplètes, dépendance à la
présence et au contenu de la table ; aucun gain Supabase LIVE n'est revendiqué.

## G. Person credits

La filmographie reçue est comparée aux dimensions narratives **avant** la limite de
20 candidats par source. La fusion privilégie la couverture narrative et les
intersections de keywords avant ses priorités historiques. Ces priorités servent
uniquement à l'admission et à l'ordre du pool borné de 50, sans modifier les scores
de `searchRanker.js`. Les crédits restent disponibles pour les recherches par personne.

## H. Films

Même plan, même mesure et mêmes bornes. Les anciennes tables lexicales restent des
sources de secours pour les films. Le type d'un candidat ne peut pas être réécrit
pour satisfaire une demande de série.

## I. Séries

Discover TV utilise les mêmes combinaisons. La recherche lexicale interroge le
catalogue canonique avec `media_type=tv`. Les tests incluent des séries sans titre
ni acteur ; aucune dépendance à un titre suggéré n'est introduite.

## J. CandidateRecall avant/après

Comparaison au commit `1211396dd677f8fdc5fbb05f01f21dbcb77f2e07`, avec les mêmes
intentions sémantiques figées, des réponses TMDB réellement capturées, puis un replay
hors réseau. Le pool est observé après fusion, **avant filtrage strict et ranking**.

| Ensemble | Cas | Recall@10 avant | Après | Recall@20 avant | Après |
| --- | ---: | ---: | ---: | ---: | ---: |
| Développement | 6 | 66,7 % | 100 % | 66,7 % | 100 % |
| Généralisation initiale | 8 | 87,5 % | 87,5 % | 87,5 % | 87,5 % |
| Généralisation élargie, films | 8 | 75 % | 75 % | 75 % | 75 % |
| Généralisation élargie, séries | 8 | 75 % | 75 % | 75 % | 75 % |
| Généralisation élargie, total | 16 | 75 % | 75 % | 75 % | 75 % |

La taille moyenne du pool de généralisation passe de 21,06 à 19,75. Il n'y a pas de
régression mesurée, mais **pas de hausse de recall sur la généralisation**. Une
meilleure position dans le pool ou un Top1 correct n'est pas compté comme un gain.

## K. Generalization set

Corpus versionné dans `narrative-recall-corpus.json` : 6 cas de développement,
16 autres œuvres (8 films, 8 séries), intrigue seule, acteur + intrigue et original
coréen face à remake. La logique a été figée avant l'évaluation du premier groupe
de généralisation. Un second groupe de huit œuvres a ensuite été ajouté sans
ajustement de règles à ses résultats. Les deux étapes sont conservées ci-dessus.

**Portée de la mesure :** les intentions ont été rédigées et figées manuellement
pour isoler le retrieval. Le benchmark n'exécute pas DeepSeek, ne simule pas des
embeddings et n'injecte jamais l'œuvre attendue dans les réponses. Les réponses
proviennent de TMDB Discover et des crédits des personnes déjà résolues. Les
gains lexicaux/vectoriels sont couverts par des tests de contrat, pas par ce benchmark.

Les 260 réponses fournisseur capturées sont conservées dans
`narrative-recall-recording.json.gz` (sans credentials). Les métriques avant/après,
concepts, sources, positions et nombres finaux sont dans `narrative-recall-results.json`.

| Cas de développement | Position avant ranking, après correction | Position finale | Résultats finaux |
| --- | ---: | ---: | ---: |
| Truman Show | 3 | absent | 2 |
| Mindhunter | 4 | absent | 3 |
| La Casa de Papel | 1 | absent | 3 |
| Mr. Robot | 2 | 2 | 3 |
| Benjamin Button | 9 | absent | 3 |
| Salt | 1 | 1 | 3 |

Ces lignes concernent le replay TMDB à intention figée, **pas le endpoint public
LIVE DeepSeek**. Toutes ont le type `specific_title_description`. Discover est
interrogé dans les six cas, avec person credits pour les deux derniers. Les sorties
absentes malgré un bon recall illustrent la séparation avec le ranking laissé intact.

## L. Tests

Développement : tests ciblés seulement. Validation finale : une exécution de la
suite complète, **449 tests réussis**, incluant baseline, quotas, hybrid baseline,
corpus qualité et 34 nouveaux tests de recall/contrats/captures. Benchmarks qualité
(18 cas historiques) et recall (22 cas) réussis comme outils de mesure. Leur succès
technique n'est pas une validation du critère de généralisation de la mission.

Reproduction du benchmark : `npm run search:recall` (hors réseau). Pour recalculer
également l'ancien moteur : `npm run search:recall -- --before CHEMIN_CHECKOUT_1211396`.
Diagnostic avec credentials configurés :
`npm run search:diagnose -- --expected tv:IDENTIFIANT "description narrative"`.
Les identifiants attendus sont des entrées de diagnostic, jamais des règles métier.

## M. Build

`npm run build` réussi, lancé une seule fois en validation finale. Avertissement
Vite sur le bundle supérieur à 500 kB, sans lien avec cette modification serveur.

## N. Commit

Commit prévu : `fix(search): improve narrative candidate recall`, sur `main`,
avec push vers `origin/main` et vérification d'égalité après publication.

## O. Vercel

Le push Git déclenche le déploiement Vercel existant. Son état et les essais du
endpoint public après publication sont consignés dans le rapport de livraison.
La réponse publique ne contient ni le SemanticIntentContext ni le pool avant
ranking : ces valeurs ne doivent jamais être déduites d'un seul résultat final.

## P. Dette restante

- Le critère demandé d'augmentation du recall de généralisation reste non satisfait.
- Quatre œuvres du jeu indépendant restent hors du pool TMDB. Aucun cas n'a été
  retiré du corpus et aucune règle n'a été ajoutée pour corriger ces identités.
- Vérifier la disponibilité et la couverture de `media_embeddings` en production,
  puis mesurer le pipeline complet avec une interprétation DeepSeek réelle.
- Des candidats présents disparaissent au ranking/budget existant. Ces étapes
  n'ont pas été modifiées ; la Mission 2 n'a pas commencé.
