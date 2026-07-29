# FlowForge — Development Roadmap

## Overview

The roadmap is divided into five major milestones. Each milestone is independently shippable and progressively unlocks more value. The versioning follows semantic milestones, not calendar sprints.

---

## Milestone 0 — Foundation (Internal / Pre-release)

**Goal:** Runnable, tested monorepo with all shared infrastructure in place. Zero user-facing features. Engineers can run the full stack locally with one command.

### Deliverables
- pnpm monorepo with `apps/api`, `apps/worker`, `apps/web`, `packages/db`, `packages/api-spec`, `packages/node-sdk`
- Drizzle schema for all core tables; `pnpm db:push` working
- OpenAPI spec with all v1 endpoints defined; codegen producing React Query hooks
- Express API server skeleton — routing, auth middleware, Zod validation, error handler, Pino logger
- BullMQ + Redis queue wiring; worker process consuming `executions` queue
- Docker Compose bringing up: api, worker, web, postgres, redis
- CI pipeline: lint + typecheck + unit tests on every PR
- `.env.example` with all required variables documented

**Acceptance:** `docker compose up` → all services healthy; `GET /api/v1/health` → `200`

---

## Milestone 1 — MVP (v1.0)

**Goal:** A single user can sign up, build a workflow on the visual canvas, trigger it manually or via webhook, and see the execution result. No teams, no scheduling.

### Deliverables

#### Auth
- Register, login, refresh token, logout
- JWT middleware on all protected routes
- Password hashing with Argon2

#### Workspaces
- Auto-create personal workspace on registration
- Workspace CRUD; member invite (owner only for now)

#### Workflow Editor (Canvas)
- React Flow canvas with drag-and-drop
- Node palette (search + category sidebar)
- Custom node components: Trigger, Action, Condition, Loop
- Edge routing with conditional labels
- Node config panel (right sidebar, per-node form)
- Undo/redo (up to 50 steps)
- Keyboard shortcuts: Cmd+Z, Cmd+Shift+Z, Del, Cmd+A, Cmd+C, Cmd+V, Space+drag to pan, scroll to zoom
- Auto-layout button (Dagre)
- Mini-map
- Save workflow (creates new version)

#### Core Nodes (MVP set)
- `trigger.manual` — manual trigger with optional JSON input
- `trigger.webhook` — generates public URL; HMAC optional
- `action.http` — GET/POST/PUT/DELETE, headers, body, auth
- `action.code` — JS in isolated-vm; `$input`, `$env` available
- `logic.condition` — if/else branching on expression
- `logic.set-variable` — write to execution variable store
- `core.log` — emit a message to execution logs

#### Execution Engine
- Topological execution of DAG
- Per-node log records in `execution_logs`
- Branch evaluation (condition node)
- Error capture per node; execution marks `error` on first failure
- Manual trigger via API + UI "Run" button

#### Webhooks
- Generate webhook URL on demand
- Receive `POST`, validate, enqueue
- Immediate response mode

#### Execution Viewer
- Execution list per workflow
- Execution detail: timeline of nodes with status badges, input/output collapsible
- Real-time updates: Socket.io pushes node status as it runs

#### Credential Store
- Create/delete credentials (api_key, basic, bearer types)
- AES-256-GCM encryption at rest
- Credential selector in node config panel

**Acceptance criteria:**
- User can build a 5-node workflow (webhook → HTTP → condition → log × 2) in under 10 minutes
- Execution completes and all node logs are visible
- Credential used in HTTP node is never returned in any API response

---

## Milestone 2 — Scheduling & Variables (v1.1)

**Goal:** Unattended automations — workflows run on a schedule without human interaction. Team shared variables reduce secret duplication.

### Deliverables
- Schedule CRUD with cron expression validation and timezone support
- Scheduler service with `redlock` leader election
- Missed-run recovery (skip or run-once policy)
- Next-run preview in UI ("next 5 runs" computed client-side from cron-parser)
- Workspace-level and workflow-level variables (plaintext + secret)
- `$vars` object injected into every node's execution context
- Schedule trigger node on canvas
- Execution source tag in execution list (manual / webhook / schedule)
- Retry node: configurable retry count + delay on action nodes

**Acceptance criteria:**
- Schedule a workflow to run every minute; observe 3 executions within 3 minutes
- Secret variable used in Code node; value does not appear in execution logs

---

## Milestone 3 — Teams & RBAC (v1.2)

**Goal:** Multiple engineers share a workspace. Access is controlled. Actions are auditable.

### Deliverables
- Team CRUD + team membership
- Workspace roles: owner, admin, editor, viewer enforced on every route
- Permission overrides per workflow (lock workflow to owner-only edit)
- API keys: create, list, revoke; scope enforcement in middleware
- Audit log: all write actions recorded; admin UI to browse + filter
- Workspace settings page: name, plan, OIDC config (Google, Okta)
- OIDC login flow (Google as default provider)
- Member invite flow: email invitation link → register or link existing account

**Acceptance criteria:**
- Viewer cannot save workflow changes; editor cannot manage credentials; admin cannot delete workspace
- API key scoped to `execution:write` cannot list credentials
- Audit log shows actor, action, before/after for credential update

---

## Milestone 4 — Integration Nodes (v1.3)

**Goal:** Users can connect to real external services without writing code. Node library grows from 7 to 40+ nodes.

### Deliverables
- Node SDK package published (`@flowforge/node-sdk`)
- Node manifest schema documented and validated
- Integration nodes: Slack, GitHub, Stripe, Postgres, MySQL, S3, SendGrid, OpenAI, Google Sheets, Jira, Linear, Notion, Twilio, Discord, PagerDuty, Datadog
- OAuth2 credential type with token refresh
- Node test button in canvas panel ("Test this node with sample data")
- Node versioning: nodes carry `version` field; old executions reference pinned version
- Custom node upload (zip package following SDK spec)
- Node search improvements: fuzzy search, "recently used" section

**Acceptance criteria:**
- User can build a workflow that posts a Slack message triggered by a GitHub push webhook in under 5 minutes
- OAuth2 credential auto-refreshes token without user intervention
- Custom node zip uploads, appears in palette, executes successfully

---

## Milestone 5 — Enterprise & Scale (v2.0)

**Goal:** FlowForge can be deployed by an enterprise IT team, governed, and audited. System handles 1M+ executions/day.

### Deliverables

#### Enterprise
- SAML 2.0 SSO (`passport-saml`)
- SCIM 2.0 provisioning endpoint (user sync from Okta/Azure AD)
- Data residency: configurable storage region per workspace
- Compliance export: audit log download as JSONL or CSV
- SLA mode: priority execution queue for pro/enterprise workspaces

#### Scaling Infrastructure
- Execution + execution_logs table partitioned by month
- Archive worker: detaches old partitions, dumps to S3, drops from Postgres
- Prometheus metrics + Grafana dashboard shipped in Helm chart
- HPA for workers based on BullMQ queue depth custom metric
- PgBouncer sidecar in K8s deployments
- Redis Cluster support
- Execution payload offloading to S3 for payloads >100 KB

#### Developer Experience
- Workflow import/export as JSON
- Git sync: push/pull workflow JSON to/from a GitHub repo
- CLI tool (`flowforge` npm binary): login, deploy workflow, trigger, tail logs
- Local execution mode: run workflow from CLI without server (for CI testing)
- Workflow testing framework: `flowforge test my-workflow.json --mock http_1`

**Acceptance criteria:**
- Single K8s cluster handles 10,000 concurrent users without degradation
- 1M executions/day stress test: p99 queue wait time < 5 s
- SAML login works with Okta dev account
- Audit log export produces valid JSONL for 90-day range

---

## Post v2.0 — Vision Items

| Item | Description |
|---|---|
| AI Agent nodes | LLM chain nodes (OpenAI, Anthropic, Gemini), memory, tool calling |
| Marketplace | Community-built nodes, paid node packs, revenue share |
| Workflow templates | One-click template gallery |
| Sub-workflows | Reusable workflow fragments called from parent workflows |
| Visual testing | Record a test run; replay it as regression test |
| Execution replay | Re-run a past execution with the same exact inputs |
| Multi-step approvals | Human-in-the-loop pause node awaiting manual approval |
| Mobile app | iOS/Android app for monitoring and manual triggers |
| Observability integration | Native Datadog, New Relic, Honeycomb trace export |
