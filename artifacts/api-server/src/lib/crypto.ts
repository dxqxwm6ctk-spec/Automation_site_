/**
 * Credential encryption — Phase 1.7
 *
 * AES-256-GCM at rest for the `credentials` table (see
 * lib/db/src/schema/credentials.ts). The GCM auth tag is appended to the
 * ciphertext buffer before base64 encoding so the schema only needs the two
 * columns it already has (data_encrypted, data_iv) — there's no separate
 * "tag" column to keep in sync.
 *
 * ENCRYPTION_KEY must be a 64-character hex string (32 raw bytes). Fails
 * loud at first use if missing/malformed rather than silently storing
 * plaintext or falling back to a weaker scheme.
 */
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM-recommended IV size.
const AUTH_TAG_LENGTH = 16;

function loadKey(): Buffer {
  const raw = process.env["ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required but was not provided.",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256-GCM.",
    );
  }
  return Buffer.from(raw, "hex");
}

export interface EncryptedPayload {
  dataEncrypted: string;
  dataIv: string;
}

/** Encrypts `plaintext` (already JSON-stringified by the caller) for storage. */
export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    dataEncrypted: Buffer.concat([ciphertext, authTag]).toString("base64"),
    dataIv: iv.toString("base64"),
  };
}

/** Reverses `encryptSecret`. Throws if the key is wrong or the ciphertext was tampered with (GCM tag check). */
export function decryptSecret(payload: EncryptedPayload): string {
  const key = loadKey();
  const iv = Buffer.from(payload.dataIv, "base64");
  const combined = Buffer.from(payload.dataEncrypted, "base64");
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Convenience wrapper for the common case of encrypting a plain string-keyed object. */
export function encryptSecretData(data: Record<string, string>): EncryptedPayload {
  return encryptSecret(JSON.stringify(data));
}

/** Convenience wrapper for the common case of decrypting back to a plain string-keyed object. */
export function decryptSecretData(payload: EncryptedPayload): Record<string, string> {
  return JSON.parse(decryptSecret(payload)) as Record<string, string>;
}
