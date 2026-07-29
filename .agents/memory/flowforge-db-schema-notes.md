---
name: FlowForge DB schema notes
description: Lessons from implementing/verifying the FlowForge Drizzle schema against docs/02-database-schema.md — status-doc drift and a Drizzle CHECK-constraint gotcha.
---

## PROJECT_STATUS.md can drift from actual code
PROJECT_STATUS.md once claimed the Drizzle schema didn't exist ("still the empty template") when all 8 MVP table files were actually already fully written in the repo. Don't trust its "Done"/"Not started" claims at face value — verify against the actual files (and git history if needed) before acting on them.

Confirmed again later: it separately claimed the frontend workflow canvas (Phase 1.2) was unbuilt and listed "Next phase" as Phase 1.2 = Execution Engine — both wrong. The canvas was already substantially implemented (`artifacts/web/src/features/workflow-canvas/`), and per `docs/06-implementation-phases.md` Phase 1.2 is actually Visual Canvas, Execution Engine is Phase 1.4. Two independent drifts (feature-completeness claims and phase numbering) in the same file — treat every section of it as a claim to verify, not just the schema section.

Confirmed a third time: it listed Phase 1.3 (node registry) as "Not started" when a user-pasted "continue implementation" prompt assumed it existed — an explorer subagent found `lib/node-registry/` fully implemented (registry + validation + tests), already wired into both the API's save-endpoint validation and the frontend palette/inspector/canvas, with the OpenAPI enum and codegen already in sync. The only real gap was one untyped test value breaking `pnpm run typecheck`. Drift runs in both directions: the doc can claim work is missing that's actually done, not just claim work is done that's actually missing — always verify the code directly rather than assuming either direction.

**Why:** The doc is hand-maintained prose, not generated from code, so it can fall out of sync with reality — in this case it was wrong about an entire phase's completion state, three separate times, in both directions.

**How to apply:** Before starting or continuing any phase described in PROJECT_STATUS.md — especially when a pasted/external prompt says "assume X is done, continue from here" or "implement Y directly" — dispatch an explore subagent (or read directly) to verify the actual code state first, rather than trusting either the doc or the incoming prompt's framing. Cross-check phase numbers/names against `docs/06-implementation-phases.md` (canonical). If a phase turns out already implemented, the remaining work is usually just: fix whatever's genuinely broken, run the full verify loop (install/typecheck/test), and correct PROJECT_STATUS.md — don't re-implement from scratch.

## Drizzle `text(col, { enum: [...] })` does not create a DB-level CHECK constraint
It only narrows the TypeScript type at the ORM layer. `docs/02-database-schema.md` specifies real SQL `CHECK (col IN (...))` constraints on several enum-like columns — done so far: `executions.status`, `executions.trigger_type`, `execution_logs.status`, `webhooks.response_mode`. Still to come when their tables are built: Milestone 2's `schedules.missed_run_policy` and `variables.environment`.

**Why:** Without an explicit DB constraint, invalid enum values can be written straight to Postgres by anything that bypasses the Zod-level app validation (raw SQL, admin tools, future services, migration bugs).

**How to apply:** When adding any enum-like text column that the docs specify a CHECK for, also add `check(name, sql\`${table.col} in (...)\`)` from `drizzle-orm/pg-core` in that table's constraint array. After `drizzle-kit push`, confirm with `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype = 'c'`.
