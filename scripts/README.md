# Recette locale des secteurs

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
```

Pour cibler une correction : `verify-sector-cashflows.mjs --beverage-only` couvre les achats, ventes et rôles du dépôt ; `verify-sector-coherence.mjs --context-only` couvre les changements d'entreprise, réponses tardives et brouillons.

## Vérifier MySQL réel

```powershell
node scripts/verify-mysql-stock.mjs --local
```

Ce contrôle exige MySQL 8 local et un compte autorisé à créer et supprimer ses bases de recette. Il utilise `AMCCO_REVIEW_MYSQL_URL` ou, à défaut, les paramètres de connexion de `backend/.env`. Une adresse distante est refusée. Aucune requête métier n'utilise la base indiquée dans cette URL : chaque cas crée une base temporaire nommée `amcco_review_<date>_<cas>` et la supprime dans le nettoyage final.

Les cas couvrent les collations `utf8mb4_0900_ai_ci`, `utf8mb4_unicode_ci` et une table produits préexistante avec une autre collation, l'initialisation utilisée par Render, le redémarrage idempotent, la conservation de lignes historiques fictives et l'absence de rejeu des anciennes ventes. Les scénarios métier vérifient aussi les ventes concurrentes, le coût moyen, les annulations, les comptages, les droits, les marges et la génération PDF.
