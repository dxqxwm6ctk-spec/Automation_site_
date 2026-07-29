# FlowForge — Full Architecture Document

## Product Vision

### Core Purpose
FlowForge is a developer-first, self-hostable workflow automation platform that lets teams visually build, test, deploy, and monitor multi-step automations. Unlike point-and-click tools, FlowForge exposes the underlying execution graph, variable state, and run logs directly in the UI, making it a trustworthy backbone for production workloads.

### Target Users
| Segment | Need |
|---|---|
| Software engineers | Code-native nodes, version-controlled workflows, CI/CD hooks |
| DevOps / SRE teams | Event-driven pipelines, alerting, incident runbooks |
| Product / growth teams | No-code triggers (webhooks, schedules, Slack), low-code branching |
| Enterprises | SSO, RBAC, audit logs, on-prem deployment |

### Key Differentiators from n8n
1. **Execution transparency** — every node's input/output is stored and diffable; full trace UI included
2. **Git-native versioning** — workflows are serialised to JSON and can be committed, PR-reviewed, and rolled back via the UI
3. **Typed variables** — workflow variables carry schema definitions; the canvas validates connections at design time
4. **Sandboxed code nodes** — user-supplied JavaScript/Python runs in V8 isolates or gVisor containers, not on the main process
5. **First-class team workspaces** — projects, environments (dev/staging/prod), and permission scopes per environment
6. **OpenAPI-generated SDK** — every node type is also an API-callable service; third parties can invoke individual nodes programmatically

### MVP Scope
- Visual canvas with drag-and-drop node editing
- Core trigger nodes: Webhook, Schedule (cron), Manual
- Core action nodes: HTTP Request, Code (JS), Condition/Branch, Loop, Set Variable, Log
- Credential store with AES-256 encryption
- Execution history with per-node logs
- Single-user local deployment with optional multi-user mode
- REST API for headless workflow management

### Future Roadmap
| Phase | Theme | Examples |
|---|---|---|
| v1.1 | Integrations Library | Slack, GitHub, Stripe, Postgres, S3, OpenAI |
| v1.2 | Teams & Orgs | workspaces, RBAC, SSO/SAML |
| v1.3 | Marketplace | community nodes, paid node packs |
| v2.0 | Enterprise | on-prem K8s operator, audit logs, compliance exports |
| v2.1 | AI Orchestration | LLM chain nodes, vector store connectors, agent loops |
| v3.0 | Multi-region | geo-distributed execution, data residency controls |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            Client Layer                                     │
│   React + Vite SPA     Canvas (React Flow)     REST/WebSocket API client    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  HTTPS / WSS
┌───────────────────────────────▼────────────────────────────────────────────┐
│                         API Gateway / Edge                                  │
│           Nginx (TLS termination, rate-limit headers, routing)              │
└────────┬──────────────────────┬─────────────────────────────────────────────┘
         │                      │
┌────────▼──────────┐  ┌────────▼────────────┐
│   REST API Server │  │  WebSocket Server    │
│   Express 5       │  │  (execution events)  │
│   + Zod validate  │  │  Socket.io           │
└────────┬──────────┘  └────────┬────────────┘
         │                      │
┌────────▼──────────────────────▼────────────────────────────────────────────┐
│                         Core Services                                        │
│  WorkflowService  ExecutionService  CredentialService  SchedulerService     │
│  WebhookService   NodeRegistryService  AuditService    NotificationService  │
└────────┬──────────────────────────────────────────────────────────────────-─┘
         │
┌────────▼──────────────────────────────────────────────────────────────────┐
│                   Execution Engine (Separate Process)                       │
│   ExecutionGraph   NodeRunner   RetryManager   VariableStore               │
│   BranchResolver   LoopController   TimeoutWatcher   SandboxRunner         │
└────────┬──────────────────────────────────────────────────────────────────┘
         │ BullMQ (Redis)
┌────────▼──────────────────────────────────────────────────────────────────┐
│                      Worker Pool (N workers, horizontal scale)              │
│   Worker process per CPU core  ·  Graceful shutdown  ·  Health endpoint    │
└────────┬──────────────────────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────────────────────┐
│                      Data Layer                                             │
│   PostgreSQL (primary)   Redis (queues + pub/sub + cache)                  │
│   S3-compatible store (execution artefacts, large payloads)                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

**Framework:** React 18 + Vite + TypeScript  
**State management:** Zustand (canvas state, execution state), React Query (server state)  
**Canvas:** React Flow (node graph), with custom node types and edge styles  
**Styling:** Tailwind CSS + shadcn/ui component library  
**Real-time:** Socket.io client — subscribes to execution events per workflow run

Key modules:
- `canvas/` — React Flow wrapper, custom nodes, edge routing, mini-map
- `execution/` — run panel, per-node log viewer, variable inspector
- `credentials/` — encrypted form, masked display
- `settings/` — workspace config, team management, API keys

### Backend Architecture

**Runtime:** Node.js 22 LTS (ESM)  
**Framework:** Express 5 with async error propagation  
**Validation:** Zod v4 at every request/response boundary  
**ORM:** Drizzle ORM (type-safe, thin abstraction over pg)  
**Auth:** JWT (access + refresh tokens) + optional OIDC/SAML

Service responsibilities:
- `WorkflowService` — CRUD, versioning, activation/deactivation
- `ExecutionService` — enqueue, status updates, log streaming
- `CredentialService` — encrypt/decrypt, scope checks, audit
- `SchedulerService` — cron expression parsing, next-run calculation, missed-run recovery
- `WebhookService` — URL generation, HMAC verification, routing to workflow
- `NodeRegistryService` — load built-in + custom node descriptors, validate manifests

### Workflow Execution Engine

See **Workflow Engine** section below for full detail.

Execution happens inside a separate `execution-engine` process (or worker). The API server enqueues a job onto a BullMQ queue (`executions`). Workers pull the job, reconstruct the execution graph, and run nodes sequentially or in parallel depending on the DAG topology. State is persisted incrementally to Postgres and published in real-time via Redis pub/sub.

### API Design

REST API with OpenAPI 3.1 spec as source of truth. All endpoints versioned under `/api/v1/`.

Key resource groups:
- `POST /api/v1/auth/*` — login, refresh, OIDC callback
- `GET|POST|PUT|DELETE /api/v1/workflows` — workflow CRUD
- `GET|POST /api/v1/workflows/:id/executions` — trigger + list runs
- `GET /api/v1/executions/:id` — execution detail + logs
- `POST /api/v1/webhooks/:token` — public webhook entry point
- `GET|POST|DELETE /api/v1/credentials` — credential management
- `GET /api/v1/nodes` — available node types
- `GET /api/v1/ws/executions/:id` — WebSocket upgrade for live events

### Database Architecture

PostgreSQL 16 with Drizzle ORM. Schema described in detail in `02-database-schema.md`.

Connection pooling: PgBouncer in transaction mode for API server, direct connections for workers (to support LISTEN/NOTIFY).

### Worker Architecture

Workers are Node.js processes that consume BullMQ jobs from Redis queues.

- **Queue:** `executions` — main workflow execution jobs
- **Queue:** `node-jobs` — individual node tasks (for distributed node execution at scale)
- **Queue:** `schedules` — timer-fired workflow triggers

Each worker:
1. Claims job, sets `execution.status = running`
2. Deserialises workflow graph
3. Finds start nodes (no incoming edges)
4. Executes nodes in topological order
5. Writes per-node `execution_logs` records
6. Publishes events to Redis channel `exec:{executionId}`
7. Marks job complete; updates `execution.status`

### Queue System

**Technology:** BullMQ + Redis 7  

Queues:
| Queue | Concurrency | Priority | Notes |
|---|---|---|---|
| `executions` | 10 per worker | standard | main workflow runs |
| `node-jobs` | 50 per worker | standard | distributed node fan-out |
| `schedules` | 5 per worker | low | cron-triggered jobs |
| `webhooks` | 20 per worker | high | sub-100ms response required |

Dead-letter queue: failed jobs after max retries move to `executions:failed` for manual inspection.

### Scheduling System

A `SchedulerService` runs on a single elected node (via Redis distributed lock with `redlock`). On startup it:
1. Queries all `schedules` with `is_active = true`
2. For each, computes `next_run_at` from cron expression using `cron-parser`
3. Schedules a BullMQ delayed job at `next_run_at`
4. After job fires, immediately schedules the *next* occurrence

Missed runs (server was down): on startup, any schedule with `next_run_at` in the past triggers a catch-up run (configurable: skip or run once).

### Webhook System

1. On workflow creation, a webhook node generates a unique token: `wh_{uuid}`.
2. The public URL is `POST /api/v1/webhooks/{token}`.
3. The endpoint is unauthenticated but supports optional HMAC-SHA256 signature verification.
4. On receipt: validate, enqueue to `webhooks` queue with high priority, return `202 Accepted` immediately (response body optionally configured to wait for workflow output — "synchronous webhook mode").
5. Request body, headers, and query params are injected as the first node's output payload.

### Authentication

- **JWT access tokens** (15 min TTL) + **refresh tokens** (30-day, stored server-side in `refresh_tokens` table for revocation)
- **API keys** — long-lived tokens stored as `sha256(key)`, scoped to resource types
- **OIDC** — optional, pluggable provider (Google, Okta, Auth0)
- **SAML 2.0** — enterprise tier, via `passport-saml`

### Authorization

Role-Based Access Control (RBAC) at workspace level:

| Role | Permissions |
|---|---|
| Owner | All permissions including billing, delete workspace |
| Admin | Manage members, workflows, credentials, executions |
| Editor | Create/edit workflows; cannot manage members or credentials |
| Viewer | Read-only access to workflows and execution history |

Resource-level overrides: individual workflows can be locked to "owner-only edit".

### File Storage

Large execution payloads (>100 KB) are offloaded from Postgres to an S3-compatible store (AWS S3, MinIO for self-hosted). A `storage_refs` table maps execution log entries to S3 keys. The execution engine transparently reads/writes through the `StorageService`.

### Real-time Updates

1. API server subscribes to Redis pub/sub channel `exec:{id}` per active client.
2. Execution engine publishes events: `node.start`, `node.complete`, `node.error`, `execution.complete`.
3. API server pushes events to the connected Socket.io room `exec:{id}`.
4. Client canvas updates node status badges and log pane in real time.

### Logging

**Application logging:** Pino (structured JSON, piped to stdout for log aggregators)  
**Execution logging:** per-node records in `execution_logs` Postgres table  
**Audit logging:** `audit_logs` table, append-only, captures actor, action, target, diff, IP

Log levels: `debug`, `info`, `warn`, `error`. Production default: `info`.

### Monitoring

- `/api/v1/health` — liveness probe (express + DB ping)
- `/api/v1/ready` — readiness probe (DB + Redis reachable)
- `/metrics` — Prometheus metrics endpoint (via `prom-client`)
  - `execution_duration_ms` histogram
  - `executions_total` counter by status
  - `node_duration_ms` histogram by node type
  - `queue_depth` gauge per queue
- Optional Grafana dashboard JSON provided in `infra/grafana/`

### Error Handling

All errors extend a base `AppError` class with `code`, `statusCode`, `context`. Express global error handler serialises to RFC 7807 Problem JSON. Unhandled rejections and uncaught exceptions are caught, logged, and trigger graceful shutdown with a non-zero exit code. Workers isolate node execution in a try/catch per node; a node failure does not crash the worker process.

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend framework | React 18 + Vite | Best ecosystem for complex SPAs; fast HMR |
| Canvas | React Flow | Purpose-built DAG editor; extensible custom nodes |
| Frontend state | Zustand + React Query | Zustand for local canvas state; RQ for server state |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent UI with full control |
| API framework | Express 5 | Mature, minimal, excellent middleware ecosystem |
| Runtime | Node.js 22 LTS | Stable LTS; native ESM; best-in-class async I/O |
| Language | TypeScript 5.9 | End-to-end type safety; codegen from OpenAPI |
| ORM | Drizzle ORM | Type-safe, zero-overhead, Postgres-native |
| Database | PostgreSQL 16 | ACID, JSONB for flexible payloads, mature ecosystem |
| Queue | BullMQ + Redis 7 | Reliable job queues with delayed jobs, priority, retries |
| Auth | JWT + OIDC | Stateless access tokens; pluggable enterprise SSO |
| Code sandbox | vm2 / isolated-vm | V8 isolate per code node; no process access |
| Real-time | Socket.io | Rooms, namespaces; falls back to polling |
| Logging | Pino | 5x faster than Winston; structured JSON output |
| Metrics | prom-client | Standard Prometheus scraping |
| Scheduling | BullMQ delayed jobs + cron-parser | Precise scheduling; survives restarts |
| Object storage | AWS S3 / MinIO SDK | Drop-in self-hosted or cloud |
| Deployment | Docker Compose (dev) · K8s Helm (prod) | Easy local start; production scalability |

---

## Security Design

### Secrets Encryption
- Credentials stored as AES-256-GCM ciphertext in Postgres
- Encryption key derived from `ENCRYPTION_KEY` env var via PBKDF2
- Key never logged, never returned in API responses; fields masked as `"***"`
- Key rotation: re-encrypt all credential records with `scripts/rotate-key.ts`

### API Security
- HTTPS enforced at Nginx layer; HSTS header set
- CORS: strict allowlist of origins
- All endpoints require valid JWT except webhook entry points and health checks
- Request size limit: 10 MB (configurable)

### Rate Limiting
- IP-based: 100 req/min for anonymous, 1000 req/min for authenticated (Redis sliding window)
- Per-API-key: configurable per key record
- Webhook endpoints: 500 req/min per token

### Sandboxed Code Execution
- Code node uses `isolated-vm` — V8 context with no Node built-ins
- Memory limit: 128 MB per execution; CPU timeout: 10 s
- No `require`/`import` of external modules; only a curated stdlib injected (`fetch`, `JSON`, `crypto`)
- Worker process itself runs as non-root with seccomp profile in production Docker

### RBAC
- Described in Authorization section above
- Middleware `requireRole(role)` checked per route
- Database queries always scoped to `workspace_id` of the authenticated user

### Audit Logs
- Append-only table; no `UPDATE` or `DELETE` permitted at application level
- Records: actor user ID, IP, action verb, resource type + ID, before/after JSON diff, timestamp
- Exported to SIEM via webhook or S3 dump

### Validation & Input Sanitization
- Zod schemas at every API boundary — never trust raw `req.body`
- Workflow JSON validated against JSON Schema before storage
- Node inputs validated against node manifest's `inputSchema` before execution
- All user-supplied strings rendered in UI via React (XSS-safe by default)
- SQL injection impossible via Drizzle ORM parameterised queries

---

## Scaling Strategy

### 10 Users
- Single Docker Compose stack: 1× API server, 1× worker, 1× Postgres, 1× Redis
- Total RAM: ~1 GB

### 100 Users
- Same stack, scale worker to 2× containers
- Add PgBouncer for connection pooling
- Enable Redis persistence (AOF)

### 10,000 Users
- Kubernetes cluster: 3× API server pods, 10× worker pods, RDS Postgres (multi-AZ), ElastiCache Redis cluster
- Separate read replicas for execution history queries
- CDN for static frontend assets
- Horizontal pod autoscaler on queue depth metric

### 1 Million Workflow Executions / day (~12/sec average, ~100/sec peak)
- Workers: 20+ pods, queue concurrency tuned per node type
- Postgres: partition `executions` and `execution_logs` tables by `created_at` (monthly)
- Archive old execution data to S3 via `scripts/archive-executions.ts`
- Redis: dedicated cluster for each queue group
- Node execution fan-out: split large workflows into parallel `node-jobs` sub-queues
- Observability: Datadog / Grafana Cloud for APM and queue depth dashboards
