# Architecture cible

## 1. Vision

Application web centralisee, multi-entreprises, avec controle financier strict et traçabilite complete.

## 2. Architecture logique

- Frontend React TypeScript (PWA-ready)
- Backend Express TypeScript
- Base MySQL (local en dev, PlanetScale en production) avec acces natif `mysql2`
- Stockage fichiers/ImageKit pour preuves et documents

## 3. Couches backend

- `src/routes`: transport HTTP
- `src/controllers`: orchestration des requetes
- `src/services`: regles metier
- `src/repositories`: acces donnees
- `src/middleware`: auth, validation, securite, erreur
- `src/lib`: utilitaires techniques

## 4. Multi-tenant

Contrainte cle: chaque donnee fonctionnelle doit etre rattachee a une entreprise (`companyId`).

Regles:

- filtrage de toutes les lectures par `companyId`
- interdiction d'acces croise entre entreprises
- journaux d'audit contenant `actorId` + `companyId` + action

## 5. Securite

- JWT court + refresh token rotatif
- hash de mot de passe (`bcrypt`)
- verification stricte des permissions
- preuve obligatoire sur transactions configurees
- limitation de taux sur endpoints sensibles
- secrets uniquement via variables d'environnement

## 6. Scalabilite

- API stateless
- indexation SQL des colonnes de filtrage et historisation
- file asynchrone pour traitements non bloquants (exports, notifications)
- readiness pour cache Redis sur endpoints de dashboard

## 7. Observabilite

- logs structures JSON
- correlation par `requestId`
- endpoint `health` (liveness)
- endpoint `ready` (readiness DB)
