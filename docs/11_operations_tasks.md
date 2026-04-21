# Operations Tasks v1

## Objectif

Mettre en place un flux operations simple mais exploitable:

- creation de taches par management
- assignation/desassignation a un membre actif
- suivi de statut terrain
- filtrage de lecture selon role/perimetre

## API Backend

- `GET /api/v1/operations/tasks` (filtres `status`, `scope`, `unassignedOnly`)
- `GET /api/v1/operations/tasks/:taskId` (detail tache)
- `GET /api/v1/operations/tasks/:taskId/timeline` (historique actions)
- `GET /api/v1/operations/tasks/:taskId/comments` (commentaires de suivi)
- `POST /api/v1/operations/tasks` (`OWNER`, `SYS_ADMIN`, `SUPERVISOR`)
- `POST /api/v1/operations/tasks/:taskId/comments` (acteur autorise sur la tache)
- `GET /api/v1/operations/members` (`OWNER`, `SYS_ADMIN`, `SUPERVISOR`)
- `PATCH /api/v1/operations/tasks/:taskId/assign` (`OWNER`, `SYS_ADMIN`, `SUPERVISOR`)
- `PATCH /api/v1/operations/tasks/assign-bulk` (`OWNER`, `SYS_ADMIN`, `SUPERVISOR`)
- `PATCH /api/v1/operations/tasks/:taskId/status`

## Regles metier

- les roles `OWNER`, `SYS_ADMIN`, `SUPERVISOR` gerent creation + assignation
- un `EMPLOYEE` voit seulement ses taches (creees ou assignees)
- un `EMPLOYEE` peut changer le statut seulement des taches qui lui sont assignees
- assignation possible uniquement vers un membre actif de la meme entreprise avec role `SUPERVISOR` ou `EMPLOYEE`
- une tache `DONE` ne peut pas etre re-assignee
- auto-transition: `TODO -> IN_PROGRESS` a l'assignation, `IN_PROGRESS -> TODO` a la desassignation
- assignation en lot disponible (max 100 taches)
- actions critiques auditees (`TASK_CREATED`, `TASK_ASSIGNED`, `TASK_UNASSIGNED`, `TASK_STATUS_CHANGED`)
- commentaires de suivi avec auteur/date (`task_comments`)
- detail tache + timeline bases sur `audit_logs` (ordre chronologique inverse)

## Frontend

Ecran:

- `frontend/src/pages/OperationsTasksPage.tsx`

Capacites:

- filtres par statut et perimetre
- filtre rapide "non assignees uniquement"
- creation de tache (management)
- tableau de charge par membre (ouvertes, en cours, bloquees)
- assignation/desassignation inline (management)
- assignation en lot avec note d'audit
- mise a jour du statut selon permissions
- table detaillee (createur, assigne, echeance, date de MAJ)
- clic sur carte pour ouvrir la page detail tache
- page detail avec timeline des actions (qui, quoi, quand)
- ajout de commentaires sur la page detail, affiches dans la timeline operationnelle
