# Organisation des secteurs Magasins, Location immobilière et BTP

Date : 21 octobre 2026. État : changements locaux prêts pour recette, sans déploiement en production.

## Ce qui a changé

| Secteur | Vue distincte | Simplifications |
| --- | --- | --- |
| Magasins (commerce général) | Boutiques | Liste consultable avant le formulaire, recherche par nom/emplacement/téléphone, ajout et modification à la demande. Un bouton « Préparer un inventaire » ouvre explicitement le formulaire des tâches ; le choix financier ne déclenche plus de redirection vers ce formulaire. |
| Location immobilière | Locataires | Liste avec logement, loyer et mois d'entrée, recherche par nom/logement/téléphone, ajout et modification à la demande. Les valeurs et la normalisation des montants du formulaire existant sont conservées. |
| BTP | Chantiers | Liste avec client, marché et localisation, recherche sur ces références, ajout et modification à la demande. Le chantier reste sélectionnable dans les transactions et les tâches existantes. |

Les trois secteurs présentent désormais la liste des transactions avant le formulaire de saisie, initialement replié. Les raccourcis d'enregistrement et les liens directs ouvrent toujours le formulaire.

Les vues sont accessibles depuis les onglets sectoriels et les actions de gestion de la page Transactions. Les titres sur téléphone et le fil d'Ariane suivent la vue affichée. Les URL sont :

- `/finance/transactions?activityCode=GENERAL_STORE&view=shops`
- `/finance/transactions?activityCode=RENTAL&view=tenants`
- `/finance/transactions?activityCode=BTP&view=projects`

Les anciens liens portant les ancres `#shop-management`, `#tenant-management` et `#project-management` ouvrent la nouvelle vue et le formulaire correspondant. Les messages des sélections vides conduisent vers les nouvelles vues pour les rôles autorisés, ou indiquent de demander l'ajout à un responsable.

## Chargement et protection des saisies

- Les listes différencient chargement, liste vide, recherche sans résultat et échec de chargement. Un bouton permet de réessayer après erreur et d'actualiser les références.
- L'ouverture du formulaire ne recharge plus une liste déjà chargée pour la même entreprise et le même secteur. Les réponses obsolètes continuent d'être ignorées par les identifiants de requête existants.
- Les listes des nouvelles vues filtrent également les fiches sur l'entreprise active avant affichage. Leur recherche locale est réinitialisée lors d'un changement d'entreprise.
- La protection des brouillons du lot précédent couvre les nouvelles vues. Annuler une navigation conserve la saisie ; confirmer l'abandon réinitialise le formulaire quitté. Un échec d'enregistrement conserve les champs.
- L'action d'ajout prépare explicitement une nouvelle fiche et demande confirmation si elle remplace un brouillon modifié.

## Données et compatibilité

Ce lot ajoute uniquement des changements frontend et une recette locale. Il ne modifie ni le backend ni le schéma de données. Les identifiants, codes de secteur, métadonnées des opérations, calculs, règles de validation et API d'écriture existants sont conservés.

La gestion des fiches reste réservée aux rôles administrateur système, comptable et superviseur. Le propriétaire et l'employé ne gagnent aucun droit de gestion. Les références existantes restent sélectionnables dans les formulaires métier.

Aucun accès aux données de production, aucune migration, aucun script de réparation et aucun déploiement n'ont été effectués. Les essais de création et de modification utilisent exclusivement des API simulées.

## Vérifications

- Vérification TypeScript et compilation backend/frontend réussies.
- Suite backend existante : 21 fichiers, 171 tests réussis.
- Recette `scripts/verify-sector-directories.mjs` sur ordinateur et téléphone pour les trois secteurs : consultation, recherche, conservation du brouillon, retour aux valeurs initiales, échec d'écriture puis nouvel essai, modification du même identifiant, création d'une nouvelle fiche sans remplacement de l'ancienne, et disponibilité dans la sélection d'une transaction.
- Pour la location, le test de modification du nom vérifie que le loyer et le mois d'entrée historique sont conservés ; le montant envoyé à l'API reste normalisé.
- Contrôle du raccourci Inventaire avec annulation préservant le brouillon financier, puis confirmation ouvrant les tâches. Le superviseur conserve cet accès opérationnel sans recevoir de droit de saisie financière.
- Contrôle des rôles propriétaire et employé, des listes vides, de la reprise après erreur de lecture, de l'exclusion à l'affichage d'une fiche d'une autre entreprise et des anciens liens à ancre.
- La recette du pilote Quincaillerie (`scripts/verify-sector-ux.mjs`) reste réussie après la généralisation de la navigation.
- Captures locales dans `artifacts/sector-ux/` : `shops-1440.png`, `shops-390.png`, `tenants-1440.png`, `tenants-390.png`, `projects-1440.png` et `projects-390.png`.

Les deux scripts exigent un frontend local sur `127.0.0.1:5175`, le backend compilé pour lire les profils métier et Playwright disponible. `AMCCO_PLAYWRIGHT_PATH` peut pointer vers un `playwright-core/index.mjs` installé. Chaque requête d'API est interceptée ; aucun backend réel n'est appelé et les accès réseau externes ne sont pas transmis.

## Livraison

La recette métier reste à faire avec les utilisateurs avant une livraison de production. Vérifier notamment un achat et un recouvrement par boutique, un loyer et une caution, ainsi qu'une transaction et une tâche BTP, en comparant leurs références et leurs rapports sur la même période.

Appliquer les précautions et l'ordre de déploiement documentés dans `21_livraison_ergonomie_quincaillerie.md` : les corrections communes de recherche du lot précédent requièrent le backend correspondant avant le frontend. Ce lot ne demande aucune migration supplémentaire. Un retour au frontend précédent conserve les données enregistrées au format existant.
