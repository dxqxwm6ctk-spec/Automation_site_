---
name: FlowForge DB schema notes
description: Lessons from implementing/verifying the FlowForge Drizzle schema against docs/02-database-schema.md — status-doc drift and a Drizzle CHECK-constraint gotcha.
---

## PROJECT_STATUS.md can drift from actual code
PROJECT_STATUS.md once claimed the Drizzle schema didn't exist ("still the empty template") when all 8 MVP table files were actually already fully written in the repo. Don't trust its "Done"/"Not started" claims at face value — verify against the actual files (and git history if needed) before acting on them.

Confirmed again later: it separately claimed the frontend workflow canvas (Phase 1.2) was unbuilt and listed "Next phase" as Phase 1.2 = Execution Engine — both wrong. The canvas was already substantially implemented (`artifacts/web/src/features/workflow-canvas/`), and per `docs/06-implementation-phases.md` Phase 1.2 is actually Visual Canvas, Execution Engine is Phase 1.4. Two independent drifts (feature-completeness claims and phase numbering) in the same file — treat every section of it as a claim to verify, not just the schema section.

**Why:** The doc is hand-maintained prose, not generated from code, so it can fall out of sync with reality — in this case it was wrong about an entire phase's completion state.

**How to apply:** Before starting or continuing any phase described in PROJECT_STATUS.md, spot-check the files/DB state it claims about, and cross-check phase numbers/names against `docs/06-implementation-phases.md` (canonical) rather than trusting this file's own "Next phase" section. If it's wrong, correct it as part of your update rather than propagating the error.

## Drizzle `text(col, { enum: [...] })` does not create a DB-level CHECK constraint
It only narrows the TypeScript type at the ORM layer. `docs/02-database-schema.md` specifies real SQL `CHECK (col IN (...))` constraints on several enum-like columns — done so far: `executions.status`, `executions.trigger_type`, `execution_logs.status`, `webhooks.response_mode`. Still to come when their tables are built: Milestone 2's `schedules.missed_run_policy` and `variables.environment`.

**Why:** Without an explicit DB constraint, invalid enum values can be written straight to Postgres by anything that bypasses the Zod-level app validation (raw SQL, admin tools, future services, migration bugs).

**How to apply:** When adding any enum-like text column that the docs specify a CHECK for, also add `check(name, sql\`${table.col} in (...)\`)` from `drizzle-orm/pg-core` in that table's constraint array. After `drizzle-kit push`, confirm with `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype = 'c'`.
