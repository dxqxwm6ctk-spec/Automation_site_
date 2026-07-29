import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

/** How the webhook responds to the caller once triggered. */
export const webhookResponseModes = ["immediate", "wait_for_completion"] as const;
export type WebhookResponseMode = (typeof webhookResponseModes)[number];

export const webhookTriggerConfigSchema = z.object({
  path: z
    .string()
    .min(1, "Path is required")
    .regex(
      /^\/[a-zA-Z0-9/_-]*$/,
      'Path must start with "/" and contain only letters, numbers, "-", "_", "/"',
    ),
  responseMode: z.enum(webhookResponseModes).default("immediate"),
});
export type WebhookTriggerConfig = z.infer<typeof webhookTriggerConfigSchema>;

/**
 * Starts the workflow when an external system calls its URL. `path` is the
 * route suffix the webhook listens on; `responseMode` controls whether the
 * caller gets an immediate ack or waits for the run to finish.
 */
export const webhookTriggerNode: NodeDefinition<WebhookTriggerConfig> = {
  id: "webhook_trigger",
  name: "Webhook Trigger",
  description: "Starts the workflow when an external system calls its unique URL.",
  category: "trigger",
  icon: "webhook",
  inputs: [],
  outputs: [{ label: "Next" }],
  configSchema: webhookTriggerConfigSchema,
  defaultConfig: { path: "/webhook", responseMode: "immediate" },
  // The public webhook receiver (Phase 1.5) isn't built yet. When this node
  // is the entry point of a manually- or API-triggered execution, it just
  // passes the trigger payload through, same as Start.
  execute: async ({ input }) => ({ output: input ?? null }),
};
