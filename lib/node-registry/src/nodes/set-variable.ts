import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const setVariableConfigSchema = z.object({
  /**
   * Name of the variable to set.  The value is merged into the output object
   * so downstream nodes can access it as `$input.<variableName>`.
   *
   * A full variable store (scoped to execution, readable from any node) is a
   * Phase 2 concern.  In Phase 1.4 the "variable" is simply a named key
   * merged onto the output — it persists only through the direct data-flow
   * chain, not across branches or into nested sub-graphs.
   */
  variableName: z.string().min(1, "Variable name is required").default("result"),
  /**
   * JavaScript expression evaluated with `$input` in scope.  The result
   * becomes the variable's value.
   *
   * Example:  $input.statusCode === 200
   * Example:  $input.items.length
   * Example:  "hello"
   */
  valueExpression: z
    .string()
    .min(1, "Value expression is required")
    .default("$input"),
});
export type SetVariableConfig = z.infer<typeof setVariableConfigSchema>;

function evaluateExpression(expression: string, input: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("$input", `"use strict"; return (${expression});`) as (
    $input: unknown,
  ) => unknown;
  return fn(input);
}

/**
 * Evaluates `valueExpression` and merges `{ [variableName]: value }` onto
 * the upstream output so downstream nodes can reference the result.
 */
export const setVariableNode: NodeDefinition<SetVariableConfig> = {
  id: "set_variable",
  name: "Set Variable",
  description: "Evaluate an expression and attach its result under a named key.",
  category: "action",
  icon: "braces",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: setVariableConfigSchema,
  defaultConfig: { variableName: "result", valueExpression: "$input" },
  execute: async ({ config, input }) => {
    const value = evaluateExpression(config.valueExpression, input);
    const base = input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
    return { output: { ...base, [config.variableName]: value } };
  },
};
