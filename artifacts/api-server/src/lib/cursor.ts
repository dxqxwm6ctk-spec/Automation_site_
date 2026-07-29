/**
 * Opaque keyset-pagination cursor helpers, shared by every `GET` list route
 * that paginates on `(createdAt DESC, id DESC)` (workflows, executions, ...).
 */

/** Encodes (createdAt, id) into an opaque base64 cursor. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    "base64url",
  );
}

/** Returns null on invalid/tampered cursors — treated as no cursor. */
export function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as { createdAt: unknown }).createdAt === "string" &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      return {
        createdAt: new Date((parsed as { createdAt: string }).createdAt),
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}
