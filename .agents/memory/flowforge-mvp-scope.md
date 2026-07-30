---
name: FlowForge MVP scope & milestone order
description: What was built, milestone order, and current state as of July 2026.
---

## Milestone order
1. Core engine + basic node types (HTTP, Code, If, Set, Log, Delay) — DONE
2. Telegram AI Product Photo workflow — DONE (seeded as live workflow)
3. Additional node types (Schedule, Code sandbox, Set Variable, Loop) — Task #2 PROPOSED
4. Auth / multi-tenancy — Task #3 PROPOSED

## Workflow seeded (July 30 2026)
- Name: "Telegram AI Product Photo"
- Workflow ID: `f1c954fb-bb1a-43dd-9fca-d49eed2dea8f`
- Active version: `f9c430a3-c484-4c80-a748-92099d4a542f`
- Webhook token: `wh_c1b753fc0bb24a8f80e61ff6613ce3ea`
- Webhook ID: `9b26dc3f-f7c2-44e0-a10c-b85890a9f6db`

## New node types added (Task #2)
All in `lib/node-registry/src/nodes/`:
- `telegram_trigger` — pass-through trigger, botToken supports `env:VAR`
- `telegram_action` — 4 ops: send_message, send_photo, answer_callback_query, get_file; all string fields support `=expr`
- `openai_image` — edit/generate ops; size+quality are `z.string()` (not enum) to allow `=expr` values
- `switch` — multi-output routing (up to 4 rules + default); uses `new Function` for conditions

**Why `size`/`quality` are strings:** enum fields reject JS expression strings like `"=$input?.size"` at Zod validation time, so they were widened to `z.string()`.

## Artifact registration gap — RESOLVED
All 3 artifacts re-registered on July 30 2026 (api-server /api, web /, mockup-sandbox /__mockup).

## Runtime setup still needed
- `TELEGRAM_BOT_TOKEN` secret (from @BotFather)
- `OPENAI_API_KEY` secret (needs gpt-image-1 access)
- Register Telegram webhook: `POST https://api.telegram.org/bot{TOKEN}/setWebhook {"url":"https://{REPLIT_DEV_DOMAIN}/api/webhooks/wh_c1b753fc0bb24a8f80e61ff6613ce3ea"}`
