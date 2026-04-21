# Alertes ciblees v1

## Objectif

Fermer le point restant du lot 3 avec un vrai flux d'alertes exploitable:

- alertes adressees a des utilisateurs precis
- compteur non lu par utilisateur
- lecture unitaire et lecture globale
- emission sur evenements metier critiques

## Schema

Le module repose sur la table `alerts` avec:

- `company_id`
- `target_user_id`
- `code`
- `message`
- `severity`
- `entity_type`
- `entity_id`
- `metadata`
- `read_at`

Migration d'upgrade:

- `backend/sql/005_add_targeted_alerts.sql`

## API Backend

- `GET /api/v1/alerts`
- `GET /api/v1/alerts/summary`
- `PATCH /api/v1/alerts/:alertId/read`
- `PATCH /api/v1/alerts/read-all`

## Regles metier

- une alerte est ciblee par utilisateur et non pas partagee globalement
- les alertes sont toujours scopees par entreprise
- un utilisateur ne peut lire/mettre a jour que ses propres alertes
- le dashboard compte uniquement les alertes non lues du user courant

## Emission d'alertes

Finance:

- soumission de transaction -> alertes vers `OWNER`, `SYS_ADMIN`, `ACCOUNTANT`
- decision comptable -> alerte vers le createur de la transaction
- les alertes finance embarquent aussi la trace de gouvernance: secteur, compte, portee et compatibilite

Operations:

- creation/assignation de tache -> alerte vers l'assigne
- passage en `BLOCKED` -> alerte management (`OWNER`, `SYS_ADMIN`, `SUPERVISOR`)
- passage en `DONE` -> alerte vers le createur si different de l'acteur

## Frontend

Ecrans / integration:

- `frontend/src/pages/AlertsPage.tsx`
- badge d'alertes non lues dans `AppLayout`

Capacites:

- filtrage `non lues uniquement`
- filtrage par severite
- filtrage par entite (`entityType`, `entityId`) pour navigation croisee
- marquage unitaire comme lu
- marquage global comme lu
