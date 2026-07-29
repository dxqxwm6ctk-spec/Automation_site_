import {
  CheckCircle2,
  Clock,
  GitBranch,
  Globe,
  PlayCircle,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { WorkflowGraphNodeType } from "@workspace/api-client-react";
import {
  listNodeDefinitions,
  type NodeCategory,
  type NodeDefinition as SharedNodeDefinition,
  type NodePort,
} from "@workspace/node-registry";

/**
 * Node *definitions* (id, config schema, category, ports) live in
 * @workspace/node-registry and are shared with the API server. This module
 * only adds the frontend-only concerns the shared package deliberately knows
 * nothing about: resolved icon components and Tailwind color classes.
 */
export type NodeTypeId = (typeof WorkflowGraphNodeType)[keyof typeof WorkflowGraphNodeType];

export type NodeOutputDef = NodePort;

export interface NodeDefinition {
  type: NodeTypeId;
  label: string;
  description: string;
  category: NodeCategory;
  icon: LucideIcon;
  inputs: NodePort[];
  outputs: NodePort[];
  defaultConfig: Record<string, unknown>;
}

/** Maps the shared registry's framework-agnostic icon ids to lucide-react components. */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  "play-circle": PlayCircle,
  webhook: Webhook,
  globe: Globe,
  clock: Clock,
  "git-branch": GitBranch,
  "check-circle-2": CheckCircle2,
};

function resolveIcon(iconId: string): LucideIcon {
  return ICON_COMPONENTS[iconId] ?? PlayCircle;
}

function toUiDefinition(shared: SharedNodeDefinition): NodeDefinition {
  return {
    type: shared.id as NodeTypeId,
    label: shared.name,
    description: shared.description,
    category: shared.category,
    icon: resolveIcon(shared.icon),
    inputs: shared.inputs,
    outputs: shared.outputs,
    defaultConfig: shared.defaultConfig,
  };
}

const SHARED_DEFINITIONS = listNodeDefinitions();

export const NODE_TYPE_LIST: NodeTypeId[] = SHARED_DEFINITIONS.map((d) => d.id as NodeTypeId);

export const NODE_DEFINITIONS: Record<NodeTypeId, NodeDefinition> = Object.fromEntries(
  SHARED_DEFINITIONS.map((shared) => [shared.id, toUiDefinition(shared)]),
) as Record<NodeTypeId, NodeDefinition>;

/** Node definitions grouped by category, in registration order — drives the palette's sections. */
export function listNodeDefinitionsByCategory(): Record<NodeCategory, NodeDefinition[]> {
  const groups: Record<NodeCategory, NodeDefinition[]> = {
    trigger: [],
    action: [],
    logic: [],
    control: [],
  };
  for (const type of NODE_TYPE_LIST) {
    groups[NODE_DEFINITIONS[type].category].push(NODE_DEFINITIONS[type]);
  }
  return groups;
}

/** Fully literal Tailwind class strings (no dynamic interpolation) so the compiler can see and keep them. */
export interface NodeColorClasses {
  badge: string;
  border: string;
  ring: string;
}

export const NODE_COLOR_CLASSES: Record<NodeTypeId, NodeColorClasses> = {
  [WorkflowGraphNodeType.start]: {
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/50",
    ring: "ring-emerald-500",
  },
  [WorkflowGraphNodeType.webhook_trigger]: {
    badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/50",
    ring: "ring-cyan-500",
  },
  [WorkflowGraphNodeType.http_request]: {
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    border: "border-blue-500/50",
    ring: "ring-blue-500",
  },
  [WorkflowGraphNodeType.delay]: {
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    border: "border-amber-500/50",
    ring: "ring-amber-500",
  },
  [WorkflowGraphNodeType.if]: {
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    border: "border-violet-500/50",
    ring: "ring-violet-500",
  },
  [WorkflowGraphNodeType.end]: {
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    border: "border-slate-500/50",
    ring: "ring-slate-500",
  },
};
