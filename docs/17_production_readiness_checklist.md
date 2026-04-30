# Checklist production AMCCO

## Etape 1 - Finition visible

- Corriger les textes francais encodes de maniere incorrecte dans l'interface.
- Verifier les libelles metier recurrents: entreprise, secteur, activite, operation, tache, rapport.
- Configurer les metadonnees HTML du frontend: langue, titre, description, couleur de theme.
- Renseigner `frontend/.env` avec `VITE_API_BASE_URL` pour chaque environnement.

## Etape 2 - Qualite automatique

- Executer avant chaque merge:

```bash
npm run lint
npm run typecheck
npm --workspace backend run test
npm run build
```

- Garder la CI bloquante sur tests backend, typecheck et build.
- Ajouter ensuite un vrai lint ESLint quand la convention de style sera stabilisee.

## Etape 3 - Securite applicative

- Garder `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` differents, longs et generes hors depot.
- Activer le rate limiting sur les routes d'authentification.
- Tracer chaque requete via `x-request-id`.
- Logger les erreurs serveur avec `requestId`, methode et route.
- Prochaine evolution recommandee: stocker le refresh token dans un cookie `HttpOnly`, `Secure`, `SameSite`, et ne garder qu'un access token court cote client.

## Etape 4 - Donnees et migrations

- Ne pas appliquer manuellement les scripts SQL en production sans journal de migration.
- Introduire un outil de migration versionne avant le premier lancement public.
- Tester le schema sur une base staging restauree depuis une sauvegarde representative.
- Documenter une procedure de rollback: sauvegarde, version applicative, version schema.

## Etape 5 - Deploiement staging puis production

- Staging:
  - deployer frontend et backend;
  - renseigner les variables d'environnement;
  - verifier `/api/v1/health` et `/api/v1/ready`;
  - tester login, changement d'entreprise, transactions, taches, rapports et exports.

- Production:
  - forcer HTTPS;
  - restreindre `CORS_ORIGIN` au domaine frontend public;
  - verifier ImageKit et les limites d'upload;
  - surveiller logs, erreurs 500, latence et disponibilite.

## Etape 6 - Tests metier a ajouter

- Parcours frontend/e2e prioritaires:
  - connexion et renouvellement de session;
  - creation d'entreprise initiale;
  - creation, soumission, validation et rejet de transaction;
  - creation, assignation et changement de statut d'une tache;
  - export CSV, Excel et PDF;
  - acces refuse selon les roles.

