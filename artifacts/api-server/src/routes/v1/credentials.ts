/**
 * Credential management CRUD — Phase 1.7
 * Mounted at /api/v1/credentials
 *
 * Secret `data` is encrypted (AES-256-GCM, see ../../lib/crypto.ts) before
 * it touches the database and is never returned by any response here — only
 * id/name/credentialType/timestamps. Decryption only happens inside the
 * execution engine (see ../../engine/nodeRunner.ts), never on an API
 * response path.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { and, eq, isNull } from "drizzle-orm";
import { db, credentials } from "@workspace/db";
import { AppError } from "../../lib/errors";
import { encryptSecretData } from "../../lib/crypto";

const router = Router();

/** Shape returned to clients — deliberately excludes dataEncrypted/dataIv. */
function toPublicCredential(row: typeof credentials.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    credentialType: row.credentialType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GET /v1/credentials ────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(credentials)
    .where(isNull(credentials.deletedAt))
    .orderBy(credentials.createdAt);
  res.json({ credentials: rows.map(toPublicCredential) });
});

// ─── POST /v1/credentials ───────────────────────────────────────────────────

const createCredentialBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  credentialType: z.string().min(1, "Credential type is required"),
  data: z.record(z.string(), z.string()),
});

router.post("/", async (req, res) => {
  const body = createCredentialBodySchema.parse(req.body);

  const [existing] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.name, body.name), isNull(credentials.deletedAt)))
    .limit(1);
  if (existing) {
    throw new AppError("CONFLICT", `A credential named "${body.name}" already exists`);
  }

  const { dataEncrypted, dataIv } = encryptSecretData(body.data);
  const [credential] = await db
    .insert(credentials)
    .values({
      name: body.name,
      credentialType: body.credentialType,
      dataEncrypted,
      dataIv,
    })
    .returning();

  res.status(201).json({ credential: toPublicCredential(credential) });
});

// ─── GET /v1/credentials/:credentialId ──────────────────────────────────────

router.get("/:credentialId", async (req, res) => {
  const [credential] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.id, req.params.credentialId), isNull(credentials.deletedAt)))
    .limit(1);
  if (!credential) {
    throw new AppError("NOT_FOUND", `Credential ${req.params.credentialId} not found`);
  }
  res.json({ credential: toPublicCredential(credential) });
});

// ─── DELETE /v1/credentials/:credentialId ───────────────────────────────────

router.delete("/:credentialId", async (req, res) => {
  const [credential] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.id, req.params.credentialId), isNull(credentials.deletedAt)))
    .limit(1);
  if (!credential) {
    throw new AppError("NOT_FOUND", `Credential ${req.params.credentialId} not found`);
  }

  await db
    .update(credentials)
    .set({ deletedAt: new Date() })
    .where(eq(credentials.id, credential.id));
  res.status(204).send();
});

export default router;
