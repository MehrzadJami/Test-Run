# Runtime Audit (Mock-Mode Reliability)

Date: 2026-05-03 (UTC)  
Target: app should remain functional without paid keys (`OPENAI_API_KEY`, `GEMINI_API_KEY` unset), with Mock mode as safe fallback.

## Commands run
1. `pnpm install`
2. `pnpm -r typecheck`
3. `pnpm -r test`
4. `pnpm -r build`
5. `docker compose up -d postgres`
6. `pnpm -r build` (rerun after patches)

---

## What passed
- ✅ `pnpm install`
- ✅ `pnpm -r build` **after patches**
  - `artifacts/mockup-sandbox` build passes
  - `artifacts/api-server` build passes
  - `artifacts/chem-ai` build passes

---

## What failed

### 1) `pnpm -r typecheck` failed
Primary causes:
- Workspace declaration output dependencies not built (`TS6305` from `api-server` importing `lib/*/dist` declarations).
- Pre-existing strict typing issues in API routes/components (implicit `any`, `User.id` typing mismatches).

### 2) `pnpm -r test` failed
Primary cause:
- API route tests require DB wiring and fail early when `DATABASE_URL` is missing.

### 3) Docker step failed
- `docker: command not found` in this runtime, so local Postgres could not be started here.

---

## What was fixed in this audit

### Fix A — local build compatibility in mockup-sandbox
**File:** `artifacts/mockup-sandbox/vite.config.ts`
- `PORT` now defaults to `5173` when absent.
- `BASE_PATH` now defaults to `/` when absent.

**Root cause:** config required Replit-only env vars even for local build contexts.

### Fix B — local build compatibility in chem-ai frontend
**File:** `artifacts/chem-ai/vite.config.ts`
- `BASE_PATH` now defaults to `/` when absent.

**Root cause:** frontend build hard-failed outside Replit due to strict env requirement.

### Fix C — syntax/runtime build blocker in model-card detail
**File:** `artifacts/chem-ai/src/pages/model-card-detail.tsx`
- Removed duplicated `projectId` parameter in `setAndPersistReview(...)` signature.

**Root cause:** duplicate parameter name caused ESBuild transform failure.

---

## Remaining known issues
1. Full monorepo typecheck remains red due to pre-existing workspace declaration and strict typing issues.
2. Full monorepo tests remain red until `DATABASE_URL` is configured and Postgres is running.
3. End-to-end flow verification (landing/dashboard/demo extraction/simulation/download flows) cannot be completed in this runtime without DB + running services.

---

## Exact commands to run locally (recommended)

### 1) Start Postgres
```bash
docker compose up -d
```

### 2) Configure environment
```bash
cp .env.example .env
# set DATABASE_URL (example)
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
```

### 3) DB setup
```bash
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/db run seed
```

### 4) Start backend + frontend
```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/chem-ai run dev
```

### 5) Runtime checks
```bash
curl http://localhost:80/api/healthz
curl http://localhost:80/api/projects
```
Then verify in browser:
1. Landing page loads
2. Dashboard loads
3. Seeded demo appears
4. View Demo Model opens model card
5. Model card tabs load
6. New Extraction works with provider = `mock` and no paid keys
7. PDF upload tab does not crash
8. Simulation runs
9. Download Package works
10. ODE template download works
11. Notebook export works (if enabled)

---

## Mock-mode reliability note
- Current provider chain still supports `mock` fallback when paid keys are absent.
- For local/no-cost operation, explicitly choose `Mock` (or `Auto` with no configured paid keys).
