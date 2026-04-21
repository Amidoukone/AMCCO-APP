# Frontend RBAC

## Source unique des permissions

Le mapping role -> fonctionnalite est centralise dans:

- `frontend/src/config/permissions.ts`

Ce fichier definit:

- les roles applicatifs (`OWNER`, `SYS_ADMIN`, `ACCOUNTANT`, `SUPERVISOR`, `EMPLOYEE`)
- les droits par fonctionnalite (`FeatureKey`)
- le menu visible par role
- la route par defaut par role

## Guards

- `AuthGuard`: session valide requise
- `RoleGuard`: role autorise requis sur une fonctionnalite

## Regle d'evolution

Pour ajouter une section:

1. Ajouter la feature dans `permissions.ts`
2. Ajouter la page et la route
3. Proteger la route avec `RoleGuard`
4. Verifier que le menu s'affiche selon le role

