import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

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
};
