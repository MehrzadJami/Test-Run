# Local Setup

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 20 | LTS recommended |
| pnpm | 9 | `npm install -g pnpm` |
| PostgreSQL | 14 | Local install or Docker |

---

## 1. Install dependencies

```bash
pnpm install
```

This installs all workspace packages — `@workspace/db`, `@workspace/api-spec`, `@workspace/api-zod`, `@workspace/api-client-react`, `@workspace/api-server`, `@workspace/chem-ai`.

---

## 2. Configure environment variables

Copy the example and fill in values:

```bash
cp .env.example .env
```

Minimum required:

```env
DATABASE_URL=postgresql://localhost:5432/chemengai
SESSION_SECRET=change-me-in-production
```

Optional (no AI providers are needed for the demo):

```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

Do not commit `.env` to version control.

---

## 3. Database setup

```bash
# Apply migrations (creates all tables)
pnpm --filter @workspace/db run migrate

# Seed the demo project (Andrews 1968 chemostat, projectId=1)
pnpm --filter @workspace/db run seed
```

To generate a new migration after schema changes:

```bash
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run migrate
```

To open Drizzle Studio (visual DB browser):

```bash
pnpm --filter @workspace/db run studio
```

---

## 4. Run services

Each service runs independently. Open two terminal tabs.

**Tab 1 — API server** (serves `/api`)

```bash
pnpm --filter @workspace/api-server run dev
```

The server starts on the port assigned by the `PORT` environment variable (default `8080`). Logs are Pino JSON, pretty-printed in development.

**Tab 2 — Frontend** (serves `/`)

```bash
pnpm --filter @workspace/chem-ai run dev
```

Vite starts on its own port. In Replit, both services are automatically routed through the shared proxy — you access everything through `localhost:80` or the preview pane URL.

---

## 5. Verify the setup

```bash
# API health
curl localhost:80/api/healthz
# → {"status":"ok"}

# List projects (should include seeded demo)
curl localhost:80/api/projects
# → [{"id":1,"name":"Chemostat — microalgae bioreactor (Andrews 1968)",...}]
```

Open the browser at `http://localhost:80/`. The landing page should load and "Connected / Demo Mode" should appear in the sidebar footer.

---

## Replit Setup

In Replit, the environment is configured automatically:

- `DATABASE_URL` is set when the PostgreSQL integration is added
- `SESSION_SECRET` is set as a Replit secret
- `PORT` is injected per-service by the workflow runner
- Both workflows (`API Server`, `web`) are registered in `.replit-artifact/`

To start the workflows:

```
Workflow: "artifacts/api-server: API Server"
Command:  pnpm --filter @workspace/api-server run dev

Workflow: "artifacts/chem-ai: web"
Command:  pnpm --filter @workspace/chem-ai run dev
```

Do not run `pnpm dev` at the workspace root — there is no root `dev` script by design.

---

## OpenAPI Codegen

If you change the OpenAPI spec (`lib/api-spec/openapi.yaml`), regenerate the client code:

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
pnpm --filter @workspace/api-server exec tsc --noEmit

# Typecheck only the frontend
pnpm --filter @workspace/chem-ai exec tsc --noEmit
```

Pre-existing type errors in `@workspace/api-client-react` barrel exports are known and do not affect the build.

---

## Troubleshooting

**`ECONNREFUSED` on API calls from the frontend**
The API server is not running or the proxy is not active. Start both workflow services and verify `curl localhost:80/api/healthz` returns 200.

**`relation "projects" does not exist`**
Migrations have not been applied. Run `pnpm --filter @workspace/db run migrate`.

**Blank preview pane in Replit**
Check the `chem-ai: web` workflow is running. Vite must have `server.allowedHosts: true` set (already configured). Hard-refresh the browser tab.

**`pnpm: command not found`**
Install pnpm globally: `npm install -g pnpm@9`.

**Port collision**
Each artifact must read `PORT` from the environment. Do not hard-code port numbers in Vite or Express config.
