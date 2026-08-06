import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const setVariableConfigSchema = z.object({
  /**
   * Name of the variable to set.  The value is always merged into the
   * output object so downstream nodes can access it as
   * `$input.<variableName>`.
   */
  variableName: z.string().min(1, "Variable name is required").default("result"),
  /**
   * JavaScript expression evaluated with `$input` and `$vars` in scope.
   * The result becomes the variable's value.
   *
   * Example:  $input.statusCode === 200
   * Example:  $input.items.length
   * Example:  $vars.API_BASE_URL + "/orders"
   */
  valueExpression: z
    .string()
    .min(1, "Value expression is required")
    .default("$input"),
  /**
   * When true, the api-server also upserts `{ variableName: value }` into
   * the workflow owner's persisted variable store (Milestone 2 — Phase
   * 2.2), so the value survives past this execution and is readable by
   * future runs and other workflows. When false (default), the value only
   * flows downstream through the direct data-flow chain, as in Phase 1.4.
   */
  persist: z.boolean().default(false),
});
export type SetVariableConfig = z.infer<typeof setVariableConfigSchema>;

function evaluateExpression(expression: string, input: unknown, vars: Record<string, string>): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("$input", "$vars", `"use strict"; return (${expression});`) as (
    $input: unknown,
    $vars: Record<string, string>,
  ) => unknown;
  return fn(input, vars);
}

/**
 * Evaluates `valueExpression` and merges `{ [variableName]: value }` onto
 * the upstream output so downstream nodes can reference the result. When
 * `config.persist` is set, the api-server (nodeRunner.ts) also writes the
 * value to the persisted variable store after this returns — node-registry
 * itself stays DB-free.
 */
export const setVariableNode: NodeDefinition<SetVariableConfig> = {
  id: "set_variable",
  name: "Set Variable",
  description: "Evaluate an expression and attach its result under a named key, optionally saving it for future runs.",
  category: "action",
  icon: "braces",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: setVariableConfigSchema,
  defaultConfig: { variableName: "result", valueExpression: "$input", persist: false },
  execute: async ({ config, input, vars }) => {
    const value = evaluateExpression(config.valueExpression, input, vars);
    const base = input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
    return { output: { ...base, [config.variableName]: value } };
  },
};
