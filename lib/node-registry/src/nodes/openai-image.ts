import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolve(value: string, input: unknown): string {
  if (value.startsWith("=")) {
    const expr = value.slice(1);
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function("$input", `"use strict"; return (${expr});`) as (
        $input: unknown,
      ) => unknown;
      const result = fn(input);
      return result == null ? "" : String(result);
    } catch {
      return "";
    }
  }
  if (value.startsWith("env:")) {
    return process.env[value.slice(4)] ?? "";
  }
  return value;
}

async function urlToBase64(url: string, signal: AbortSignal): Promise<{ base64: string; mimeType: string }> {
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`Failed to fetch image from URL: ${resp.status} ${resp.statusText}`);
  const contentType = resp.headers.get("content-type") ?? "image/png";
  const mimeType = contentType.split(";")[0].trim();
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType };
}

// ─── config schema ────────────────────────────────────────────────────────────

export const openaiImageConfigSchema = z.object({
  /**
   * OpenAI API key.  Use `env:OPENAI_API_KEY` (default) to read from the
   * environment variable.
   */
  apiKey: z.string().default("env:OPENAI_API_KEY"),

  /**
   * Model to use.  `gpt-image-1` supports image editing with a reference photo.
   */
  model: z.enum(["gpt-image-1", "dall-e-3", "dall-e-2"]).default("gpt-image-1"),

  /**
   * `edit` — edit/refine an existing image (requires `imageData`).
   * `generate` — generate from prompt only.
   */
  operation: z.enum(["edit", "generate"]).default("edit"),

  /**
   * Image generation / editing prompt.  Supports `=expr` JS expressions.
   */
  prompt: z.string().default(""),

  /**
   * Source image for edit mode.  Supports `=expr`.
   *  - `https://…` URL — fetched automatically
   *  - `data:image/…;base64,…` data URL
   *  - Raw base64 string
   */
  imageData: z.string().default("=($input?.fileUrl ?? $input?.photoUrl ?? '')"),

  /**
   * Output image size.  Supports `=expr` expressions resolved at runtime.
   * Valid literal values: "1024x1024" | "1024x1536" | "1536x1024".
   */
  size: z.string().default("1024x1024"),

  /**
   * Quality setting (gpt-image-1 only: `low`, `medium`, `high`).
   * Supports `=expr` expressions.
   */
  quality: z.string().default("high"),
});
export type OpenAIImageConfig = z.infer<typeof openaiImageConfigSchema>;

// ─── node definition ──────────────────────────────────────────────────────────

/**
 * Generates or edits an image via the OpenAI Images API.
 *
 * Outputs:
 *  - `out_0` (Success) — carries `imageBase64`, `imageDataUrl`, and `imageUrl` in output.
 *  - `out_1` (Error)   — carries `error` string; does NOT throw, mirrors n8n's
 *                         `onError: "continueErrorOutput"` behaviour.
 */
export const openaiImageNode: NodeDefinition<OpenAIImageConfig> = {
  id: "openai_image",
  name: "OpenAI Image",
  description: "Generate or edit an image using OpenAI gpt-image-1 / DALL-E.",
  category: "action",
  icon: "image",
  inputs: [{ label: "In" }],
  outputs: [
    { id: "out_0", label: "Success" },
    { id: "out_1", label: "Error" },
  ],
  configSchema: openaiImageConfigSchema,
  defaultConfig: {
    apiKey: "env:OPENAI_API_KEY",
    model: "gpt-image-1",
    operation: "edit",
    prompt: "",
    imageData: "=($input?.fileUrl ?? $input?.photoUrl ?? '')",
    size: "1024x1024",
    quality: "high",
  },

  execute: async ({ config, input, signal }) => {
    const apiKey = resolve(config.apiKey, input);
    if (!apiKey) {
      return {
        output: { ...((input as object) ?? {}), error: "OpenAI API key is not configured" },
        branch: "out_1",
      };
    }

    const prompt = resolve(config.prompt, input);
    if (!prompt) {
      return {
        output: { ...((input as object) ?? {}), error: "Prompt is required" },
        branch: "out_1",
      };
    }

    try {
      const formData = new FormData();
      formData.append("model", config.model);
      formData.append("prompt", prompt);
      formData.append("n", "1");
      formData.append("size", config.size);
      if (config.quality !== "standard") {
        formData.append("quality", config.quality);
      }
      formData.append("response_format", "b64_json");

      const endpoint =
        config.operation === "edit"
          ? "https://api.openai.com/v1/images/edits"
          : "https://api.openai.com/v1/images/generations";

      if (config.operation === "edit") {
        const imageRef = resolve(config.imageData, input);
        if (!imageRef) {
          return {
            output: { ...((input as object) ?? {}), error: "imageData is required for edit operation" },
            branch: "out_1",
          };
        }

        let base64Data: string;
        let mimeType = "image/png";

        if (imageRef.startsWith("data:")) {
          const match = imageRef.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          } else {
            base64Data = imageRef;
          }
        } else if (imageRef.startsWith("http")) {
          const fetched = await urlToBase64(imageRef, signal);
          base64Data = fetched.base64;
          mimeType = fetched.mimeType;
        } else {
          // assume raw base64
          base64Data = imageRef;
        }

        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        formData.append("image", blob, "image.png");
      }

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal,
      });

      if (!resp.ok) {
        const errBody = (await resp.json().catch(() => ({ error: { message: resp.statusText } }))) as {
          error?: { message?: string };
        };
        const msg = errBody?.error?.message ?? resp.statusText;
        return {
          output: { ...((input as object) ?? {}), error: `OpenAI API error: ${msg}` },
          branch: "out_1",
        };
      }

      const json = (await resp.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };

      const imageItem = json.data?.[0];
      if (!imageItem) {
        return {
          output: { ...((input as object) ?? {}), error: "OpenAI returned no image data" },
          branch: "out_1",
        };
      }

      const imageBase64 = imageItem.b64_json ?? null;
      const imageUrl = imageItem.url ?? null;
      const imageDataUrl = imageBase64 ? `data:image/png;base64,${imageBase64}` : null;

      return {
        output: {
          ...((input as object) ?? {}),
          imageBase64,
          imageUrl,
          imageDataUrl,
        },
        branch: "out_0",
      };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: { ...((input as object) ?? {}), error: message },
        branch: "out_1",
      };
    }
  },
};
