# FlowForge

A developer-first, self-hostable workflow automation platform — visually build, test, deploy, and monitor multi-step automations. Inspired by n8n but with full execution transparency, git-native versioning, typed variables, and sandboxed code nodes.

**Current status:** Milestone 0 (Foundation) in progress — see `PROJECT_STATUS.md` for what's built, what's next, and confirmed MVP scope.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (defaults to port 8080 via `PORT` env var)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env (once the credential store ships, Phase 1.7): `ENCRYPTION_KEY` — 32 hex bytes, AES-256 credential encryption key
- `JWT_SECRET`, `JWT_REFRESH_SECRET` are NOT needed for the MVP — they belong to the deferred Milestone 4 (Authentication & Multi-Tenancy). The MVP has no login.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Queue: BullMQ + Redis 7
- Real-time: Socket.io
- Canvas: React Flow
- Logging: Pino

## Architecture Documents

All design documents live in `docs/`:

| File | Contents |
|---|---|
| `docs/01-architecture.md` | Full system architecture, product vision, scaling strategy, security |
| `docs/02-database-schema.md` | All 16 Postgres tables with columns, indexes, relationships |
| `docs/03-api-specification.md` | Complete REST API + WebSocket spec for all resources |
| `docs/04-folder-structure.md` | Production monorepo layout (`apps/`, `packages/`, `infra/`) |
| `docs/05-development-roadmap.md` | 5-milestone roadmap (Foundation → Enterprise) |
| `docs/06-implementation-phases.md` | 20+ phases with goals, files, acceptance criteria, complexity |
| `docs/07-workflow-engine.md` | Execution engine deep dive: DAG, branches, loops, retry, sandbox |

## Where Things Live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema (source of truth for DB tables)
- `artifacts/api-server/src/` — Express API server

## Architecture Decisions

See `docs/01-architecture.md` for full detail. Key non-obvious choices:
- Separate worker process for execution (not in-process) — enables horizontal scaling and crash isolation
- AES-256-GCM credential encryption in Postgres (not a secrets manager) — enables self-hosted deployments without external dependencies
- BullMQ over native pg queues — reliable delayed jobs, retries, dead-letter queue, and priority out of the box
- `isolated-vm` for Code nodes — V8 isolate, no process access, hard memory/CPU limits

## Product

FlowForge lets teams visually build multi-step workflow automations:

- **Canvas editor** — drag-and-drop React Flow graph with live execution overlay
- **Execution engine** — DAG execution with branches, loops, parallel nodes, retry, timeout
- **Core nodes** — Webhook trigger, Schedule trigger, HTTP Request, Code (JS sandbox), Condition, Loop, Set Variable, Log
- **Credential store** — encrypted-at-rest secrets, injected into nodes at runtime
- **Real-time logs** — node-level execution trace with input/output inspector
- **Versioning** — every workflow save creates a named version; old versions are restorable

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml` before touching any frontend code
- Credential data is never returned by any API endpoint — only name and type
- Worker and API share queue definitions via `lib/` packages — keep them in sync
- Execution timeout fires at the execution level (5 min default), not just per-node (30 s default)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/07-workflow-engine.md` for the full execution engine design before implementing the worker
- See `PROJECT_STATUS.md` for current build status, confirmed MVP scope, and the next phase to implement
