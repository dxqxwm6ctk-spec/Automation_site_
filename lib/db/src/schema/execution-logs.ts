import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { executions } from "./executions";

export const EXECUTION_LOG_STATUSES = [
  "pending",
  "running",
  "success",
  "error",
  "skipped",
] as const;

export const executionLogs = pgTable(
  "execution_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    status: text("status", { enum: EXECUTION_LOG_STATUSES }).notNull(),
    // Node input/output (or storage_ref key if large).
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    // S3 key when payload > 100 KB.
    storageRef: text("storage_ref"),
    durationMs: integer("duration_ms"),
    attempt: integer("attempt").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_exec_logs_execution").on(table.executionId),
    index("idx_exec_logs_node").on(table.executionId, table.nodeKey),
  ],
);

export const insertExecutionLogSchema = createInsertSchema(executionLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertExecutionLog = z.infer<typeof insertExecutionLogSchema>;
export type ExecutionLog = typeof executionLogs.$inferSelect;
