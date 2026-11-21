# Cohérence des actions de tâches, indexation et utilitaires modulaires — 20 novembre 2026

Cette passe s'inscrit dans la continuité directe des optimisations de performances et de cohérence (passes 31 à 38). Elle consolide la structure de l'application sur le chargement, la validation et l'affichage des tâches opérationnelles sans casser l'existant.

---

## 1. Indexation SQL et accélération des listes de tâches

### Constat
Les requêtes de listing des tâches opérationnelles (`listOperationsTasks` dans `backend/src/repositories/tasks.repository.ts`) filtrent par entreprise et secteur d'activité :
```sql
WHERE t.company_id = ? AND t.activity_code = ? ...
ORDER BY t.created_at DESC, t.updated_at DESC, ...
```
L'index existant `idx_task_company_activity_status (company_id, activity_code, status)` ne couvrait pas le tri chronologique par défaut (`created_at DESC, updated_at DESC`), contraignant le moteur MySQL à un `filesort` lors du parcours paginé des tâches.

### Optimisation appliquée
1. **Bootstrap dynamique** : ajout de l'index composite `idx_task_company_activity_created (company_id, activity_code, created_at, updated_at)` dans `backend/src/lib/schema-bootstrap.ts` via `ensureActivityColumnOnTasks`, avec vérification d'existence (`indexExists`) évitant toute erreur au démarrage.
2. **Script de migration versionné** : création de `backend/sql/030_add_task_listing_index.sql` pour assurer la traçabilité des montées de version en production.
3. **Gain** : élimination du `filesort`, accélération de la pagination et allègement de la charge I/O sur le serveur de base de données.

---

## 2. Parallélisation et réduction de latence sur les mutations serveur

Dans `backend/src/services/tasks.service.ts`, plusieurs opérations d'écriture enchaînaient des requêtes SQL de manière séquentielle, allongeant inutilement le temps de réponse aux actions utilisateur.

* **Création de tâche (`createCompanyTask`)** :
  * La vérification d'activation de l'activité (`ensureCompanyActivityEnabledOrThrow`) et la validation du membre assigné (`findCompanyTaskAssigneeByUserId`) s'exécutent désormais en parallèle (`activityCheckPromise` et `findCompanyTaskAssigneeByUserId`), sur le modèle déjà éprouvé dans `finance.service.ts`.
* **Suppression de tâche (`deleteCompanyTask`)** :
  * L'insertion du journal d'audit (`createAuditLogRecord`) et la suppression physique (`deleteOperationTask`) s'exécutent désormais conjointement via `Promise.all`.
* **Commentaires (`addCompanyTaskComment`)** :
  * L'écriture d'audit et la relecture du commentaire créé sont regroupées en un seul aller-retour parallèle (`Promise.all([createAuditLogRecord, findTaskCommentById])`).
* **Pièces jointes (`addAttachmentToCompanyTask`)** :
  * L'audit de téléversement et le rechargement de la liste des pièces jointes s'exécutent en parallèle (`Promise.all([createAuditLogRecord, listTaskAttachments])`).

---

## 3. Extraction modulaire des utilitaires de tâches (`operationsTasks.ts`)

### Constat
À l'instar de `FinanceTransactionsPage.tsx` avant la passe 35, `frontend/src/pages/OperationsTasksPage.tsx` accumulait plus de 500 lignes de constantes, types, gardes et fonctions de formatage purs (labels de secteurs, validation des protocoles d'accord, calcul des statuts, détection des natures d'activité), dupliqués en partie dans `TaskDetailsPage.tsx`.

### Architecture appliquée
Création du module partagé [`frontend/src/utils/operationsTasks.ts`](file:///C:/Users/konea/Desktop/Projet%20AMCCO/AMCCO-APP/frontend/src/utils/operationsTasks.ts) regroupant :
* **Constantes & Tailles de page** : `TASKS_PAGE_SIZE`, `TASKS_MOBILE_PAGE_SIZE`, `TASKS_SERVICE_SUGGESTION_HISTORY_SIZE`, `DEFAULT_TASKS_VISIBLE_PAGE_SIZE`, `getTasksFetchPageSize`.
* **Types & Dictionnaires sectoriels** :
  * Agriculture (`AgricultureTaskKind`, `AGRICULTURE_TASK_LABELS`, `isAgricultureTaskKind`)
  * BTP (`BtpTaskKind`, `BTP_TASK_LABELS`, `isBtpTaskKind`)
  * Magasins / Alimentation (`FoodTaskKind`, `FOOD_TASK_LABELS`, `isFoodTaskKind`)
  * Location (`RentalTaskKind`, `RENTAL_TASK_LABELS`, `isRentalTaskKind`)
  * Hôtellerie (`HotelTaskKind`, `HOTEL_TASK_LABELS`, `isHotelTaskKind`)
  * Agence (`AgencyTaskKind`, `AGENCY_TASK_LABELS`, `isAgencyTaskKind`)
  * Pisciculture (`FishFarmingTaskKind`, `FISH_FARMING_TASK_LABELS`, `isFishFarmingTaskKind`)
  * Élevage (`LivestockTaskKind`, `LIVESTOCK_TASK_LABELS`, `isLivestockTaskKind`)
  * Dépenses générales (`GeneralExpenseKind`, `GENERAL_EXPENSE_KIND_LABELS`, `isGeneralExpenseKind`)
  * Protocoles d'accord & activités quotidiennes (`isRequiredDailyAgreementField`, `DAILY_PROTOCOL_CATEGORY`)
* **Formatage et UI** : `statusLabel`, `statusToneClass`, `statusShortMetric`, `memberLabel`, `formatDate`, `formatFileSize`, `formatMetadataValue`, `formatMetadataSummary`, `createDefaultTaskForm`, `syncMetadataState`, `toErrorMessage`.

### Résultats
* Réduction de la taille de `OperationsTasksPage.tsx` de 3 055 à 2 570 lignes (-485 lignes).
* Élimination des doublons de code dans `TaskDetailsPage.tsx`.
* Cohérence stricte et unique des libellés et des statuts visuels à travers toute l'application.

---

## 4. Sécurisation et conformité des contextes

* **`TaskDetailsPage.tsx`** :
  * Réutilisation des utilitaires centralisés (`statusLabel`, `statusToneClass`, `formatFileSize`, `toErrorMessage`).
  * Déclaration de l'état `isSaving` remontée avant le hook `useEffect` du scope d'action, garantissant la conformité stricte avec les règles d'initialisation des variables fermées par les hooks d'effet.
* **`frontend/src/lib/api.ts`** :
  * Protection par chaînage optionnel `import.meta.env?.VITE_API_BASE_URL` évitant toute exception `TypeError` lors de l'exécution en environnement hors navigateur ou outillé.

---

## 5. Vérifications effectuées

1. **Compilation TypeScript & typecheck global** :
   * `npm run typecheck --workspaces` passé avec code 0 sur l'ensemble des modules `amcco-backend` et `amcco-frontend`.
2. **Tests unitaires des utilitaires et règles de profils** :
   * Validation complète des helpers de statut, du dimensionnement des pages, des règles de protocole d'accord et des contraintes sectorielles (agriculture, mines, BTP).
3. **Non-régression fonctionnelle** :
   * Maintien strict des permissions de rôles (`OWNER` en lecture seule, `SUPERVISOR`/`SYS_ADMIN` en assignation).
   * Rétro-compatibilité intégrale préservée pour tous les secteurs.
