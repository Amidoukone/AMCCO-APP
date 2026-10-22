# Organisation des cinq secteurs de terrain et des activités quotidiennes

Date : 21 octobre 2026. État : changements locaux prêts pour recette métier, sans déploiement.

## Parcours simplifiés

| Secteur | Transactions | Tâches / activités |
| --- | --- | --- |
| Activités agricoles | Accès directs Achat d'intrants, Travaux, Vente de récolte et Appui. Campagne et parcelle restent obligatoires. | Liste des interventions avant la saisie, recherche par campagne et parcelle, échéance conservée. |
| Pisciculture | Accès directs Alevins, Aliment, Charge, Vente et Appui. Bassin et cycle restent obligatoires. | Liste des interventions avant la saisie, références bassin/cycle, responsable et date conservés. |
| Transport | Recette ou dépense, puis catégorie de véhicule. La sélection Camion benne respecte le sens du flux choisi ; les calculs de voyages et la synthèse dédiée restent disponibles. | Liste des missions avant la saisie, recherche par véhicule et trajet, responsable et échéance conservés. |
| Exploitation minière | Recette ou dépense avec site obligatoire et équipement facultatif. | Liste des interventions avant la saisie et rappel du filtre Bloquée. Responsable, échéance et criticité des blocages restent inchangés. |
| Activités quotidiennes | Vue Versements : partenaire, bénéfice reçu, retour de capital et dépense d'accord. | Vue Activités et accords, raccourci de création d'une fiche d'accord, gestion des catégories dans une vue distincte. |

Les listes financières précèdent les synthèses, les comptes et les formulaires, initialement repliés. Les champs métier sont ouverts et placés avant le justificatif facultatif. Les synthèses affichent les devises séparément ; elles concernent uniquement les opérations chargées après recherche et filtres, tous statuts. Les rapports restent la référence pour les totaux comptabilisés de la période complète.

Les listes des tâches précèdent également leur formulaire pour ces cinq secteurs. Les références métier sont déjà présentes dans les cartes et restent recherchables dans tout l'historique autorisé. Aucun nouveau référentiel de campagnes, bassins ou véhicules n'est créé.

## Activités quotidiennes et catégories

- Les onglets distinguent « Activités et accords » et « Versements ». La fiche décrit les engagements ; chaque versement réel se saisit dans les transactions.
- « Créer une fiche d'accord » prépare une nouvelle fiche avec la catégorie Protocole d'accord. Remplacer un brouillon demande confirmation. Le partenaire, la référence et la nature de l'accord restent à renseigner ; le capital devient obligatoire pour un accord financier, selon les règles existantes.
- Créer un accord ne crée aucune transaction financière. Le capital prévu ne devient pas une recette.
- La vue Catégories est accessible à `/operations/tasks?activityCode=DAILY_ACTIVITIES&view=categories` pour les administrateurs système, comptables et superviseurs, conformément aux droits existants.
- La liste des catégories précède son formulaire, avec recherche, actualisation et reprise après erreur. Une fiche d'une autre entreprise est exclue de cette liste à l'affichage. Les API et les confirmations de suppression existantes sont conservées.
- L'ancienne ancre `#daily-activity-categories` ouvre la nouvelle vue et le formulaire. Le titre mobile et le fil d'Ariane suivent la vue.

## Protection des données

La saisie ne produit aucune écriture avant validation du formulaire. Un échec de sauvegarde conserve le brouillon. La navigation entre activités, catégories et autres pages demande confirmation lorsqu'une saisie est modifiée.

Les métadonnées historiques absentes des formulaires actuels sont conservées lors d'une modification dans les transactions et tâches de ces cinq secteurs. Les essais vérifient notamment les références de campagne, parcelle, bassin, cycle, véhicule, site, équipement et accord, ainsi que le montant, la date et l'identifiant des transactions, et l'échéance et le responsable des tâches. Une nouvelle fiche n'hérite pas des métadonnées du précédent enregistrement.

Ce lot modifie uniquement le frontend, les recettes locales et cette documentation. Les API, codes de secteur, schémas, validations et calculs métier restent inchangés. Aucun accès aux données de production, aucune migration, aucune suppression de données et aucun déploiement n'ont été effectués.

## Vérifications

- Compilation frontend et contrôle TypeScript.
- Suite backend : 21 fichiers, 171 tests réussis.
- `scripts/verify-sector-cashflows.mjs --field-sectors` : cinq secteurs sur ordinateur et téléphone, 17 actions courantes, calculs quantité × prix et voyages × prix, devises séparées, annulation d'un remplacement de brouillon, échec d'écriture puis nouvel essai, conservation des identifiants, dates et métadonnées historiques. Le choix Camion benne est contrôlé après l'action Recette et après l'action Dépense.
- `scripts/verify-sector-field-tasks.mjs` : cinq secteurs sur ordinateur et téléphone, modification des mêmes identifiants, conservation des références, responsables et échéances, recherche serveur sans perte de saisie, navigation annulée, création d'accord sans transaction, catégories distinctes, recherche, reprise après erreur, modification et création. Contrôle des accès propriétaire, employé et superviseur, et de l'ancienne ancre des catégories.
- Recettes précédentes conservées : `verify-sector-ux.mjs`, `verify-sector-directories.mjs` et `verify-sector-cashflows.mjs` sans option.
- Captures locales dans `artifacts/sector-ux/`, préfixes `agriculture`, `fish_farming`, `transport`, `mining`, `daily_activities` et `daily-categories`.

Ces recettes exigent le frontend local sur `127.0.0.1:5175`, les profils backend compilés et Playwright. `AMCCO_PLAYWRIGHT_PATH` désigne une installation existante de `playwright-core/index.mjs`. Toutes les API sont simulées ; les écritures sont contrôlées avec les profils métier du backend et les accès réseau externes sont bloqués. Elles ne constituent pas une validation des dossiers réels ni des performances de production.

## Livraison

La recette métier avec les utilisateurs reste nécessaire avant déploiement : comparer une campagne, un cycle piscicole, les catégories de véhicules utilisées, un site minier et un accord avec leurs opérations et rapports sur la même période. Vérifier aussi la visibilité des tâches bloquées et les autorisations des rôles réels.

Appliquer l'ordre de déploiement documenté dans `21_livraison_ergonomie_quincaillerie.md` pour les corrections communes précédentes : backend de recherche avant frontend. Ce lot ne demande aucune migration supplémentaire.

Les 14 secteurs actifs indiqués par l'utilisateur ont désormais reçu un premier lot d'améliorations locales. La validation métier et la livraison en production restent à réaliser.
