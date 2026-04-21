# Lot 5 - Regles sectorielles backend

## Objectif

Faire du `secteur d'activite` une vraie cle de pilotage backend, et non plus seulement un filtre.

## Ce qui est maintenant pilote par secteur

- validation des transactions a la creation et a la soumission
- validation des taches a la creation, a l'assignation et a certains changements de statut
- exposition des champs attendus par secteur via les profils metier
- exposition des workflows metier par secteur via l'API
- enrichissement du dashboard et des rapports avec des indicateurs dedies par secteur

## Profils sectoriels

Les profils sont centralises dans:

- `backend/src/config/business-activity-profiles.ts`

Chaque profil definit:

- `operationsModel`: logique d'exploitation du secteur
- `finance`: types de flux autorises, devises, description obligatoire ou non, preuve obligatoire, workflow, champs attendus
- `tasks`: description/echeance/assignation obligatoires ou non, severite d'escalade en cas de blocage, workflow, champs attendus
- `reporting`: focus de lecture, sections d'export et indicateurs dedies

## Exemples de regles executees

- `MINING`: description transaction obligatoire, devise limitee a `XOF` ou `USD`, tache obligatoirement assignee et datee
- `WATER`: devise finance `XOF` uniquement, taches obligatoirement assignees et datees, blocages escalades en `CRITICAL`
- `RENTAL`: description obligatoire, echeance obligatoire pour les taches, cloture interdite sur une tache non assignee
- `REAL_ESTATE_AGENCY`: transaction rattachee a un mandat/bien via la description, tache obligatoirement assignee et datee

## API exposee

- `GET /activities`
  Retourne maintenant `items` + `profiles`
- `GET /activities/:activityCode/profile`
  Retourne le profil detaille d'un secteur
- `GET /reports/overview`
  Retourne maintenant `activityProfile`, `activityHighlights`, `availableActivityProfiles`, `sectorRulesVersion`
- `GET /dashboard/summary`
  Retourne maintenant `activityProfiles`, `activityHighlightsByCode`, `sectorRulesVersion`

## Limite actuelle

- les champs dedies par secteur sont exposes comme exigences metier, mais ils ne disposent pas encore de colonnes SQL propres
- la persistance detaillee passe pour l'instant par `metadata_json` sur transactions et taches

## Suite logique

- construire des formulaires frontend dynamiques a partir de `profiles`
- ajouter des exports sectoriels plus profonds avec sections conditionnelles par profil
