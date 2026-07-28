# Finance Workflow v1

## Objectif

Mettre en place un flux financier exploitable:

- saisie transaction terrain
- preuve obligatoire configurable
- soumission avec finalisation automatique
- aucune validation comptable n'est requise pour comptabiliser la transaction

## API Backend

- `GET /api/v1/finance/accounts`
- `POST /api/v1/finance/accounts` (`OWNER`, `SYS_ADMIN`, `ACCOUNTANT`)
- `GET /api/v1/finance/transactions`
- `POST /api/v1/finance/transactions`
- `GET /api/v1/finance/transactions/:transactionId/proofs`
- `GET /api/v1/finance/transactions/:transactionId/proofs/upload-auth`
- `POST /api/v1/finance/transactions/:transactionId/proofs`
- `PATCH /api/v1/finance/transactions/:transactionId/submit`
- `PATCH /api/v1/finance/transactions/:transactionId/review` (`OWNER`, `SYS_ADMIN`, `ACCOUNTANT`)

## Regles metier

- une transaction est creee en `DRAFT`
- la preuve est obligatoire avant soumission
- la soumission finalise la transaction en `APPROVED` sans action comptable separee
- les anciens statuts `SUBMITTED` restent pris en compte dans les rapports comme flux comptabilises
- chaque action critique est journalisee en audit
- les comptes financiers suivent un modele hybride:
- `GLOBAL`: visible/utilisable sur tous les secteurs
- `DEDICATED`: reserve a un seul secteur
- `RESTRICTED`: partage uniquement entre secteurs autorises
- un compte ne peut pas etre utilise pour une transaction hors de son perimetre secteur
- creation compte global reservee a `OWNER` et `SYS_ADMIN`
- `ACCOUNTANT` peut creer des comptes dedies ou restreints, pas des comptes globaux entreprise

## Frontend

Ecran:

- `frontend/src/pages/FinanceTransactionsPage.tsx`

Capacites:

- creation compte financier (selon role)
- creation transaction
- upload fichier preuve vers ImageKit + enregistrement metadata
- consultation des preuves associees (liens cliquables)
- soumission
- approbation/rejet
- liste des transactions recentes
- detail transaction avec gouvernance compte/secteur
- navigation croisee vers alertes et audit lies a la transaction
