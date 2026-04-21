# Admin Utilisateurs

## Scope

Gestion des utilisateurs entreprise pour les roles:

- `OWNER`
- `SYS_ADMIN`

## API backend

- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId`
- `PATCH /api/v1/admin/users/:userId/role`
- `PATCH /api/v1/admin/users/:userId/password`
- `DELETE /api/v1/admin/users/:userId`

## Regles metier

- un utilisateur ne peut pas etre ajoute 2 fois sur la meme entreprise
- impossible de changer son propre role
- impossible de supprimer son propre membership
- impossible de retirer le dernier `OWNER` d'une entreprise
- reset de mot de passe possible par admin avec invalidation des sessions refresh
- toutes les operations admin ecrivent un audit log

## Frontend

Ecran:

- `frontend/src/pages/AdminUsersPage.tsx`

Capacites:

- creation utilisateur
- modification nom et activation
- changement de role
- reset mot de passe utilisateur
- suppression membership
- rechargement de liste avec gestion d'erreurs
- retry automatique apres refresh token en cas de `401`
