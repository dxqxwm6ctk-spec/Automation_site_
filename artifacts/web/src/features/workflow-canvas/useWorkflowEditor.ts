import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import {
  getGetWorkflowQueryKey,
  useGetWorkflow,
  useSaveWorkflowVersion,
} from "@workspace/api-client-react";
import { flowToGraph, graphToFlow } from "./graph-transform";
import { NODE_DEFINITIONS, type NodeTypeId } from "./node-registry";
import type { FlowNode } from "./types";

let nodeKeySequence = 0;

/** Stable-enough unique key for a brand new canvas node; the API only requires uniqueness within the graph. */
function generateNodeKey(type: NodeTypeId): string {
  nodeKeySequence += 1;
  return `${type}_${Date.now().toString(36)}_${nodeKeySequence}`;
}

/**
 * Owns the workflow editor's canvas state: loads the active version's graph,
 * tracks local edits (nodes/edges/dirty flag), and saves them back as a new
 * workflow version through the generated API hooks.
 */
export function useWorkflowEditor(workflowId: string) {
  const queryClient = useQueryClient();
  const workflowQuery = useGetWorkflow(workflowId, {
    query: {
      enabled: Boolean(workflowId),
      queryKey: getGetWorkflowQueryKey(workflowId),
    },
  });

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [hasLoadedVersion, setHasLoadedVersion] = useState(false);

  useEffect(() => {
    if (!workflowQuery.data || hasLoadedVersion) return;
    const graph = workflowQuery.data.activeVersion?.graphJson ?? { nodes: [], connections: [] };
    const { nodes: flowNodes, edges: flowEdges } = graphToFlow(graph);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsDirty(false);
    setHasLoadedVersion(true);
  }, [workflowQuery.data, hasLoadedVersion, setNodes, setEdges]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const onNodesChange: typeof onNodesChangeBase = useCallback(
    (changes) => {
      onNodesChangeBase(changes);
      markDirty();
    },
    [onNodesChangeBase, markDirty],
  );

  const onEdgesChange: typeof onEdgesChangeBase = useCallback(
    (changes) => {
      onEdgesChangeBase(changes);
      markDirty();
    },
    [onEdgesChangeBase, markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge(connection, current));
      markDirty();
    },
    [setEdges, markDirty],
  );

  const addNode = useCallback(
    (type: NodeTypeId, position: { x: number; y: number }) => {
      const definition = NODE_DEFINITIONS[type];
      const key = generateNodeKey(type);
      const newNode: FlowNode = {
        id: key,
        type,
        position,
        data: { nodeType: type, label: definition.label, config: { ...definition.defaultConfig } },
      };
      setNodes((current) => [...current, newNode]);
      setSelectedNodeId(key);
      markDirty();
    },
    [setNodes, markDirty],
  );

  const updateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, label } } : node)),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const updateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, config } } : node)),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId((current) => (current === nodeId ? null : current));
      markDirty();
    },
    [setNodes, setEdges, markDirty],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const saveVersionMutation = useSaveWorkflowVersion();

  const save = useCallback(async () => {
    const graph = flowToGraph(nodes, edges);
    const result = await saveVersionMutation.mutateAsync({ workflowId, data: { graph } });
    setIsDirty(false);
    await queryClient.invalidateQueries({ queryKey: getGetWorkflowQueryKey(workflowId) });
    return result;
  }, [nodes, edges, saveVersionMutation, workflowId, queryClient]);

  /** Discards local edits and reloads the currently active version — used after restoring a past version. */
  const reload = useCallback(async () => {
    setHasLoadedVersion(false);
    await workflowQuery.refetch();
  }, [workflowQuery]);

  return {
    workflow: workflowQuery.data?.workflow ?? null,
    isLoading: workflowQuery.isLoading,
    isError: workflowQuery.isError,
    nodes,
    edges,
    selectedNode,
    isDirty,
    isSaving: saveVersionMutation.isPending,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeLabel,
    updateNodeConfig,
    deleteNode,
    selectNode: setSelectedNodeId,
    save,
    reload,
  };
}
