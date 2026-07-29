import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const telegramTriggerConfigSchema = z.object({
  /**
   * Telegram Bot API token.
   * Use the literal token value, or prefix with `env:` to read from an
   * environment variable (e.g. `env:TELEGRAM_BOT_TOKEN`).
   */
  botToken: z.string().default("env:TELEGRAM_BOT_TOKEN"),
});
export type TelegramTriggerConfig = z.infer<typeof telegramTriggerConfigSchema>;

/**
 * Starts the workflow when Telegram delivers an update to the workflow's
 * webhook URL (/api/webhooks/:token).  The full Telegram Update object is
 * passed downstream as the node's output.
 *
 * Setup:
 *  1. Create a FlowForge webhook for this workflow (POST /api/v1/webhooks).
 *  2. Register the webhook URL with Telegram:
 *       POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
 *       { "url": "https://<your-host>/api/webhooks/<wh_token>" }
 */
export const telegramTriggerNode: NodeDefinition<TelegramTriggerConfig> = {
  id: "telegram_trigger",
  name: "Telegram Trigger",
  description: "Starts the workflow when a Telegram bot message or callback is received.",
  category: "trigger",
  icon: "send",
  inputs: [],
  outputs: [{ label: "Update" }],
  configSchema: telegramTriggerConfigSchema,
  defaultConfig: { botToken: "env:TELEGRAM_BOT_TOKEN" },
  // When triggered via webhook, the inbound body IS the Telegram Update.
  execute: async ({ input }) => ({ output: input ?? null }),
};
