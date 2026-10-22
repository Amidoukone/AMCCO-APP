# Dépôt de boissons : saisie opérateur

Date : 22 octobre 2026.

## Problème reproduit

Après une première vente, la réinitialisation du formulaire effaçait `beverageOperationKind`. Le sélecteur affichait toujours « Vente » grâce à une valeur de repli, mais la préparation de la requête ne rétablissait pas cette catégorie. La vente suivante échouait avec le message de catégorie obligatoire, même si tous les champs métier étaient remplis. Le champ Précision n'était pas la cause et reste facultatif.

## Corrections

- La préparation des données transmet la catégorie effectivement affichée, y compris pour un formulaire sans catégorie initialisée.
- Le formulaire réinitialisé contient explicitement la catégorie Vente.
- Le guide de saisie décrit les opérations disponibles, les champs à remplir et l'enregistrement.
- Les consignes sur les tâches de rapprochement ont été retirées de la saisie financière. L'opérateur conserve ses permissions actuelles.
- L'espace opérateur présente les ventes, achats et dépenses accessibles avec son compte.
- Précision est explicitement facultative ; les champs métier obligatoires portent un astérisque.
- Les indications expliquent les unités de quantité et de prix, le calcul du total et l'utilité du prix d'achat dans une vente pour le bénéfice brut.
- Les champs Compte et Opération restent dans leurs colonnes sans chevauchement.

## Vérification locale

`node scripts/verify-sector-cashflows.mjs --beverage-only` utilise un navigateur et des API simulées, avec validation des écritures par les profils métier réels compilés du backend.

Parcours couverts sur ordinateur et mobile :

- compte comptable : quatre raccourcis, calculs, échec et nouvelle tentative, modification et conservation des métadonnées historiques ;
- compte opérateur : deux ventes consécutives sans Précision depuis le formulaire standard, puis les quatre opérations sans Précision ;
- modification d'une vente historique avec suppression de la Précision, conservation de la date et des métadonnées d'archive ;
- changement direct de Vente vers Dépense et vérification de la catégorie et du sens du mouvement transmis ;
- absence d'accès ajouté aux tâches et aux rapports, champs obligatoires et absence de débordement horizontal.

Compilation frontend vérifiée. Cette correction porte sur l'interface ; aucune migration ni modification de données de production. Aucun déploiement effectué.
