import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Credentials are global and unscoped in the MVP — no owner, no per-user
// visibility rule. Secret storage, not identity, so it ships without accounts.
// The API must never return data_encrypted / data_iv (see replit.md "Gotchas").
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // "oauth2", "api_key", "basic", "aws", etc.
    credentialType: text("credential_type").notNull(),
    // AES-256-GCM base64 ciphertext.
    dataEncrypted: text("data_encrypted").notNull(),
    dataIv: text("data_iv").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("credentials_name_key").on(table.name).where(sql`${table.deletedAt} IS NULL`),
    index("idx_credentials_type")
      .on(table.credentialType)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const insertCredentialSchema = createInsertSchema(credentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Credential = typeof credentials.$inferSelect;
