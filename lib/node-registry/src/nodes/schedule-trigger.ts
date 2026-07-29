import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const scheduleTriggerConfigSchema = z.object({
  /**
   * Standard 5-field cron expression (minute hour dom month dow).
   * Validated only for basic format here — real scheduling (Phase 2) will
   * validate more strictly against the chosen cron library.
   */
  cronExpression: z
    .string()
    .min(1, "Cron expression is required")
    .default("0 * * * *"),
  timezone: z.string().default("UTC"),
});
export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerConfigSchema>;

/**
 * Fires the workflow on a cron schedule.  Actual scheduling is implemented
 * in Milestone 2 (Phase 2.1 — Scheduling & Variables); this Phase 1.3
 * definition makes the node available in the palette and executable
 * (pass-through when triggered manually).
 */
export const scheduleTriggerNode: NodeDefinition<ScheduleTriggerConfig> = {
  id: "schedule_trigger",
  name: "Schedule Trigger",
  description: "Fire the workflow on a recurring cron schedule.",
  category: "trigger",
  icon: "calendar-clock",
  inputs: [],
  outputs: [{ label: "Next" }],
  configSchema: scheduleTriggerConfigSchema,
  defaultConfig: { cronExpression: "0 * * * *", timezone: "UTC" },
  // When run manually, the trigger payload passes through unchanged.
  execute: async ({ input }) => ({ output: input ?? null }),
};
