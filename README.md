# App Builder

Monorepo (npm workspaces):

- `backend/` – Express + Drizzle ORM + PostgreSQL (JavaScript, ESM)
  - `src/services/api` – HTTP API
  - `src/services/worker` – background job worker (pg-boss queue, backed by Postgres)
  - `src/shared` – config, logger, db, queue shared by services
- `frontend/` – Vite + React + Tailwind CSS v4

Each backend service is a separate entrypoint/process, so you can scale them independently
(e.g. `docker compose --profile full up --scale worker=3`). Add a new service by creating
`src/services/<name>/index.js`.

## Getting started

```bash
cp .env.example .env
npm install
npm run db:up          # start Postgres
npm run db:generate    # generate SQL migration from schema
npm run db:migrate     # apply it
npm run dev            # api :4000, worker, web :5173
```

## Adding a background job
1. Add a queue name in `backend/src/shared/queue.js`.
2. Write a handler in `backend/src/services/worker/jobs/`.
3. Register it in `backend/src/services/worker/index.js`.
4. Enqueue with `boss.send(QUEUE, payload)` from the API.
