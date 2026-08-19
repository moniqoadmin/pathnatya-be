# Pathnatya Backend (POC)

NestJS API for the Pathnatya Electron desktop app. It manages accounts and device teams, login, encrypted video metadata, issue tracking, event logs, bulk Excel imports, and per-account app configuration. PostgreSQL is the source of truth; JSON request and response bodies can be wrapped in JWE for the Electron client.

## Stack

- [NestJS 10](https://nestjs.com/)
- [TypeORM](https://typeorm.io/) + `pg`
- PostgreSQL
- [Swagger](https://docs.nestjs.com/openapi/introduction) (`/docs`)
- `class-validator` / `class-transformer`
- [Helmet](https://helmetjs.github.io/), CORS allowlist, `@nestjs/throttler`
- [jose](https://github.com/panva/jose) (JWE auth tokens and payload encryption)
- [ExcelJS](https://github.com/exceljs/exceljs) (account import templates and uploads)
- In-memory cache (`cache-manager`) for video records

## Features

### Security and transport

- **Helmet** security headers (CSP tuned for Swagger, HSTS, COEP, COOP, Permissions-Policy).
- **CORS allowlist** via `CORS_ORIGINS`. Requests with no `Origin` (Electron main process, curl) are allowed; browsers must match the list.
- **Global request validation** (`whitelist` + `forbidNonWhitelisted`).
- **Rate limiting** per IP (default 100 requests / 60s). Auth endpoints are capped at 30 / 60s. `GET /api/health` is not throttled.
- **Optional load-test bypass** with `X-Load-Test-Key` matching `LOAD_TEST_KEY` (non-production only).
- **App key gate**: most routes require `X-App-Key` equal to `ELECTRON_APP_KEY` (timing-safe compare).
- **JWE sessions**: compact JWE (`dir` / `A256GCM`) from `JWE_SECRET`. Electron sessions last **5 days**; `?admin=true` login issues a **2-hour** token.
- **Payload encryption**: when `PAYLOAD_ENCRYPTION=true`, JSON bodies must be `{ "payload": "<compact-jwe>" }` derived from `ELECTRON_APP_1` (SHA-256 → A256GCM). Localhost may send and receive plain JSON. Multipart uploads, health, Swagger, binary downloads, and `@SkipPayloadEncryption()` routes skip wrapping.
- **Trust proxy** so `req.ip` is correct behind Railway / a reverse proxy.
- **2 MB** JSON / urlencoded body limit.

### Accounts, teams, and login

- CRUD for accounts keyed by an immutable **10-digit** US / UK / India phone number (no country code).
- Organizational fields: country, sanghat, jilha, taluka, group, kendra, sanchalak name, metadata.
- Roles: `User`, `Admin`, `SuperAdmin`, `Developer`.
- **Device teams**: each account has up to `numberOfTeams` teams (default 1). A team is created when a new device MAC (`ipAddress`) sets a password or logs in, and is bound to that `systemAddress`.
- Per-team **scrypt** password hashes, `setPassword` flag, `isLoginDisabled`, last login time, and metadata.
- **Check phone**: reports whether the account exists and whether this device still needs a password. Rejects login-disabled teams and accounts at the device cap.
- **Set password**: hashes the password, binds the device, stores optional metadata, returns `teamNumber`.
- **Login**: matches the device team (or any team with a password when `?admin=true`), returns account + team + JWE token.
- **Admin login** (`?admin=true`): skips device MAC matching and team caps; shorter token TTL.
- **Login protection**: lock after too many failures per phone and per IP (defaults: 5 phone / 100 IP failures in 15 minutes → 15-minute lock).
- **Password-hash concurrency cap** so scrypt cannot saturate the process (`LOGIN_HASH_CONCURRENCY`, queue limit, `503` + retry-after when busy).
- Paginated account list with search (phone or kendra). Admins see only `User` accounts in their sanghat; SuperAdmin / Developer see all and may filter by role.
- Role-scoped updates: Admins may only toggle a subset of fields (password reset, login disable, offline, team count, reboot count, logout button, app configuration) for Users in their sanghat. SuperAdmin / Developer may edit all mutable fields.
- Account flags consumed by the Electron app: `isOffline`, `logoutButton`, `numberOfReboot`, `appConfiguration`.
- `GET /api/accounts/login-token` returns six `LOGIN_SUCCESS_KEY_*` values used after a successful login.
- `GET /api/accounts/roles` lists role names.

### Bulk account import

- Download an `.xlsx` template (`GET /api/accounts/bulk/template`).
- Upload a filled sheet (`POST /api/accounts/bulk/upload`, multipart field `file`, max 20 MB). Admin, SuperAdmin, and Developer only.
- In-process queue (`IMPORT_QUEUE_CONCURRENCY`) with job status: `queued` → `processing` → `completed` / `failed`.
- Per-row errors stored and listed with pagination. Duplicate / invalid phones are skipped, not fatal.
- Template columns include country, sanghat, jilha, taluka, group, kendra type/name, sanchalak, country code (`91` / `44` / `1`), mobile number, expected team count, and role.
- Old jobs are pruned after `IMPORT_JOB_RETENTION_DAYS` (default 7).

### Videos and segments

- Store encrypted-video catalog records (`videoId`, source, sizes, duration, algorithm, header, key derivation, local dir).
- Create segments one-at-a-time, as an array, or as `{ videoId, segments }`. Duplicate `(videoId, segmentNumber)` pairs are rejected.
- Segment payload includes language, timings, split ratios, hashes, part orders, and base64 `remoteData`.
- List/get videos and get a segment by `videoId` + `segmentNumber`.
- **1-day in-memory cache** for video list and individual video / segment reads.

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

- **App configurations**: HLS source, allowed hosts, and video-file list, assigned to accounts by numeric id.
- **Server API URLs**: two slots (`id` 1 or 2) for the client to discover backends. These routes skip auth and payload encryption.

### Health and ops

- `GET /api` — service name and status.
- `GET /api/health` — app + Postgres (`SELECT 1`); `503` when the DB is down. Skips throttle and payload encryption.
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

For a local Postgres / Railway **public** TCP proxy, set `DATABASE_URL` and typically `DB_SSL=true`. On Railway’s private network use the internal URL and `DB_SSL=false`.

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
| `THROTTLE_LIMIT` | Global requests per window per IP | `100` |
| `LOAD_TEST_KEY` | Optional; matching `X-Load-Test-Key` skips throttles outside production | unset |

## Authentication

Almost every route needs:

| Header | Value |
| --- | --- |
| `X-App-Key` | `ELECTRON_APP_KEY` |
| `Authorization` | `Bearer <jwe>` from `POST /api/accounts/login` |

**Public** (still require `X-App-Key` unless noted):

- `POST /api/accounts` — create account
- `POST /api/accounts/check-phone`
- `POST /api/accounts/set-password`
- `POST /api/accounts/login`
- `GET` / `POST /api/server-api-urls` — no app key
- `GET /api/health`, `GET /api/health/time`, `GET /api` — no app key
- `POST /api/crypto/encrypt`, `POST /api/crypto/decrypt` — app key only

### Roles

| Role | Typical access |
| --- | --- |
| `User` | Own teams, own issues/comments, own logs, videos, config |
| `Admin` | Users in the same sanghat: list/edit a limited field set, import accounts, report issues for those users |
| `SuperAdmin` / `Developer` | All accounts, full edits, import, issue inbox, resolve issues |

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
| POST | `/accounts` | app key | Create an account |
| POST | `/accounts/check-phone` | app key | `{ exists, needsPassword }`; `?admin=true` skips device matching |
| POST | `/accounts/set-password` | app key | Set / reset password for this device team |
| POST | `/accounts/login` | app key | Login; `?admin=true` → 2h token, no device bind |
| GET | `/accounts/login-token` | token | Six login success keys |
| GET | `/accounts/roles` | token | Role names |
| GET | `/accounts` | token | Paginated list (`page`, `limit`, `search`, `role`, `admin`) |
| GET | `/accounts/:id` | token | Get one account |
| PATCH | `/accounts/:id` | token | Update account (role-scoped) |
| DELETE | `/accounts/:id` | token | Delete account |
| GET | `/accounts/:accountId/teams` | token | List teams |
| PATCH | `/accounts/:accountId/teams/:teamId` | token | Update one team |
| GET | `/accounts/bulk/template` | token | Download Excel template (binary, not encrypted) |
| POST | `/accounts/bulk/upload` | token | Queue Excel import (`202`, `{ jobId, status }`) |
| GET | `/accounts/bulk/upload/:jobId` | token | Import job status |
| GET | `/accounts/bulk/upload/:jobId/errors` | token | Paginated row errors |

### Videos

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/videos` | Create a video record |
| GET | `/videos` | List videos (cached) |
| GET | `/videos/:videoId` | Get one video |
| POST | `/video-segments` | Create one, many, or bulk segments |
| GET | `/video-segments/:videoId/:segmentNumber` | Get one segment |

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
| POST | `/app-configurations` | token | Upsert by numeric `id` |
| GET | `/server-api-urls` | none | List backend URLs (ids `1` and `2`) |
| POST | `/server-api-urls` | none | Upsert `{ id, link }` |

## Project structure

```
src/
  main.ts                         # Helmet, CORS, validation, Swagger, payload filter
  app.module.ts                   # Config, TypeORM, throttle, cache, feature modules
  accounts/                       # Accounts, teams, login, JWE, app-key guard
  imports/                        # Excel upload queue, jobs, row errors
  videos/                         # Videos and encrypted segments
  issues/                         # Issue reporting and resolution
  logs/                           # Client event logs
  config/                         # App configurations, server API URLs, DB/cache
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
- Use strong unique values for `JWE_SECRET`, `ELECTRON_APP_KEY`, `ELECTRON_APP_1`, and all `LOGIN_SUCCESS_KEY_*`.
- Keep `PAYLOAD_ENCRYPTION=true` for the Electron client.
- Leave `LOAD_TEST_KEY` unset.
- Prefer the private Postgres URL on the same network (`DB_SSL=false`); use the public proxy + SSL from outside.
- Import jobs and login-failure counters live in process memory / this instance’s queue — they are not shared across multiple replicas.
