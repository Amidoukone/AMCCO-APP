# Chargement progressif et rapports — 18 novembre 2026

Cette passe traite les deux premières priorités de l'analyse précédente.
Elle modifie uniquement le frontend et les outils de vérification locaux.
Aucune migration, modification de données métier ou intervention en production.

## Rapports : charger uniquement ce qui est affiché

La page Rapports contenait plus de 2 700 lignes de tableaux dans un bloc
`details` masqué. Ces tableaux n'étaient pas rendus initialement, mais leur
JavaScript était téléchargé avec le résumé.

Ils sont maintenant dans `frontend/src/pages/ReportsDetails.tsx`, importé avec
`React.lazy` seulement lorsque le bloc détaillé est ouvert. Le bloc reste masqué
dans le parcours actuel. Les filtres, la synthèse, le périmètre appliqué et le
téléchargement PDF restent dans `ReportsPage.tsx`. Les fonctions communes de
formatage et de calcul sont regroupées dans `utils/reportDisplay.ts`.

| JavaScript compilé | Avant | Après |
| --- | --- | --- |
| Page Rapports au premier accès | 115,53 Ko | 17,62 Ko |
| Page Rapports gzip | 18,03 Ko | 5,87 Ko |
| Module de détails optionnel | inclus dans la page | 98,98 Ko, soit 13,29 Ko gzip |

La réduction concerne le téléchargement initial de cette page : environ 85 %
avant compression et 67 % gzip. Ce découpage ne supprime pas le code des tableaux
et ne prédit pas un pourcentage équivalent de réduction du temps utilisateur.

Une comparaison par l'AST TypeScript a vérifié que le JSX des tableaux et les
corps des fonctions extraites sont identiques à ceux d'avant le déplacement.
La recette Rapports vérifie aussi que le navigateur ne demande pas le module
détaillé au chargement initial et qu'il le charge et le rend lorsqu'on ouvre
explicitement ce bloc dans le test.

## Listes : réduire le lot initial sans perdre l'historique

| Liste | Ancien lot ordinateur | Nouveau lot ordinateur | Lot mobile conservé |
| --- | --- | --- | --- |
| Transactions | 100 | 50 | 30 |
| Tâches, hors Services | 200 | 50 | 40 |
| Tâches du secteur Services | 200 | 200 | 40 |

Les boutons « Charger plus », les pages visibles et la recherche serveur restent
disponibles. Les compteurs locaux et les synthèses portent toujours sur les
opérations chargées, comme indiqué dans l'interface. Les rapports continuent à
fournir les totaux de la période complète.

Les suggestions financières utilisaient la liste principale ou son historique.
Réduire simplement sa limite aurait retiré certaines anciennes références.
Un historique séparé conserve donc la profondeur précédente de 100 transactions
sur ordinateur et 30 sur mobile, dans les secteurs qui utilisent ces suggestions.
Il est demandé en arrière-plan à l'ouverture du formulaire ; il n'est pas requis
pour consulter la liste et n'allonge pas celle-ci.

Les suggestions et les lignes courantes sont fusionnées par identifiant, en
privilégiant les lignes courantes, puis filtrées par entreprise et secteur.
L'enregistrement ou la suppression d'une transaction invalide les réponses
d'historique encore en attente et met à jour les suggestions locales.

Ce choix favorise le premier affichage. Sur ordinateur, consulter la liste puis
ouvrir le formulaire peut transférer 50 lignes de liste et 100 lignes d'historique
de suggestions, au lieu du seul lot de 100 auparavant. L'historique se charge en
parallèle des autres données du formulaire et ne conditionne pas son ouverture.
Une future API de suggestions dédiée pourrait éviter ce recouvrement.

Le secteur Services conserve volontairement son lot de 200 tâches sur ordinateur :
ses catégories suggérées proviennent encore directement des tâches chargées.
Cette exception préserve le comportement existant sans ajouter une requête
d'historique à chaque ouverture de formulaire de tâche.

## Vérifications réalisées

- Compilation et vérification TypeScript du frontend réussies.
- Vérification structurelle du déplacement des tableaux et fonctions de rapport.
- Recette Rapports réussie sur les 14 secteurs en bureau et mobile : résumé,
  filtres, téléchargement PDF, erreurs de lecture/export, lecture propriétaire,
  absence de chargement initial des détails et rendu du module différé.
- Recette de cohérence intégrée réussie sur les 14 secteurs en bureau et mobile,
  avec détails, modifications, métadonnées historiques et changements de contexte.
- Les 12 scénarios de cache restent valides.
- Une nouvelle recette sur 135 opérations fictives vérifie les quatre cas
  Transactions/Tâches en bureau/mobile : limites initiales, offsets serveur,
  accès à toutes les lignes, absence de doublons entre pages et recherche d'une
  opération située au-delà du premier lot.
- Cette recette vérifie aussi la présence d'une ancienne référence en position
  80 dans les suggestions Quincaillerie et Services après ouverture du formulaire,
  sans étendre la liste de 50 lignes, ainsi que le maintien du lot Services de tâches.

Les API sont entièrement simulées dans ces recettes. Aucune opération n'est
envoyée au backend local ni à la production. Les tests backend de la passe
précédente restent inchangés ; aucun code backend n'a été modifié ici.

## Reproduire

Avec les dépendances installées et les exemples de rapports locaux disponibles
selon `scripts/README.md`, démarrer le frontend de vérification :

```powershell
npm --workspace frontend run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Dans un autre terminal :

```powershell
node scripts/verify-progressive-lists.mjs
node scripts/verify-sector-reports.mjs
node scripts/verify-sector-coherence.mjs
node scripts/verify-api-cache.mjs
```

`verify-progressive-lists.mjs --suggestions-only` permet de cibler les références
de formulaires. `npm --workspace frontend run build` permet de remesurer les
fichiers compilés. Aucun déploiement n'est effectué.
