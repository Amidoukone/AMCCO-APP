# Runbook de mise en production

Objectif: publier l'application avec le backend sur Render, le frontend sur Netlify,
le stockage fichiers sur ImageKit, la base sur DigitalOcean Managed MySQL, et le
domaine `groupenioumaladiady.com` gere chez Squarespace.

## 1. Conventions retenues

- Frontend production: `https://groupenioumaladiady.com`
- Frontend alias: `https://www.groupenioumaladiady.com`
- Backend production: `https://api.groupenioumaladiady.com`
- API versionnee: `/api/v1`
- Branche production: `main`
- Branche recette recommandee: `develop`
- Service Render: `amcco-backend`
- Netlify: configuration depuis `netlify.toml`
- Render: configuration depuis `render.yaml`

## 2. Verification locale avant publication

Executer avant chaque mise en ligne:

```bash
npm --workspace backend run test
npm run typecheck
npm run build
git status --short --branch
```

Si une commande echoue, corriger avant de deployer.

## 3. DigitalOcean Managed MySQL

1. Creer un cluster MySQL manage dans une region proche du backend Render.
   Recommandation initiale: Europe (`fra1` ou region proche) avec Render en
   `frankfurt`.
2. Creer une base dediee, par exemple `amcco_prod`.
3. Creer un utilisateur applicatif dedie si possible. Eviter d'utiliser
   durablement `doadmin` pour l'application.
4. Telecharger le certificat CA depuis les details de connexion DigitalOcean.
5. Ajouter temporairement l'IP locale dans les Trusted Sources pour initialiser
   la base, puis la retirer apres l'operation.
6. Construire `DATABASE_URL`:

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/amcco_prod
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
```

Notes:

- `DB_SSL_CA` peut contenir le certificat avec de vrais retours ligne ou avec
  `\n`.
- Si les Trusted Sources sont activees, ajouter ensuite les IP sortantes Render.
  Les IP par defaut Render sont des plages partagees; pour une allowlist stricte,
  utiliser des Dedicated Outbound IPs Render.

## 4. Initialisation du schema

Le script `backend/src/scripts/init-schema.ts` lit `backend/sql/001_init_schema.sql`
et ignore `CREATE DATABASE` / `USE amcco_dev`, ce qui le rend compatible avec
DigitalOcean.

Sur Render, il est execute via:

```bash
npm --workspace backend run db:init
```

En local, apres avoir renseigne `backend/.env`, utiliser:

```bash
npm --workspace backend run build
npm --workspace backend run db:init
```

Pour un lancement manuel sans build:

```bash
npm --workspace backend run db:init:dev
```

## 5. ImageKit

Dans ImageKit, recuperer:

- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

Les mettre uniquement dans Render. Ne jamais mettre `IMAGEKIT_PRIVATE_KEY` dans
Netlify ou dans le frontend.

Le frontend demande des parametres d'upload au backend authentifie, puis envoie
le fichier a `https://upload.imagekit.io/api/v1/files/upload`.

## 6. Render backend

1. Connecter le repo GitHub dans Render.
2. Creer un Blueprint depuis `render.yaml`.
3. Verifier les valeurs non secretes:
   - Region: `frankfurt`
   - Build: `npm ci --include=dev && npm --workspace backend run build && npm prune --omit=dev`
   - Pre-deploy: `npm --workspace backend run db:init`
   - Start: `npm --workspace backend run start`
   - Health check: `/api/v1/health`
4. Renseigner les secrets dans Render:
   - `DATABASE_URL`
   - `DB_SSL_CA`
   - `IMAGEKIT_PUBLIC_KEY`
   - `IMAGEKIT_PRIVATE_KEY`
   - `IMAGEKIT_URL_ENDPOINT`
5. Verifier que `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` sont generes et
   differents.
6. Lancer le premier deploy.
7. Verifier:

```bash
curl https://SERVICE.onrender.com/api/v1/health
curl https://SERVICE.onrender.com/api/v1/ready
```

8. Ajouter le domaine custom `api.groupenioumaladiady.com` dans Render.
9. Dans Squarespace DNS, ajouter le CNAME demande par Render pour `api`.
10. Re-verifier:

```bash
curl https://api.groupenioumaladiady.com/api/v1/health
curl https://api.groupenioumaladiady.com/api/v1/ready
```

## 7. Netlify frontend

1. Creer un site Netlify depuis le repo GitHub.
2. Netlify doit lire `netlify.toml` a la racine:
   - Build command: `npm --workspace frontend run build`
   - Publish directory: `frontend/dist`
3. Ajouter la variable Netlify:

```env
VITE_API_BASE_URL=https://api.groupenioumaladiady.com/api/v1
```

4. Lancer un deploy depuis `main`.
5. Verifier l'URL Netlify temporaire:
   - page d'accueil;
   - navigation directe sur une route interne;
   - login;
   - appels API.

Pendant ce test temporaire, ajouter aussi l'origine Netlify exacte dans
`CORS_ORIGIN` cote Render, par exemple:

```env
CORS_ORIGIN=https://groupenioumaladiady.com,https://www.groupenioumaladiady.com,https://NOM-DU-SITE.netlify.app
```

Retirer l'URL temporaire si elle n'est plus necessaire apres activation du
domaine custom.

## 8. Domaine Squarespace vers Netlify

Dans Netlify, ajouter:

- `groupenioumaladiady.com`
- `www.groupenioumaladiady.com`

Choisir le domaine primaire, puis appliquer les DNS dans Squarespace:

- `www` -> CNAME vers le sous-domaine Netlify du site, par exemple
  `NOM-DU-SITE.netlify.app`.
- Apex `@` -> si Squarespace propose ALIAS/ANAME/flattened CNAME, pointer vers
  `apex-loadbalancer.netlify.com`; sinon utiliser l'enregistrement A Netlify
  `75.2.60.5`.

Supprimer les anciens records Squarespace par defaut qui pointent encore vers un
site Squarespace si le domaine doit pointer vers Netlify.

Propagation DNS: prevoir quelques minutes a 24-48h selon les caches DNS.

## 9. Variables production

Backend Render:

```env
NODE_ENV=production
API_PREFIX=/api/v1
CORS_ORIGIN=https://groupenioumaladiady.com,https://www.groupenioumaladiady.com
JWT_ACCESS_SECRET=<genere Render ou secret long>
JWT_REFRESH_SECRET=<genere Render ou secret long different>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/amcco_prod
DB_POOL_LIMIT=10
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=<certificat CA DigitalOcean>
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX_ATTEMPTS=10
IMAGEKIT_PUBLIC_KEY=<ImageKit public key>
IMAGEKIT_PRIVATE_KEY=<ImageKit private key>
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/<id>
```

Frontend Netlify:

```env
VITE_API_BASE_URL=https://api.groupenioumaladiady.com/api/v1
```

## 10. Verification post-deploiement

Backend:

- `GET /api/v1/health` renvoie `status: ok`
- `GET /api/v1/ready` renvoie `status: ready`
- logs Render sans erreurs de boot ou DB

Frontend:

- chargement du domaine principal en HTTPS;
- redirection coherent entre apex et `www`;
- navigation React Router sur refresh de page;
- login;
- changement d'entreprise;
- creation transaction;
- upload preuve ImageKit;
- creation tache;
- ajout commentaire et piece jointe;
- export CSV/XLSX/PDF.

## 11. Workflow Git professionnel

Developpement quotidien:

```bash
git checkout develop
git pull
git checkout -b feat/nom-court
# edits
npm --workspace backend run test
npm run typecheck
npm run build
git status --short
git add <fichiers>
git commit -m "feat: description courte"
git push -u origin feat/nom-court
```

Release:

1. Ouvrir une PR vers `develop`.
2. Corriger jusqu'a CI verte.
3. Tester la recette.
4. Merger `develop` vers `main` via PR.
5. Le push sur `main` declenche Netlify et Render.
6. Executer la verification post-deploiement.

## 12. Rollback

- Netlify: restaurer le deploy precedent depuis l'interface Deploys.
- Render: rollback vers le deploy precedent depuis Events/Deploys.
- Base de donnees: utiliser les backups/PITR DigitalOcean. Ne jamais faire de
  rollback SQL manuel sans sauvegarde prealable.

## 13. References officielles

- Render Blueprint: https://render.com/docs/blueprint-spec
- Render custom domains: https://render.com/docs/custom-domains
- Render outbound IPs: https://render.com/docs/outbound-ip-addresses
- Netlify monorepos: https://docs.netlify.com/build/configure-builds/monorepos/
- Netlify external DNS: https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/
- DigitalOcean MySQL connection: https://docs.digitalocean.com/products/databases/mysql/how-to/connect/
- DigitalOcean MySQL security: https://docs.digitalocean.com/products/databases/mysql/how-to/secure/
- ImageKit upload auth: https://imagekit.io/docs/api-reference/upload-file/upload-file
