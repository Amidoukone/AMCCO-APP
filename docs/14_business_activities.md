# Lot 4 bis - Activites metier AMCCO

## Objectif

Faire ressortir explicitement les activites du cahier des charges dans l'application:

- Quincaillerie
- Magasins (commerce general)
- Alimentation
- Location immobiliere
- Activites agricoles
- BTP
- Pisciculture
- Transport
- Transaction
- Hotellerie / Auberge
- Services divers
- Exploitation miniere
- Production d'eau potable
- Agence immobiliere

## Choix d'implementation

- referentiel metier AMCCO v1 partage backend/frontend
- rattachement des transactions financieres a une `activityCode`
- rattachement des taches operationnelles a une `activityCode`
- metadonnees sectorielles pour les sous-sections: type de champ agricole, chantier BTP, bassin piscicole, engin transport, reseau de transaction, reservation hotel
- filtres par activite sur transactions, taches et rapports
- synthese sectorielle dans le dashboard et les rapports
- exports CSV / Excel / PDF enrichis avec l'activite

## Impact utilisateur

- chaque nouvelle transaction est saisie dans une activite
- chaque nouvelle tache est rattachee a une activite
- le dashboard montre les neuf activites avec leurs volumes finance/taches
- les rapports permettent une lecture par activite et un export aligne
- l'admin peut maintenant activer/desactiver des activites par entreprise
- l'admin peut reclasser les anciennes donnees `Non renseignee`
- les secteurs Transport et Transaction disposent de champs de sous-section pour camion benne/tracteur/citerne et Orange Money/Moov Money/Wave/Western Union/MoneyGram/Ria

## Migration SQL

Appliquer:

```bash
mysql -u root -p < backend/sql/006_add_business_activities.sql
mysql -u root -p < backend/sql/007_add_company_activity_settings.sql
mysql -u root -p < backend/sql/013_add_requested_business_activities.sql
```

## Limite actuelle

- les anciennes transactions et anciennes taches restent avec `activity_code = NULL`
- elles ne remontent plus dans les listes, dashboards, rapports et exports metier
- elles restent comptabilisees dans l'ecran admin pour reclassement
- les nouvelles saisies imposent une activite active

## Suite logique

- ajouter un assistant de reclassement plus fin avec filtres date/perimetre avant mise a jour
- ajouter des regles metier specifiques par activite (ex: libelles, comptes, workflows ou rapports dedies)
