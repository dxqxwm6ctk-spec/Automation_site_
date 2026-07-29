import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const ifConfigSchema = z.object({
  condition: z.string().min(1, "Condition is required"),
});
export type IfConfig = z.infer<typeof ifConfigSchema>;

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
};
