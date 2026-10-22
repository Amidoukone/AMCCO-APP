# Harmonisation des rapports des 14 secteurs actifs

Date : 21 octobre 2026. Changements locaux, sans déploiement ni accès aux données de production.

## Référence et présentation commune

Le rapport Dépenses générales sert de référence : identité AMCCO, titre clair, période, synthèse, tableaux métier et pagination. Son contenu et ses tableaux PDG / employés sont conservés.

Les treize autres secteurs reprennent une présentation commune pour l'en-tête et le pied de page, avec logo, coordonnées existantes, titre adapté, période et numéro de page. Les couleurs et tableaux métier propres aux secteurs restent disponibles. Les PDF reçoivent également un titre documentaire, un auteur et une date de génération.

Dans l'application, chaque rapport affiche le secteur, la période appliquée, la date d'établissement et la portée des montants. La lecture utilise le défilement principal de la page. Les modifications de filtres non appliquées sont signalées ; le PDF conserve la période du rapport affiché.

## Passe par secteur et exemples locaux

Les fichiers ci-dessous utilisent exclusivement des données fictives issues des recettes automatisées.

| Secteur | Travail et contenu conservé | Exemple PDF |
| --- | --- | --- |
| Quincaillerie | En-tête et pied de page harmonisés ; achats, bénéfices, remises et recouvrements conservés. | [Quincaillerie](../artifacts/sector-reports/HARDWARE-review.pdf) |
| Magasins | Présentation commune ; situation cumulée par boutique, recouvrements et inventaires conservés. | [Magasins](../artifacts/sector-reports/GENERAL_STORE-review.pdf) |
| Location immobilière | Présentation commune ; arriérés, loyers encaissés et cautions conservés. | [Location](../artifacts/sector-reports/RENTAL-review.pdf) |
| Activités agricoles | Paysage et colonnes adaptées à la largeur ; campagnes, parcelles, opérations et exécution conservées. | [Agriculture](../artifacts/sector-reports/AGRICULTURE-review.pdf) |
| BTP | En-tête et pied de page harmonisés ; catégories de coûts réalignées dans la synthèse, situation cumulée et détail des chantiers conservés. | [BTP](../artifacts/sector-reports/BTP-review.pdf) |
| Pisciculture | Paysage et colonnes adaptées à la largeur ; bassins, cycles, espèces, alimentation et mortalité conservés. | [Pisciculture](../artifacts/sector-reports/FISH_FARMING-review.pdf) |
| Transport | Présentation commune ; détail des opérations et synthèse par devise conservés. | [Transport](../artifacts/sector-reports/TRANSPORT-review.pdf) |
| Services divers | Rapport structuré : flux par devise, recettes, dépenses, références client/prestation, regroupements XOF et interventions. Les détails ne sont plus limités aux listes génériques de 20 lignes. | [Services](../artifacts/sector-reports/SERVICES-review.pdf) |
| Exploitation minière | Même structure, adaptée aux sites et équipements ; tâches, blocages et échéances disponibles. | [Mines](../artifacts/sector-reports/MINING-review.pdf) |
| Production d'eau potable | Présentation commune ; recettes, dépenses, quantités et répartitions métier conservées. | [Eau](../artifacts/sector-reports/WATER-review.pdf) |
| Dépôt de boissons | Présentation commune ; ventes, achats, dépenses, inventaires hors caisse et rapprochements conservés. | [Boissons](../artifacts/sector-reports/BEVERAGE_DEPOT-review.pdf) |
| Hydrocarbure | Présentation commune ; devises, flux financiers et actions conservés. | [Hydrocarbure](../artifacts/sector-reports/HYDROCARBON-review.pdf) |
| Dépenses générales | Modèle de référence conservé ; vérification des deux groupes PDG et employés et de leurs totaux. | [Dépenses générales](../artifacts/sector-reports/GENERAL_EXPENSES-review.pdf) |
| Activités quotidiennes | Présentation commune ; fiches d'accord, partenaires, mouvements réels et montants prévisionnels restent distingués. | [Activités quotidiennes](../artifacts/sector-reports/DAILY_ACTIVITIES-review.pdf) |

Vue des premières pages : [planche des 14 rapports](../artifacts/sector-reports/contact-sheet.png). Les exemples longs sont volontairement volumineux pour vérifier les sauts de page.

## Périmètres financiers

- Les montants comptabilisés conservent les statuts existants : opérations enregistrées ou finalisées, sans brouillons ni rejets.
- Les tableaux métier Quincaillerie, Magasins, Location, Agriculture, BTP et Pisciculture restent calculés en XOF. Lorsqu'une autre devise existe dans les agrégats financiers, une page complémentaire présente les flux par devise ; le même récapitulatif est visible dans l'application. Aucune conversion ni modification des calculs métier n'est introduite.
- Les situations cumulées des boutiques, loyers et chantiers conservent leur date d'arrêté et leur historique antérieur à la période. Cette différence avec les seuls mouvements de la période est explicitée dans l'application.
- Les regroupements Services / Mines utilisent les dimensions et calculs XOF existants. Leurs détails financiers affichent les devises séparément. Les références non renseignées sont libellées explicitement.

## Compatibilité et données

Le schéma de données, les identifiants, métadonnées enregistrées, formules métier et règles de comptabilisation ne sont pas modifiés. Les mêmes requêtes de lecture, filtrées par entreprise et période, alimentent les rapports.

La réponse d'aperçu ajoute uniquement un champ facultatif `fieldOperationsReport` pour Services et Mines, à partir des transactions et tâches déjà chargées. Les PDF correspondants reprennent les détails complets, des en-têtes de tableau répétés et des lignes longues réparties sur plusieurs pages. Le frontend reste compatible avec une réponse ne contenant pas ce champ.

Aucune écriture métier, aucune migration, aucune suppression et aucun déploiement n'ont été effectués. Les exemples PDF et captures sont synthétiques. Aucun engagement n'est pris ici sur les performances de très gros dossiers réels ; ceux-ci restent à vérifier en recette.

## Vérifications techniques

- Compilations backend et frontend avec contrôle TypeScript.
- Suite backend : 21 fichiers et 188 tests réussis, dont 40 tests du service de rapports. Les montants et exemples métier existants restent vérifiés.
- Cas supplémentaires : rapport vide explicite pour chaque secteur, détails Services / Mines au-delà de 20 lignes, texte très long conservé jusqu'au dernier marqueur, brouillons / rejets / autre secteur exclus et complément USD d'un rapport XOF.
- Contrôle PDF des 14 exemples : pages non vides, pagination cohérente, textes dans les marges, absence de valeurs invalides ; contrôle de l'alignement de la synthèse BTP et inspection visuelle de la planche et de pages détaillées.
- Recette navigateur des 14 secteurs sur ordinateur et téléphone : tableaux métier, période visible, filtres modifiés sans application, téléchargement PDF avec les dates appliquées, absence d'écriture et de débordement horizontal de la page. Contrôles complémentaires du propriétaire et des erreurs de lecture/export.

### Reproduire localement

1. Définir `AMCCO_REPORT_ARTIFACTS=1` puis lancer `npm.cmd --workspace backend test -- src/services/reporting.service.test.ts`. Les dépôts sont simulés : cette commande ne lit aucune base réelle.
2. Lancer `python scripts/verify-sector-report-pdfs.py` avec PyMuPDF installé. Les PDF, aperçus JSON, captures, planche et manifeste sont placés dans `artifacts/sector-reports/`.
3. Avec le frontend local sur `127.0.0.1:5175`, le backend compilé et Playwright disponible, lancer `node scripts/verify-sector-reports.mjs`. `AMCCO_PLAYWRIGHT_PATH` peut pointer vers une installation de `playwright-core/index.mjs`. Toutes les API du navigateur sont interceptées et les accès externes sont bloqués. On peut limiter un contrôle à certains codes en les passant en arguments.

## Livraison

La recette avec les utilisateurs reste à faire sur un environnement de test, en comparant les mêmes périodes, montants et dossiers que leurs rapports de référence. Vérifier en particulier les dates d'arrêté des situations cumulées, les devises, les dossiers volumineux et les accords.

Livrer le backend avant le frontend, conformément aux lots précédents. Aucun changement de schéma n'est requis. Le retour à la version précédente ne demande aucune conversion des données enregistrées.
