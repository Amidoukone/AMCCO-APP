# Roadmap de livraison

## Lot 0 - Fondations (en cours)

- structure monorepo
- conventions de code
- API backend initiale
- frontend initial
- documentation d'architecture

## Lot 1 - IAM et securite

- modele utilisateurs / roles / permissions
- login + refresh + logout
- middleware RBAC
- journal d'audit minimal

Definition of done:

- authentification fonctionnelle
- autorisation par role sur endpoints critiques
- tests sur auth et droits

Statut actuel:

- backend IAM v1 implemente (JWT access/refresh, sessions refresh, route protegee `/me`)
- tests automatiques backend ajoutes sur auth, RBAC et alertes

## Lot 2 - Noyau financier

- saisie entree/sortie argent
- preuve obligatoire selon regles
- validation comptable
- historique et statut des transactions

Definition of done:

- workflow complet employe -> comptable
- aucune transaction sensible sans preuve
- exports CSV basiques

Statut actuel:

- workflow financier v1 implemente (DRAFT -> SUBMITTED -> APPROVED/REJECTED)
- gestion des preuves transaction en metadata (integration stockage binaire a brancher)
- tests automatiques backend ajoutes sur le service finance (soumission, validation, alertes)

## Lot 3 - Operations et taches

- gestion des taches par superviseur
- suivi des activites par equipe
- alertes ciblees

Statut actuel:

- workflow operations tasks v1 implemente (creation, assignation, statuts, filtrage par perimetre)
- alertes ciblees v1 implementees (par utilisateur, lecture, compteur non lu, integration finance+taches)
- tests automatiques backend ajoutes sur le service tasks (creation, assignation, statuts, alertes)

## Lot 4 - Dashboards et reporting

- vue proprietaire 360 en lecture seule
- tableaux de bord par role
- exports PDF/Excel

Statut actuel:

- dashboard v1 implemente (KPI entreprise, finance, operations, charge equipe, listes recentes)
- reporting v1 implemente (consolidation par statut/type/devise, repartition des roles, filtres temporels, exports CSV/Excel transactions+taches, export PDF du rapport)
- ventilation metier par activite AMCCO implemente (9 secteurs du cahier des charges sur transactions, taches, dashboard, rapports et exports)
- administration des activites par entreprise et reclassement legacy `Non renseignee` implementes

## Lot 5 - Offline basique + synchro

- stockage local des brouillons
- file de synchronisation
- resolution simple des conflits

## Lot 6 - Hardening production

- CI/CD complet (test, lint, build, migrate)
- environnement staging + production
- sauvegarde et reprise
- supervision et alerting

Statut actuel:

- pipeline CI GitHub actif sur `push` et `pull_request` vers `main`/`develop`
- backend tests executes avant `typecheck` et `build` pour bloquer les regressions critiques
