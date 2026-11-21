# Cohérence des contextes et des actions — 18 novembre 2026

Cette passe complète les optimisations décrites dans les documents 33 à 35.
Elle cible la cohérence de l'interface pendant les changements d'entreprise,
de secteur et de session, notamment lorsque plusieurs requêtes se terminent
dans un ordre différent de leur lancement.

Aucun changement de schéma, migration, déploiement ou accès à la production
n'a été effectué. Aucun code backend n'a été modifié dans cette passe.

## Authentification et renouvellement

Une requête recevant un ancien `401` pouvait renouveler la session désormais
active puis rejouer son action dans une autre entreprise. Le hook
`useAuthorizedRequest` conserve maintenant le contexte de départ et refuse ce
rejeu lorsque le contexte a changé. Si un renouvellement a déjà réussi dans le
même contexte, il utilise directement le nouveau jeton.

`AuthContext` partage un renouvellement seulement entre les requêtes utilisant
la même session. Une réponse de renouvellement ou de profil d'une session
remplacée ne peut plus restaurer l'ancienne entreprise ni effacer la nouvelle
connexion. Une déconnexion retardée ne peut plus effacer une connexion plus
récente ; entre deux connexions explicites, la dernière intention prévaut.
La restauration initiale abandonne également les réponses devenues obsolètes.

Un changement d'entreprise qui échoue conserve la session réellement active.
Un renouvellement valide déjà engagé pour cette session reste applicable :
la rotation de son jeton n'est pas perdue au seul motif que l'utilisateur a
tenté un changement d'entreprise.

## Réponses d'actions et formulaires

Le hook partagé `useActionScope` capture le contexte d'une action et invalide
ses effets sur l'interface après un changement ou un démontage. Le retour
ultérieur au contexte initial ne réactive pas une ancienne action.

Les pages Transactions, Tâches, Salaires, Détail d'une tâche et Rapports utilisent
cette protection pour leurs actions asynchrones. Les contextes comprennent
l'entreprise et l'utilisateur ; les écrans sectoriels comprennent aussi le
secteur, le détail comprend l'identifiant de tâche, et l'export comprend la
période appliquée. Les pages de saisie comprennent également le rôle.

Les réponses devenues obsolètes ne réinitialisent plus le formulaire suivant,
ne remplacent plus ses messages et ne libèrent plus son bouton d'enregistrement.
Les indicateurs d'action sont réinitialisés au changement de contexte afin que
la nouvelle entreprise reste utilisable. Les notifications après envoi différé
des pièces jointes suivent la même règle.

Pour les rapports, un ancien export ne déclenche plus de téléchargement dans
le nouveau contexte et sa fin ne libère plus le bouton d'un autre export déjà
en cours.

**Cette protection ne révoque pas une écriture serveur.** Une action envoyée
avant le changement peut avoir été enregistrée dans son entreprise d'origine.
La recette vérifie précisément que cette écriture reste dans son entreprise et
que sa réponse ne modifie pas le travail de l'autre entreprise. Aucun rejeu
automatique dans le nouveau contexte n'est ajouté.

## Brouillons, erreurs de chargement et documentation

Le composant `DeferredViewBoundary` conserve le marqueur de brouillon lorsque
sa vue enfant échoue. Les protections communes de navigation et de fermeture
restent ainsi actives. Le bouton de rechargement utilise la confirmation native
du garde commun, évitant une deuxième confirmation manuelle.

Une ancienne branche de suppression financière située après un `return` a été
retirée. La suppression effective reste dans le gestionnaire de confirmation.
Les mentions obsolètes de validation financière ont été corrigées dans la
recherche et la synthèse des camions bennes. Le README présente désormais les
20 activités sélectionnables et les routes correspondant au fonctionnement
actuel ; les anciennes valeurs restent reconnues pour les historiques.

## Vérifications et périmètre

Les recettes navigateur utilisent des données fictives avec interception des
API. Les tests backend utilisent leurs dépendances simulées. Les contrôles
ne nécessitent aucune écriture métier dans une base d'entreprise.

- Compilation backend et frontend, contrôles TypeScript et `git diff --check`
  réussis.
- Suite backend : 254 tests dans 27 fichiers.
- Authentification : 12 scénarios, dont renouvellement partagé, ancien `401`,
  réponses tardives, connexion/déconnexion concurrentes, changement refusé et
  restauration initiale dépassée par une nouvelle connexion.
- Cycle de vie des actions : même contexte, changement, retour au contexte
  initial et démontage ; erreur d'une vue avec brouillon, annulation du vrai
  rechargement et absence de blocage d'une vue propre.
- Tâches et transactions : huit scénarios d'écriture retardée, succès et erreur,
  en bureau et mobile. Une écriture dans l'entreprise B reste occupée pendant
  que la réponse de l'entreprise A se termine ; les données des deux sociétés
  restent distinctes. Les salaires et pièces jointes bénéficient du même garde,
  sans recette navigateur dédiée à chaque combinaison de ces actions.
- Export PDF : ancien téléchargement ignoré pendant un nouvel export ;
  indicateur d'attente du nouvel export conservé.
- Cache : 12 scénarios de déduplication, invalidation, isolation et expiration.
- Répertoires, listes progressives, navigation et formulaires : maintien des
  droits, identifiants, brouillons, fichiers sélectionnés et anciennes références.
- Alertes : lectures, suppressions, compteurs et réponses retardées en bureau
  et mobile, y compris pendant les changements d'entreprise.
- Parcours financiers courants et terrain : calculs, confirmations, erreurs
  d'écriture, devises et conservation des métadonnées historiques ; tâches
  terrain et catégories quotidiennes également vérifiées.

La recette sectorielle couvre les 20 activités en bureau et mobile. Les PDF
et les rapports complets sont vérifiés pour les 14 activités disposant de
fixtures. Les six activités supplémentaires — Alimentation, Élevage,
Hôtellerie / Auberge, Transaction, Transit et Hadj — couvrent le dashboard,
les listes, le détail et la modification des tâches, les métadonnées historiques
et le lien vers Rapports. Leur PDF n'est pas couvert par cette recette.

Ces vérifications ne constituent pas une mesure des latences de production,
ni une validation de tous les services externes, notamment l'envoi réel des
pièces jointes. Les temps API sur une copie de recette et les échanges ImageKit
restent des contrôles distincts.

## Reproduire

Préparer les dépendances, les exemples PDF et le serveur Vite local sur le
port 5175 selon `scripts/README.md`, puis exécuter :

```powershell
npm run build
npm --workspace backend test
node scripts/verify-auth-coherence.mjs
node scripts/verify-view-coherence.mjs
node scripts/verify-api-cache.mjs
node scripts/verify-sector-coherence.mjs
node scripts/verify-sector-directories.mjs
node scripts/verify-sector-reports.mjs
node scripts/verify-sector-field-tasks.mjs
node scripts/verify-sector-cashflows.mjs
node scripts/verify-sector-cashflows.mjs --field-sectors
node scripts/verify-alerts-coherence.mjs
node scripts/verify-progressive-lists.mjs
node scripts/verify-sector-ux.mjs
```

Les commandes de préparation ou de démarrage de la vraie API locale ne sont
pas nécessaires à ces recettes avec réseau simulé.
