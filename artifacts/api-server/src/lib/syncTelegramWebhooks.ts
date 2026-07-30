/**
 * syncTelegramWebhooks
 *
 * Called once at server startup.  For every active FlowForge webhook whose
 * workflow graph contains a `telegram_trigger` node, this routine ensures
 * Telegram's Bot API is pointing at the current server's public URL.
 *
 * Domain resolution order:
 *   1. REPLIT_DOMAINS  — set by Replit for deployed (production) apps;
 *                        comma-separated list, first entry is the primary domain.
 *   2. REPLIT_DEV_DOMAIN — set in the Replit workspace during development.
 *   3. PUBLIC_URL      — manual override for self-hosted / other environments.
 *
 * If no domain can be resolved the function logs a warning and exits early
 * (no crash — a missing env var shouldn't prevent the server from starting).
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { db, webhooks, workflows, workflowVersions } from "@workspace/db";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types (minimal — avoids importing the full node-registry at runtime)
// ---------------------------------------------------------------------------

interface GraphNode {
  type: string;
  config?: Record<string, unknown>;
}

interface Graph {
  nodes: GraphNode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a bot token value that may carry an `env:VAR_NAME` prefix. */
function resolveToken(value: string): string | undefined {
  if (value.startsWith("env:")) {
    const envKey = value.slice(4);
    return process.env[envKey];
  }
  return value || undefined;
}

/** Return the primary public hostname for this server (without trailing slash). */
function resolvePublicBaseUrl(): string | undefined {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;

  const publicUrl = process.env["PUBLIC_URL"];
  if (publicUrl) return publicUrl.replace(/\/$/, "");

  return undefined;
}

// ---------------------------------------------------------------------------
// Telegram API calls
// ---------------------------------------------------------------------------

interface TelegramWebhookInfo {
  url: string;
}

async function getWebhookInfo(botToken: string): Promise<TelegramWebhookInfo> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
  );
  const json = (await res.json()) as { ok: boolean; result?: TelegramWebhookInfo; description?: string };
  if (!json.ok) throw new Error(`getWebhookInfo failed: ${json.description ?? "unknown"}`);
  return json.result ?? { url: "" };
}

async function setWebhook(botToken: string, url: string): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    },
  );
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`setWebhook failed: ${json.description ?? "unknown"}`);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function syncTelegramWebhooks(): Promise<void> {
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl) {
    logger.warn(
      "syncTelegramWebhooks: no public domain found " +
        "(REPLIT_DOMAINS / REPLIT_DEV_DOMAIN / PUBLIC_URL not set) — skipping",
    );
    return;
  }

  // Load all active webhooks that have a published workflow version.
  const rows = await db
    .select({
      webhookToken: webhooks.token,
      graphJson: workflowVersions.graphJson,
    })
    .from(webhooks)
    .innerJoin(workflows, eq(webhooks.workflowId, workflows.id))
    .innerJoin(
      workflowVersions,
      eq(workflowVersions.id, workflows.activeVersionId),
    )
    .where(
      and(
        eq(webhooks.isActive, true),
        isNotNull(workflows.activeVersionId),
      ),
    );

  // Each (botToken → webhookUrl) pair that needs to be synced.
  // Using a Map so multiple workflows sharing the same bot only call the API once.
  const toSync = new Map<string, string>(); // botToken → expected webhookUrl

  for (const row of rows) {
    let graph: Graph;
    try {
      graph = row.graphJson as Graph;
    } catch {
      continue;
    }
    if (!Array.isArray(graph?.nodes)) continue;

    for (const node of graph.nodes) {
      if (node.type !== "telegram_trigger") continue;

      const rawToken =
        typeof node.config?.["botToken"] === "string"
          ? node.config["botToken"]
          : "env:TELEGRAM_BOT_TOKEN";

      const botToken = resolveToken(rawToken);
      if (!botToken) {
        logger.warn("syncTelegramWebhooks: telegram_trigger node found but bot token is empty — skipping");
        continue;
      }

      const expectedUrl = `${baseUrl}/api/webhooks/${row.webhookToken}`;
      // Last writer wins — if two workflows share the same bot token, the last
      // one encountered sets the webhook.  In practice there should be exactly
      // one active Telegram trigger per bot token.
      toSync.set(botToken, expectedUrl);
    }
  }

  if (toSync.size === 0) {
    logger.info("syncTelegramWebhooks: no active telegram_trigger workflows found — nothing to sync");
    return;
  }

  for (const [botToken, expectedUrl] of toSync.entries()) {
    try {
      const info = await getWebhookInfo(botToken);
      if (info.url === expectedUrl) {
        logger.info({ url: expectedUrl }, "syncTelegramWebhooks: webhook already up-to-date");
        continue;
      }
      await setWebhook(botToken, expectedUrl);
      logger.info(
        { prev: info.url || "(none)", next: expectedUrl },
        "syncTelegramWebhooks: webhook updated",
      );
    } catch (err) {
      // Log but don't crash startup — a Telegram API hiccup shouldn't kill the server.
      logger.error({ err }, "syncTelegramWebhooks: failed to sync webhook");
    }
  }
}
