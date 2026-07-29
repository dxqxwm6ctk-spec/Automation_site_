---
name: FlowForge DB schema notes
description: Gotchas about the DB schema, test cleanup order, and generated-code export conflicts.
---

## Schema import notes
- `PROJECT_STATUS.md` can drift from real code state (schema AND feature/phase claims) — always check the actual Drizzle schema files in `lib/db/src/schema/` for the truth.
- Drizzle `text(enum:[...])` needs an explicit `check()` for a real DB constraint — the enum argument only affects TypeScript types, not the database.

## DB table dependency order for test cleanup
- `execution_logs.execution_id` references `executions.id` with `onDelete: "cascade"` — deleting an execution row cascades to its logs automatically.
- `executions.workflow_id` references `workflows.id` — NO cascade. Delete executions before workflows or you get a FK violation.
- `workflow_versions.workflow_id` references `workflows.id` — also no cascade; the existing `workflows.test.ts` skips versions cleanup because Postgres handles it (the tests use `DELETE FROM workflows` which cascades via FK? No — they just delete workflows directly). Actually looking at the test: it uses `db.delete(workflows).where(...)` and it works because `workflow_versions` has `ON DELETE CASCADE` implicitly? Check the actual schema if you hit FK violations.

**Why:** Replit provisions a fresh Postgres on import — no tables until `pnpm --filter @workspace/db run push` is run. Tests hit 500s with "relation does not exist" if the DB wasn't pushed.

**How to apply:** After any re-import or fresh environment, run `pnpm --filter @workspace/db run push` before running tests. In test cleanup, delete child-table rows (executions) before parent-table rows (workflows) unless the FK has `onDelete: "cascade"`.

## api-zod duplicate export conflict
- Orval generates both `lib/api-zod/src/generated/api.ts` (Zod schemas, named `FooBarBody = zod.object(...)`) and `lib/api-zod/src/generated/types/fooBarBody.ts` (TypeScript types, named `FooBarBody = { ... }`). When `index.ts` re-exports both with `export *`, TypeScript raises TS2308 for any name present in both.
- Fix: add an explicit tiebreak in `lib/api-zod/src/index.ts`: `export { ExecuteWorkflowBody } from "./generated/api";` after the two `export *` lines. This tells TypeScript which source wins.
- The conflict recurs whenever a new request-body type is added to the OpenAPI spec and `orval` codegen is re-run — check for TS2308 after every codegen run.
