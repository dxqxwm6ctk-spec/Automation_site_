import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const loopConfigSchema = z.object({
  /**
   * JavaScript expression evaluated with `$input` in scope.  Must return an
   * array; each element becomes one iteration's input.
   *
   * Example:  $input.results
   * Example:  $input.users.map(u => u.id)
   */
  itemsExpression: z
    .string()
    .min(1, "Items expression is required")
    .default("$input"),
  /**
   * Hard cap on iterations (default 100, max 10 000).  Guards against
   * accidentally looping over huge arrays and hitting the execution timeout.
   */
  maxIterations: z
    .number()
    .int("Max iterations must be a whole number")
    .positive("Max iterations must be greater than 0")
    .max(10_000, "Max iterations cannot exceed 10 000")
    .default(100),
});
export type LoopConfig = z.infer<typeof loopConfigSchema>;

/**
 * Evaluates `itemsExpression` against `$input` and returns the resulting
 * array (capped at `maxIterations`).
 *
 * In the Phase 1.4 in-process DAG engine there is no looping sub-graph
 * concept — the Loop node is a "for-each collector": it evaluates the
 * expression to produce the array and passes it downstream as
 * `{ items, count }`.  Downstream nodes receive the whole collected array
 * rather than running once per item.  Per-item fan-out / sub-workflow loops
 * are a Phase 2 concern.
 */
function evaluateItems(expression: string, input: unknown): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("$input", `"use strict"; return (${expression});`) as (
    $input: unknown,
  ) => unknown;
  const result = fn(input);
  if (!Array.isArray(result)) {
    throw new Error(
      `Loop items expression did not return an array (got ${typeof result})`,
    );
  }
  return result;
}

/** Extracts an array from the upstream output and passes it downstream as `{ items, count }`. */
export const loopNode: NodeDefinition<LoopConfig> = {
  id: "loop",
  name: "Loop",
  description: "Iterate over an array — downstream nodes receive `{ items, count }`.",
  category: "control",
  icon: "repeat",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: loopConfigSchema,
  defaultConfig: { itemsExpression: "$input", maxIterations: 100 },
  execute: async ({ config, input }) => {
    const all = evaluateItems(config.itemsExpression, input);
    const items = all.slice(0, config.maxIterations);
    return { output: { items, count: items.length } };
  },
};
