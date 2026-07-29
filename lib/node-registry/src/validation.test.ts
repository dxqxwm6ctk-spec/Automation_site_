import { describe, expect, it } from "vitest";
import { validateNodeConfig, validateWorkflowGraph } from "./validation";

describe("validateNodeConfig", () => {
  it("accepts a valid http_request config", () => {
    const result = validateNodeConfig("http_request", {
      method: "POST",
      url: "https://example.com/webhook",
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects an http_request config with a missing/invalid url", () => {
    const result = validateNodeConfig("http_request", { method: "GET", url: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "url" }),
    );
  });

  it("rejects an unknown node type without throwing", () => {
    const result = validateNodeConfig("action.http", {});
    expect(result).toEqual({
      valid: false,
      errors: [{ field: "type", message: 'Unknown node type: "action.http"' }],
    });
  });

  it("accepts an empty config for start/end", () => {
    expect(validateNodeConfig("start", {}).valid).toBe(true);
    expect(validateNodeConfig("end", undefined).valid).toBe(true);
  });

  it("rejects a webhook_trigger with a malformed path", () => {
    const result = validateNodeConfig("webhook_trigger", { path: "no-leading-slash" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("path");
  });

  it("rejects an if node with a blank condition", () => {
    const result = validateNodeConfig("if", { condition: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "condition" }));
  });

  it("rejects a negative delay duration", () => {
    const result = validateNodeConfig("delay", { durationMs: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "durationMs" }));
  });
});

describe("validateWorkflowGraph", () => {
  it("passes an empty graph", () => {
    expect(validateWorkflowGraph({ nodes: [], connections: [] })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("passes a graph of well-formed nodes", () => {
    const result = validateWorkflowGraph({
      nodes: [
        { key: "a", type: "start", config: {} },
        { key: "b", type: "http_request", config: { method: "GET", url: "https://example.com" } },
        { key: "c", type: "end", config: {} },
      ],
      connections: [],
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("collects one error per invalid field, tagged with the owning node's key", () => {
    const result = validateWorkflowGraph({
      nodes: [
        { key: "http_1", type: "http_request", config: { url: "" } },
        { key: "if_1", type: "if", config: {} },
      ],
      connections: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ nodeId: "http_1", field: "url" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ nodeId: "if_1", field: "condition" }),
    );
  });

  it("flags a node with an unregistered type", () => {
    const result = validateWorkflowGraph({
      nodes: [{ key: "http_1", type: "action.http", config: {} }],
      connections: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { nodeId: "http_1", field: "type", message: 'Unknown node type: "action.http"' },
    ]);
  });

  it("flags a node missing a type, falling back to a positional id", () => {
    const result = validateWorkflowGraph({ nodes: [{ key: "x" }], connections: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { nodeId: "x", field: "type", message: "Node type is required" },
    ]);
  });
});
