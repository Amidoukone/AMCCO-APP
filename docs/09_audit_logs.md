# Journal d'audit

## Objectif

Rendre la traçabilite exploitable par le proprietaire et l'admin systeme.

## API

- `GET /api/v1/admin/audit-logs`
  - query optionnelle: `limit`, `offset`, `action`, `actorId`, `entityType`, `entityId`

## Donnees retournees

- date/heure de l'action
- action metier (`AUTH_LOGIN`, `ADMIN_USER_CREATED`, etc.)
- acteur (id, nom, email)
- entite cible (type + id)
- metadata JSON
- pour la finance, les metadata incluent aussi la trace secteur + gouvernance du compte

## Ecran frontend

- `frontend/src/pages/SecuritySettingsPage.tsx`
- filtres action/acteur
- tableau des evenements recents

## Evenements actuellement journalises

- `AUTH_LOGIN`
- `AUTH_REFRESH`
- `AUTH_LOGOUT`
- `ADMIN_USER_CREATED`
- `ADMIN_USER_UPDATED`
- `ADMIN_USER_ROLE_CHANGED`
- `ADMIN_USER_PASSWORD_RESET`
- `ADMIN_USER_REMOVED`
- `FINANCE_ACCOUNT_CREATED`
- `FINANCE_TRANSACTION_CREATED`
- `FINANCE_PROOF_ADDED`
- `FINANCE_TRANSACTION_SUBMITTED`
- `FINANCE_TRANSACTION_APPROVED`
- `FINANCE_TRANSACTION_REJECTED`
