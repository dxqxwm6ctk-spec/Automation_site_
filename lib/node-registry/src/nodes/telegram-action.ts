import { z } from "zod/v4";
import type { NodeDefinition } from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves a config string that may be:
 *   - A JS expression (starts with `=`): evaluated with `$input` in scope.
 *   - An env-var reference (`env:VAR_NAME`): read from `process.env`.
 *   - A plain literal string.
 */
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

function telegramApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(telegramApiUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API error (${method}): ${json.description ?? "unknown error"}`);
  }
  return json.result;
}

// ─── config schema ────────────────────────────────────────────────────────────

export const telegramOperations = [
  "send_message",
  "send_photo",
  "answer_callback_query",
  "get_file",
] as const;
export type TelegramOperation = (typeof telegramOperations)[number];

export const telegramActionConfigSchema = z.object({
  /**
   * Bot token literal or `env:VAR_NAME` reference.
   * Default reads from `TELEGRAM_BOT_TOKEN` environment variable.
   */
  botToken: z.string().default("env:TELEGRAM_BOT_TOKEN"),

  /** Which Telegram Bot API method to call. */
  operation: z.enum(telegramOperations).default("send_message"),

  // ── send_message / send_photo ─────────────────────────────────────────────
  /** Chat id. Supports `=expr` expressions. */
  chatId: z.string().default(""),

  // ── send_message ─────────────────────────────────────────────────────────
  /** Message text. Supports `=expr`. */
  text: z.string().default(""),
  /** Telegram parse mode for text formatting. */
  parseMode: z.enum(["none", "HTML", "Markdown", "MarkdownV2"]).default("none"),

  // ── send_photo ────────────────────────────────────────────────────────────
  /**
   * Photo to send.  Supports `=expr`.  Accepted values:
   *  - A data URL (`data:image/png;base64,...`) — uploaded as multipart
   *  - A raw base64 string (≥100 chars) — treated as PNG, uploaded
   *  - An https:// URL — sent directly to Telegram
   *  - A Telegram file_id
   */
  photoData: z.string().default(""),
  /** Caption for the photo. Supports `=expr`. */
  caption: z.string().default(""),
  /**
   * Inline keyboard JSON (Telegram InlineKeyboardMarkup).
   * Example: `{"inline_keyboard":[[{"text":"Regenerate","callback_data":"regen"}]]}`
   * Supports `=expr`.
   */
  replyMarkup: z.string().default(""),
  /** Message id to reply to. Supports `=expr`. */
  replyToMessageId: z.string().default(""),

  // ── answer_callback_query ─────────────────────────────────────────────────
  /** Callback query id. Supports `=expr`. */
  callbackQueryId: z.string().default(""),
  /** Notification text for the callback answer. Supports `=expr`. */
  callbackText: z.string().default(""),

  // ── get_file ──────────────────────────────────────────────────────────────
  /**
   * Telegram file_id to retrieve.  Supports `=expr`.
   * The output includes `fileUrl` (the full download URL) and `filePath`.
   */
  fileId: z.string().default(""),
});
export type TelegramActionConfig = z.infer<typeof telegramActionConfigSchema>;

// ─── node definition ──────────────────────────────────────────────────────────

export const telegramActionNode: NodeDefinition<TelegramActionConfig> = {
  id: "telegram_action",
  name: "Telegram",
  description: "Send messages, photos, answer callbacks, or fetch files via the Telegram Bot API.",
  category: "action",
  icon: "send",
  inputs: [{ label: "In" }],
  outputs: [{ label: "Result" }],
  configSchema: telegramActionConfigSchema,
  defaultConfig: {
    botToken: "env:TELEGRAM_BOT_TOKEN",
    operation: "send_message",
    chatId: "",
    text: "",
    parseMode: "none",
    photoData: "",
    caption: "",
    replyMarkup: "",
    replyToMessageId: "",
    callbackQueryId: "",
    callbackText: "",
    fileId: "",
  },

  execute: async ({ config, input, signal }) => {
    const token = resolve(config.botToken, input);
    if (!token) throw new Error("Telegram bot token is not configured");

    switch (config.operation) {
      // ── sendMessage ────────────────────────────────────────────────────────
      case "send_message": {
        const chatId = resolve(config.chatId, input);
        const text = resolve(config.text, input);
        if (!chatId) throw new Error("telegram_action send_message: chatId is required");
        if (!text) throw new Error("telegram_action send_message: text is required");

        const body: Record<string, unknown> = { chat_id: chatId, text };
        if (config.parseMode !== "none") body.parse_mode = config.parseMode;

        const result = await callTelegram(token, "sendMessage", body, signal);
        return { output: { ...((input as object) ?? {}), telegramResult: result } };
      }

      // ── sendPhoto ─────────────────────────────────────────────────────────
      case "send_photo": {
        const chatId = resolve(config.chatId, input);
        const photoData = resolve(config.photoData, input);
        const caption = resolve(config.caption, input);
        const replyMarkupStr = resolve(config.replyMarkup, input);
        const replyToStr = resolve(config.replyToMessageId, input);

        if (!chatId) throw new Error("telegram_action send_photo: chatId is required");
        if (!photoData) throw new Error("telegram_action send_photo: photoData is required");

        let result: unknown;

        const isBase64 =
          photoData.startsWith("data:") ||
          (photoData.length > 100 && !photoData.startsWith("http") && !/^[A-Za-z0-9_-]{20,100}$/.test(photoData));

        if (isBase64) {
          // multipart upload
          const formData = new FormData();
          formData.append("chat_id", String(chatId));

          let mimeType = "image/png";
          let base64Data = photoData;
          if (photoData.startsWith("data:")) {
            const match = photoData.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              mimeType = match[1];
              base64Data = match[2];
            }
          }
          const buffer = Buffer.from(base64Data, "base64");
          const blob = new Blob([buffer], { type: mimeType });
          formData.append("photo", blob, "photo.png");
          if (caption) formData.append("caption", caption);
          if (replyMarkupStr) formData.append("reply_markup", replyMarkupStr);
          if (replyToStr) formData.append("reply_to_message_id", replyToStr);

          const resp = await fetch(telegramApiUrl(token, "sendPhoto"), {
            method: "POST",
            body: formData,
            signal,
          });
          const json = (await resp.json()) as { ok: boolean; result?: unknown; description?: string };
          if (!json.ok) {
            throw new Error(`Telegram sendPhoto error: ${json.description ?? "unknown"}`);
          }
          result = json.result;
        } else {
          // URL or file_id — send as JSON
          const body: Record<string, unknown> = { chat_id: chatId, photo: photoData };
          if (caption) body.caption = caption;
          if (replyMarkupStr) {
            try {
              body.reply_markup = JSON.parse(replyMarkupStr) as unknown;
            } catch {
              body.reply_markup = replyMarkupStr;
            }
          }
          if (replyToStr) body.reply_to_message_id = Number(replyToStr) || replyToStr;
          result = await callTelegram(token, "sendPhoto", body, signal);
        }

        return { output: { ...((input as object) ?? {}), telegramResult: result } };
      }

      // ── answerCallbackQuery ────────────────────────────────────────────────
      case "answer_callback_query": {
        const queryId = resolve(config.callbackQueryId, input);
        const text = resolve(config.callbackText, input);
        if (!queryId) throw new Error("telegram_action answer_callback_query: callbackQueryId is required");

        const body: Record<string, unknown> = { callback_query_id: queryId };
        if (text) body.text = text;

        const result = await callTelegram(token, "answerCallbackQuery", body, signal);
        return { output: { ...((input as object) ?? {}), telegramResult: result } };
      }

      // ── getFile ───────────────────────────────────────────────────────────
      case "get_file": {
        const fileId = resolve(config.fileId, input);
        if (!fileId) throw new Error("telegram_action get_file: fileId is required");

        const fileInfo = (await callTelegram(token, "getFile", { file_id: fileId }, signal)) as {
          file_id: string;
          file_path?: string;
        };

        const fileUrl = fileInfo.file_path
          ? `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`
          : null;

        return {
          output: {
            ...((input as object) ?? {}),
            fileId: fileInfo.file_id,
            filePath: fileInfo.file_path ?? null,
            fileUrl,
          },
        };
      }

      default:
        throw new Error(`Unknown telegram_action operation: ${config.operation as string}`);
    }
  },
};
