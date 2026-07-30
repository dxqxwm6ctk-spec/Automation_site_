import { z } from "zod/v4";

/**
 * Graph JSON shape stored in workflow_versions.graph_json. Mirrors the
 * required/optional split of WorkflowGraphNode/WorkflowGraphConnection in
 * openapi.yaml — `key`/`type` (and `sourceKey`/`targetKey`) are structurally
 * required, `config` stays a loose record so @workspace/node-registry can
 * validate/execute it against the node type's own schema.
 *
 * Single source of truth for this shape within the API server — shared by
 * the workflow CRUD routes (validate + persist on save) and the execution
 * engine (walk on run).
 */
export const retryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(1),
  backoffMs: z.number().int().min(0).max(60_000).default(1_000),
}).optional();

export type RetryConfig = z.infer<typeof retryConfigSchema>;

export const graphNodeSchema = z.object({
  key: z.string(),
  type: z.string(),
  label: z.string().nullable().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  retry: retryConfigSchema,
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphConnectionSchema = z.object({
  sourceKey: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetKey: z.string(),
  targetHandle: z.string().nullable().optional(),
});
export type GraphConnection = z.infer<typeof graphConnectionSchema>;

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema).default([]),
  connections: z.array(graphConnectionSchema).default([]),
});
export type Graph = z.infer<typeof graphSchema>;
