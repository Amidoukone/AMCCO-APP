# Transactions : formulaire et répertoires à la demande — 18 novembre 2026

Cette passe poursuit l'allègement de la page Transactions. Elle ne modifie aucun
endpoint, droit d'accès, calcul métier, schéma SQL ou donnée d'entreprise.
Les validations utilisent des API simulées sur le frontend local.

## Changements

### Formulaire différé, état de saisie conservé

Le formulaire complet est maintenant dans
`frontend/src/components/FinanceTransactionForm.tsx`. Il est importé à la première
ouverture. Avant cette ouverture, une liste de transactions n'instancie plus ses
contrôles masqués et ne télécharge pas son module JavaScript.

La page conserve les données du formulaire, le fichier sélectionné, le suivi des
modifications, les appels API et les contrôles d'enregistrement. Après sa première
ouverture, le formulaire reste monté lorsqu'on le replie. Le brouillon et la pièce
jointe sélectionnée sont ainsi conservés. Le montage est rattaché à l'entreprise
et au secteur ; les changements de contexte suivent les règles existantes.

Les fonctions communes ont été déplacées dans
`frontend/src/utils/financeTransactions.ts`. Une comparaison de l'AST TypeScript
vérifie l'identité des 301 définitions déplacées — fonctions, constantes et types —
ainsi que du JSX complet du formulaire. Les commentaires explicatifs sont conservés.
Ce déplacement n'introduit pas de nouvelle formule financière.

### Répertoires chargés dans leur vue

Les interfaces Articles, Locataires, Boutiques et Chantiers sont importées
séparément lorsqu'on ouvre leur vue. Une simple consultation des transactions
ne charge plus ces quatre interfaces. Les données de référence utiles à la
saisie restent chargées selon les règles existantes.

### Échec de chargement limité à la vue demandée

Un échec d'import ne doit pas faire disparaître la liste et la navigation.
`DeferredViewBoundary` affiche une erreur locale avec une action explicite
« Recharger la page ». Aucune actualisation automatique n'est déclenchée.
Les brouillons connus de la vue nécessitent une confirmation avant abandon ;
les protections générales de navigation et de rechargement restent actives.

Le test réseau a confirmé qu'une simple relance du même import pouvait conserver
l'échec en cache dans le navigateur. Le bouton effectue donc un vrai rechargement
de la page, plutôt qu'une nouvelle tentative du même import rejeté.

## Mesures de compilation

| Fichier | Avant | Après |
| --- | --- | --- |
| Module principal Transactions | 173,73 Ko | 133,31 Ko |
| Module principal gzip | 42,42 Ko | 35,11 Ko |
| Formulaire différé | intégré | 36,28 Ko, soit 8,45 Ko gzip |
| Articles différé | intégré | environ 4,13 Ko |
| Locataires différé | intégré | environ 3,47 Ko |
| Boutiques différé | intégré | environ 2,34 Ko |
| Chantiers différé | intégré | environ 2,75 Ko |

Le module principal baisse d'environ 23 % avant compression et 17 % gzip.
Ces valeurs décrivent ce fichier, pas le poids total de l'application ni une
réduction mesurée du temps de réponse de l'API. Les dépendances partagées de
l'application continuent d'être chargées normalement.

Le gain concerne surtout l'arrivée dans la liste et les consultations sans
ouverture de formulaire. La première ouverture du formulaire ajoute le chargement
de son module ; le total gzip du module principal et du formulaire est d'environ
43,56 Ko, légèrement supérieur aux 42,42 Ko de l'ancien module principal.
Les séparations réduisent le travail initial, sans prétendre diminuer tous les
transferts d'une session qui utilise toutes les vues. Les ouvertures suivantes
dans la même page réutilisent le module déjà chargé.

## Vérifications réalisées

- Compilation frontend et vérification TypeScript réussies.
- Parité structurelle des helpers et du formulaire après extraction.
- Recette de cohérence sur les 14 secteurs, en bureau et mobile : détail,
  modification, métadonnées historiques, changement d'entreprise/secteur et PDF.
- Recettes financières courantes et terrain : presets, calculs automatiques,
  confirmation, erreurs d'écriture, totaux par devise et métadonnées historiques.
- Parcours opérateur Hydrocarbure et Dépôt de boissons : accès, stock insuffisant,
  conflit serveur, correction, création produit et vente à quantité nulle désactivée.
- Répertoires : chargement du seul module demandé, recherche, brouillons,
  création/modification, identifiants conservés, erreurs, droits et reprise de lecture.
- Historique simulé de 135 opérations : limites, pagination complète, absence
  de doublons, recherche serveur et anciennes suggestions.
- Absence du module de formulaire et de ses contrôles avant ouverture ; maintien
  du même formulaire monté, du brouillon et du fichier après fermeture/réouverture.
- Échec réseau forcé sur le module du formulaire : erreur locale, liste toujours
  utilisable, puis formulaire de nouveau accessible après rechargement explicite.
- Les 12 scénarios de cache restent valides.

Les écritures des recettes sont interceptées et validées sur des données
fictives. Aucun backend local ni service de production ne reçoit ces écritures.
Aucun code backend n'a été modifié dans cette passe.

## Reproduire

Avec le frontend de vérification servi sur `http://127.0.0.1:5175` et les exemples
de rapports locaux disponibles selon `scripts/README.md` :

```powershell
node scripts/verify-progressive-lists.mjs
node scripts/verify-sector-directories.mjs
node scripts/verify-sector-ux.mjs
node scripts/verify-sector-coherence.mjs
node scripts/verify-sector-cashflows.mjs
node scripts/verify-sector-cashflows.mjs --field-sectors
node scripts/verify-api-cache.mjs
npm --workspace frontend run build
```

Les prochaines mesures utiles concernent le rendu pendant une saisie, le bundle
d'entrée commun, la feuille de style globale et les latences complètes des actions
API. Cette passe ne change ni le nombre de requêtes métier ni les garanties des
écritures financières.
