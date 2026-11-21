# Analyse des performances après simplification — 18 novembre 2026

## Périmètre et méthode

Revue des modifications présentes dans le répertoire de travail : transactions
directement enregistrées, alertes utiles, tableau de bord simplifié, rapports
PDF, contexte entreprise/secteur et cache HTTP du frontend. Les modifications
préexistantes ont été conservées.

Mesures réalisées exclusivement sur `amcco_recette_20261117`, MySQL 8.4.3 local.
Le script de profilage importe les services et dépôts compilés, sans importer
le serveur ni son bootstrap de schéma. Il appelle uniquement des lectures et
`EXPLAIN FORMAT=JSON`. Les recettes navigateur simulent toutes les API et bloquent
les destinations externes. Aucun accès à la production, aucune migration et
aucune écriture métier n'ont été nécessaires pour cette passe.

Chaque mode du tableau de bord est exécuté huit fois, en alternant l'ordre
des modes ; la première paire est écartée. Les résultats ci-dessous sont les
médianes de sept mesures. Les temps excluent le réseau, l'authentification HTTP
et le rendu navigateur. Les lignes sont celles renvoyées au backend, pas toutes
les lignes examinées par MySQL. Les tailles JSON sont mesurées avant compression.
Le petit volume local ne permet pas de prédire les temps en production.

## Corrections réalisées

### 1. Le tableau de bord relisait des historiques non affichés

`DashboardPage` et `MyWorkPage` utilisent les totaux et les éléments récents.
Le backend chargeait aussi toutes les transactions et tâches du périmètre pour
construire `operationalPerformance`, inutilisé dans ces deux vues. Même une
projection JSON réduite conserve un coût proportionnel à l'historique.

Les deux pages demandent maintenant `details=false`. Le service évite ces deux
lectures et renvoie un tableau `operationalPerformance` vide dans ce mode.
Les totaux, soldes, compteurs, droits et éléments récents restent identiques.
Le script compare tous les autres champs entre les deux modes à chaque paire.
L'absence du paramètre et `details=true` conservent le comportement antérieur
pour les clients existants. Les PDF continuent à charger leurs données complètes.

| Périmètre | Requêtes avant → après | Lignes renvoyées avant → après | JSON avant → après | Temps local avant → après |
| --- | --- | --- | --- | --- |
| Tous secteurs | 8 → 6 | 82 → 16 | 62 147 → 7 130 octets | 4,34 → 2,00 ms |
| Magasins | 8 → 6 | 16 → 10 | 7 603 → 5 532 octets | 2,97 → 2,02 ms |
| Quincaillerie | 8 → 6 | 14 → 9 | 10 442 → 5 308 octets | 2,61 → 1,47 ms |
| Dépôt de boissons | 8 → 6 | 14 → 9 | 10 534 → 5 384 octets | 2,66 → 1,64 ms |

Le gain structurel est de deux requêtes par chargement et l'évitement du transfert
des historiques. L'écart de quelques millisecondes observé localement ne doit
pas être présenté comme une amélioration garantie du temps utilisateur.

### 2. Toute écriture supprimait tous les caches

Une lecture d'alerte rendait inutilisables aussi les listes financières, tâches,
rapports et catalogues encore valides. Le même comportement existait entre
les écritures financières et les données de tâches indépendantes.

L'invalidation suit maintenant les dépendances vérifiées dans les services :

| Écriture | Lectures invalidées | Lectures conservées jusqu'à leur expiration |
| --- | --- | --- |
| Alertes | Alertes, dashboard, lectures non classées | Finance, tâches, rapports, catalogues |
| Finance, salaires, stock de boissons | Finance, rapports, dashboard, alertes, lectures non classées | Tâches et catalogues |
| Tâches, affectations, commentaires, pièces jointes | Opérations, rapports, dashboard, alertes, lectures non classées | Finance et catalogues |
| Administration, authentification, catalogues ou écriture inconnue | Tout | Aucune |

L'invalidation reste appliquée au début et à la fin de l'écriture, y compris en
échec. Les clés conservent le jeton, le chemin et tous les paramètres ; des
générations distinctes isolent les domaines. Les changements de session et
d'entreprise effacent toujours tout. Une réponse ancienne peut terminer pour
son appelant, mais elle ne peut plus remplir le cache d'une génération invalidée.
Cela évite aussi que de nombreuses réponses obsolètes évincent des réponses
récentes de la limite de 60 entrées.

Sur un parcours simulé qui consulte six ressources, puis lit une alerte et
reconsulte ces ressources, seuls deux GET repartent au lieu de six. Les durées
de cache existantes restent inchangées : 5 à 30 secondes selon les ressources.
Ce cache ne fournit pas de synchronisation instantanée entre plusieurs postes.

## Autres constats et priorités suivantes

Les deux premières priorités ci-dessous ont ensuite été traitées dans
[la passe de chargement progressif et de découpage des rapports](34_chargement_progressif_et_rapports.md).
Les valeurs du tableau décrivent l'état au moment de cette première analyse.

| Priorité | Constat vérifié | Travail utile et condition de validation |
| --- | --- | --- |
| Haute | La page Rapports conserve un grand bloc de détails dans un `<details hidden>`. Son fichier compilé pèse environ 115,53 Ko, soit 18,03 Ko gzip. | Extraire ces détails dans un module chargé à la demande, ou retirer le parcours désactivé après décision produit. Vérifier le résumé, les filtres et le PDF avant/après. |
| Haute | Transactions charge 100 lignes sur ordinateur et 30 sur mobile ; Tâches en charge 200 et 40, pour une page visible initiale de 10 lignes. | Mesurer le volume réel et diminuer le premier lot, avec chargement progressif. Préserver les suggestions de saisie, la sélection multiple et les indicateurs qui utilisent les lignes déjà chargées. |
| Moyenne | La page Transactions atteint environ 173,34 Ko de JavaScript, soit 42,30 Ko gzip ; la feuille CSS globale atteint 223,85 Ko, soit 37,19 Ko gzip. Les routes sont déjà chargées à la demande. | Séparer les formulaires et présentations propres aux secteurs ; profiler la saisie sur mobile avant de modifier les composants. Éviter de refaire un découpage des routes déjà présent. |
| Moyenne | Les plans SQL locaux utilisent les index entreprise/activité et les clés des jointures. Les tris des listes nécessitent encore un `filesort`. | Tester sur une copie représentative des index complétant les colonnes de tri. Le petit volume actuel ne justifie pas une migration immédiate ni la suppression d'index existants. |
| Moyenne | Les filtres de période des tâches utilisent `COALESCE`, et parfois une date extraite du JSON. | Si ces rapports deviennent lents, mesurer une colonne de date métier indexable et sa reprise de données sur copie. Ne pas changer la définition de période pour gagner du temps. |
| Moyenne | Les affectations en lot traitent jusqu'à 100 tâches successivement ; les validations initiales sont déjà regroupées. | Mesurer le cas 100 tâches puis concevoir une écriture groupée ou une concurrence bornée avec un contrat explicite sur les erreurs partielles, les audits et les notifications. |
| Moyenne | Les exports PDF calculent le détail complet et rendent le document dans le processus API. Deux vagues SQL limitent une requête isolée, sans garantir la capacité sous plusieurs exports concurrents. | Mesurer plusieurs exports concurrents et les actions ordinaires ; envisager une file bornée ou un worker si le rendu bloque l'API. |
| Suivi | Le backend vérifie les droits actuels en base à chaque requête authentifiée. Les requêtes lentes ont déjà un seuil de journalisation de 500 ms. | Conserver cette vérification ; mesurer séparément l'authentification, le SQL, les notifications, les transferts et le rendu. Ne pas mettre les permissions en cache sans mécanisme de révocation. |

Le profilage local relève également, dans le secteur le plus fourni de cette
copie, 1,58 ms pour une liste de transactions, 0,91 ms pour une liste de tâches
et 2,66 ms pour le résumé de rapport. Ces lectures seules n'expliquent pas une
éventuelle attente de plusieurs secondes côté utilisateur : un diagnostic réel
doit inclure le réseau et les autres étapes de l'action.

Les créations et modifications affichent déjà le résultat renvoyé par l'API
et réalisent plusieurs resynchronisations en arrière-plan. Les pièces jointes
sont également envoyées après l'enregistrement dans les parcours concernés.
Il faut conserver les messages distinguant une opération enregistrée d'une
pièce jointe ayant échoué, ainsi que les contrôles transactionnels du stock.

## Vérifications et reproduction

Résultats de cette passe :

- 254 tests backend réussis, dont les modes HTTP du dashboard et leur authentification.
- Vérifications TypeScript et compilation backend/frontend réussies.
- 12 scénarios navigateur dédiés au cache : déduplication, isolation jeton/secteur,
  dépendances d'invalidation, écritures en erreur, réponses anciennes, expiration
  et limite mémoire.
- Recette intégrée réussie sur 14 secteurs, en bureau et mobile : dashboard,
  listes, détails, modification, conservation des métadonnées historiques,
  rapports et téléchargement PDF simulé.
- Recette des alertes réussie en bureau et mobile, avec écritures et lectures
  retardées, succès, échecs, sérialisation et changements d'entreprise.

Depuis la racine, compiler avec `npm run build`. Avec MySQL déjà démarré et une
copie de recette existante, lancer `node scripts/profile-local-performance.mjs`.
Les mesures et plans synthétiques sont écrits dans
`artifacts/local-performance.json`, sans noms, identifiants utilisateur ou montants
métier. Le script refuse une source distante et n'applique aucune migration.

Pour les recettes navigateur, servir le frontend local sur le port 5175 puis lancer :

```powershell
npm --workspace frontend run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Dans un autre terminal :

```powershell
node scripts/verify-api-cache.mjs
node scripts/verify-alerts-coherence.mjs
node scripts/verify-sector-coherence.mjs
```

La dernière commande réutilise les exemples de rapports locaux documentés dans
`scripts/README.md`. Ces tests simulés ne constituent pas une mesure des latences
de production. Aucun déploiement n'est effectué par ces commandes.
