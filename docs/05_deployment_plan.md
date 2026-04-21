# Plan de deploiement

## Environnements

- `local`: dev quotidien (Laragon MySQL)
- `staging`: validation metier et recette
- `production`: exploitation

## Cibles

- frontend: Netlify
- backend: Render
- db: PlanetScale
- stockage fichiers: ImageKit

## Variables critiques

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `IMAGEKIT_*` (a ajouter avec le module documents)

## Strategie release

1. Merge sur `develop` -> deploiement staging
2. Validation fonctionnelle
3. Merge sur `main` -> deploiement production
4. Verification post-release (`health`, logs, erreurs)

## Prepa domaines (quand decide)

- frontend: configuration DNS du domaine public dans Netlify
- backend: sous-domaine API avec HTTPS force
- mise a jour `CORS_ORIGIN` et URL API frontend
- activation politique HSTS cote API

