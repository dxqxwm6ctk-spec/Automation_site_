import { z } from "zod/v4";
import { NodeTimeoutError, type NodeDefinition } from "../types";

export const codeConfigSchema = z.object({
  /**
   * JavaScript code body.  The code runs in `new Function` with `$input`
   * bound to the upstream node's output.  It must return a value (the node's
   * output).
   *
   * Example:  return { doubled: $input.value * 2 };
   *
   * Phase 1.3 deliberate scope note: `new Function` is not a real sandbox
   * (same as the `if` node's condition evaluator).  Full `isolated-vm`
   * sandboxing is slated for Phase 1.7 / Credential Store + Sandbox hardening.
   */
  code: z.string().min(1, "Code is required").default("return $input;"),
  /**
   * Per-node execution timeout in milliseconds (default 10 s, max 30 s).
   * The execution-level 5-minute backstop still applies independently.
   */
  timeout: z
    .number()
    .int("Timeout must be a whole number of milliseconds")
    .positive("Timeout must be greater than 0")
    .max(30_000, "Code node timeout cannot exceed 30 000 ms")
    .default(10_000),
});
export type CodeConfig = z.infer<typeof codeConfigSchema>;

/**
 * Runs arbitrary JavaScript with `$input` bound to the upstream node's
 * output.  The return value of the code block becomes the node's output.
 *
 * The code is wrapped in an async function so top-level `await` is
 * supported; a per-node timeout races against the AbortSignal.
 */
async function runCode(
  code: string,
  input: unknown,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function("$input", `"use strict"; return (async () => { ${code} })();`) as (
    $input: unknown,
  ) => Promise<unknown>;

  const ownTimeout = AbortSignal.timeout(timeoutMs);
  const done = Promise.race([
    fn(input),
    new Promise<never>((_, reject) => {
      // Check already-aborted signals synchronously before installing listeners
      // — addEventListener's "abort" event only fires on *transition*, not
      // when the signal is already in the aborted state.
      if (signal.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new Error("Execution aborted"));
        return;
      }
      if (ownTimeout.aborted) {
        reject(new NodeTimeoutError(`Code node timed out after ${timeoutMs}ms`));
        return;
      }
      function onAbort(this: AbortSignal) {
        if (this === ownTimeout) {
          reject(new NodeTimeoutError(`Code node timed out after ${timeoutMs}ms`));
        } else {
          reject(this.reason instanceof Error ? this.reason : new Error("Execution aborted"));
        }
      }
      ownTimeout.addEventListener("abort", onAbort.bind(ownTimeout), { once: true });
      signal.addEventListener("abort", onAbort.bind(signal), { once: true });
    }),
  ]);

  return done;
}

/** Executes a JavaScript code block with the upstream output bound to `$input`. */
export const codeNode: NodeDefinition<CodeConfig> = {
  id: "code",
  name: "Code",
  description: "Run a JavaScript snippet — `$input` holds the upstream output.",
  category: "action",
  icon: "code-2",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: codeConfigSchema,
  defaultConfig: { code: "return $input;", timeout: 10_000 },
  execute: async ({ config, input, signal }) => ({
    output: await runCode(config.code, input, config.timeout, signal),
  }),
};
