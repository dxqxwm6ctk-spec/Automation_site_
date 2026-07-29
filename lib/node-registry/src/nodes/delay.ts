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

/**
 * Resolves after `ms`, or rejects immediately/early if `signal` is (or
 * becomes) aborted — so a cancelled or timed-out execution doesn't have to
 * wait out the rest of the delay.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

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
  // No node-level cap here — durationMs IS the node's contract, unbounded
  // by design. The execution-level timeout (5 min default) is the backstop
  // that keeps a very long delay from running forever.
  execute: async ({ config, input, signal }) => {
    await sleep(config.durationMs, signal);
    return { output: input ?? null };
  },
};
