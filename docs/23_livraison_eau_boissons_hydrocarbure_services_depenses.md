# Simplification de cinq secteurs financiers

Date : 21 octobre 2026. État : changements locaux, sans déploiement en production.

## Parcours proposés

| Secteur | Actions courantes |
| --- | --- |
| Production d'eau potable | Vendre des paquets d'eau, enregistrer une dépense, autre recette. |
| Dépôt de boissons | Vente, achat de stock, dépense, autre recette. |
| Hydrocarbure | Entrée ou sortie, puis choix du produit ou de l'équipement. |
| Services divers | Encaisser une prestation ou enregistrer une dépense. |
| Dépenses générales | Dépense du PDG ou d'un employé, puis choix de la catégorie. |

Les actions préparent un formulaire ; elles n'enregistrent aucune opération automatiquement. Remplacer une saisie modifiée demande confirmation. La liste des opérations précède les synthèses, la gestion des comptes et le formulaire de saisie, initialement replié. Les champs métier sont ouverts dans le formulaire et précèdent le justificatif facultatif. Les libellés d'opération et les références utiles sont visibles dans la liste.

La synthèse repliable sépare les entrées, sorties et écarts par devise. Elle porte sur les opérations chargées après recherche et filtres, tous statuts, et ne remplace pas les rapports comptabilisés de la période complète. Aucun taux de conversion n'est introduit.

## Conservation des données et des droits

- Les API, identifiants, codes sectoriels, validations, calculs et règles comptables existants sont conservés. Les calculs quantité × prix unitaire restent disponibles selon l'opération ; les versements et reliquats de boissons ne deviennent pas de nouvelles ventes.
- Lors d'une modification dans ces cinq secteurs, les métadonnées historiques absentes du formulaire actuel sont conservées. Une nouvelle saisie n'hérite pas des métadonnées du précédent enregistrement.
- Un échec d'écriture conserve la saisie. Un enregistrement réussi ne déclenche plus une fausse confirmation d'abandon quand l'URL sélectionne la transaction enregistrée. Les changements de page, de secteur et de vue restent protégés.
- Les rôles de consultation ne reçoivent aucun droit de création. Les opérateurs Hydrocarbure et Dépôt de boissons conservent leur périmètre sectoriel et leurs accès existants.
- Aucun accès aux données de production, aucune migration, aucune suppression de données et aucun déploiement n'ont été effectués. Ce lot modifie uniquement le frontend, sa recette locale et cette documentation.

## Vérifications locales

- Compilation frontend avec vérification TypeScript.
- Suite backend : 21 fichiers et 171 tests.
- `scripts/verify-sector-cashflows.mjs` : cinq secteurs sur ordinateur et téléphone, treize actions, calculs existants, abandon annulé/confirmé, échec d'écriture puis nouvel essai, totaux séparés par devise, modification du même identifiant avec conservation du montant, de la date et des métadonnées historiques. Les écritures simulées sont contrôlées avec les profils métier compilés du backend.
- Recettes des lots précédents : `scripts/verify-sector-ux.mjs` et `scripts/verify-sector-directories.mjs`, notamment protection des brouillons, changement de contexte, droits et références.
- Captures dans `artifacts/sector-ux/` : préfixes `water`, `beverage_depot`, `hydrocarbon`, `services`, `general_expenses`, suffixes `1440` et `390`.

Les recettes exigent le frontend local sur `127.0.0.1:5175`, les profils backend compilés et Playwright. `AMCCO_PLAYWRIGHT_PATH` permet d'utiliser une installation existante. Les API sont entièrement simulées et les accès réseau externes sont bloqués ; les essais ne valident donc pas une écriture réelle en production.

## Avant livraison

Faire la recette métier avec les utilisateurs sur un environnement de test : vente d'eau, achat et vente de boissons, entrée et sortie hydrocarbures, prestation et dépense de service, dépense PDG et employé. Comparer les références, devises et rapports sur la même période.

Respecter l'ordre de livraison des corrections communes documenté dans `21_livraison_ergonomie_quincaillerie.md` : backend de recherche avant frontend. Ce lot ne nécessite aucune migration supplémentaire. Le retour à la version précédente du frontend ne demande aucune conversion des enregistrements.
