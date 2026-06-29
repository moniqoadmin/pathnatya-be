# Pathnatya Backend (POC)

A NestJS + TypeORM + PostgreSQL boilerplate. Add your APIs as feature modules and they will be wired to the Railway Postgres database.

## Stack

- [NestJS 10](https://nestjs.com/)
- [TypeORM](https://typeorm.io/) + `pg`
- PostgreSQL (hosted on Railway)
- Swagger (API docs)
- `class-validator` / `class-transformer` (request validation)

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Configure the database connection in `.env`.

   The `.env` file already contains your Railway credentials, but you must fill in
   the **public** TCP proxy host and port so you can connect from your machine:

   - Go to Railway -> your Postgres service -> **Variables** (or the **Connect** tab).
   - Copy `RAILWAY_TCP_PROXY_DOMAIN` and `RAILWAY_TCP_PROXY_PORT`.
   - Update `DATABASE_URL` in `.env`:

   ```env
   DATABASE_URL=postgresql://postgres:ifzvheOXfKCvrpaTylaxcvoxpVsWBqsZ@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/railway
   ```

   > When deploying **on** Railway, use the internal `DATABASE_URL`
   > (`...@<RAILWAY_PRIVATE_DOMAIN>:5432/railway`) and set `DB_SSL=false`.

3. Run in watch mode:

```bash
npm run start:dev
```

- API base URL: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/docs`

## Environment variables

| Variable          | Description                                                        | Default |
| ----------------- | ------------------------------------------------------------------ | ------- |
| `PORT`            | HTTP port                                                          | `3000`  |
| `DATABASE_URL`    | Postgres connection string                                         | -       |
| `DB_SYNCHRONIZE`  | Auto-create tables from entities (dev only, **off in prod**)       | `true`  |
| `DB_LOGGING`      | Log SQL queries                                                    | `false` |
| `DB_SSL`          | Require SSL (use `true` for Railway public endpoint)               | `true`  |

## Project structure

```
src/
  main.ts                 # bootstrap, global pipes, Swagger, CORS
  app.module.ts           # root module (config + TypeORM + feature modules)
  app.controller.ts       # GET /api  -> service info
  app.service.ts
  config/
    database.config.ts    # builds TypeORM options from env
  health/                 # GET /api/health -> app + DB status
  users/                  # sample CRUD resource (use as a template)
    entities/user.entity.ts
    dto/
    users.controller.ts
    users.service.ts
    users.module.ts
```

## Sample API (users)

| Method | Endpoint         | Description     |
| ------ | ---------------- | --------------- |
| POST   | `/api/users`     | Create a user   |
| GET    | `/api/users`     | List users      |
| GET    | `/api/users/:id` | Get one user    |
| PATCH  | `/api/users/:id` | Update a user   |
| DELETE | `/api/users/:id` | Delete a user   |

Example:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
```

## Adding a new API (resource)

Fastest way is the Nest CLI:

```bash
npx nest g resource <name>
```

Or copy the `src/users` folder as a template:

1. Create an entity in `entities/` (decorate with `@Entity`).
2. Create DTOs in `dto/` with `class-validator` decorators.
3. Implement the service (inject the repository via `@InjectRepository`).
4. Implement the controller (HTTP routes).
5. Register the module with `TypeOrmModule.forFeature([YourEntity])` and import it in `app.module.ts`.

Entities are auto-loaded (`autoLoadEntities: true`), so once the module is imported the table is picked up.

## Scripts

| Script              | Description                  |
| ------------------- | ---------------------------- |
| `npm run start:dev` | Watch mode                   |
| `npm run build`     | Compile to `dist/`           |
| `npm run start:prod`| Run compiled build           |
| `npm run lint`      | Lint + autofix               |
| `npm run format`    | Prettier format              |

## Production note

Set `DB_SYNCHRONIZE=false` in production and use TypeORM migrations instead of schema sync.
