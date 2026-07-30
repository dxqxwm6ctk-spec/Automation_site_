import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
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

const MAX_HISTORY = 50;

type HistorySnapshot = { nodes: FlowNode[]; edges: Edge[] };

/**
 * Owns the workflow editor's canvas state: loads the active version's graph,
 * tracks local edits (nodes/edges/dirty flag), exposes undo/redo history,
 * auto-layout via Dagre, and saves them back as a new workflow version.
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

  // ── History (undo/redo) ────────────────────────────────────────────────────
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  // Increment to force re-renders when history index changes (canUndo/canRedo)
  const [historyStamp, setHistoryStamp] = useState(0);

  // Live refs so pushHistory can read current state without stale closures
  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  function pushHistory(snapshot: HistorySnapshot) {
    // Discard any "future" entries when a new action is taken
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryStamp((s) => s + 1);
  }

  // ── Load workflow ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workflowQuery.data || hasLoadedVersion) return;
    const graph = workflowQuery.data.activeVersion?.graphJson ?? { nodes: [], connections: [] };
    const { nodes: flowNodes, edges: flowEdges } = graphToFlow(graph);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsDirty(false);
    setHasLoadedVersion(true);
    // Seed history with the loaded state so undo can't go further back
    historyRef.current = [{ nodes: flowNodes, edges: flowEdges }];
    historyIndexRef.current = 0;
    setHistoryStamp(0);
  }, [workflowQuery.data, hasLoadedVersion, setNodes, setEdges]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  // ── Change handlers ────────────────────────────────────────────────────────
  const onNodesChange: typeof onNodesChangeBase = useCallback(
    (changes) => {
      onNodesChangeBase(changes);
      const hasSignificantChange = changes.some(
        (c) => c.type === "remove" || (c.type === "position" && !c.dragging),
      );
      if (hasSignificantChange) markDirty();
    },
    [onNodesChangeBase, markDirty],
  );

  /** Push a history snapshot when a drag operation finishes. */
  const onNodeDragStop = useCallback(() => {
    pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
    markDirty();
  }, [markDirty]);

  const onEdgesChange: typeof onEdgesChangeBase = useCallback(
    (changes) => {
      onEdgesChangeBase(changes);
      markDirty();
    },
    [onEdgesChangeBase, markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
      setEdges((current) => addEdge(connection, current));
      markDirty();
    },
    [setEdges, markDirty],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addNode = useCallback(
    (type: NodeTypeId, position: { x: number; y: number }) => {
      pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
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
      pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
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
      pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId((current) => (current === nodeId ? null : current));
      markDirty();
    },
    [setNodes, setEdges, markDirty],
  );

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current];
    setNodes(n);
    setEdges(e);
    setIsDirty(true);
    setHistoryStamp((s) => s + 1);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current];
    setNodes(n);
    setEdges(e);
    setIsDirty(true);
    setHistoryStamp((s) => s + 1);
  }, [setNodes, setEdges]);

  // historyStamp is used as a dependency so these recompute after each push/undo/redo
  const canUndo = historyStamp >= 0 && historyIndexRef.current > 0;
  const canRedo = historyStamp >= 0 && historyIndexRef.current < historyRef.current.length - 1;

  // ── Auto-layout (Dagre LR) ─────────────────────────────────────────────────
  const applyLayout = useCallback(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

    for (const node of nodesRef.current) {
      const measured = node.measured as { width?: number; height?: number } | undefined;
      g.setNode(node.id, { width: measured?.width ?? 200, height: measured?.height ?? 60 });
    }

    for (const edge of edgesRef.current) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    pushHistory({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });

    setNodes((current) =>
      current.map((node) => {
        const layoutNode = g.node(node.id);
        if (!layoutNode) return node;
        const { x, y, width, height } = layoutNode;
        return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
      }),
    );
    markDirty();
  }, [setNodes, markDirty]);

  // ── Derived ────────────────────────────────────────────────────────────────
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

  /** Discards local edits and reloads the currently active version. */
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
    canUndo,
    canRedo,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onConnect,
    addNode,
    updateNodeLabel,
    updateNodeConfig,
    deleteNode,
    selectNode: setSelectedNodeId,
    undo,
    redo,
    applyLayout,
    save,
    reload,
  };
}
