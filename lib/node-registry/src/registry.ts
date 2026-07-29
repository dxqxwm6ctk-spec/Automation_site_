import { startNode } from "./nodes/start";
import { webhookTriggerNode } from "./nodes/webhook-trigger";
import { scheduleTriggerNode } from "./nodes/schedule-trigger";
import { httpRequestNode } from "./nodes/http-request";
import { codeNode } from "./nodes/code";
import { delayNode } from "./nodes/delay";
import { ifNode } from "./nodes/if";
import { loopNode } from "./nodes/loop";
import { setVariableNode } from "./nodes/set-variable";
import { logNode } from "./nodes/log";
import { endNode } from "./nodes/end";
import type { NodeCategory, NodeDefinition } from "./types";

/** Ordered list of every registered node — order drives palette display order. */
export const NODE_DEFINITIONS: NodeDefinition[] = [
  startNode,
  webhookTriggerNode,
  scheduleTriggerNode,
  httpRequestNode,
  codeNode,
  delayNode,
  ifNode,
  loopNode,
  setVariableNode,
  logNode,
  endNode,
];

const REGISTRY_BY_ID: Record<string, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** Looks up a node definition by its type id. Returns `undefined` for unknown types. */
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return REGISTRY_BY_ID[type];
}

/** Returns `true` if `type` is a registered node type. */
export function isKnownNodeType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY_BY_ID, type);
}

/** All registered node definitions, in display order. */
export function listNodeDefinitions(): NodeDefinition[] {
  return NODE_DEFINITIONS;
}

/** Node definitions grouped by category, preserving registration order within each group. */
export function listNodeDefinitionsByCategory(): Record<NodeCategory, NodeDefinition[]> {
  const groups: Record<NodeCategory, NodeDefinition[]> = {
    trigger: [],
    action: [],
    logic: [],
    control: [],
  };
  for (const definition of NODE_DEFINITIONS) {
    groups[definition.category].push(definition);
  }
  return groups;
}
