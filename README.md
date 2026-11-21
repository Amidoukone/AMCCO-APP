# AMCCO APP

Systeme de gestion centralisee multi-activites.

## Objectif

Ce depot contient l'application de gestion AMCCO:

- un frontend React + TypeScript
- un backend Node.js + Express + TypeScript
- une architecture multi-entreprises (multi-tenant) orientee securite et traçabilite

## Structure

- `backend/`: API, regles metier, acces donnees
- `frontend/`: interface web PWA-ready
- `docs/`: architecture, roadmap, domaine metier, decisions techniques

## Mise en production

La procedure Render + Netlify + DigitalOcean Managed MySQL + ImageKit +
Squarespace est detaillee dans `docs/18_production_deployment_runbook.md`.

## Prerequis

- Node.js 20+
- npm 10+
- MySQL local (Laragon) pour dev local

## Demarrage local

### Verifier MySQL avant de lancer le backend

Laragon doit avoir son serveur **MySQL demarre**, pas seulement sa fenetre ouverte.
Depuis la racine ou le dossier `backend`, lancer :

```powershell
npm run db:check
```

Ce diagnostic verifie uniquement la connexion locale, sans modifier le schema ni
les donnees. `ECONNREFUSED 127.0.0.1:3306` signifie que la connexion TCP a ete
refusee : verifier **Laragon > MySQL > Start** et le port de `DATABASE_URL`
dans `backend/.env`. Ne pas reinitialiser la base pour cette erreur.

Pour tester les changements metier sur la copie de recette isolee, utiliser
`npm run dev:recette` (racine ou `backend`) au lieu du demarrage sur la base
locale d'origine. La preparation initiale et les identifiants sont documentes
dans [scripts/README.md](scripts/README.md#tester-manuellement-avec-une-vraie-api-locale).

### Installation initiale

1. Installer les dependances:

```bash
npm install
```

2. Copier les variables d'environnement backend:

```bash
copy backend\\.env.example backend\\.env
```

3. Initialiser la base MySQL locale:

```bash
mysql -u root -p < backend/sql/001_init_schema.sql
```

4. Si la base existait deja, appliquer les ajouts Lot 1:

```bash
mysql -u root -p < backend/sql/002_add_refresh_sessions.sql
```

5. Si la base existait deja avant le Lot 3, appliquer le module taches:

```bash
mysql -u root -p < backend/sql/003_add_operations_tasks.sql
```

6. Si la base existait deja avant les commentaires de taches, appliquer:

```bash
mysql -u root -p < backend/sql/004_add_task_comments.sql
```

7. Si la base existait deja avant les alertes ciblees, appliquer:

```bash
mysql -u root -p < backend/sql/005_add_targeted_alerts.sql
```

8. Si la base existait deja avant la ventilation par activite metier, appliquer:

```bash
mysql -u root -p < backend/sql/006_add_business_activities.sql
```

9. Si la base existait deja avant l'administration des activites par entreprise, appliquer:

```bash
mysql -u root -p < backend/sql/007_add_company_activity_settings.sql
```

10. Si la base existait deja avant les metadata sectorielles, appliquer:

```bash
mysql -u root -p < backend/sql/008_add_sector_metadata.sql
```

11. Si la base existait deja avant la portee hybride des comptes financiers, appliquer:

```bash
mysql -u root -p < backend/sql/009_add_financial_account_scopes.sql
```

12. Si la base existait deja avant les profils entreprises multi-societes, appliquer:

```bash
mysql -u root -p < backend/sql/010_add_company_profiles.sql
```

13. Lancer backend et frontend dans deux terminaux:

```bash
npm run dev:backend
npm run dev:frontend
```

14. Creer un utilisateur owner de dev:

```bash
npm --workspace backend run seed:dev-user
```

15. Configurer ImageKit pour l'upload de preuves:

Dans `backend/.env`, renseigner:

```env
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/...
```

## Principes de qualite

- Separation claire des responsabilites (UI / API / metier / donnees)
- Contrat API versionne (`/api/v1`)
- Gestion stricte des roles et permissions
- Audit systematique des actions sensibles
- Tests automatises sur les cas critiques

## Activites metier AMCCO

Le catalogue propose 20 activites, selon leur activation dans chaque entreprise:

- Quincaillerie
- Magasins (commerce general)
- Alimentation
- Location immobiliere
- Activites agricoles
- BTP
- Pisciculture
- Elevage
- Transport
- Transit
- Hydrocarbure
- Hadj
- Transaction (transferts d'argent)
- Hotellerie / Auberge
- Services divers
- Exploitation miniere
- Production d'eau potable
- Depot de boissons
- Depenses generales
- Activites quotidiennes

Le code historique `REAL_ESTATE_AGENCY` reste reconnu pour la lecture des anciennes
donnees ; il n'est plus propose pour une nouvelle saisie.

Les nouvelles transactions et nouvelles taches sont rattachees a une activite. Le dashboard, les rapports et les exports remontent aussi cette ventilation.

Chaque entreprise peut maintenant:

- activer ou desactiver des activites dans l'ecran admin
- reclasser les anciennes transactions/taches `Non renseignee` vers une activite cible

Comportement metier:

- les nouvelles operations exigent une activite active
- les anciennes operations sans activite ne remontent plus dans les vues metier courantes
- elles restent visibles uniquement via le resume legacy de l'ecran admin `Activites`
- le secteur actif pilote par defaut le dashboard metier, les transactions, les taches et les rapports
- les vues d'administration globale restent au niveau entreprise

Note locale:

- au demarrage, le backend verifie aussi la presence des colonnes `activity_code` et de la table `company_activities`
- cela reduit les erreurs locales quand le code a evolue plus vite que la base de donnees

## Tests backend

Executer les tests backend:

```bash
npm --workspace backend run test
```

Couverture actuelle:

- authentification, roles, alertes et contrats des routes
- services critiques `finance`, `tasks` et `reporting`
- profils sectoriels, stockage et initialisation des schemas

Les recettes navigateur de coherence, de chargement et de concurrence locale
sont documentees dans [scripts/README.md](scripts/README.md).

Le pipeline CI GitHub execute aussi ces tests backend avant `typecheck` et `build`.

## Endpoints de base API

- `GET /api/v1/health` : liveness
- `GET /api/v1/ready` : readiness (connexion MySQL)
- `POST /api/v1/auth/login` : authentification
- `POST /api/v1/auth/refresh` : rotation access/refresh token
- `POST /api/v1/auth/switch-company` : changement d'entreprise pour la session
- `POST /api/v1/auth/logout` : invalidation de session refresh
- `GET /api/v1/me` : profil courant (token requis)
- `GET /api/v1/alerts` : liste des alertes ciblees de l'utilisateur
- `GET /api/v1/alerts/summary` : compteur d'alertes non lues
- `PATCH /api/v1/alerts/:alertId/read` : marquage unitaire comme lu
- `PATCH /api/v1/alerts/read-all` : marquage global comme lu
- `GET /api/v1/activities` : liste des activites metier de l'entreprise
- `GET /api/v1/admin/users` : liste utilisateurs de l'entreprise (OWNER/SYS_ADMIN)
- `POST /api/v1/admin/users` : creation utilisateur + membership
- `PATCH /api/v1/admin/users/:userId` : mise a jour profil (nom, actif)
- `PATCH /api/v1/admin/users/:userId/role` : changement de role
- `PATCH /api/v1/admin/users/:userId/password` : reset mot de passe + revocation sessions
- `DELETE /api/v1/admin/users/:userId` : suppression membership entreprise
- `GET /api/v1/admin/activities` : administration des activites + resume legacy
- `PATCH /api/v1/admin/activities/:activityCode` : activation/desactivation d'une activite
- `POST /api/v1/admin/activities/reclassify-legacy` : reclassement des anciennes donnees sans activite
- `GET /api/v1/admin/audit-logs` : journal d'audit (OWNER/SYS_ADMIN)
- `GET /api/v1/dashboard/summary` : synthese entreprise/secteur (`details=false` evite les historiques operationnels non affiches)
- `GET /api/v1/finance/accounts` : liste comptes financiers (`activityCode` optionnel pour compatibilite sectorielle)
- `POST /api/v1/finance/accounts` : creation compte financier hybride (`GLOBAL`, `DEDICATED`, `RESTRICTED`)
- `GET /api/v1/finance/transactions` : liste transactions (`status`, `type`, `activityCode`)
- `POST /api/v1/finance/transactions` : enregistrement direct d'une transaction (avec `activityCode`)
- `PATCH /api/v1/finance/transactions/:transactionId` : modification d'une transaction autorisee
- `DELETE /api/v1/finance/transactions/:transactionId` : suppression d'une transaction autorisee
- `GET /api/v1/finance/transactions/:transactionId/proofs` : liste des preuves de la transaction
- `GET /api/v1/finance/transactions/:transactionId/proofs/upload-auth` : auth upload ImageKit
- `POST /api/v1/finance/transactions/:transactionId/proofs` : ajout preuve
- `GET /api/v1/operations/tasks` : liste des taches (avec filtres `status`, `scope`, `unassignedOnly`, `activityCode`)
- `GET /api/v1/operations/tasks/:taskId` : detail d'une tache
- `GET /api/v1/operations/tasks/:taskId/timeline` : timeline des actions de la tache
- `GET /api/v1/operations/tasks/:taskId/comments` : commentaires de suivi de la tache
- `POST /api/v1/operations/tasks` : creation tache (SYS_ADMIN/ACCOUNTANT/SUPERVISOR/EMPLOYEE, avec `activityCode`)
- `POST /api/v1/operations/tasks/:taskId/comments` : ajout commentaire (acteur autorise sur la tache)
- `GET /api/v1/operations/members` : membres assignables (OWNER/SYS_ADMIN/SUPERVISOR)
- `PATCH /api/v1/operations/tasks/:taskId/assign` : assignation/desassignation (SYS_ADMIN/SUPERVISOR)
- `PATCH /api/v1/operations/tasks/assign-bulk` : assignation en lot (SYS_ADMIN/SUPERVISOR)
- `PATCH /api/v1/operations/tasks/:taskId/status` : changement statut tache (manager ou employe assigne)
- `GET /api/v1/reports/overview` : synthese finance + operations + comptes (`activityCode` obligatoire, `dateFrom`/`dateTo` optionnels, `details=true` pour les tableaux complets)
- `GET /api/v1/reports/exports/overview.pdf` : export PDF du rapport consolide (`activityCode` obligatoire, `dateFrom`/`dateTo` optionnels)

Les anciennes routes publiques de soumission/approbation et les exports CSV/Excel
des rapports sont retires. Les statuts historiques restent lisibles.
Le cycle transactionnel et sa migration sont decrits dans
[docs/31_simplification_performance_production.md](docs/31_simplification_performance_production.md).
