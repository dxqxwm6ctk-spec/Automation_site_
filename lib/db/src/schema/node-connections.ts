import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflowVersions } from "./workflow-versions";

export const nodeConnections = pgTable(
  "node_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "cascade" }),
    sourceNodeKey: text("source_node_key").notNull(),
    // Named output port.
    sourceHandle: text("source_handle").notNull().default("output"),
    targetNodeKey: text("target_node_key").notNull(),
    // Named input port.
    targetHandle: text("target_handle").notNull().default("input"),
    // Optional filter expression.
    conditionExpr: text("condition_expr"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_connections_version").on(table.workflowVersionId),
    index("idx_connections_source").on(table.workflowVersionId, table.sourceNodeKey),
  ],
);

export const insertNodeConnectionSchema = createInsertSchema(nodeConnections).omit({
  id: true,
  createdAt: true,
});
export type InsertNodeConnection = z.infer<typeof insertNodeConnectionSchema>;
export type NodeConnection = typeof nodeConnections.$inferSelect;
