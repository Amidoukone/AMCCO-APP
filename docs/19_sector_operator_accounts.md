# Comptes opérateurs sectoriels

## Rôles

- `HARDWARE_OPERATOR` : accès aux transactions du secteur `HARDWARE` (Quincaillerie).
- `HYDROCARBON_OPERATOR` : accès aux transactions du secteur `HYDROCARBON` (Hydrocarbure).
- `BEVERAGE_DEPOT_OPERATOR` : accès aux transactions du secteur `BEVERAGE_DEPOT` (Dépôt de boissons).

Un administrateur système crée chaque compte depuis Administration > Utilisateurs en choisissant le rôle correspondant. Ces rôles créent une adhésion à l'entreprise active uniquement. Une adresse dédiée est exigée afin qu'un utilisateur déjà rattaché à d'autres entreprises ne récupère pas un périmètre plus large.

## Accès

Les opérateurs peuvent consulter la liste de leur secteur et saisir une transaction. Les activités retournées par l'API sont limitées à leur secteur, et les requêtes de transactions remplacent tout filtre client par le secteur associé au rôle. Les comptes financiers visibles et utilisables doivent être dédiés à ce secteur, afin de ne pas exposer le solde d'une caisse globale ou partagée. L'administration doit donc rattacher au moins un compte financier dédié au secteur.

Les API des rapports, tableaux de bord, tâches, salaires, administration et des autres secteurs sont refusées pour ces rôles, même lorsqu'elles sont appelées directement sans passer par le menu.

## Schéma

Les rôles opérateurs sont ajoutés à l'ENUM `memberships.role` par les migrations SQL numérotées. La migration `backend/sql/017_add_beverage_depot_operator_role.sql` ajoute le rôle Dépôt de boissons. Le démarrage du backend applique aussi l'évolution de manière idempotente pour les bases existantes.
