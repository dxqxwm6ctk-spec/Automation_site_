import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const delayConfigSchema = z.object({
  durationMs: z
    .number()
    .int("Duration must be a whole number of milliseconds")
    .nonnegative("Duration cannot be negative")
    .default(5000),
});
export type DelayConfig = z.infer<typeof delayConfigSchema>;

/** Pauses the workflow run for a fixed duration before continuing. */
export const delayNode: NodeDefinition<DelayConfig> = {
  id: "delay",
  name: "Delay",
  description: "Pause the workflow for a fixed duration.",
  category: "control",
  icon: "clock",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: delayConfigSchema,
  defaultConfig: { durationMs: 5000 },
};
