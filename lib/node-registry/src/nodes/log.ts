import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

export const logLevels = ["info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export const logConfigSchema = z.object({
  /**
   * Message to log.  Supports simple `{{expression}}` interpolation where
   * `expression` is evaluated with `$input` in scope.
   *
   * Example:  "Status: {{$input.statusCode}}"
   * Example:  "Got {{$input.items.length}} items"
   * Plain text (no `{{}}`) is logged verbatim.
   */
  message: z.string().min(1, "Message is required").default("{{$input}}"),
  level: z.enum(logLevels).default("info"),
});
export type LogConfig = z.infer<typeof logConfigSchema>;

const INTERPOLATION_RE = /\{\{(.+?)\}\}/g;

/** Replaces `{{ expression }}` placeholders by evaluating each against `$input`. */
function interpolate(template: string, input: unknown): string {
  return template.replace(INTERPOLATION_RE, (_, expr: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function("$input", `"use strict"; return (${expr.trim()});`) as (
        $input: unknown,
      ) => unknown;
      const value = fn(input);
      return value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    } catch {
      return `{{${expr}}}`;
    }
  });
}

/**
 * Logs a message (with optional `{{ expression }}` interpolation) and
 * passes the upstream input through unchanged.
 */
export const logNode: NodeDefinition<LogConfig> = {
  id: "log",
  name: "Log",
  description: "Log a message — supports `{{ $input.field }}` interpolation.",
  category: "action",
  icon: "terminal",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: logConfigSchema,
  defaultConfig: { message: "{{$input}}", level: "info" },
  execute: async ({ config, input }) => {
    const message = interpolate(config.message, input);
    // Write to the standard Node.js console so the message appears in the
    // API server's process log and the execution_logs.output captures it.
    console[config.level](`[FlowForge Log] ${message}`);
    return { output: { message, level: config.level, input } };
  },
};
