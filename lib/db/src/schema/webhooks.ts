import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflows } from "./workflows";

export const WEBHOOK_RESPONSE_MODES = ["immediate", "wait_for_completion"] as const;

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    // wh_{uuid}, used in the public URL.
    token: text("token").notNull().unique(),
    method: text("method").notNull().default("POST"),
    responseMode: text("response_mode", { enum: WEBHOOK_RESPONSE_MODES })
      .notNull()
      .default("immediate"),
    responseStatus: integer("response_status").notNull().default(200),
    // Static response body template.
    responseTemplate: jsonb("response_template"),
    // HMAC key (stored hashed).
    signingSecret: text("signing_secret"),
    isActive: boolean("is_active").notNull().default(true),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_webhooks_workflow").on(table.workflowId)],
);

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTriggeredAt: true,
});
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;
