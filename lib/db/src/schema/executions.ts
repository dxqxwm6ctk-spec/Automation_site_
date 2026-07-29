import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflows } from "./workflows";
import { workflowVersions } from "./workflow-versions";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const EXECUTION_STATUSES = [
  "pending",
  "running",
  "success",
  "error",
  "cancelled",
  "timeout",
] as const;

export const EXECUTION_TRIGGER_TYPES = ["manual", "webhook", "schedule", "api"] as const;

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => workflowVersions.id),
    status: text("status", { enum: EXECUTION_STATUSES }).notNull().default("pending"),
    triggerType: text("trigger_type", { enum: EXECUTION_TRIGGER_TYPES }).notNull(),
    // Initial input data.
    triggerPayload: jsonb("trigger_payload"),
    // Final output of the last node.
    output: jsonb("output"),
    // Structured error if failed.
    error: jsonb("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    retryCount: integer("retry_count").notNull().default(0),
    // For sub-workflow calls.
    parentId: uuid("parent_id").references((): AnyPgColumn => executions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_executions_workflow").on(table.workflowId, table.createdAt.desc()),
    index("idx_executions_status")
      .on(table.status)
      .where(sql`${table.status} IN ('pending','running')`),
    // Partition by month for scale — deferred until execution volume needs it
    // (see docs/02-database-schema.md "Data Retention & Partitioning").
    check(
      "executions_status_check",
      sql`${table.status} in ('pending', 'running', 'success', 'error', 'cancelled', 'timeout')`,
    ),
    check(
      "executions_trigger_type_check",
      sql`${table.triggerType} in ('manual', 'webhook', 'schedule', 'api')`,
    ),
  ],
);

export const insertExecutionSchema = createInsertSchema(executions).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  output: true,
  error: true,
});
export type InsertExecution = z.infer<typeof insertExecutionSchema>;
export type Execution = typeof executions.$inferSelect;
