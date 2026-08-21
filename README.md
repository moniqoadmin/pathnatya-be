# Pathnatya Backend (POC)

NestJS API for the Pathnatya Electron desktop app. It manages accounts and device teams, login, issue tracking, event logs, bulk Excel imports, and per-account app configuration. PostgreSQL is the source of truth; JSON request and response bodies can be wrapped in JWE for the Electron client.

## Stack

- [NestJS 10](https://nestjs.com/)
- [TypeORM](https://typeorm.io/) + `pg`
- PostgreSQL
- [Swagger](https://docs.nestjs.com/openapi/introduction) (`/docs`)
- `class-validator` / `class-transformer`
- [Helmet](https://helmetjs.github.io/), CORS allowlist, `@nestjs/throttler`
- [jose](https://github.com/panva/jose) (JWE auth tokens and payload encryption)
- [ExcelJS](https://github.com/exceljs/exceljs) (account import templates and uploads)

## Features

### Security and transport

- **Helmet** security headers (CSP tuned for Swagger, HSTS, COEP, COOP, Permissions-Policy).
- **CORS allowlist** via `CORS_ORIGINS`. Requests with no `Origin` (Electron main process, curl) are allowed; browsers must match the list.
- **Global request validation** (`whitelist` + `forbidNonWhitelisted`).
- **Rate limiting** per IP (default 30 requests / 60s). Auth endpoints (`check-phone`, `set-password`, `login`) are capped at 15 / 60s. Health endpoints are capped at 10 / 60s.
- **Optional load-test bypass** with `X-Load-Test-Key` matching `LOAD_TEST_KEY` (non-production only).
- **App key gate**: most routes require `X-App-Key` equal to `ELECTRON_APP_KEY` (timing-safe compare).
- **JWE sessions**: compact JWE (`dir` / `A256GCM`) from `JWE_SECRET`. Electron sessions last **5 days**; `?admin=true` login issues a **2-hour** token.
- **Payload encryption**: when `PAYLOAD_ENCRYPTION=true`, JSON bodies must be `{ "payload": "<compact-jwe>" }` derived from `ELECTRON_APP_1` (SHA-256 → A256GCM). Localhost may send and receive plain JSON. Multipart uploads, health, Swagger, binary downloads, and `@SkipPayloadEncryption()` routes skip wrapping.
- **Trust proxy** so `req.ip` is correct behind Railway / a reverse proxy.
- **2 MB** JSON / urlencoded body limit.

### Accounts, teams, and login

- CRUD for accounts keyed by an immutable **10-digit** US / UK / India phone number (no country code). **Create** (`POST /api/accounts`) requires a token: Admin, SuperAdmin, or Developer. Admins may only create `User` accounts in their sanghat.
- Organizational fields: country, sanghat, jilha, taluka, group, kendra, sanchalak name, metadata.
- Roles: `User`, `Admin`, `SuperAdmin`, `Developer`.
- **Device teams**: each account has up to `numberOfTeams` teams (default 1). A team is created when a new device MAC (`ipAddress`) sets a password or logs in, and is bound to that `systemAddress`.
- Per-team **scrypt** password hashes, `setPassword` flag, `isLoginDisabled`, last login time, and metadata.
- **Check phone**: reports whether the account exists and whether this device still needs a password. Rejects login-disabled teams and accounts at the device cap.
- **Set password**: hashes the password, binds the device, stores optional metadata, returns `teamNumber`.
- **Login**: matches the device team (or any team with a password when `?admin=true`), returns account + team + JWE token.
- **Admin login** (`?admin=true`): skips device MAC matching and team caps; shorter token TTL. Admin / SuperAdmin / Developer always receive a token on this path.
- **Electron privileged login**: controlled by entitlement `ADMIN_LOGIN_ELECTRON_APP` (default true). When false, Admin / SuperAdmin / Developer cannot log in from the Electron app (`admin` omitted or false).
- **Login protection**: lock after too many failures per phone and per IP (defaults: 5 phone / 100 IP failures in 15 minutes → 15-minute lock).
- **Password-hash concurrency cap** so scrypt cannot saturate the process (`LOGIN_HASH_CONCURRENCY`, queue limit, `503` + retry-after when busy).
- Paginated account list with search (phone or kendra). Admins see only `User` accounts in their sanghat; SuperAdmin / Developer see all and may filter by role or sanghat name.
- Role-scoped reads and deletes: Users may GET their own account. Admins may GET or DELETE Users in their sanghat. SuperAdmin / Developer may GET or DELETE any account. A token is rejected if the caller account no longer exists.
- Role-scoped updates: Admins may only toggle a subset of fields (password reset, login disable, offline, team count, reboot count, logout button, app configuration) for Users in their sanghat. SuperAdmin / Developer may edit all mutable fields.
- Account flags consumed by the Electron app: `isOffline`, `logoutButton`, `numberOfReboot`, `appConfiguration`.
- `GET /api/accounts/login-token` returns six `LOGIN_SUCCESS_KEY_*` values used after a successful login.
- `GET /api/accounts/roles` lists role names.
- **Login analytics** (`GET /api/accounts/analytics`): SuperAdmin / Developer counts of teams and accounts that have logged in (`lastLoginTime` set). Optional `sanghat` and `since` (ISO-8601) filters; also returns `totalAccounts` and `totalTeams`. Cached in process memory for 3 hours per sanghat + since combination (no Redis).

### Bulk account import

- Download an `.xlsx` template (`GET /api/accounts/bulk/template`). SuperAdmin and Developer only.
- Upload a filled sheet (`POST /api/accounts/bulk/upload`, multipart field `file`, max 20 MB). SuperAdmin and Developer only. Role and sanghat in the sheet are applied as given. Admin, SuperAdmin, and Developer rows always get `numberOfTeams` 1, ignoring the sheet value.
- Update team counts for existing accounts (`POST /api/accounts/bulk/teams`, same Excel format). Phone numbers must already exist; missing phones and invalid team numbers are per-row errors. Uses **Updated No. of Teams Expected** when that column is present, otherwise **No. of Teams Expected**.
- List import jobs (`GET /api/accounts/bulk/upload`, paginated, optional `status`). SuperAdmin and Developer only.
- List team-number update jobs (`GET /api/accounts/bulk/teams`, paginated, optional `status`). SuperAdmin and Developer only.
- In-process queue (`IMPORT_QUEUE_CONCURRENCY`) with job status: `queued` → `processing` → `completed` / `failed`.
- Per-row errors stored and listed with pagination. Duplicate / invalid phones are skipped, not fatal.
- Template columns include country, sanghat, jilha, taluka, group, kendra type/name, sanchalak, country code (`91` / `44` / `1`), mobile number, expected team count, and role.
- Old jobs are pruned after `IMPORT_JOB_RETENTION_DAYS` (default 7).

### Issues

- Users report issues against a phone number (own account). Admins may report for Users in their sanghat; SuperAdmin / Developer may report for anyone.
- Catalog codes via `issueNumbers`, status workflow: `open` → `in_progress` → `resolved` / `closed`.
- Threaded comments (reporter plus SuperAdmin / Developer).
- SuperAdmin / Developer list (`/pending`), mark in progress, and resolve with `resolution` + `resolutionMessage`.
- Paginated lists (page / limit / optional status).

### Logs

- Authenticated clients post events; account id and phone come from the token.
- Body may be flat or wrapped as `{ data: { event, tampered, ipAddress, metadata } }`.
- `FILES_TAMPERED` requires a device MAC and **disables login only for that team**, not the whole account.
- List and fetch logs scoped to the authenticated account.

### Configuration

- **App configurations**: HLS source, allowed hosts, and video-file list, assigned to accounts by numeric id. Reads are authenticated; writes are SuperAdmin / Developer only.
- **Entitlements**: SuperAdmin / Developer feature flags the Electron app can read. `ADMIN_LOGIN_ELECTRON_APP` is seeded **enabled** when the table is created. When it is **true**, Admin / SuperAdmin / Developer may log in with `?admin=true` or `?admin=false`. When it is **false**, those roles may only log in with `?admin=true`; the Electron app accepts User roles only. Creates and updates write an audit-trail entry for the caller.

### Health and ops

- `GET /api` — service name and status.
- `GET /api/health` — app + Postgres (`SELECT 1`); `503` when the DB is down. Capped at 10 / 60s; skips payload encryption.
- `GET /api/health/time` — server UTC as ISO-8601 and Unix milliseconds.
- Graceful shutdown hooks.
- Swagger at `/docs` when `NODE_ENV` is not `production`, or when `SWAGGER_ENABLED=true`.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

For a local Postgres / Railway **public** TCP proxy, set `DATABASE_URL` and typically `DB_SSL=true`. On Railway’s private network use the internal URL and `DB_SSL=false`. Use placeholders only — never commit a real password:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

For local Swagger or curl, set `PAYLOAD_ENCRYPTION=false` (or call from localhost, which accepts plain JSON even when encryption is on).

3. Run in watch mode:

```bash
npm run start:dev
```

- API base URL: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/docs`

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | `development` / `production` (Swagger hidden in production unless enabled) | — |
| `CORS_ORIGINS` | Comma-separated browser origins. Empty = non-browser clients only | empty |
| `DATABASE_URL` | Postgres connection string | required |
| `DB_POOL_MAX` | Pool size | `20` |
| `DB_CONNECTION_TIMEOUT_MS` | Connect timeout | `5000` |
| `DB_IDLE_TIMEOUT_MS` | Idle connection timeout | `30000` |
| `DB_STATEMENT_TIMEOUT_MS` | Statement timeout | `30000` |
| `DB_SYNCHRONIZE` | Auto-create tables from entities (**dev only**) | `false` |
| `DB_LOGGING` | Log SQL | `false` |
| `DB_SSL` | Require SSL (Railway public endpoint typically needs this) | `true` |
| `SWAGGER_ENABLED` | Force Swagger on in production | `false` |
| `JWE_SECRET` | Secret hashed to the 256-bit JWE auth key | required |
| `ELECTRON_APP_KEY` | Shared secret in `X-App-Key` | required |
| `ELECTRON_APP_1` | Secret hashed to the payload-encryption key | required |
| `PAYLOAD_ENCRYPTION` | Require `{ "payload": "<jwe>" }` for JSON | `true` |
| `LOGIN_SUCCESS_KEY_1` … `LOGIN_SUCCESS_KEY_6` | Keys returned by `GET /api/accounts/login-token` | required |
| `LOGIN_HASH_CONCURRENCY` | Max concurrent scrypt verifies | `4` |
| `LOGIN_HASH_QUEUE_LIMIT` | Max waiters before `503` | `500` |
| `LOGIN_RETRY_AFTER_SECONDS` | Hint when the hash queue is full | `5` |
| `LOGIN_PHONE_FAILURE_LIMIT` | Failed logins per phone before lock | `5` |
| `LOGIN_IP_FAILURE_LIMIT` | Failed logins per IP before lock | `100` |
| `LOGIN_FAILURE_WINDOW_SECONDS` | Failure counting window | `900` |
| `LOGIN_LOCK_SECONDS` | Lock duration after the limit | `900` |
| `IMPORT_QUEUE_CONCURRENCY` | Import jobs processed at once | `1` |
| `IMPORT_MAX_FILE_SIZE_MB` | Upload size cap | `20` |
| `IMPORT_JOB_RETENTION_DAYS` | How long import jobs are kept | `7` |
| `THROTTLE_TTL_MS` | Global throttle window | `60000` |
| `THROTTLE_LIMIT` | Global requests per window per IP | `30` |
| `LOAD_TEST_KEY` | Optional; matching `X-Load-Test-Key` skips throttles outside production | unset |

## Authentication

Almost every route needs:

| Header | Value |
| --- | --- |
| `X-App-Key` | `ELECTRON_APP_KEY` |
| `Authorization` | `Bearer <jwe>` from `POST /api/accounts/login` |

**Public** (still require `X-App-Key` unless noted):

- `POST /api/accounts/check-phone`
- `POST /api/accounts/set-password`
- `POST /api/accounts/login`
- `GET /api/health`, `GET /api/health/time`, `GET /api` — no app key
- `POST /api/crypto/encrypt`, `POST /api/crypto/decrypt` — app key only

### Roles

| Role | Typical access |
| --- | --- |
| `User` | Own account, own teams, own issues/comments, own logs, read config |
| `Admin` | Users in the same sanghat: create, list, get, delete, edit a limited field set, report issues for those users |
| `SuperAdmin` / `Developer` | All accounts, get/delete, full edits, bulk import (including role and sanghat), login analytics, issue inbox, resolve issues, write app configurations and entitlements |

## Payload encryption

When `PAYLOAD_ENCRYPTION` is on and the client is **not** localhost:

```json
{ "payload": "<compact-jwe>" }
```

The JWE uses `dir` / `A256GCM` with `SHA-256(ELECTRON_APP_1)` as the key. Responses are wrapped the same way. Localhost always returns plain JSON.

Helpers (skip transport wrapping, still need `X-App-Key`):

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/crypto/encrypt` | `{ "data": … }` → `{ "payload": "<jwe>" }` |
| POST | `/api/crypto/decrypt` | `{ "payload": "<jwe>" }` → `{ "data": … }` |

## API

Base path: `/api`. Authenticated routes also need `X-App-Key` and a Bearer token unless marked otherwise.

### Root and health

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | none | Service info |
| GET | `/health` | none | App + database status |
| GET | `/health/time` | none | Server time (UTC) |

### Accounts

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/accounts` | token | Create an account (Admin / SuperAdmin / Developer) |
| POST | `/accounts/check-phone` | app key | `{ exists, needsPassword }`; `?admin=true` skips device matching |
| POST | `/accounts/set-password` | app key | Set / reset password for this device team |
| POST | `/accounts/login` | app key | Login; `?admin=true` → 2h token, no device bind. Privileged Electron login gated by `ADMIN_LOGIN_ELECTRON_APP` |
| GET | `/accounts/login-token` | token | Six login success keys |
| GET | `/accounts/roles` | token | Role names |
| GET | `/accounts/analytics` | token | Login counts (`teamsLoggedIn`, `accountsLoggedIn`, `totalTeams`, `totalAccounts`). Optional `sanghat`, `since`. Cached 3h in process memory per sanghat + since. SuperAdmin / Developer |
| GET | `/accounts` | token | Paginated list (`page`, `limit`, `search`, `role`, `sanghat`, `admin`) |
| GET | `/accounts/:id` | token | Get one account (own, or role-scoped) |
| PATCH | `/accounts/:id` | token | Update account (role-scoped) |
| DELETE | `/accounts/:id` | token | Delete account (Admin / SuperAdmin / Developer) |
| GET | `/accounts/:accountId/teams` | token | List teams |
| PATCH | `/accounts/:accountId/teams/:teamId` | token | Update one team |
| GET | `/accounts/bulk/template` | token | Download Excel template (binary, not encrypted). SuperAdmin / Developer |
| POST | `/accounts/bulk/upload` | token | Queue Excel import (`202`, `{ jobId, status }`). SuperAdmin / Developer |
| GET | `/accounts/bulk/upload` | token | Paginated import jobs (`page`, `limit`, `status`). SuperAdmin / Developer |
| GET | `/accounts/bulk/upload/:jobId` | token | Import job status. SuperAdmin / Developer |
| GET | `/accounts/bulk/upload/:jobId/errors` | token | Paginated row errors. SuperAdmin / Developer |
| POST | `/accounts/bulk/teams` | token | Queue Excel team-number update (`202`, `{ jobId, status }`). SuperAdmin / Developer |
| GET | `/accounts/bulk/teams` | token | Paginated team-number update jobs (`page`, `limit`, `status`). SuperAdmin / Developer |
| GET | `/accounts/bulk/teams/:jobId` | token | Team-number update job status (`createdCount` = accounts updated). SuperAdmin / Developer |
| GET | `/accounts/bulk/teams/:jobId/errors` | token | Paginated row errors. SuperAdmin / Developer |

### Issues

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/issues` | Report an issue |
| GET | `/issues` | Issues reported by the caller (paginated) |
| GET | `/issues/pending` | SuperAdmin / Developer inbox |
| GET | `/issues/:id` | Get one issue |
| POST | `/issues/:id/comments` | Add a comment |
| PATCH | `/issues/:id/status` | Set `in_progress` |
| PATCH | `/issues/:id/resolve` | Resolve / close with notes |

### Logs

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/logs` | Create an event (`FILES_TAMPERED` disables that device team) |
| GET | `/logs` | List events for the authenticated account |
| GET | `/logs/:logId` | Get one event |

### Configuration

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/app-configurations` | token | List configurations |
| POST | `/app-configurations` | token | Upsert by numeric `id` (SuperAdmin / Developer) |

### Entitlements

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/entitlements` | token | List flags (Electron app reads these) |
| GET | `/entitlements/:key` | token | Get one flag |
| POST | `/entitlements` | token | Add a flag (SuperAdmin / Developer). Audited |
| PATCH | `/entitlements/:key` | token | Update `enabled` / `description` (SuperAdmin / Developer). Audited |

## Project structure

```
src/
  main.ts                         # Helmet, CORS, validation, Swagger, payload filter
  app.module.ts                   # Config, TypeORM, throttle, cache, feature modules
  accounts/                       # Accounts, teams, login, JWE, app-key guard
  imports/                        # Excel upload queue, jobs, row errors
  videos/                         # Video catalog entities (no HTTP API)
  issues/                         # Issue reporting and resolution
  logs/                           # Client event logs
  entitlements/                   # SuperAdmin feature flags (Electron login gate)
  config/                         # App configurations, DB/cache
  crypto/                         # Payload JWE interceptor, encrypt/decrypt helpers
  health/                         # Liveness + DB ping + server time
```

Entities are auto-loaded (`autoLoadEntities: true`). With `DB_SYNCHRONIZE=true`, TypeORM creates tables from entities.

## Scripts

| Script | Description |
| --- | --- |
| `npm run start:dev` | Watch mode |
| `npm run start:debug` | Debug + watch |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled build |
| `npm run lint` | ESLint + autofix |
| `npm run format` | Prettier |
| `npm test` | Jest (`*.spec.ts`) |

## Production notes

- Set `DB_SYNCHRONIZE=false`. Apply schema changes yourself; do not rely on TypeORM auto-sync.
- Never commit a real `DATABASE_URL`. Rotate any password that was ever checked in, even after the file is scrubbed.
- Bootstrap the first SuperAdmin / Developer in the database; `POST /api/accounts` is not public.
- Use strong unique values for `JWE_SECRET`, `ELECTRON_APP_KEY`, `ELECTRON_APP_1`, and all `LOGIN_SUCCESS_KEY_*`.
- Keep `PAYLOAD_ENCRYPTION=true` for the Electron client.
- Leave `LOAD_TEST_KEY` unset.
- Prefer the private Postgres URL on the same network (`DB_SSL=false`); use the public proxy + SSL from outside.
- Import jobs, login-failure counters, and login-analytics cache live in process memory / this instance’s queue — they are not shared across multiple replicas.
