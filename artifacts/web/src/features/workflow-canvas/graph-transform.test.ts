import { describe, expect, it } from "vitest";
import type { WorkflowGraph } from "@workspace/api-client-react";
import { flowToGraph, graphToFlow } from "./graph-transform";

const SAMPLE_GRAPH: WorkflowGraph = {
  nodes: [
    {
      key: "n1",
      type: "start",
      label: "Start",
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      key: "n2",
      type: "if",
      label: "Check status",
      position: { x: 260, y: 0 },
      config: { condition: "{{previous.status}} == 200" },
    },
    {
      key: "n3",
      type: "http_request",
      label: "Notify success",
      position: { x: 520, y: -80 },
      config: { method: "POST", url: "https://example.com/hook" },
    },
    {
      key: "n4",
      type: "end",
      label: "End",
      position: { x: 780, y: 0 },
      config: {},
    },
  ],
  connections: [
    { sourceKey: "n1", sourceHandle: null, targetKey: "n2", targetHandle: null },
    { sourceKey: "n2", sourceHandle: "true", targetKey: "n3", targetHandle: null },
    { sourceKey: "n2", sourceHandle: "false", targetKey: "n4", targetHandle: null },
    { sourceKey: "n3", sourceHandle: null, targetKey: "n4", targetHandle: null },
  ],
};

describe("graphToFlow", () => {
  it("maps every API node to a React Flow node preserving id, type, position and config", () => {
    const { nodes } = graphToFlow(SAMPLE_GRAPH);

    expect(nodes).toHaveLength(4);
    const ifNode = nodes.find((n) => n.id === "n2");
    expect(ifNode).toMatchObject({
      id: "n2",
      type: "if",
      position: { x: 260, y: 0 },
      data: {
        nodeType: "if",
        label: "Check status",
        config: { condition: "{{previous.status}} == 200" },
      },
    });
  });

  it("falls back to a grid position when the API node has none", () => {
    const graph: WorkflowGraph = {
      nodes: [{ key: "a", type: "start", config: {} }],
      connections: [],
    };
    const { nodes } = graphToFlow(graph);
    expect(nodes[0].position).toEqual({ x: 120, y: 120 });
  });

  it("falls back to the registry label when the API node has none", () => {
    const graph: WorkflowGraph = {
      nodes: [{ key: "a", type: "end", config: {} }],
      connections: [],
    };
    const { nodes } = graphToFlow(graph);
    expect(nodes[0].data.label).toBe("End");
  });

  it("maps connections to edges, preserving distinct source handles for branching nodes", () => {
    const { edges } = graphToFlow(SAMPLE_GRAPH);

    expect(edges).toHaveLength(4);
    const trueBranch = edges.find((e) => e.source === "n2" && e.sourceHandle === "true");
    const falseBranch = edges.find((e) => e.source === "n2" && e.sourceHandle === "false");
    expect(trueBranch?.target).toBe("n3");
    expect(falseBranch?.target).toBe("n4");
    expect(trueBranch?.id).not.toBe(falseBranch?.id);
  });

  it("produces stable, unique edge ids so React Flow never collides two connections", () => {
    const { edges } = graphToFlow(SAMPLE_GRAPH);
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.size).toBe(edges.length);
  });
});

describe("flowToGraph", () => {
  it("round-trips graphToFlow output back into an equivalent WorkflowGraph", () => {
    const { nodes, edges } = graphToFlow(SAMPLE_GRAPH);
    const roundTripped = flowToGraph(nodes, edges);

    expect(roundTripped.nodes).toHaveLength(SAMPLE_GRAPH.nodes.length);
    expect(roundTripped.connections).toHaveLength(SAMPLE_GRAPH.connections.length);

    for (const original of SAMPLE_GRAPH.nodes) {
      const rebuilt = roundTripped.nodes.find((n) => n.key === original.key);
      expect(rebuilt).toMatchObject({
        key: original.key,
        type: original.type,
        label: original.label,
        position: original.position,
        config: original.config,
      });
    }

    for (const original of SAMPLE_GRAPH.connections) {
      const rebuilt = roundTripped.connections.find(
        (c) => c.sourceKey === original.sourceKey && c.targetKey === original.targetKey,
      );
      expect(rebuilt).toMatchObject(original);
    }
  });

  it("normalizes an undefined sourceHandle/targetHandle to null for the API", () => {
    const graph = flowToGraph(
      [
        {
          id: "a",
          type: "start",
          position: { x: 0, y: 0 },
          data: { nodeType: "start", label: "Start", config: {} },
        },
      ],
      [{ id: "e1", source: "a", target: "a" }],
    );

    expect(graph.connections[0].sourceHandle).toBeNull();
    expect(graph.connections[0].targetHandle).toBeNull();
  });
});
