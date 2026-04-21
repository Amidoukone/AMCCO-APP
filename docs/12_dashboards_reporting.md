# Dashboards et reporting v1

## Objectif

Ajouter le lot 4 sur une base deja operationnelle:

- un tableau de bord exploitable par role
- une consolidation lisible des donnees finance et operations
- des exports CSV immediats pour retraitement externe

## API Backend

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/reports/overview`
- `GET /api/v1/reports/exports/overview.pdf`
- `GET /api/v1/reports/exports/transactions.csv`
- `GET /api/v1/reports/exports/transactions.xlsx`
- `GET /api/v1/reports/exports/tasks.csv`
- `GET /api/v1/reports/exports/tasks.xlsx`

Parametres optionnels de reporting:

- `dateFrom` (ISO datetime)
- `dateTo` (ISO datetime)

## Regles metier

- le dashboard est accessible a tous les roles applicatifs autorises sur l'app
- la vue taches recentes d'un `EMPLOYEE` reste limitee a son perimetre (cree par lui ou assigne a lui)
- la charge equipe n'est exposee qu'aux roles management/reporting
- les consolidations financieres conservent une ventilation par devise pour eviter les montants faux en multi-devise
- les rapports et exports sont limites aux roles `OWNER`, `SYS_ADMIN`, `ACCOUNTANT`, `SUPERVISOR`
- le filtre temporel s'applique aux transactions via `occurred_at`
- le filtre temporel s'applique aux taches et a la charge equipe via `updated_at`
- la repartition des roles reste un snapshot courant et n'est pas historisee

## Contenu du dashboard

- KPI entreprise: utilisateurs actifs, comptes financiers, activite d'audit, alertes non lues
- KPI finance: brouillons, soumises, approuvees, rejetees
- synthese des comptes financiers hybrides: globaux, dedies, restreints, compatibles avec le secteur actif
- totaux approuves par devise (entrees, sorties, net)
- KPI operations: a faire, en cours, bloquees, terminees, echeances depassees/proches
- listes recentes: transactions et taches
- charge equipe: distribution des taches ouvertes/en cours/bloquees/terminees

## Contenu des rapports

- transactions par statut et devise
- transactions par type et devise
- gouvernance des comptes financiers et compatibilite sectorielle
- taches par statut
- repartition des roles actifs
- top charge d'assignation
- exports CSV transactions et taches
- export PDF du rapport consolide
- export Excel `.xlsx` pour transactions et taches
- les exports transactions incluent la gouvernance des comptes: portee, secteur principal, secteurs autorises, compatibilite
- branding PDF AMCCO integre: logo dessine, en-tete, pied de page, pagination
- feuille Excel `Synthese` ajoutant directement les agregats du rapport

## Frontend

Ecrans:

- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/ReportsPage.tsx`

Capacites:

- chargement securise avec refresh transparent du token
- rendu coherent avec les modules finances et taches existants
- export de fichiers CSV via l'API authentifiee
