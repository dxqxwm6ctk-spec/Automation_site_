import { describe, expect, it } from "vitest";
import {
  NODE_DEFINITIONS,
  getNodeDefinition,
  isKnownNodeType,
  listNodeDefinitions,
  listNodeDefinitionsByCategory,
} from "./registry";

describe("node registry", () => {
  it("registers all Phase 1.3 node types", () => {
    const ids = NODE_DEFINITIONS.map((definition) => definition.id).sort();
    expect(ids).toEqual(
      [
        "code",
        "delay",
        "end",
        "http_request",
        "if",
        "log",
        "loop",
        "schedule_trigger",
        "set_variable",
        "start",
        "webhook_trigger",
      ].sort(),
    );
  });

  it("gives every node definition a unique id", () => {
    const ids = NODE_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every node definition the fields UI code depends on", () => {
    for (const definition of NODE_DEFINITIONS) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(["trigger", "action", "logic", "control"]).toContain(definition.category);
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(Array.isArray(definition.inputs)).toBe(true);
      expect(Array.isArray(definition.outputs)).toBe(true);
      // defaultConfig must itself be parseable by the schema in "loose" mode
      // (required-but-empty fields are allowed to fail — that's what makes a
      // freshly dragged node incomplete until the user fills it in — but the
      // schema must not throw synchronously on a well-formed object).
      expect(() => definition.configSchema.safeParse(definition.defaultConfig)).not.toThrow();
    }
  });

  it("looks up a known type and returns undefined for an unknown one", () => {
    expect(getNodeDefinition("http_request")?.name).toBe("HTTP Request");
    expect(getNodeDefinition("does_not_exist")).toBeUndefined();
  });

  it("reports known vs. unknown types", () => {
    expect(isKnownNodeType("start")).toBe(true);
    expect(isKnownNodeType("action.http")).toBe(false);
  });

  it("lists all definitions", () => {
    expect(listNodeDefinitions()).toHaveLength(NODE_DEFINITIONS.length);
  });

  it("groups definitions by category", () => {
    const byCategory = listNodeDefinitionsByCategory();
    expect(byCategory.trigger.map((d) => d.id).sort()).toEqual(
      ["schedule_trigger", "start", "webhook_trigger"].sort(),
    );
    expect(byCategory.action.map((d) => d.id).sort()).toEqual(
      ["code", "http_request", "log", "set_variable"].sort(),
    );
    expect(byCategory.logic.map((d) => d.id)).toEqual(["if"]);
    expect(byCategory.control.map((d) => d.id).sort()).toEqual(["delay", "end", "loop"].sort());
  });
});
