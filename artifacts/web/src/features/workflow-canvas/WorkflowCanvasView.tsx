import { useCallback, useMemo, type DragEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasNode } from "./CanvasNode";
import { WORKFLOW_NODE_DND_TYPE } from "./NodePalette";
import { NODE_TYPE_LIST, type NodeTypeId } from "./node-registry";
import type { FlowNode } from "./types";

interface WorkflowCanvasViewProps {
  nodes: FlowNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onAddNode: (type: NodeTypeId, position: { x: number; y: number }) => void;
  onNodeClick: (nodeId: string) => void;
  onPaneClick: () => void;
}

function WorkflowCanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onAddNode,
  onNodeClick,
  onPaneClick,
}: WorkflowCanvasViewProps) {
  const { screenToFlowPosition } = useReactFlow();

  // Every registered node type renders through the same generic CanvasNode —
  // derived from the registry's type list so a new node type never needs a
  // manual entry here.
  const nodeTypes = useMemo(
    () => Object.fromEntries(NODE_TYPE_LIST.map((type) => [type, CanvasNode])),
    [],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(WORKFLOW_NODE_DND_TYPE) as NodeTypeId | "";
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddNode(type, position);
    },
    [onAddNode, screenToFlowPosition],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div className="relative flex-1" data-testid="canvas-workflow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onNodeClick={(_event, node) => onNodeClick(node.id)}
        onPaneClick={onPaneClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>
    </div>
  );
}

/** Public entry point — wraps the canvas in its own ReactFlowProvider so screenToFlowPosition works. */
export function WorkflowCanvasView(props: WorkflowCanvasViewProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
