/**
 * Execution behaviour tests for the five Phase 1.3 node types that were
 * added after the initial set (start / webhook_trigger / http_request /
 * delay / if / end):
 *
 *   schedule_trigger  — pass-through trigger
 *   code              — JS sandbox via new Function, per-node timeout
 *   set_variable      — expression eval + key merge onto output object
 *   log               — template interpolation, structured output, pass-through
 *   loop              — items expression, maxIterations cap
 */
import { describe, expect, it } from "vitest";
import { scheduleTriggerNode } from "./schedule-trigger";
import { codeNode } from "./code";
import { setVariableNode } from "./set-variable";
import { logNode } from "./log";
import { loopNode } from "./loop";
import { NodeTimeoutError } from "../types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Non-aborted signal for tests that don't need cancellation. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Already-aborted signal for testing abort propagation. */
function abortedSignal(): AbortSignal {
  const ac = new AbortController();
  ac.abort(new Error("Aborted"));
  return ac.signal;
}

// ---------------------------------------------------------------------------
// Schedule Trigger
// ---------------------------------------------------------------------------

describe("scheduleTriggerNode.execute", () => {
  it("passes the trigger payload through unchanged", async () => {
    const payload = { event: "scheduled_run", runAt: "2025-01-01T00:00:00Z" };
    const result = await scheduleTriggerNode.execute!({
      config: { cronExpression: "0 * * * *", timezone: "UTC" },
      input: payload,
      signal: liveSignal(),
    });
    expect(result.output).toEqual(payload);
  });

  it("returns null when input is null (cold manual trigger)", async () => {
    const result = await scheduleTriggerNode.execute!({
      config: { cronExpression: "*/5 * * * *", timezone: "America/New_York" },
      input: null,
      signal: liveSignal(),
    });
    expect(result.output).toBeNull();
  });

  it("does not set a branch (single unconditional output)", async () => {
    const result = await scheduleTriggerNode.execute!({
      config: { cronExpression: "0 9 * * 1-5", timezone: "UTC" },
      input: { foo: "bar" },
      signal: liveSignal(),
    });
    expect(result.branch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Code node
// ---------------------------------------------------------------------------

describe("codeNode.execute", () => {
  it("doubles a number via $input", async () => {
    const result = await codeNode.execute!({
      config: { code: "return $input * 2;", timeout: 10_000 },
      input: 21,
      signal: liveSignal(),
    });
    expect(result.output).toBe(42);
  });

  it("passes the upstream object through with return $input", async () => {
    const input = { name: "Alice", score: 99 };
    const result = await codeNode.execute!({
      config: { code: "return $input;", timeout: 10_000 },
      input,
      signal: liveSignal(),
    });
    expect(result.output).toEqual(input);
  });

  it("can access nested properties of $input", async () => {
    const result = await codeNode.execute!({
      config: { code: "return $input.items.length;", timeout: 10_000 },
      input: { items: [1, 2, 3] },
      signal: liveSignal(),
    });
    expect(result.output).toBe(3);
  });

  it("supports async code with top-level await style", async () => {
    const result = await codeNode.execute!({
      config: {
        code: "const val = await Promise.resolve($input.value + 1); return val;",
        timeout: 10_000,
      },
      input: { value: 10 },
      signal: liveSignal(),
    });
    expect(result.output).toBe(11);
  });

  it("throws when the code itself throws", async () => {
    await expect(
      codeNode.execute!({
        config: { code: 'throw new Error("boom");', timeout: 10_000 },
        input: null,
        signal: liveSignal(),
      }),
    ).rejects.toThrow("boom");
  });

  it("throws a NodeTimeoutError when code exceeds its configured timeout", async () => {
    // A tight 50 ms timeout so the test doesn't block long.
    await expect(
      codeNode.execute!({
        config: {
          code: "await new Promise(r => setTimeout(r, 5000));",
          timeout: 50,
        },
        input: null,
        signal: liveSignal(),
      }),
    ).rejects.toThrow(NodeTimeoutError);
  }, 3_000);

  it("rejects promptly when the abort signal is already fired", async () => {
    await expect(
      codeNode.execute!({
        config: {
          code: "await new Promise(r => setTimeout(r, 5000));",
          timeout: 10_000,
        },
        input: null,
        signal: abortedSignal(),
      }),
    ).rejects.toThrow();
  }, 2_000);
});

// ---------------------------------------------------------------------------
// Set Variable node
// ---------------------------------------------------------------------------

describe("setVariableNode.execute", () => {
  it("merges the new key onto an existing object", async () => {
    const result = await setVariableNode.execute!({
      config: { variableName: "doubled", valueExpression: "$input.n * 2" },
      input: { n: 5 },
      signal: liveSignal(),
    });
    expect(result.output).toEqual({ n: 5, doubled: 10 });
  });

  it("creates a plain object when input is null", async () => {
    const result = await setVariableNode.execute!({
      config: { variableName: "greeting", valueExpression: '"hello"' },
      input: null,
      signal: liveSignal(),
    });
    expect(result.output).toEqual({ greeting: "hello" });
  });

  it("creates a plain object when input is a primitive", async () => {
    const result = await setVariableNode.execute!({
      config: { variableName: "raw", valueExpression: "$input" },
      input: 42,
      signal: liveSignal(),
    });
    // Primitives are not spread — only the new key appears.
    expect(result.output).toEqual({ raw: 42 });
  });

  it("overwrites an existing key when variable names clash", async () => {
    const result = await setVariableNode.execute!({
      config: { variableName: "status", valueExpression: '"ok"' },
      input: { status: "pending", id: 7 },
      signal: liveSignal(),
    });
    expect(result.output).toEqual({ status: "ok", id: 7 });
  });

  it("supports a boolean expression result", async () => {
    const result = await setVariableNode.execute!({
      config: { variableName: "isAdult", valueExpression: "$input.age >= 18" },
      input: { age: 20 },
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).isAdult).toBe(true);
  });

  it("throws when the expression is syntactically invalid", async () => {
    await expect(
      setVariableNode.execute!({
        config: { variableName: "x", valueExpression: "(((" },
        input: null,
        signal: liveSignal(),
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Log node
// ---------------------------------------------------------------------------

describe("logNode.execute", () => {
  it("returns the rendered message in the output", async () => {
    const result = await logNode.execute!({
      config: { message: "Hello world", level: "info" },
      input: null,
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).message).toBe("Hello world");
    expect((result.output as Record<string, unknown>).level).toBe("info");
  });

  it("interpolates {{ $input.field }} expressions", async () => {
    const result = await logNode.execute!({
      config: { message: "Status: {{$input.statusCode}}", level: "info" },
      input: { statusCode: 200 },
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).message).toBe("Status: 200");
  });

  it("interpolates multiple placeholders in a single message", async () => {
    const result = await logNode.execute!({
      config: {
        message: "User {{$input.name}} has {{$input.items.length}} items",
        level: "warn",
      },
      input: { name: "Alice", items: [1, 2, 3] },
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).message).toBe(
      "User Alice has 3 items",
    );
  });

  it("serialises an object placeholder to JSON", async () => {
    const result = await logNode.execute!({
      config: { message: "Payload: {{$input}}", level: "info" },
      input: { key: "value" },
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).message).toBe(
      'Payload: {"key":"value"}',
    );
  });

  it("leaves a broken expression as a literal {{ }} in the output", async () => {
    const result = await logNode.execute!({
      config: { message: "Val: {{(((}}", level: "info" },
      input: null,
      signal: liveSignal(),
    });
    // Broken expression renders unchanged, does not throw.
    expect((result.output as Record<string, unknown>).message).toContain("{{");
  });

  it("passes the original input through in the output", async () => {
    const input = { id: 42 };
    const result = await logNode.execute!({
      config: { message: "test", level: "error" },
      input,
      signal: liveSignal(),
    });
    expect((result.output as Record<string, unknown>).input).toEqual(input);
  });

  it("does not set a branch", async () => {
    const result = await logNode.execute!({
      config: { message: "x", level: "info" },
      input: null,
      signal: liveSignal(),
    });
    expect(result.branch).toBeUndefined();
  });

  it("supports warn and error log levels", async () => {
    for (const level of ["warn", "error"] as const) {
      const result = await logNode.execute!({
        config: { message: "msg", level },
        input: null,
        signal: liveSignal(),
      });
      expect((result.output as Record<string, unknown>).level).toBe(level);
    }
  });
});

// ---------------------------------------------------------------------------
// Loop node
// ---------------------------------------------------------------------------

describe("loopNode.execute", () => {
  it("extracts an array from $input and returns { items, count }", async () => {
    const result = await loopNode.execute!({
      config: { itemsExpression: "$input.results", maxIterations: 100 },
      input: { results: ["a", "b", "c"] },
      signal: liveSignal(),
    });
    expect(result.output).toEqual({ items: ["a", "b", "c"], count: 3 });
  });

  it("caps the array at maxIterations", async () => {
    const result = await loopNode.execute!({
      config: { itemsExpression: "$input", maxIterations: 2 },
      input: [10, 20, 30, 40],
      signal: liveSignal(),
    });
    expect((result.output as { count: number }).count).toBe(2);
    expect((result.output as { items: unknown[] }).items).toEqual([10, 20]);
  });

  it("handles an empty array", async () => {
    const result = await loopNode.execute!({
      config: { itemsExpression: "$input.items", maxIterations: 100 },
      input: { items: [] },
      signal: liveSignal(),
    });
    expect(result.output).toEqual({ items: [], count: 0 });
  });

  it("supports a map expression as the itemsExpression", async () => {
    const result = await loopNode.execute!({
      config: {
        itemsExpression: "$input.users.map(u => u.id)",
        maxIterations: 100,
      },
      input: { users: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      signal: liveSignal(),
    });
    expect((result.output as { items: number[] }).items).toEqual([1, 2, 3]);
  });

  it("throws when the expression does not return an array", async () => {
    await expect(
      loopNode.execute!({
        config: { itemsExpression: "$input.count", maxIterations: 100 },
        input: { count: 42 },
        signal: liveSignal(),
      }),
    ).rejects.toThrow("did not return an array");
  });

  it("throws when the expression throws", async () => {
    await expect(
      loopNode.execute!({
        config: { itemsExpression: "$input.missing.deep", maxIterations: 100 },
        input: null,
        signal: liveSignal(),
      }),
    ).rejects.toThrow();
  });

  it("does not set a branch", async () => {
    const result = await loopNode.execute!({
      config: { itemsExpression: "$input", maxIterations: 10 },
      input: [1, 2],
      signal: liveSignal(),
    });
    expect(result.branch).toBeUndefined();
  });
});
