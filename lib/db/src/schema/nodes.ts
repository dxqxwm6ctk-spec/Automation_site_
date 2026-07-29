import { boolean, index, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { credentials } from "./credentials";
import { workflowVersions } from "./workflow-versions";

// Denormalised for fast graph queries; source of truth is
// workflow_versions.graph_json (see docs/02-database-schema.md).
export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "cascade" }),
    // Unique key within the graph, e.g. "http_1".
    nodeKey: text("node_key").notNull(),
    // e.g. "trigger.webhook", "action.http".
    nodeType: text("node_type").notNull(),
    label: text("label"),
    positionX: real("position_x").notNull().default(0),
    positionY: real("position_y").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    credentialId: uuid("credential_id").references(() => credentials.id, {
      onDelete: "set null",
    }),
    isDisabled: boolean("is_disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_nodes_version").on(table.workflowVersionId),
    index("idx_nodes_type").on(table.nodeType),
  ],
);

export const insertNodeSchema = createInsertSchema(nodes).omit({
  id: true,
  createdAt: true,
});
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;
