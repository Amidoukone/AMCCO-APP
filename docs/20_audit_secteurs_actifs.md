# Audit et organisation des 14 secteurs actifs

Date : 21 octobre 2026.

## Portée et limites

Audit du code local des pages, de la navigation, des profils métier et des tests existants. Les 14 secteurs examinés sont ceux indiqués par l'utilisateur ; leur activation en production n'a pas été interrogée. Aucun accès aux données de production, aucune migration et aucune modification des règles métier n'ont été effectués.

Les constats de structure ci-dessous sont établis dans le code. Les propositions ergonomiques restent à vérifier dans un navigateur sur téléphone et ordinateur, puis avec les utilisateurs. Les tests automatisés ne permettent pas de certifier à eux seuls les données, les calculs de chaque dossier réel ou le confort d'utilisation en production.

## Ce qui existe déjà

- Quatre pages communes : Vue d'ensemble, Transactions, Tâches et Rapports, avec navigation sectorielle dans `frontend/src/components/SectorWorkspaceNav.tsx`.
- Profils métier centralisés dans `backend/src/config/business-activity-profiles.ts` : champs, devises, exigences et dimensions de suivi.
- Sélection de secteur persistée par entreprise et restrictions des opérateurs sectoriels.
- Pagination et chargement supplémentaire des transactions et tâches.
- Formulaires repliables, calculs métier assistés et rapports spécialisés dans plusieurs secteurs.
- Gestion des réponses de chargement obsolètes et filtrage des listes par entreprise et secteur.
- Consultation adaptée au propriétaire et droits distincts pour les autres rôles.

Ces éléments sont une base à conserver. Le précédent backlog `16_execution_backlog_ergonomie.md` doit être réconcilié avec l'état réel : plusieurs fonctions qu'il annonce « À faire » existent maintenant.

## Constats transversaux

| Priorité | Constat vérifié dans le code | Conséquence et travail proposé |
| --- | --- | --- |
| P1 | La protection de saisie repose sur `data-unsaved-sector-form`, vérifié lors du changement de secteur/entreprise et dans les onglets sectoriels. Les liens du menu et de `QuickActions` ne font pas cette vérification. | Un changement de page peut abandonner une saisie. Unifier la protection des sorties, y compris retour navigateur et fermeture/rechargement, avec une confirmation seulement si des données ont réellement changé. |
| P1 | Les formulaires de compte, article, locataire, boutique, chantier et catégorie marquent leur état comme non enregistré à partir de l'identifiant d'édition. | Une nouvelle fiche partiellement remplie n'est pas détectée ; une édition ouverte sans changement peut déclencher une confirmation. Suivre les modifications réelles pour chaque formulaire. |
| P1 | Les recherches des transactions et tâches filtrent les tableaux locaux ; les requêtes de liste transmettent secteur, type/statut, limite et offset, sans le texte recherché. | Un élément plus ancien peut être absent des résultats jusqu'au chargement de pages supplémentaires. Ajouter une recherche serveur avec pagination et périmètre entreprise/secteur. Afficher entre-temps une explication claire de la portée de recherche, même sans résultat. |
| P1 | La page Transactions contient aussi les formulaires et listes des comptes et des référentiels métier. | L'accès aux opérations quotidiennes se mélange à la configuration. Donner une vue propre aux référentiels déjà existants et garder les transactions centrées sur la liste et la saisie. |
| P2 | Les actions sont présentes dans le menu, les raccourcis globaux et les raccourcis du secteur. | Plusieurs chemins concurrents peuvent alourdir le haut de page. Afficher une action principale selon le rôle, des onglets stables et des actions secondaires discrètes. Valider l'effet visuel sur mobile. |
| P2 | `QuickActions` propose « Rapport du jour », mais ouvre `/reports` avec le secteur seulement. `createDefaultPeriodForm` initialise des dates vides. | Le libellé promet une période qui n'est pas appliquée. Renommer en « Rapports » ou transmettre et appliquer explicitement la journée. |
| P2 | Les filtres de rapports utilisent `periodForm`, l'aperçu utilise `appliedPeriod`, et l'export utilise `periodForm`. | Une période modifiée sans application peut produire un PDF différent de l'aperçu. Retenir une période appliquée commune, ou afficher explicitement qu'il faut actualiser l'aperçu avant export. |
| P2 | Les listes cumulent pagination locale et bouton de chargement serveur. | L'utilisateur doit distinguer les lignes affichées, les données chargées et l'historique restant. Préférer une pagination serveur unique avec libellés simples ; mesurer avant toute optimisation plus large. |
| P2 | Les pages Transactions, Tâches et Rapports regroupent de nombreuses branches sectorielles dans de grands fichiers. | Chaque changement commun touche potentiellement les 14 secteurs. Extraire progressivement les composants par métier avec vérification des parcours et des calculs ; éviter une réécriture simultanée. |

Sources principales : `frontend/src/components/AppLayout.tsx`, `SectorWorkspaceNav.tsx`, `QuickActions.tsx`, `frontend/src/pages/FinanceTransactionsPage.tsx`, `OperationsTasksPage.tsx` et `ReportsPage.tsx`.

## Organisation cible commune

Conserver les quatre accès existants et ajouter un accès métier aux référentiels lorsqu'ils existent réellement :

1. **Vue d'ensemble** : secteur visible, période explicite, quelques indicateurs utiles et éléments à traiter ; accès direct aux listes concernées.
2. **Transactions** : liste et filtres en premier, action de saisie visible selon les droits, détail et justificatifs accessibles depuis une ligne. Les données nécessaires à la création d'une fiche métier doivent rester accessibles depuis la saisie.
3. **Tâches** : tâches ouvertes, échéances et responsables ; formulaire court, champs obligatoires du secteur visibles, compléments repliables.
4. **Rapports** : période appliquée visible, synthèse métier et export concordants ; détails supplémentaires accessibles à la demande.
5. **Référentiels du métier**, si disponibles : articles, boutiques, locataires ou chantiers. L'accès suit les permissions existantes. Les comptes financiers restent accessibles comme outil secondaire.

Les mots utilisés pour les actions peuvent suivre le métier (« Enregistrer un loyer », par exemple) sans changer les codes techniques, les statuts ou le rattachement des données.

## Bilan par secteur

Les parcours ci-dessous sont des propositions d'organisation fondées sur les champs et fonctions présents. Ils ne constituent pas une validation comptable ou une nouvelle spécification métier.

| Secteur | Fonctions et contexte repérés | Amélioration proposée | Vérification métier avant livraison |
| --- | --- | --- | --- |
| Quincaillerie | Gestion des articles ; quantités, prix d'achat/vente et versements ; rapport spécifique. | Donner un accès Articles distinct ; proposer la sélection de l'article au début de la saisie ; présenter vente, versement et marge avec des libellés explicites. | Conservation des références historiques ; concordance quantités, montants, versements et marge avec le rapport actuel. |
| Magasins (commerce général) | Boutiques, achats, recouvrements et inventaires ; l'option Inventaire du formulaire financier redirige vers Tâches. | Accès Boutiques distinct ; actions explicites Achat, Recouvrement et Inventaire ; éviter une redirection surprenante depuis une sélection pendant la saisie. | Rattachement à la boutique ; absence de perte de saisie ; distinction entre mouvement financier et inventaire. |
| Location immobilière | Locataires, logements, loyers et cautions ; rapport spécifique. | Accès Locataires distinct ; démarrer la saisie par le locataire/logement ; distinguer clairement loyer et caution. | Mois concernés, encaissements et cautions concordants ; historique d'un locataire conservé après modification de sa fiche. |
| Activités agricoles | Campagne, parcelle, type de champ et culture ; suivi d'opérations dédié. | Regrouper la lecture par campagne puis parcelle ; montrer les seuls champs pertinents pour l'opération choisie. | Stabilité des regroupements existants et conservation des montants/calculs. Ne pas ajouter un nouveau référentiel sans besoin confirmé. |
| BTP | Gestion des chantiers ; opérations et tâches rattachées au chantier et au lot ; rapport dédié. | Accès Chantiers distinct ; chantier clairement visible dans les listes et la saisie ; accès aux tâches et dépenses du même chantier. | Persistance des références chantier/lot ; concordance des agrégats avant et après changement d'interface. |
| Pisciculture | Bassins, cycles, espèces, alimentation, ventes et mortalité ; rapport dédié. | Organiser la lecture par bassin et cycle ; adapter la saisie au type d'opération ; préciser les unités. | Quantités, mortalité et montants non confondus ; cycles et espèces conservés dans l'historique. |
| Transport | Véhicules, trajets, catégories d'engin ; synthèse particulière pour les camions bennes et rapport dédié. | Présenter d'abord le véhicule et l'opération ; n'afficher que les champs utiles à la catégorie choisie ; accès direct aux opérations du véhicule. | Calculs et regroupements pour chaque catégorie actuellement utilisée ; cohérence de l'historique et du PDF. |
| Services divers | Type/catégorie de service et client ; tâches d'intervention ; suivi par dimensions du profil. | Saisie courte autour du client et de la prestation ; catégories suggérées cohérentes ; filtre client/type. | Conservation des libellés libres existants ; aucun client imposé rétroactivement aux anciennes opérations. |
| Exploitation minière | Site obligatoire, équipement facultatif ; tâches avec description, responsable et échéance obligatoires ; blocages critiques. | Site mis en avant dans les listes ; tâches urgentes visibles ; champs de traçabilité requis immédiatement accessibles. | Exigences de responsable/échéance conservées ; remontée des blocages critiques ; devises XOF/USD respectées. |
| Production d'eau potable | Catégories de ventes et dépenses, quantité et prix unitaire ; XOF ; rapport dédié ; tâches simples sans métadonnées sectorielles. | Deux parcours directs Vente et Dépense ; calcul quantité × prix lorsque pertinent ; synthèse quotidienne. | Préserver la saisie directe du montant prévue par le profil ; ne pas imposer un bassin, un site supplémentaire ou des exigences de tâches absentes du code actuel. |
| Dépôt de boissons | Achats/ventes par produit, stock et rapprochement journalier ; opérateur sectoriel spécifique. | Mettre en avant Produit et Journée ; accès clair aux ventes, achats, dépenses et rapprochement ; isoler les compléments. | Cohérence du stock et des montants ; droits de l'opérateur limités au secteur ; contrôle du rapport journalier. |
| Hydrocarbure | Catégories, citerne/équipement et lieu ; formulaire conditionnel, rapport et opérateur dédiés. | Commencer par la catégorie et la citerne/équipement ; rendre l'effet du choix sur les champs lisible ; listes par équipement et période. | Champs obligatoires conditionnels, unités, calculs existants et restrictions de l'opérateur conservés. |
| Dépenses générales | Bénéficiaires et catégories de dépense ; montants et rapport dédié. | Parcours centré sur bénéficiaire, motif, montant et compte ; justificatifs accessibles ; éviter les champs de vente sans rapport avec l'opération. | Types de flux réellement autorisés et calculs existants conservés ; accès aux dépenses historiques. |
| Activités quotidiennes | Catégories administrables ; tâches, partenaires, accords, montants et paiements ; rapport dédié. | Distinguer visuellement suivi d'activité, accord et paiement ; accès Catégories séparé pour les rôles autorisés ; libellés métier cohérents. | Aucun double comptage entre activité et paiement ; conservation des accords et catégories historiques ; visibilité des champs conditionnels. |

## Ordre de réalisation proposé

### Lot 1 : fiabiliser les parcours communs

- Uniformiser la protection des saisies et corriger la détection des nouvelles fiches.
- Corriger le libellé du raccourci rapports et aligner période affichée, appliquée et exportée.
- Rendre explicite la portée actuelle des recherches, puis implémenter la recherche serveur avec les tests d'isolation nécessaires.
- Vérifier liens directs, retour navigateur et changements d'entreprise/secteur sur les quatre pages communes.

### Lot 2 : organiser un secteur pilote

Quincaillerie proposée comme pilote : elle dispose d'un référentiel Articles, d'une saisie spécifique, d'un rapport et d'un rôle opérateur. Cela permet de vérifier l'organisation pour la saisie et la consultation.

- Séparer l'accès Articles de la liste des transactions.
- Mettre la liste et l'action principale au premier plan ; garder les compléments accessibles.
- Comparer les mêmes exemples avant/après sur téléphone et ordinateur, avec opérateur, comptable et propriétaire selon les accès permis.
- Recueillir le retour des utilisateurs avant de généraliser cette organisation.

### Lot 3 : étendre aux autres secteurs

- Référentiels déjà présents : Magasins, Location et BTP.
- Saisies commerciales et dépenses : Eau, Dépôt de boissons, Hydrocarbure, Services et Dépenses générales.
- Suivi de terrain et dossiers : Agriculture, Pisciculture, Transport, Exploitation minière et Activités quotidiennes.

Cet ordre vise la réutilisation des améliorations communes. Il pourra être ajusté selon les secteurs les plus utilisés et les difficultés remontées ; ces volumes ne sont pas connus dans cet audit.

## Critères d'acceptation par lot

- Une action courante reste accessible sans chercher dans les réglages ; les champs obligatoires restent visibles.
- Une saisie modifiée n'est abandonnée qu'après une décision explicite de l'utilisateur.
- Le même secteur et la même entreprise sont conservés entre liste, détail, tâche et rapport ; les opérateurs restent dans leur périmètre autorisé.
- Une recherche retrouve un enregistrement ancien quand la recherche serveur est livrée, sans charger manuellement tout l'historique.
- Une recherche sans résultat distingue absence réelle, filtre actif et erreur de chargement.
- Le PDF correspond à la période et au secteur annoncés ; les montants d'exemples de référence restent identiques.
- Les historiques, identifiants, métadonnées, statuts et règles existants restent compatibles.
- Les parcours fonctionnent sur mobile et ordinateur, avec les rôles concernés et les cas vide/chargement/erreur.
- Mesurer avant/après le temps, le nombre d'étapes et les erreurs sur quelques saisies réelles représentatives, sans présumer du gain.

## Vérifications techniques de cet audit

- `npm.cmd run typecheck` : réussi sur backend et frontend.
- `npm.cmd --workspace backend test` : 18 fichiers, 158 tests réussis.
- `npm.cmd run build` : compilation backend et compilation de production frontend réussies.
- Aucun test de parcours navigateur ni contrôle des données de production réalisé pendant cet audit.

Ces vérifications constituent un état de référence technique ; elles ne remplacent pas la recette des changements à venir.
