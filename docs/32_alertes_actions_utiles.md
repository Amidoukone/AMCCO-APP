# Alertes centrées sur les actions utiles

## Diffusions informatives évitées

Le service d'alertes ignore les diffusions collectives de niveau `INFO` pour :

- `TASK_CREATED_BY_EMPLOYEE` : simple création d'une tâche par un employé ;
- `FINANCE_TRANSACTION_SUBMITTED` : ancien enregistrement d'une transaction ;
- `FINANCE_SALARY_SUBMITTED`, `FINANCE_SALARY_CREATED`, `FINANCE_SALARY_UPDATED` :
  copie collective d'un enregistrement ou d'une correction courante de paie.

Ces événements restent enregistrés dans le journal d'audit et consultables dans
leurs écrans métier. Le filtrage intervient avant la recherche SQL des destinataires
et avant toute insertion d'alerte. Les anciennes alertes ne sont pas supprimées.

## Notifications conservées

Les affectations de tâches, les blocages et les notifications de fin de tâche au
créateur restent actifs. Le salarié continue de recevoir son information de paie.
Les alertes `WARNING` et `CRITICAL`, notamment les modifications/suppressions
financières sensibles et les changements administratifs, sont conservées.
Un code nouveau ou inconnu reste transmis : seuls les événements listés ci-dessus
sont exclus des diffusions informatives collectives.

Un réenregistrement séquentiel d'un statut déjà `BLOCKED` ou `DONE` ne crée plus
de nouvelle alerte. Un passage réel vers ces statuts continue de notifier les
destinataires prévus. La déduplication n'est pas une garantie contre deux écritures
strictement simultanées ; aucun verrou ou changement de schéma n'est ajouté.

## Vérification

Les tests couvrent l'absence de requête destinataire et d'insertion pour les
diffusions supprimées, la conservation des alertes élevées et directes, l'exclusion
de l'acteur, la déduplication des destinataires et les statuts réenregistrés.
Les API de consultation, compteurs, lecture et suppression des alertes gardent
leur contrat et leur périmètre entreprise/utilisateur. Aucune migration requise.

## Cohérence de l'interface multi-entreprise

La liste et les réponses de lecture/suppression sont rattachées au contexte
entreprise/utilisateur au démarrage de chaque opération. Les réponses et erreurs
tardives d'un ancien contexte sont ignorées. Les événements qui synchronisent le
compteur de navigation portent aussi l'entreprise et l'utilisateur concernés.
Le compteur est remis à zéro pendant le changement de contexte, puis synchronisé
sur le résultat de liste déjà reçu, sans ajouter de requête de comptage.

La recette locale `node scripts/verify-alerts-coherence.mjs` vérifie sur bureau et
mobile les réponses de lecture, lecture groupée, suppression et suppression groupée
retardées (succès et erreurs), une consultation normale et une liste source tardive.
Elle utilise exclusivement des API simulées sur `http://127.0.0.1:5175`.

Dans un même contexte, les actions de lecture et de suppression sont sérialisées.
Le démarrage d'une action invalide les lectures déjà en cours. Si une lecture ou
un changement de filtre a chevauché l'action, une seule resynchronisation silencieuse
est effectuée avec les filtres actuels. Une action isolée n'ajoute pas de lecture.
Les erreurs d'écriture restent visibles après cette resynchronisation. Les tests
couvrent aussi ces chevauchements en succès et en échec pour les quatre actions,
sans modifier les données de production.
