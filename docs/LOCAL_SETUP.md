# Local Setup

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 20 | LTS recommended |
| pnpm | 9 | `npm install -g pnpm@9` |
| PostgreSQL | 14 | Local install **or** Docker (see below) |

---

## 1. Clone the repo

```bash
git clone https://github.com/MehrzadJami/Test-Run.git
cd Test-Run
```

---

## 2. Install dependencies

```bash
pnpm install
```

This installs all workspace packages: `@workspace/db`, `@workspace/api-spec`,
`@workspace/api-zod`, `@workspace/api-client-react`, `@workspace/api-server`,
`@workspace/chem-ai`, `@workspace/scripts`.

---

## 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. Minimum required:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/chemengai
SESSION_SECRET=change-me-to-a-long-random-secret
```

Generate a strong session secret:

```bash
openssl rand -hex 32
```

AI provider keys are optional. Leave them blank to run in **demo/mock mode** —
the app is fully functional without them.

**Never commit `.env` to version control.** It is already in `.gitignore`.

---

## 4. Start PostgreSQL

### Option A — Docker (recommended for local dev, no install required)

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on `localhost:5432` with the credentials
from the default `.env.example`. Stop it with `docker compose down`.

### Option B — Local PostgreSQL install

Create the database manually:

```bash
createdb chemengai
```

Or via `psql`:

```sql
CREATE DATABASE chemengai;
```

---

## 5. Apply the database schema

The project uses Drizzle ORM. Choose one of two approaches:

### Schema push (fast, for development)

Pushes the TypeScript schema directly to the database — no migration files needed.
Ideal for local dev and fresh databases.

```bash
pnpm --filter @workspace/db run push
```

### Migration-based (for production / tracking changes)

Generates SQL migration files in `lib/db/drizzle/`, then applies them.
Use this when you need a reproducible audit trail of schema changes.

```bash
# Generate migration files from the current schema
pnpm --filter @workspace/db run generate

# Apply pending migrations
pnpm --filter @workspace/db run migrate
```

After a schema change, always run `generate` then `migrate` (or `push` for dev).

---

## 6. Seed demo data

```bash
pnpm --filter @workspace/db run seed
```

This inserts the Andrews 1968 chemostat demo project (idempotent — safe to run
multiple times). The API server also seeds automatically on first boot, so this
step is optional if you plan to start the server immediately.

---

## 7. Run services

Open two terminal tabs.

**Tab 1 — API server** (serves `/api`, default port 8080)

```bash
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev
```

**Tab 2 — Frontend** (serves `/`, default port 5173)

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/chem-ai run dev
```

> **Note on ports:** Outside Replit, the two services run on separate ports and
> there is no shared reverse proxy. The frontend makes API calls to `/api/...`
> — for local dev you can either:
>
> a. Run a local nginx/caddy proxy that routes `/api` → port 8080 and `/` →
>    port 5173 (recommended for parity with production).
>
> b. Add a Vite proxy in `vite.config.ts` for local-only dev (see below).

### Optional: Vite proxy for local dev

Add to `artifacts/chem-ai/vite.config.ts` inside `server: { ... }` — **do not
commit this change**:

```ts
proxy: {
  "/api": "http://localhost:8080",
},
```

Then the frontend's API calls will be forwarded to the API server automatically.

---

## 8. Verify the setup

```bash
# API health (replace 8080 with your API port)
curl http://localhost:8080/api/healthz
# → {"status":"ok"}

# List projects (should include the seeded chemostat demo)
curl http://localhost:8080/api/projects
# → [{"id":1,"name":"Chemostat — microalgae bioreactor (Andrews 1968)",...}]

# Full data export
curl http://localhost:8080/api/export
# → {"exportedAt":"...","version":"1","projectCount":1,"data":[...]}
```

Open the frontend at `http://localhost:5173/` (or whatever port Vite reports).
The landing page should load and "Connected / Demo Mode" should appear in the
sidebar footer.

---

## Replit Setup

In Replit, the environment is configured automatically:

- `DATABASE_URL` is set when the PostgreSQL integration is added
- `SESSION_SECRET` is set as a Replit secret
- `PORT` and `BASE_PATH` are injected per-service by the workflow runner
- Both workflows (`API Server`, `web`) are registered in `.replit-artifact/`

To start the workflows:

```
Workflow: "artifacts/api-server: API Server"
Command:  pnpm --filter @workspace/api-server run dev

Workflow: "artifacts/chem-ai: web"
Command:  pnpm --filter @workspace/chem-ai run dev
```

Do not run `pnpm dev` at the workspace root — there is no root `dev` script by
design.

Access everything through `localhost:80` or the Replit preview pane — the
shared reverse proxy handles routing automatically.

---

## Data export and import

### Export all data to JSON

**Via the API** (server must be running):

```bash
curl http://localhost:8080/api/export -o my-backup.json
```

**Via the CLI script** (works without the server):

```bash
pnpm --filter @workspace/scripts run export-data
# → writes chemengai-export-<timestamp>.json

# Custom output path:
pnpm --filter @workspace/scripts run export-data -- --out /path/to/backup.json
```

### Import data into a fresh database

```bash
# Apply schema first
pnpm --filter @workspace/db run push

# Import from export file
pnpm --filter @workspace/scripts run import-data -- --in chemengai-export-<timestamp>.json
```

If the database already has data, add `--force` to import anyway (existing
projects with the same name are skipped).

---

## Drizzle Studio (visual DB browser)

```bash
pnpm --filter @workspace/db run studio
```

Opens the Drizzle web UI at `https://local.drizzle.studio/` — shows all tables
and lets you browse/edit rows.

---

## OpenAPI codegen

If you change the OpenAPI spec (`lib/api-spec/openapi.yaml`), regenerate the
client code:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This updates:
- `lib/api-zod/src/` — Zod request/response schemas
- `lib/api-client-react/src/` — TanStack Query hooks

Commit the generated files. Do not edit them manually.

---

## TypeScript

```bash
# Full workspace typecheck (libs then artifacts)
pnpm run typecheck

# Typecheck only the API server
pnpm --filter @workspace/api-server run typecheck

# Typecheck only the frontend
pnpm --filter @workspace/chem-ai run typecheck
```

---

## Automated tests

Tests use **Vitest** (unit + API integration). API tests hit the real database,
so `DATABASE_URL` must be set and the schema must be applied first.

```bash
# All tests (unit + API integration) — api-server
pnpm --filter @workspace/api-server run test

# Unit tests only (api-server extraction engine + mapping)
pnpm --filter @workspace/api-server run test:unit

# API route integration tests only
pnpm --filter @workspace/api-server run test:api

# All tests — chem-ai pure-logic libs
pnpm --filter @workspace/chem-ai run test

# Watch mode (re-runs on file save)
pnpm --filter @workspace/api-server run test:watch
pnpm --filter @workspace/chem-ai run test:watch
```

### What is tested

| Package | Test file | Coverage |
|---|---|---|
| `@workspace/api-server` | `src/lib/__tests__/extractor.test.ts` | MockProvider output, getActiveProvider fallback chain, JSON repair (fenced + prose-wrapped), mapExtractionToDb (roles, numeric parsing, ODE template) |
| `@workspace/api-server` | `src/routes/__tests__/api.test.ts` | GET /api/healthz, GET /api/projects, POST /api/projects, POST /api/projects/:id/sources, POST /api/projects/:id/extractions, GET /api/projects/:id/model-card, GET /api/projects/:id/export, GET /api/export, POST /api/pdf/parse |
| `@workspace/chem-ai` | `src/lib/__tests__/reproducibility.test.ts` | Return shape, empty inputs → score 0, well-populated inputs → higher score, missing_item severity, edge cases (null values, determinism) |
| `@workspace/chem-ai` | `src/lib/__tests__/unit-checker.test.ts` | Return shape, clean inputs → pass, missing units → warnings, mixed time scales, undefined symbols in equations, determinism |
| `@workspace/chem-ai` | `src/lib/__tests__/python-generator.test.ts` | scipy/numpy imports present, title embedded, parameters with values, TODO for null values, score embedding, determinism |
| `@workspace/chem-ai` | `src/lib/__tests__/package-generator.test.ts` | Exactly 14 files, all filenames correct, README/CSV/JSON content, simulate.py matches pythonCode, requirements.txt has numpy/scipy/matplotlib, CSV quoting, null raw → _note field, determinism |

### CI (GitHub Actions)

The `.github/workflows/ci.yml` workflow runs automatically on every push and
pull request to `main`. It:

1. Starts a PostgreSQL 16 service container
2. Installs dependencies (`pnpm install --frozen-lockfile`)
3. Applies the schema (`drizzle-kit push`)
4. Typechecks libs, api-server, and chem-ai
5. Runs chem-ai unit tests
6. Runs api-server unit + API integration tests
7. Builds the frontend (`vite build`)
8. Builds the API server (`esbuild`)

---

## Troubleshooting

**`ECONNREFUSED` when the frontend calls the API**
The API server is not running, or for local dev outside Replit you need a Vite
proxy (see step 7). Verify `curl http://localhost:8080/api/healthz` returns 200.

**`relation "projects" does not exist`**
The schema has not been applied. Run `pnpm --filter @workspace/db run push`.

**`DATABASE_URL must be set`**
The `.env` file is missing or not loaded. Check that `.env` exists and contains
`DATABASE_URL`. The `dotenv/config` import in `drizzle.config.ts` and
`lib/db/src/seed.ts` loads `.env` automatically.

**`pnpm: command not found`**
Install pnpm globally: `npm install -g pnpm@9`.

**Port collision**
Each service reads `PORT` from the environment. Do not hard-code port numbers
in Vite or Express config.

**Blank preview pane in Replit**
Check that the `chem-ai: web` workflow is running. Vite is configured with
`server.allowedHosts: true`. Hard-refresh the browser tab.
