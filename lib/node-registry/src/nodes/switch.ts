import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

const switchRuleSchema = z.object({
  /** JS expression evaluated with `$input`; truthy → take this branch. */
  condition: z.string().default(""),
  /** Human-readable label shown on the output port. */
  label: z.string().default(""),
});

export const switchConfigSchema = z.object({
  /**
   * Ordered list of rules — evaluated top-to-bottom; first match wins.
   * Up to 4 cases supported; if no case matches, the `default` port fires.
   */
  rules: z
    .array(switchRuleSchema)
    .min(1)
    .max(4)
    .default([{ condition: "", label: "Case 1" }]),
  fallbackLabel: z.string().default("Default"),
});
export type SwitchConfig = z.infer<typeof switchConfigSchema>;

/**
 * Routes the workflow to one of up to 4 named outputs based on JS conditions,
 * with an implicit `default` fallback port when no rule matches.
 *
 * Output port ids: `out_0` … `out_3` (matching rule index), `default`.
 */
export const switchNode: NodeDefinition<SwitchConfig> = {
  id: "switch",
  name: "Switch",
  description:
    "Route to one of multiple outputs based on JS conditions — first match wins.",
  category: "logic",
  icon: "git-fork",
  inputs: [{ label: "In" }],
  outputs: [
    { id: "out_0", label: "Case 1" },
    { id: "out_1", label: "Case 2" },
    { id: "out_2", label: "Case 3" },
    { id: "out_3", label: "Case 4" },
    { id: "default", label: "Default" },
  ],
  configSchema: switchConfigSchema,
  defaultConfig: {
    rules: [{ condition: "", label: "Case 1" }],
    fallbackLabel: "Default",
  },
  execute: async ({ config, input }) => {
    for (let i = 0; i < config.rules.length; i++) {
      const { condition } = config.rules[i];
      if (!condition.trim()) continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const fn = new Function("$input", `"use strict"; return !!(${condition});`) as (
          $input: unknown,
        ) => boolean;
        if (fn(input)) {
          return { output: input ?? null, branch: `out_${i}` };
        }
      } catch {
        // skip rules that error — they don't match
      }
    }
    return { output: input ?? null, branch: "default" };
  },
};
