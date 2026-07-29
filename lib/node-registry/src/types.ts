import type { ZodType } from "zod/v4";

/**
 * Broad classification used to group nodes in the palette UI. Kept small and
 * closed — new categories should be rare and deliberate.
 */
export type NodeCategory = "trigger" | "action" | "logic" | "control";

/**
 * A single input or output connection point on a node. `id` distinguishes
 * multiple ports of the same kind (e.g. the "if" node's `true`/`false`
 * outputs) — omit it for nodes with a single, unambiguous port.
 */
export interface NodePort {
  id?: string;
  label: string;
}

/**
 * Framework-agnostic description of a node type. This is the single source
 * of truth for what a node is, what it's configured with, and how that
 * config is validated. It intentionally knows nothing about React, icons as
 * components, or canvas rendering — `icon` is a plain string id that
 * consumers (e.g. the web app) map to their own icon components.
 */
export interface NodeDefinition<TConfig = Record<string, unknown>> {
  /** Stable identifier persisted as the node's `type` in workflow graph JSON. */
  id: string;
  name: string;
  description: string;
  category: NodeCategory;
  /** Icon identifier (e.g. "globe"); consumers map this to a real icon. */
  icon: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;
}
