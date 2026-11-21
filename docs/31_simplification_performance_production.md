# Simplification et performance : procédure de déploiement

## Garanties

Cette évolution ne supprime aucune transaction, pièce justificative, tâche,
compte, utilisateur, journal d'audit ou donnée sectorielle. Le code historique
`REAL_ESTATE_AGENCY` reste uniquement dans la base pour éviter de rendre des
lignes existantes illisibles ; il est retiré des parcours actifs et des rapports.

## Transaction directe

Une création ou une modification est maintenant enregistrée directement. Les
routes publiques de soumission et d'approbation sont retirées. La colonne SQL
`status` est conservée temporairement pour la compatibilité des données et des
contraintes existantes, mais n'est plus une étape de travail.

Avant le déploiement, prendre une sauvegarde restaurable puis exécuter
`backend/sql/029_simplify_transaction_lifecycle.sql` sur une copie de la base,
valider les totaux par secteur, et seulement ensuite l'exécuter une fois sur la
base de production. Sélectionner explicitement la base cible dans la session SQL
avant l'exécution : le script ne choisit volontairement aucun schéma. La migration convertit seulement les anciennes lignes
`DRAFT` et `SUBMITTED` en `APPROVED`; les anciens rejets restent inchangés.

## Exports

L'interface rapports conserve le PDF. Les routes publiques CSV/Excel des
rapports sont retirées afin d'éviter des traitements et transferts inutiles.
Les générateurs internes CSV/XLSX, leurs helpers et requêtes dédiés ainsi que
les tests propres à ces formats ont également été supprimés. La dépendance
`xlsx` a été retirée du manifeste backend et du verrou de dépendances.
Les tests de synthèse salariale, de calcul métier et de génération PDF sont conservés.

## Passe de cohérence locale

La création et la modification des salaires utilisent aussi l'enregistrement direct :
elles ne rappellent plus la soumission d'une transaction déjà finalisée. Les tests
utilisent des salaires persistés en `APPROVED`, vérifient l'absence de soumission
et d'approbation supplémentaires et conservent les notifications de paie.
Le contexte frontend refuse aussi la réintroduction du secteur retiré par une
mise à jour administrative. `RENTAL` (Location immobilière) reste actif.

Contrôles exécutés après cette passe : compilations backend et frontend,
232 tests backend, recette navigateur intégrée sur 14 secteurs en bureau et mobile,
changements d'entreprise/secteur, export PDF obsolète ignoré et réponses
administratives tardives isolées par entreprise. La recette navigateur utilise
des API simulées et n'accède pas aux données de production. La migration doit
encore être validée sur une copie de la base avant déploiement.

Le tableau de bord compte les tâches ouvertes par statut, pour qu'une tâche à la
fois bloquée et en retard ne soit pas comptée deux fois. Le flux net est identifié
comme tel et le raccourci PDF n'affiche plus le nombre d'alertes. Les tests HTTP
vérifient à la fois le refus du secteur retiré et le maintien des créations pour
Location immobilière. Le catalogue des profils actifs exclut le secteur retiré ;
son profil reste disponible en lecture explicite pour l'historique.

## Vérifications après déploiement

1. Créer, modifier et consulter une transaction dans un secteur standard.
2. Vérifier une vente et un ajustement du dépôt de boissons.
3. Contrôler le dashboard, un rapport PDF et les totaux d'une période connue.
4. Surveiller les logs `Slow database query` et le temps de réponse de
   `/dashboard/summary` et `/reports/overview`.
