# Recette locale des secteurs

## Tester manuellement avec une vraie API locale

Demarrer MySQL dans Laragon avant l'API. La fenetre Laragon ouverte ne garantit
pas que MySQL fonctionne. `npm run db:check` (depuis la racine ou `backend`)
teste la connexion locale sans importer le serveur, modifier le schema ou
ecrire des donnees. Une erreur `ECONNREFUSED` demande de verifier le demarrage
et le port MySQL, pas de recreer la base.

`node scripts/local-recipe.mjs prepare` copie la base locale configurée dans
`backend/.env` vers `amcco_recette_20261117`, applique la migration de cycle
transactionnel uniquement à cette copie et y crée un administrateur de recette.
Une source distante est refusée, et une copie existante n'est jamais écrasée.
`AMCCO_RECIPE_DATABASE` permet de choisir un autre nom préfixé `amcco_recette_`.
`AMCCO_MYSQL_BIN` permet de choisir le dossier de `mysqldump` si Laragon diffère.

Pour developper avec rechargement automatique, lancer depuis la racine ou
`backend` dans un premier terminal :

```powershell
npm run dev:recette
```

Cette commande reutilise la copie deja preparee. Elle ne recopie pas la source
et ne rejoue pas la migration `029`. Le bootstrap habituel de l'API s'execute
uniquement sur cette copie. `npm run dev` dans `backend` continue d'utiliser la
base configuree dans `.env` ; reserver les essais metier a `dev:recette`.

Pour utiliser le backend compile, apres `npm run build`, utiliser a la place
depuis la racine :

```powershell
node scripts/local-recipe.mjs serve
```

```powershell
npm --workspace frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Ouvrir `http://127.0.0.1:5173/login`. Compte de test local :
`recette.admin@amcco.local` / `RecetteLocale2026!`.
Le mot de passe peut être défini avant préparation par `AMCCO_RECIPE_PASSWORD`.
Le backend utilise la copie sur le port 4000 avec des clés de session temporaires ;
les services ImageKit sont désactivés. Les essais de création, modification et
suppression doivent rester dans cette copie de recette. Aucun fichier `.env`
existant n'est modifié. Pour arrêter un serveur lancé en terminal, utiliser Ctrl+C.

## Recettes automatisées avec API simulées

Ces outils utilisent des données fictives. Les parcours navigateur interceptent les API et bloquent les requêtes externes. Ils ne doivent pas être lancés contre le site de production.

## Préparer les outils

Depuis la racine du dépôt, avec Node 20 ou 22 :

```powershell
npm ci
npm run build
npx playwright-core install chromium
python -m pip install pymupdf
```

`playwright-core` est une dépendance de développement verrouillée. `AMCCO_PLAYWRIGHT_PATH` permet facultativement de réutiliser une installation compatible.

Dans un terminal séparé, servir le frontend local :

```powershell
npm --workspace frontend run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

## Générer les exemples de rapports

```powershell
$env:AMCCO_REPORT_ARTIFACTS='1'
npm --workspace backend test
Remove-Item Env:AMCCO_REPORT_ARTIFACTS
python scripts/verify-sector-report-pdfs.py
```

Les exemples et le manifeste sous `artifacts/sector-reports/` sont nécessaires aux deux recettes `reports` et `coherence`. Le dossier `artifacts/` est ignoré par Git.

## Vérifier les parcours

```powershell
node scripts/verify-sector-ux.mjs
node scripts/verify-sector-directories.mjs
node scripts/verify-sector-cashflows.mjs
node scripts/verify-sector-cashflows.mjs --field-sectors
node scripts/verify-sector-cashflows.mjs --stock-states-only
node scripts/verify-sector-field-tasks.mjs
node scripts/verify-sector-reports.mjs
node scripts/verify-sector-coherence.mjs
node scripts/verify-auth-coherence.mjs
node scripts/verify-view-coherence.mjs
node scripts/verify-admin-coherence.mjs
```

Pour cibler une correction : `verify-sector-cashflows.mjs --beverage-only` couvre les achats, ventes et rôles du dépôt ; `verify-sector-coherence.mjs --context-only` ou `--actions-only` couvre les changements d'entreprise, réponses tardives, brouillons et enregistrements concurrents. `--sectors=FOOD,LIVESTOCK` limite la boucle sectorielle, en conservant les scénarios de changement de contexte.

La recette de cohérence couvre les 20 secteurs sélectionnables, en bureau et
mobile. Les 14 secteurs disposant d'exemples PDF couvrent aussi l'ouverture des
rapports et le téléchargement. Pour Alimentation, Élevage, Hôtellerie / Auberge,
Transaction, Transit et Hadj, elle vérifie le dashboard, les transactions, les
tâches, leur modification, les métadonnées historiques et le lien vers Rapports ;
elle ne valide pas leur PDF.

Les recettes `auth` et `view` utilisent les vrais composants React avec un réseau
simulé : renouvellements concurrents, changements de session, invalidation des
actions anciennes et protection d'un brouillon lorsque sa vue échoue. Elles
chargent leur fixture par Vite et nécessitent le serveur de développement local
sur le port 5175. Leurs résultats et leurs limites sont documentés dans
[`docs/36_coherence_globale_et_contextes.md`](../docs/36_coherence_globale_et_contextes.md).

`node scripts/verify-admin-coherence.mjs` couvre les utilisateurs, les secteurs
administrés et la sécurité personnelle : écritures retardées, changement
d'entreprise pendant un enregistrement profil/rôle, actions parallèles,
brouillons, déconnexion, erreurs partielles et reprises de lecture. Les 34 cas
utilisent des API simulées ; aucun compte ni mot de passe réel n'est modifié.
Cette recette nécessite le frontend local sur le port 5175 et les profils backend
compilés par `npm run build`, sans nécessiter les exemples PDF ni une API réelle.
`--drafts-only` cible les brouillons et états de liste ; `--lists-only` cible
uniquement les lectures et créations autour des erreurs de liste.
Voir [`docs/37_coherence_administration_et_securite.md`](../docs/37_coherence_administration_et_securite.md).

## Vérifier la cohérence des alertes

La cohérence des alertes se vérifie séparément, avec le frontend local lancé sur
`http://127.0.0.1:5175` : `node scripts/verify-alerts-coherence.mjs`.
Cette recette simule toutes les API et vérifie les listes, actions et compteurs
pendant les changements d'entreprise, en bureau et mobile.

## Mesurer les performances et vérifier les caches

Après `npm run build`, `node scripts/profile-local-performance.mjs` compare les
deux modes du dashboard sur la copie locale existante de recette. Il vérifie
l'égalité des données affichées et écrit les mesures ainsi que les plans SQL
synthétiques dans `artifacts/local-performance.json`. Il n'importe pas le
bootstrap serveur, ne modifie aucune donnée et refuse une adresse distante.

Avec le frontend local sur le port 5175, `node scripts/verify-api-cache.mjs`
vérifie la déduplication, les dépendances d'invalidation, l'isolation des jetons,
les réponses tardives, les erreurs et l'expiration avec des API entièrement simulées.

L'analyse et les priorités suivantes sont décrites dans
[`docs/33_analyse_performance_actions.md`](../docs/33_analyse_performance_actions.md).

`node scripts/verify-progressive-lists.mjs` utilise 135 opérations fictives pour
vérifier les premiers lots, les pages suivantes, les offsets, la recherche et les
anciennes suggestions en bureau et mobile. `--suggestions-only` cible les
références des formulaires. La recette Rapports vérifie également que les tableaux
masqués ne chargent pas leur module JavaScript avant ouverture explicite.
Les résultats de cette seconde passe sont détaillés dans
[`docs/34_chargement_progressif_et_rapports.md`](../docs/34_chargement_progressif_et_rapports.md).

La recette des listes vérifie aussi le chargement différé du formulaire financier,
la conservation du brouillon et du fichier lors d'une fermeture/réouverture et
la récupération après une interruption réseau du module. La recette des
répertoires contrôle que seule l'interface du répertoire demandé est téléchargée.
Voir [`docs/35_transactions_formulaire_a_la_demande.md`](../docs/35_transactions_formulaire_a_la_demande.md)
pour les mesures, les limites et les vérifications de cette troisième passe.

## Vérifier MySQL réel

```powershell
node scripts/verify-mysql-stock.mjs --local
node scripts/verify-operator-accounts.mjs --local
```

Le contrôle des comptes opérateurs vérifie la création des caisses manquantes
dans les trois secteurs, leur visibilité par l'API, la conservation des comptes
existants, les démarrages concurrents, l'idempotence et le rollback sur erreur.
Il utilise une base temporaire locale `amcco_review_operators_<date>`.

Ce contrôle exige MySQL 8 local et un compte autorisé à créer et supprimer ses bases de recette. Il utilise `AMCCO_REVIEW_MYSQL_URL` ou, à défaut, les paramètres de connexion de `backend/.env`. Une adresse distante est refusée. Aucune requête métier n'utilise la base indiquée dans cette URL : chaque cas crée une base temporaire nommée `amcco_review_<date>_<cas>` et la supprime dans le nettoyage final.

Les cas couvrent les collations `utf8mb4_0900_ai_ci`, `utf8mb4_unicode_ci` et une table produits préexistante avec une autre collation, l'initialisation utilisée par Render, le redémarrage idempotent, la conservation de lignes historiques fictives et l'absence de rejeu des anciennes ventes. Les scénarios métier vérifient aussi les ventes concurrentes, le coût moyen, les annulations, les comptages, les droits, les marges et la génération PDF.
