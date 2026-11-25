# Dépôt de boissons : intégration des pertes de stock

Date : 25 novembre 2026.

## Objectif

Intégrer la gestion des pertes de stock (canette percée, bouteille cassée, avarie, péremption…) dans le secteur **Dépôt de boissons (`BEVERAGE_DEPOT`)** sans impacter les données ni les parcours existants, afin de distinguer clairement pour chaque produit ce qui est **vendu**, **perdu** et **disponible**.

## Architecture retenue

### 1. Base de données et migration additive sans coupure
- Ajout de la valeur `'LOSS'` à la **fin** de l'`ENUM` `beverage_stock_movements.kind` :
  `ENUM('ACHAT_STOCK', 'VENTE', 'INVENTORY_IN', 'INVENTORY_OUT', 'LOSS')`.
- La migration conserve les quatre valeurs existantes dans leur ordre d'origine.
- Migration versionnée : `backend/sql/031_add_beverage_stock_loss.sql`, alignée avec `backend/sql/028_beverage_stock.sql`.
- Mise à niveau automatique et idempotente au démarrage du backend dans `backend/src/lib/beverage-stock-schema.ts` (`SHOW COLUMNS FROM beverage_stock_movements LIKE 'kind'`).

### 2. Règles métier et permissions
- **Acteurs autorisés** : `BEVERAGE_DEPOT_OPERATOR`, `ACCOUNTANT` et `SYS_ADMIN` peuvent déclarer et annuler une perte ; `OWNER` et les autres rôles en lecture voient les pertes et les cumuls sans pouvoir les modifier.
- **Saisie fluide** :
  - Motif et cause facultatifs (non bloquants).
  - Aucune écriture dans `audit_logs` ni alerte envoyée au propriétaire/comptable.
  - Aucun mouvement de caisse (`transactions`) : la perte déduit uniquement le stock disponible et la valeur du stock au coût moyen pondéré (verrou transactionnel par entreprise `FOR UPDATE`, même arithmétique `BigInt` sans résidu d'arrondi).
  - Annulation d'une perte en deux clics (confirmation en ligne, sans blocage même après un comptage physique) : restaure exactement la quantité et la valeur du stock.
- **Compatibilité** :
  - `GET /finance/beverage-products` retourne `{ items, losses }` en un seul appel réseau (rétro-compatible : `losses` est optionnel côté frontend).
  - Chaque produit expose en plus `purchasedQuantity`, `soldQuantity`, `lostQuantity` et `lostValue`, calculés dans la même requête agrégée sans jointure supplémentaire.
  - Nouveaux endpoints :
    - `GET /finance/beverage-products/losses`
    - `POST /finance/beverage-products/:productId/losses`
    - `DELETE /finance/beverage-products/losses/:lossId`

### 3. Interface utilisateur (`BeverageStockPanel`)
- Tableau de stock enrichi avec les colonnes **Vendu** et **Perdu** (quantité et valeur perdue) + carte de résumé **Pertes enregistrées (XOF)**.
- Bouton rapide **Perte** sur chaque ligne de produit (désactivé en cas de rupture) + section repliable **Déclarer une perte**.
- **Assistant optionnel en pièces individuelles** pour les produits suivis en `casier`, `carton` ou `pack` (ex. 1 canette sur un casier de 24 → calcule automatiquement `0,042 casier` et affiche l'estimation en XOF).
- Sur un casier de 24, les pertes successives en pièces sont calculées sur le solde restant au millième. Une modification concurrente du stock impose de vérifier la saisie. Le conditionnement accepte de 1 à 1 000 pièces.
- Un achat ayant servi à valoriser une perte active bénéficie de la même protection que pour une vente.
- Section repliable **Historique des pertes** (50 dernières pertes actives) avec annulation directe à confirmation en ligne.

### 4. Rapports et export PDF
- Carte KPI **Pertes de stock** et section dédiée **Pertes de stock de la période (hors caisse)** dans l'interface web (`ReportsDetails.tsx`) et dans le PDF (`reporting.service.ts`), séparée des écarts de comptage physique.
- Tableau **Stock disponible — situation actuelle** enrichi des colonnes **Vendu** et **Perdu**.
- Formule du résultat d'exploitation mise à jour :
  `Marge brute + Autres recettes − Dépenses − Pertes de stock + Écarts de comptage valorisés`.

## Vérifications exécutées

- `npm run typecheck` (backend + frontend) : réussi sans erreur.
- `npm --workspace backend run test` : **27 fichiers, 269 tests réussis** (dont schéma legacy ENUM → `LOSS`, intégrité stock/pertes/annulation/concurrence, permissions middleware & service, rapport et PDF).
- `npm run build` (backend + frontend Vite) : réussi sans erreur.
- Recette navigateur Playwright (`scripts/verify-sector-cashflows.mjs --beverage-only` et `--stock-states-only`) sur bureau (1440 px) et mobile (390 px) : réussie sans erreur ni débordement horizontal, incluant déclaration de perte en pièce (`1/24`), vérification de `Perdu` vs `Vendu`, et annulation avec restauration exacte du stock.
- Recette sur **MySQL 8.4.3 réel** (`node scripts/verify-mysql-stock.mjs --local`, 3 bases temporaires isolées, `amcco_dev` intacte) : **réussie** (`utf8mb4_0900_ai_ci`, `utf8mb4_unicode_ci`, et mise à niveau automatique d'un ancien schéma `ENUM` à 4 valeurs vers `'LOSS'`, conservation des données historiques, ventes concurrentes, pertes, séparation `Vendu`/`Perdu`, rapport, PDF et annulation après comptage).
