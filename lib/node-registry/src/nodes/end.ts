import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const endConfigSchema = z.object({});
export type EndConfig = z.infer<typeof endConfigSchema>;

/** Terminates the workflow run. A graph may have more than one. */
export const endNode: NodeDefinition<EndConfig> = {
  id: "end",
  name: "End",
  description: "Terminates the workflow run.",
  category: "control",
  icon: "check-circle-2",
  inputs: [{ label: "In" }],
  outputs: [],
  configSchema: endConfigSchema,
  defaultConfig: {},
};
