import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const startConfigSchema = z.object({});
export type StartConfig = z.infer<typeof startConfigSchema>;

/** Entry point of a workflow run. Every graph should have exactly one. */
export const startNode: NodeDefinition<StartConfig> = {
  id: "start",
  name: "Start",
  description: "Entry point of the workflow. Every run begins here.",
  category: "trigger",
  icon: "play-circle",
  inputs: [],
  outputs: [{ label: "Next" }],
  configSchema: startConfigSchema,
  defaultConfig: {},
  // Passes the execution's trigger payload through unchanged as the first
  // node output.
  execute: async ({ input }) => ({ output: input ?? null }),
};
