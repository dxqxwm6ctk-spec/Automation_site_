import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const ifConfigSchema = z.object({
  condition: z.string().min(1, "Condition is required"),
});
export type IfConfig = z.infer<typeof ifConfigSchema>;

/**
 * Evaluates `condition` as a JS expression with the upstream output bound to
 * `$input`, per docs/07-workflow-engine.md's expression sandbox design.
 *
 * This is `new Function`, not a real sandbox (no `isolated-vm`) — a
 * deliberate Phase 1.4 scope boundary, same as the deferred Code node. It
 * stops accidental mistakes, not hostile input, and (being synchronous)
 * can't be interrupted by an abort signal if the expression itself hangs.
 */
function evaluateCondition(condition: string, input: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const evaluator = new Function("$input", `"use strict"; return (${condition});`);
  return Boolean(evaluator(input));
}

/** Branches the workflow into a `true` and a `false` path based on a condition. */
export const ifNode: NodeDefinition<IfConfig> = {
  id: "if",
  name: "If",
  description: "Branch the workflow based on a condition.",
  category: "logic",
  icon: "git-branch",
  inputs: [{ label: "In" }],
  outputs: [
    { id: "true", label: "True" },
    { id: "false", label: "False" },
  ],
  configSchema: ifConfigSchema,
  defaultConfig: { condition: "" },
  execute: async ({ config, input }) => {
    let matched: boolean;
    try {
      matched = evaluateCondition(config.condition, input);
    } catch (err) {
      throw new Error(
        `Condition "${config.condition}" failed to evaluate: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { output: input ?? null, branch: matched ? "true" : "false" };
  },
};
