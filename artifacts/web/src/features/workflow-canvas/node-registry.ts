import {
  CheckCircle2,
  Clock,
  GitBranch,
  Globe,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { WorkflowGraphNodeType } from "@workspace/api-client-react";
import type { WorkflowGraphNodeConfig } from "@workspace/api-client-react";

export type NodeTypeId = (typeof WorkflowGraphNodeType)[keyof typeof WorkflowGraphNodeType];

export const NODE_TYPE_LIST: NodeTypeId[] = [
  WorkflowGraphNodeType.start,
  WorkflowGraphNodeType.http_request,
  WorkflowGraphNodeType.delay,
  WorkflowGraphNodeType.if,
  WorkflowGraphNodeType.end,
];

/** A single output the node can connect from. `id` maps to React Flow's handle id / the graph connection's sourceHandle. */
export interface NodeOutputDef {
  id?: string;
  label: string;
}

export interface NodeDefinition {
  type: NodeTypeId;
  label: string;
  description: string;
  icon: LucideIcon;
  hasInput: boolean;
  outputs: NodeOutputDef[];
  defaultConfig: WorkflowGraphNodeConfig;
}

/** Fully literal Tailwind class strings (no dynamic interpolation) so the compiler can see and keep them. */
export interface NodeColorClasses {
  badge: string;
  border: string;
  ring: string;
}

export const NODE_DEFINITIONS: Record<NodeTypeId, NodeDefinition> = {
  [WorkflowGraphNodeType.start]: {
    type: WorkflowGraphNodeType.start,
    label: "Start",
    description: "Entry point of the workflow. Every run begins here.",
    icon: PlayCircle,
    hasInput: false,
    outputs: [{ label: "Next" }],
    defaultConfig: {},
  },
  [WorkflowGraphNodeType.http_request]: {
    type: WorkflowGraphNodeType.http_request,
    label: "HTTP Request",
    description: "Call an external API and capture the response.",
    icon: Globe,
    hasInput: true,
    outputs: [{ label: "Next" }],
    defaultConfig: { method: "GET", url: "", headers: {}, body: "" },
  },
  [WorkflowGraphNodeType.delay]: {
    type: WorkflowGraphNodeType.delay,
    label: "Delay",
    description: "Pause the workflow for a fixed duration.",
    icon: Clock,
    hasInput: true,
    outputs: [{ label: "Next" }],
    defaultConfig: { durationSeconds: 5 },
  },
  [WorkflowGraphNodeType.if]: {
    type: WorkflowGraphNodeType.if,
    label: "If",
    description: "Branch the workflow based on a condition.",
    icon: GitBranch,
    hasInput: true,
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    defaultConfig: { condition: "" },
  },
  [WorkflowGraphNodeType.end]: {
    type: WorkflowGraphNodeType.end,
    label: "End",
    description: "Terminates the workflow run.",
    icon: CheckCircle2,
    hasInput: true,
    outputs: [],
    defaultConfig: {},
  },
};

export const NODE_COLOR_CLASSES: Record<NodeTypeId, NodeColorClasses> = {
  [WorkflowGraphNodeType.start]: {
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/50",
    ring: "ring-emerald-500",
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
