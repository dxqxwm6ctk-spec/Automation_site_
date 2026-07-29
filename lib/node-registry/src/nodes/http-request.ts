import { z } from "zod/v4";
import { NodeTimeoutError, type NodeDefinition } from "../types";

export const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export const httpRequestAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("basic"),
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),
  z.object({
    type: z.literal("bearer"),
    token: z.string().min(1, "Token is required"),
  }),
  // Resolved to a concrete "basic" | "bearer" shape by the api-server's
  // engine (see engine/nodeRunner.ts) before execute() ever runs — the
  // registry package stays DB-agnostic (it's also imported by the browser
  // bundle), so this variant only carries a reference, never secret data.
  z.object({
    type: z.literal("credential"),
    credentialId: z.string().min(1, "Credential is required"),
  }),
]);
export type HttpRequestAuth = z.infer<typeof httpRequestAuthSchema>;

export const httpRequestConfigSchema = z.object({
  method: z.enum(httpMethods).default("GET"),
  url: z.string().min(1, "URL is required").url("Invalid URL"),
  headers: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.string()).default({}),
  body: z.string().default(""),
  timeout: z
    .number()
    .int("Timeout must be a whole number of milliseconds")
    .positive("Timeout must be greater than 0")
    .max(300_000, "Timeout cannot exceed 300000ms (5 minutes)")
    .default(30_000),
  auth: httpRequestAuthSchema.default({ type: "none" }),
});
export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>;

function buildUrl(url: string, queryParams: Record<string, string>): string {
  const entries = Object.entries(queryParams);
  if (entries.length === 0) return url;
  const target = new URL(url);
  for (const [key, value] of entries) target.searchParams.set(key, value);
  return target.toString();
}

function applyAuth(headers: Record<string, string>, auth: HttpRequestAuth): void {
  if (auth.type === "basic") {
    headers["Authorization"] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
  } else if (auth.type === "bearer") {
    headers["Authorization"] = `Bearer ${auth.token}`;
  } else if (auth.type === "credential") {
    // The engine resolves "credential" auth into a concrete basic/bearer
    // shape before calling execute() (see engine/nodeRunner.ts). Reaching
    // this branch means that resolution step was skipped.
    throw new Error(
      "HTTP Request credential auth was not resolved before execution — this is an engine bug, not a user error",
    );
  }
}

/**
 * A non-2xx HTTP response is still a *successful* node execution — the node
 * only errors on a network-level failure (DNS, connection refused, timeout).
 * This lets a downstream "if" node branch on status code.
 */
async function performRequest(
  config: HttpRequestConfig,
  signal: AbortSignal,
): Promise<{ statusCode: number; headers: Record<string, string>; body: unknown }> {
  const url = buildUrl(config.url, config.queryParams);
  const headers: Record<string, string> = { ...config.headers };
  applyAuth(headers, config.auth);
  const hasBody = config.body !== "" && config.method !== "GET";

  // The node's own configurable timeout (default 30s, max 5 min) is combined
  // with the shared execution signal — whichever fires first wins. Only the
  // node's own timer should surface as a NodeTimeoutError; if the shared
  // signal fired instead (cancel or execution-level timeout), the engine
  // classifies that itself, so it's left as a plain abort here.
  const ownTimeout = AbortSignal.timeout(config.timeout);
  const combined = AbortSignal.any([signal, ownTimeout]);

  let response: Response;
  try {
    response = await fetch(url, {
      method: config.method,
      headers,
      body: hasBody ? config.body : undefined,
      signal: combined,
    });
  } catch (err) {
    if (ownTimeout.aborted && !signal.aborted) {
      throw new NodeTimeoutError(`HTTP request to ${url} timed out after ${config.timeout}ms`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let body: unknown = text;
  if (contentType.includes("application/json") && text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // Server lied about the content type — fall back to raw text.
      body = text;
    }
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

/** Calls an external API and captures the response. */
export const httpRequestNode: NodeDefinition<HttpRequestConfig> = {
  id: "http_request",
  name: "HTTP Request",
  description: "Call an external API and capture the response.",
  category: "action",
  icon: "globe",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Next" }],
  configSchema: httpRequestConfigSchema,
  defaultConfig: {
    method: "GET",
    url: "",
    headers: {},
    queryParams: {},
    body: "",
    timeout: 30_000,
    auth: { type: "none" },
  },
  execute: async ({ config, signal }) => ({ output: await performRequest(config, signal) }),
};
