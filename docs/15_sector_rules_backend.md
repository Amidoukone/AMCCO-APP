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
- `reporting`: focus de lecture, sections d'export, dimensions de sous-section et indicateurs dedies
- `metadataFields`: champs de sous-section stockes dans `metadata_json` pour qualifier les flux et taches sans ajouter de tables dediees

Pour `HARDWARE`, les transactions de quincaillerie peuvent porter `itemName`, `quantity`,
`purchaseUnitPrice`, `saleUnitPrice` et `dailyPayment`. Ces champs alimentent le rapport
mensuel de vente type quincaillerie: designation, quantite, vente du jour, versement, cout
d'achat, benefice et marge.

Pour `FISH_FARMING`, les transactions et taches piscicoles portent `fishOperationKind`,
`fishTaskKind`, `pondRef`, `cycleRef`, `species`, `quantity`, `unitPrice`, `feedName`,
`mortalityCount` et les references fournisseur/acheteur/source selon le flux. Ces champs
alimentent le rapport Pisciculture: bassins, cycles, especes, alevins, aliments, ventes,
mortalite, solde et execution.

Pour `LIVESTOCK`, les transactions et taches d'elevage portent `livestockOperationKind`,
`livestockTaskKind`, `herdRef`, `batchRef`, `species`, `animalCount`, `feedQuantity`,
`productQuantity`, `mortalityCount`, `treatmentName` et les references fournisseur,
acheteur ou source selon le flux. Ces champs alimentent le rapport Elevage: troupeaux,
lots, especes, achats, aliments, ventes, produits, mortalite, solde et execution.

## Pilotage operationnel

Les rapports et dashboards calculent maintenant `operationalPerformance` a partir des transactions et taches:

- rentabilite XOF: entrees approuvees, sorties approuvees, net, marge et rentabilite sur couts
- efficacite: taux d'execution des taches terminees
- suivi: taches ouvertes, pression de suivi, taches en retard
- execution: taches bloquees, taux de blocage et alertes par sous-section

Les sous-sections sont pilotees par les dimensions declarees dans chaque profil: chantier, lot de travaux, type de champ, bassin, cycle piscicole, service transport, type d'engin, reseau de transaction, service hotelier, site, client, bien ou mandat.

## Exemples de regles executees

- `MINING`: description transaction obligatoire, devise limitee a `XOF` ou `USD`, tache obligatoirement assignee et datee
- `WATER`: devise finance `XOF` uniquement, taches obligatoirement assignees et datees, blocages escalades en `CRITICAL`
- `RENTAL`: description obligatoire, echeance obligatoire pour les taches, cloture interdite sur une tache non assignee
- `REAL_ESTATE_AGENCY`: transaction rattachee a un mandat/bien via la description, tache obligatoirement assignee et datee
- `BTP`: transaction et tache rattachees a un chantier et un lot de travaux
- `FISH_FARMING`: suivi par bassin et cycle piscicole
- `LIVESTOCK`: suivi par troupeau, lot d'elevage et espece
- `TRANSPORT`: sous-section location/gestion et type d'engin camion benne, tracteur ou citerne
- `MONEY_TRANSFER`: suivi par reseau Orange Money, Moov Money, Wave, Western Union, MoneyGram ou Ria, avec blocages critiques
- `HOTEL_LODGING`: suivi par reservation, chambre ou service hotelier
- `AGRICULTURE`: suivi des campagnes par parcelle, type de champ et culture

## API exposee

- `GET /activities`
  Retourne maintenant `items` + `profiles`
- `GET /activities/:activityCode/profile`
  Retourne le profil detaille d'un secteur
- `GET /reports/overview`
  Retourne maintenant `activityProfile`, `activityHighlights`, `availableActivityProfiles`, `operationalPerformance`, `hardwareMonthlyReport`, `agricultureOperationsReport`, `fishFarmingOperationsReport`, `livestockOperationsReport`, `sectorRulesVersion`
  Le parametre `activityCode` est obligatoire pour limiter la reponse au secteur choisi.
- `GET /dashboard/summary`
  Retourne maintenant `activityProfiles`, `activityHighlightsByCode`, `operationalPerformance`, `sectorRulesVersion`

## Limite actuelle

- les champs dedies par secteur sont exposes comme exigences metier, mais ils ne disposent pas encore de colonnes SQL propres
- la persistance detaillee passe pour l'instant par `metadata_json` sur transactions et taches

## Suite logique

- construire des formulaires frontend dynamiques a partir de `profiles`
- ajouter des exports sectoriels plus profonds avec sections conditionnelles par profil
