# Corrections communes et pilote Quincaillerie

Date : 21 octobre 2026. État : changements locaux préparés pour recette ; aucun déploiement effectué.

## Changements livrables

- Protection des formulaires lors des liens de navigation, des raccourcis et du retour navigateur ; avertissement natif pour le rechargement et la fermeture. Les changements de secteur et d'entreprise conservent leur confirmation préalable.
- Détection des modifications réelles des formulaires, y compris les nouvelles fiches de compte, article, locataire, boutique, chantier et catégorie. Ouvrir une modification sans changer les valeurs ne déclenche plus une alerte de saisie ; revenir aux valeurs initiales remet le formulaire au propre.
- Confirmation avant de remplacer ou d'annuler une fiche modifiée sur la même page et avant déconnexion.
- Recherche serveur dans les transactions et tâches, avant pagination. L'entreprise et les restrictions existantes de secteur, créateur et visibilité sont conservées. Les caractères `%`, `_` et `!` sont recherchés littéralement et les termes restent des paramètres SQL.
- Saisie de recherche temporisée de 300 ms, limitée à 200 caractères, avec portée explicitée et messages distincts en cas d'erreur ou d'absence de résultat.
- Conservation de l'identifiant de la transaction en cours de modification lorsqu'une recherche ou un filtre retire cette transaction de la liste. La sauvegarde reste une modification du même enregistrement.
- Export PDF fondé sur la période appliquée à l'aperçu. Le raccourci « Rapport du jour » devient « Rapports », puisqu'il n'appliquait pas la journée.
- Quincaillerie : onglet Articles distinct, catalogue consultable et recherchable avant le formulaire ; ajout et modification à la demande. La vue Transactions présente la liste avant le formulaire de saisie. Les comptes, articles sélectionnables et calculs existants restent utilisés.

## Compatibilité des données

Aucune migration SQL, aucun changement de schéma, aucun reclassement de données et aucun script de réparation ou de réinitialisation n'accompagnent ce lot. Les codes de secteur, identifiants, métadonnées, statuts et calculs métier sont conservés. Les actions de création, modification et suppression réutilisent leurs API existantes.

L'API de liste reçoit uniquement un paramètre `search` facultatif. Les anciennes requêtes restent compatibles. La recherche utilise les colonnes existantes, sans ajout d'index ; son coût sur les volumes réels devra être observé après recette.

L'onglet Articles est une vue dédiée de la route existante : `/finance/transactions?activityCode=HARDWARE&view=articles`. Les droits de gestion existants restent limités aux rôles administrateur système, comptable et superviseur. Le propriétaire et l'opérateur Quincaillerie ne reçoivent aucun droit supplémentaire.

Le routeur frontend utilise `createBrowserRouter` pour permettre le blocage du retour navigateur. Les URL publiques et les contrôles d'accès existants sont conservés.

## Vérification locale

- Vérification TypeScript et compilation backend/frontend.
- Suite backend : 21 fichiers de tests, 171 tests réussis, incluant les contrats HTTP de recherche, la validation de longueur, les paramètres SQL et la conservation des restrictions existantes.
- Recette navigateur automatisée avec API entièrement simulée, sur ordinateur 1440 × 1000 et téléphone 390 × 844 : catalogue, modification, nouvelle fiche, conservation du brouillon après annulation, raccourcis, retour arrière, protection de rechargement, remise au propre après enregistrement, recherche et concordance de période PDF.
- Contrôle du changement de secteur : annulation préservant la saisie et confirmation unique lors de l'abandon.
- Contrôle de la modification d'une transaction après une recherche : identifiant conservé et envoi d'un `PATCH`, sans création d'une nouvelle transaction.
- Contrôle des rôles propriétaire et opérateur Quincaillerie : gestion des articles non exposée.

Le script `scripts/verify-sector-ux.mjs` bloque les appels réseau externes et simule les API. Aucun backend réel ni compte de production n'est nécessaire. Les appels de création et modification de cette recette sont interceptés et ne persistent aucune donnée.

Pour reproduire : compiler le backend, démarrer le frontend sur `127.0.0.1:5175`, puis lancer `node scripts/verify-sector-ux.mjs` avec Playwright disponible. Si seul `playwright-core` est installé ailleurs, `AMCCO_PLAYWRIGHT_PATH` peut pointer vers son fichier `index.mjs` ; son navigateur Chromium doit être installé. Les captures sont générées dans `artifacts/sector-ux/`.

## Mise en production à préparer après recette

Suivre le runbook existant `18_production_deployment_runbook.md`. Avant livraison, vérifier la disponibilité d'une sauvegarde récente et du mécanisme de restauration prévu par l'hébergement ; aucune sauvegarde de production n'a été effectuée pendant ce travail local.

1. Livrer le backend en premier : le paramètre facultatif est compatible avec le frontend actuellement utilisé.
2. Vérifier les listes sans recherche et avec recherche dans une entreprise de recette, puis livrer le frontend. Un frontend nouveau face à l'ancien backend ne doit pas être présenté comme validé : celui-ci ignore le nouveau paramètre de recherche.
3. Vérifier les parcours avec les rôles réellement utilisés, puis comparer quelques transactions, références d'articles et totaux de rapports avant/après sur la même période. Faire les essais d'écriture dans une entreprise de recette.
4. Observer les erreurs et le temps de réponse des listes recherchées sur les volumes représentatifs.

En cas de retour arrière, rétablir d'abord le frontend précédent, puis le backend précédent si nécessaire. Ce lot ne demande aucune restauration de base de données : les opérations enregistrées pendant son utilisation conservent le format existant et doivent être gardées.

Les tests locaux et simulés ne certifient pas les performances de la base hébergée, le rendu de tous les téléphones ni les données particulières des utilisateurs. La recette métier reste à réaliser avant la livraison de production.
