# Local Setup

This project supports **two development modes**:

1. **Local mode (recommended outside Replit)**
2. **Replit mode**

---

## Local mode

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### Exact setup commands

```bash
git clone https://github.com/MehrzadJami/Test-Run.git
cd Test-Run
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:push
pnpm db:seed
pnpm dev
```

### What starts in local mode
- Postgres via `docker-compose.yml` on `localhost:5432`
- API server on `http://localhost:8080`
- Frontend on `http://localhost:5173`

The frontend uses a Vite `/api` proxy to `http://localhost:8080` (configurable with `VITE_API_PROXY_TARGET` in `.env`).

### Optional DB command
Use migrations instead of schema push:

```bash
pnpm db:migrate
```

---

## Replit mode

Use this when running inside Replit’s managed environment.

- Replit injects runtime env values (for example `PORT`, `BASE_PATH`, and Replit auth variables).
- Replit routes traffic through its own preview/proxy.
- You usually do **not** need Docker Compose in Replit mode.

Run services using Replit workflows (or equivalent package commands).

---

## Common workspace commands

```bash
pnpm dev
pnpm test
pnpm build
pnpm db:push
pnpm db:migrate
pnpm db:seed
```

---

## Troubleshooting

### 1) `DATABASE_URL` missing
- Ensure `.env` exists and includes `DATABASE_URL`.
- Re-run: `cp .env.example .env`.

### 2) Port already in use
- API default is `8080`, frontend default is `5173`.
- Change `PORT` for one service, or free the occupied port.

### 3) Postgres not running
- Check containers: `docker compose ps`.
- Start DB: `docker compose up -d`.
- Inspect logs: `docker compose logs postgres`.

### 4) API health check fails
- Verify API is running and reachable:
  - `curl http://localhost:8080/api/healthz`
- If schema is missing, run `pnpm db:push` and `pnpm db:seed`.

### 5) Frontend cannot reach API
- Confirm API is healthy at `http://localhost:8080/api/healthz`.
- Confirm `VITE_API_PROXY_TARGET` in `.env` points to your API URL.
- Restart frontend after env changes.
