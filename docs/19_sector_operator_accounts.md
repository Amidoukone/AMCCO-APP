# Comptes opérateurs sectoriels

## Rôles

- `HARDWARE_OPERATOR` : accès aux transactions du secteur `HARDWARE` (Quincaillerie).
- `HYDROCARBON_OPERATOR` : accès aux transactions du secteur `HYDROCARBON` (Hydrocarbure).
- `BEVERAGE_DEPOT_OPERATOR` : accès aux transactions du secteur `BEVERAGE_DEPOT` (Dépôt de boissons).

Un administrateur système crée chaque compte depuis Administration > Utilisateurs en choisissant le rôle correspondant. Ces rôles créent une adhésion à l'entreprise active uniquement. Une adresse dédiée est exigée afin qu'un utilisateur déjà rattaché à d'autres entreprises ne récupère pas un périmètre plus large.

## Accès

Les opérateurs peuvent consulter la liste de leur secteur et saisir une transaction. Les activités retournées par l'API sont limitées à leur secteur, et les requêtes de transactions remplacent tout filtre client par le secteur associé au rôle. Les comptes financiers visibles et utilisables doivent être dédiés à ce secteur, afin de ne pas exposer le solde d'une caisse globale ou partagée. L'administration doit donc rattacher au moins un compte financier dédié au secteur.

Les API des rapports, tableaux de bord, tâches, salaires, administration et des autres secteurs sont refusées pour ces rôles, même lorsqu'elles sont appelées directement sans passer par le menu.

## Comptes financiers en production

Le déploiement du code ne transfère pas les comptes créés dans la base locale.
Au démarrage du backend, chaque entreprise active disposant d'un opérateur actif
et de son secteur activé reçoit une caisse dédiée si aucun compte utilisable par
cet opérateur n'existe. Cette vérification couvre Quincaillerie, Hydrocarbure et
Dépôt de boissons. Elle est aussi exécutée lors de la création d'un opérateur ou
de l'attribution d'un rôle opérateur.

Les caisses créées portent le nom « Caisse opérateur » suivi du secteur et ont un
solde initial de zéro. Un compte dédié existant, ou un compte restreint uniquement
à ce secteur, est conservé. Les soldes, transactions historiques et comptes
globaux ne sont pas modifiés. Les créations sont transactionnelles, journalisées
dans `audit_logs` et protégées contre les doublons lors de démarrages simultanés.

Après déploiement du backend sur Render, reconnecter les opérateurs et vérifier
le sélecteur Compte de leur formulaire de transaction. Si les utilisateurs
opérateurs eux-mêmes n'existent pas en production, les créer depuis
Administration > Utilisateurs ; les identifiants locaux ne sont pas transférés.

## Schéma

Les rôles opérateurs sont ajoutés à l'ENUM `memberships.role` par les migrations SQL numérotées. La migration `backend/sql/017_add_beverage_depot_operator_role.sql` ajoute le rôle Dépôt de boissons. Le démarrage du backend applique aussi l'évolution de manière idempotente pour les bases existantes.
