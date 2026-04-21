# Lot 1 - IAM backend v1

## Endpoints

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me` (Bearer access token)
- `GET /api/v1/admin/ping` (roles `OWNER`, `SYS_ADMIN`)

## Body attendu

`POST /auth/login`

```json
{
  "email": "owner@amcco.local",
  "password": "Passw0rd!123",
  "companyCode": "AMCCO"
}
```

`POST /auth/refresh`

```json
{
  "refreshToken": "<token>"
}
```

`POST /auth/logout`

```json
{
  "refreshToken": "<token>"
}
```

## Base de donnees

Table ajoutee:

- `refresh_sessions`: stockage hash des refresh tokens (rotation + revocation)

Script migration:

- `backend/sql/002_add_refresh_sessions.sql`

## Seed dev

Commande:

```bash
npm --workspace backend run seed:dev-user
```

Valeurs par defaut:

- `DEV_COMPANY_CODE=AMCCO`
- `DEV_ADMIN_EMAIL=bakayoko@amcco.local`
- `DEV_ADMIN_PASSWORD=Bakayoko1234!`
- `DEV_ADMIN_FULL_NAME=Bakayoko Demo`
