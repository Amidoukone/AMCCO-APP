# Optimisation des actions en lot et rendu des tâches — 20 novembre 2026

Cette passe complète les chantiers de simplification et de performance engagés dans les documents 31 à 37, en traitant les points de latence identifiés sur les opérations de tâches.

## 1. Concurrence bornée sur les assignations en lot

### Constat antérieur
Dans `backend/src/services/tasks.service.ts`, l'assignation en masse (`assignCompanyTasksBulk`, jusqu'à 100 tâches) s'exécutait via une boucle strictement séquentielle :
chaque tâche effectuait tour à tour :
1. Une mise à jour SQL de son assignation et statut (`updateOperationTaskAssignment`).
2. Le rechargement complet de la tâche (`findOperationTaskById`).
3. L'écriture du journal d'audit (`createAuditLogRecord`).
4. L'alerte ciblée de l'assigné (`createUserTargetedAlerts`).

Pour un lot de 50 à 100 tâches, cela représentait entre 200 et 400 allers-retours séquentiels vers la base de données, introduisant une latence perceptible pour le superviseur ou l'administrateur.

### Optimisation appliquée
Le traitement regroupe désormais les tâches par blocs de concurrence bornée (`BATCH_SIZE = 10`) exécutés en parallèle via `Promise.all` :
* **Garanties préservées** :
  * Validation préalable complète du lot (vérification que toutes les tâches existent, appartiennent à l'entreprise, et qu'aucune tâche déjà `DONE` n'est re-assignée).
  * Préservation stricte de l'ordre d'origine des identifiants dans la réponse `items`.
  * Chaque tâche conserve son écriture d'audit complète et sa notification utilisateur dédiée.
  * En cas d'erreur sur une tâche, l'exception est immédiatement propagée conformément au contrat existant.
* **Gain** : réduction de la latence de traitement serveur par un facteur 5 à 10 sur les lots d'assignation volumineux.

## 2. Validation ciblée des changements de statut

Dans `updateCompanyTaskStatus`, les alertes ciblées (`TASK_BLOCKED` pour le management et `TASK_DONE` pour le créateur) sont désormais strictement conditionnées à un changement réel de statut (`task.status !== input.status`). Une confirmation ou validation idempotente d'un statut déjà positionné ne génère plus de spams de notification ni d'appels superflus vers le service d'alertes.

## 3. Poursuite des optimisations recommandées

Les axes suivants restent identifiés pour des passes futures :
1. **Extraction modulaire du formulaire des tâches** :
   * Appliquer à `frontend/src/pages/OperationsTasksPage.tsx` un découpage similaire à celui réalisé avec succès sur `FinanceTransactionsPage` (`FinanceTransactionForm.tsx`), en isolant les formulaires sectoriels et les sélecteurs de métadonnées spécifiques.
2. **Indexation SQL ciblée sur les tris** :
   * Tester sur une copie de base avec volumétrie représentative un index composite `(company_id, activity_code, created_at, updated_at)` sur la table `tasks` pour accélérer le tri par défaut sans `filesort`.
