# 16. Backlog D'Execution Ergonomie

## Objectif

Ce document transforme l'analyse UX en tickets techniques executables, avec priorisation, ordre d'intervention, niveau de risque, estimation rapide et criteres d'acceptation.

Principe directeur:

- Ne pas changer les regles metier dans les premiers lots.
- Isoler d'abord les gains de lisibilite, de rapidite d'action et de tracabilite.
- Verifier a chaque lot les parcours critiques avant de continuer.

## Convention

- Estimation:
  - `XS`: moins de 0,5 jour
  - `S`: 0,5 a 1 jour
  - `M`: 1 a 2 jours
  - `L`: 2 a 4 jours
- Risque:
  - `Faible`: UI, texte, layout, composants de presentation
  - `Moyen`: logique de chargement, partage de code, pagination
- Statut initial:
  - `A faire`

## Sprint 1: Stabilite, lisibilite, fondations communes

### Ticket UX-001

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P0`
- Sujet: Corriger completement les textes corrompus et l'encodage UTF-8 de l'interface
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/config/branding.ts`
  - `frontend/src/config/permissions.ts`
  - `frontend/src/config/businessActivities.ts`
  - `frontend/src/components/AppLayout.tsx`
  - `frontend/src/context/BusinessActivityContext.tsx`
  - `frontend/src/pages/LoginPage.tsx`
  - `frontend/src/pages/ForbiddenPage.tsx`
  - `frontend/src/pages/DashboardPage.tsx`
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/TaskDetailsPage.tsx`
  - `frontend/src/pages/ReportsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/pages/AdminUsersPage.tsx`
  - `frontend/src/pages/AdminCompaniesPage.tsx`
  - `frontend/src/pages/AdminActivitiesPage.tsx`
- Travail:
  - Corriger toutes les sequences de texte corrompu.
  - Verifier l'encodage de tous les fichiers frontend en UTF-8.
  - Uniformiser les accents sur les libelles visibles et uniquement eux.
- Criteres d'acceptation:
  - Aucun texte visible ne contient de caracteres corrompus.
  - `npm.cmd run typecheck` passe.
  - `npm.cmd run build` passe.
  - Controle visuel fait sur connexion, dashboard, alertes, finances, operations, rapports, securite, administration.

### Ticket UX-002

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P0`
- Sujet: Creer un composant unique de confirmation pour les actions destructives
- Estimation: `S`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/components/ConfirmDialog.tsx`
  - `frontend/src/styles.css`
  - `frontend/src/pages/AdminCompaniesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
- Travail:
  - Remplacer `window.confirm`.
  - Afficher un titre, un texte d'impact, le nom de l'objet et les actions `Annuler` / `Confirmer`.
  - Garder une API simple pour reutilisation.
- Criteres d'acceptation:
  - Plus aucune suppression frontend ne depend de `window.confirm`.
  - Les confirmations affichent clairement l'objet concerne.
  - Les suppressions existantes continuent de fonctionner sans changement metier.

### Ticket UX-003

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P0`
- Sujet: Centraliser l'affichage des messages succes, erreur et chargement
- Estimation: `S`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/components/FeedbackBanner.tsx`
  - `frontend/src/styles.css`
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/ReportsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/pages/AdminUsersPage.tsx`
  - `frontend/src/pages/AdminCompaniesPage.tsx`
  - `frontend/src/pages/AdminActivitiesPage.tsx`
- Travail:
  - Definir un composant commun pour les messages de retour.
  - Uniformiser le ton, la position et le style.
  - Eviter les formulations heterogenes entre ecrans.
- Criteres d'acceptation:
  - Tous les messages de retour utilisent le meme composant.
  - Le comportement visuel est coherent sur tous les modules modifies.

### Ticket UX-004

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P0`
- Sujet: Centraliser la gestion de session et le refresh token cote frontend
- Estimation: `L`
- Risque: `Moyen`
- Fichiers:
  - `frontend/src/lib/api.ts`
  - ou nouveau helper dans `frontend/src/lib`
  - `frontend/src/components/AppLayout.tsx`
  - `frontend/src/context/BusinessActivityContext.tsx`
  - `frontend/src/pages/DashboardPage.tsx`
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/TaskDetailsPage.tsx`
  - `frontend/src/pages/ReportsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/pages/AdminUsersPage.tsx`
  - `frontend/src/pages/AdminCompaniesPage.tsx`
  - `frontend/src/pages/AdminActivitiesPage.tsx`
- Travail:
  - Extraire `withAuthorizedToken` vers un helper unique.
  - Uniformiser le comportement en cas de 401.
  - Reduire la duplication de code.
- Criteres d'acceptation:
  - Plus aucun ecran ne redefine localement la meme logique de refresh.
  - Les parcours de session continuent de fonctionner.
  - Les erreurs 401 sont gerees de facon coherente.

### Ticket UX-005

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P0`
- Sujet: Ajouter une pagination simple ou un mode `Charger plus` sur les listes longues
- Estimation: `L`
- Risque: `Moyen`
- Fichiers frontend:
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/TaskDetailsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
- Fichiers backend:
  - `backend/src/routes/alerts.route.ts`
  - `backend/src/routes/finance.route.ts`
  - `backend/src/routes/tasks.route.ts`
  - `backend/src/routes/admin-audit.route.ts`
- Travail:
  - Introduire `page`, `cursor` ou `offset` selon le plus simple.
  - Afficher le nombre d'elements charges et la suite.
  - Eviter le blocage des listes a 100/200 elements.
- Criteres d'acceptation:
  - Les listes critiques peuvent afficher plus de 100/200 elements.
  - Le chargement supplementaire est visible et compréhensible.
  - Les performances restent correctes.

### Ticket UX-006

- Statut: `A faire`
- Sprint: `1`
- Priorite: `P1`
- Sujet: Ajouter une checklist de regression manuelle courte pour chaque lot UX
- Estimation: `XS`
- Risque: `Faible`
- Fichiers:
  - `docs/04_delivery_standards.md`
  - `docs/16_execution_backlog_ergonomie.md`
- Travail:
  - Documenter les parcours a tester apres chaque lot.
  - Standardiser la verification minimale.
- Criteres d'acceptation:
  - Une checklist courte existe et peut etre suivie a chaque livraison.

### Checklist de regression courte par lot UX

Appliquer cette verification a la fin de chaque ticket ou lot UX, avant commit ou push.

#### Controle interface

- ouvrir la connexion et verifier qu'aucun texte ou composant principal n'est casse
- ouvrir le `pilotage`
- ouvrir le `centre d'alertes`
- ouvrir `flux financiers`
- ouvrir `operations`
- ouvrir `rapports`

#### Controle contexte

- verifier le changement d'entreprise si disponible
- verifier le changement de perimetre actif si l'ecran depend d'une activite
- verifier que les compteurs, listes ou titres se recalculent correctement apres changement de contexte

#### Controle interactions

- verifier un retour utilisateur visible: succes, erreur ou chargement
- verifier une action destructive si le lot en contient une
- verifier qu'un bouton principal et un bouton secondaire restent fonctionnels

#### Controle metier minimum

- alertes: filtrer ou marquer comme lue
- transactions: consulter la liste puis ouvrir un detail
- taches: consulter la liste puis ouvrir un detail
- rapports: ouvrir la page et verifier les actions d'export visibles
- securite: ouvrir la page si le role le permet

#### Validation technique

- `frontend`: `npm.cmd run typecheck`
- `frontend`: `npm.cmd run build`
- si backend touche: lancer la verification minimale du lot backend avant livraison

## Sprint 2: Debit de travail quotidien et confort d'usage

### Ticket UX-007

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Refaire le tableau de bord en vue `A traiter aujourd'hui`
- Estimation: `L`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/DashboardPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Mettre en tete les actions quotidiennes.
  - Ajouter blocs `Mes taches`, `Alertes critiques`, `Transactions a revoir`, `Blocages`.
  - Rendre les indicateurs cliquables vers les modules filtres.
- Criteres d'acceptation:
  - Le dashboard permet d'ouvrir directement les actions prioritaires.
  - Les cartes principales ne sont plus seulement informatives.

### Ticket UX-008

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Ajouter des vues rapides persistées par module
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - nouveau helper dans `frontend/src/lib`
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/OperationsTasksPage.tsx`
- Travail:
  - Stocker les filtres utiles localement.
  - Ajouter des presets `Non lues`, `Mes taches`, `A finaliser`, `Cette semaine`.
- Criteres d'acceptation:
  - Le retour sur un ecran conserve la vue de travail precedente.
  - Les presets sont visibles et utilisables en un clic.

### Ticket UX-009

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Ajouter recherche rapide sur les ecrans metier majeurs
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/pages/AdminUsersPage.tsx`
- Travail:
  - Ajouter recherche par titre, compte, email ou reference.
  - Filtrer localement ou cote API selon la charge.
- Criteres d'acceptation:
  - L'utilisateur peut retrouver rapidement un objet sans scroller toute la liste.

### Ticket UX-010

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Simplifier les cartes de taches et limiter les actions visibles
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Garder 1 action principale et 1 action secondaire visibles.
  - Deplacer le reste dans un menu ou un panneau secondaire.
  - Clarifier la hierarchie `voir`, `modifier`, `assigner`, `supprimer`.
- Criteres d'acceptation:
  - La carte de tache est plus lisible.
  - Le nombre d'actions visibles est reduit sans perte fonctionnelle.

### Ticket UX-011

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Rendre le traitement en lot plus visible et plus robuste
- Estimation: `S`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Ajouter une barre d'action en lot plus visible.
  - Afficher clairement combien de taches sont selectionnees.
  - Rendre l'etat de selection plus stable au rechargement de vue.
- Criteres d'acceptation:
  - Le traitement en lot est visible sans chercher.
  - Le nombre d'elements concernes est toujours clair.

### Ticket UX-012

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Alleger le formulaire de creation et d'edition des taches
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/OperationsTasksPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Garder les champs essentiels au premier niveau.
  - Laisser les champs contextuels dans un panneau secondaire.
  - Clarifier l'assignation initiale et l'echeance.
- Criteres d'acceptation:
  - Une nouvelle tache peut etre creee plus vite.
  - Les champs avances restent accessibles mais non envahissants.

### Ticket UX-013

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P1`
- Sujet: Creer une vue de saisie rapide pour les transactions
- Estimation: `L`
- Risque: `Moyen`
- Fichiers:
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Mettre les champs minimums en tete.
  - Conserver preuves et contexte metier dans un second niveau.
  - Preselectionner le compte et la devise quand c'est pertinent.
- Criteres d'acceptation:
  - Une transaction simple peut etre saisie avec moins d'etapes.
  - Les champs complets restent disponibles.

### Ticket UX-014

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P2`
- Sujet: Ajouter des presets de periode sur les rapports
- Estimation: `S`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/ReportsPage.tsx`
- Travail:
  - Ajouter `Aujourd'hui`, `7 jours`, `30 jours`, `Ce mois`.
  - Garder la saisie manuelle disponible.
- Criteres d'acceptation:
  - L'utilisateur peut filtrer une periode frequente en un clic.

### Ticket UX-015

- Statut: `A faire`
- Sprint: `2`
- Priorite: `P2`
- Sujet: Clarifier l'administration utilisateurs et separer creation / gestion
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/AdminUsersPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Mieux separer la creation d'utilisateur de la table d'administration.
  - Ajouter filtre `actif/inactif` et filtre `role`.
- Criteres d'acceptation:
  - La page est plus lisible.
  - La gestion quotidienne des utilisateurs est plus rapide.

## Sprint 3: Tracabilite, navigation croisee, productivite transverse

### Ticket UX-016

- Statut: `A faire`
- Sprint: `3`
- Priorite: `P1`
- Sujet: Creer un fil de tracabilite unifie pour les taches
- Estimation: `L`
- Risque: `Moyen`
- Fichiers:
  - `frontend/src/pages/TaskDetailsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/utils/traceMetadata.ts`
  - `frontend/src/styles.css`
- Travail:
  - Fusionner commentaires, changements de statut, assignations et timeline dans une lecture unique.
  - Rendre le fil plus chronologique et plus utile.
- Criteres d'acceptation:
  - Une tache expose une histoire lisible sans changer d'ecran.
  - Les informations de suivi sont ordonnees et actionnables.

### Ticket UX-017

- Statut: `A faire`
- Sprint: `3`
- Priorite: `P1`
- Sujet: Renforcer la fiche detail transaction comme centre de decision
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/utils/governanceDisplay.ts`
  - `frontend/src/styles.css`
- Travail:
  - Structurer clairement `transaction`, `preuves`, `gouvernance`, `alertes`, `audit`.
  - Ajouter raccourcis coherents et visibles.
- Criteres d'acceptation:
  - La fiche transaction evite les allers-retours entre ecrans.

### Ticket UX-018

- Statut: `A faire`
- Sprint: `3`
- Priorite: `P1`
- Sujet: Ajouter navigation croisee standard depuis alertes, audit, taches et transactions
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/AlertsPage.tsx`
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/pages/TaskDetailsPage.tsx`
  - `frontend/src/pages/FinanceTransactionsPage.tsx`
  - `frontend/src/pages/FinanceSalariesPage.tsx`
  - `frontend/src/utils/traceMetadata.ts`
- Travail:
  - Standardiser `Voir alertes`, `Voir audit`, `Voir tache`, `Voir transaction`, `Voir salaire`.
  - Harmoniser les liens directs entre modules.
- Criteres d'acceptation:
  - Depuis une alerte ou un evenement d'audit, l'utilisateur peut ouvrir l'objet utile en 1 clic.

### Ticket UX-019

- Statut: `A faire`
- Sprint: `3`
- Priorite: `P2`
- Sujet: Ameliorer la page securite pour les usages quotidiens
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/SecuritySettingsPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Ajouter filtres rapides.
  - Rendre la synthese d'un evenement plus lisible que le JSON brut.
  - Mieux distinguer mot de passe personnel et audit.
- Criteres d'acceptation:
  - La page securite est lisible par un non technique.
  - Le journal d'audit est plus exploitable.

### Ticket UX-020

- Statut: `A faire`
- Sprint: `3`
- Priorite: `P2`
- Sujet: Clarifier les pages d'administration entreprises et activites
- Estimation: `M`
- Risque: `Faible`
- Fichiers:
  - `frontend/src/pages/AdminCompaniesPage.tsx`
  - `frontend/src/pages/AdminActivitiesPage.tsx`
  - `frontend/src/styles.css`
- Travail:
  - Mieux distinguer `etat`, `action`, `impact`.
  - Rendre visibles les consequences de la desactivation.
- Criteres d'acceptation:
  - La comprehension des effets d'une action admin est immediate.
  - Les actions sensibles sont mieux contextualisees.

## Ordre D'Execution Recommande

1. `UX-001`
2. `UX-002`
3. `UX-003`
4. `UX-004`
5. `UX-005`
6. `UX-006`
7. `UX-007`
8. `UX-008`
9. `UX-009`
10. `UX-010`
11. `UX-011`
12. `UX-012`
13. `UX-013`
14. `UX-014`
15. `UX-015`
16. `UX-016`
17. `UX-017`
18. `UX-018`
19. `UX-019`
20. `UX-020`

## Verification Minimale Par Ticket

- Connexion
- Changement d'entreprise
- Changement de perimetre
- Dashboard
- Alertes
- Taches
- Transactions
- Salaires
- Rapports
- Audit

## Verification Renforcee Par Sprint

### Fin Sprint 1

- `npm.cmd run typecheck`
- `npm.cmd run build`
- Verification manuelle des suppressions
- Verification manuelle des messages et de la session

### Fin Sprint 2

- Verification manuelle des filtres persistants
- Verification manuelle des recherches
- Verification manuelle du dashboard actionnable
- Verification manuelle des formulaires allégés

### Fin Sprint 3

- Verification manuelle des navigations croisées
- Verification manuelle des fils de traçabilité
- Verification manuelle des écrans admin et sécurité
