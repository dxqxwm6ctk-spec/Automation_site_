# FlowForge — Task Tracker

> **الغرض:** هذا الملف هو المرجع الموحّد لكل المهام المتبقية في المشروع. كل agent يبدأ يقرأ هذا الملف أولاً، يشوف وين وقف السابق، يكمل، ويحدّث الحالة قبل ما ينهي جلسته.

---

## طريقة الاستخدام

- **`[ ]`** = لم يبدأ بعد
- **`[~]`** = بدأ ولم يكتمل (اكتب ملاحظة تحته)
- **`[x]`** = مكتمل

قبل ما تبدأ: غيّر الحالة لـ `[~]` وأضف ملاحظة. قبل ما تنهي: حدّث الحالة لـ `[x]` أو اترك ملاحظة للـ agent الجاي.

---

## الأولوية 1 — إصلاح الأشياء الموجودة بس مش شغّالة

### 1.1 `ENCRYPTION_KEY` — تفعيل Credential Store
- **الحالة:** `[~]` — بانتظار إدخال الـ secret من المستخدم
- **ما المشكلة:** صفحة `/credentials` موجودة والـ routes موجودة، لكن بدون `ENCRYPTION_KEY` secret أي محاولة حفظ credential ترمي error.
- **المطلوب:**
  - [~] إضافة `ENCRYPTION_KEY` secret (32 hex byte) عبر Replit Secrets — تم توليد القيمة، بانتظار الإدخال
  - [x] التأكد من أن `artifacts/api-server/src/routes/v1/credentials.ts` يعمل end-to-end
  - [ ] اختبار إنشاء credential من الـ UI وحذفه (بعد ضبط الـ secret)
- **الملفات ذات الصلة:**
  - `artifacts/api-server/src/routes/v1/credentials.ts`
  - `artifacts/web/src/pages/credentials.tsx`
  - `replit.md` (قسم Required env)

---

### 1.2 Webhook Trigger Infrastructure (Phase 1.5)
- **الحالة:** `[x]` — مكتمل بالكامل
- **ما تم:**
  - [x] `POST /api/webhooks/:token` و `GET /api/webhooks/:token` — موجودان ومـ mounted على `/api/webhooks`
  - [x] ربط الـ webhook بالـ workflow — auto-create تلقائي عند حفظ workflow يحتوي `webhook_trigger`
    - منطق الـ auto-create أُضيف في `artifacts/api-server/src/routes/v1/workflows.ts` (POST + PUT handlers)
  - [x] عرض الـ webhook URL للمستخدم — موجود في `NodeInspector` (يجلب الـ token من `/api/v1/webhooks?workflowId=...`)
- **الملفات ذات الصلة:**
  - `artifacts/api-server/src/routes/webhooks.ts` (inbound receiver)
  - `artifacts/api-server/src/routes/v1/workflows.ts` (auto-create logic)

---

### 1.3 Loop Node — إصلاح الـ throw الناقص
- **الحالة:** `[x]` — كان مكتملاً فعلاً
- **ما تبيّن:** الـ node هو "for-each collector" — يأخذ array ويمرره downstream كـ `{ items, count }`. لا يوجد throw إشكالي؛ التعليق في الكود كان يوضح أن الـ per-item fan-out هو Phase 2 وليس Phase 1. الـ node يعمل بشكل صحيح.

---

### 1.4 Schedule Trigger — تشغيل حقيقي بـ Cron
- **الحالة:** `[x]` — مكتمل
- **ما تم:**
  - [x] `artifacts/api-server/src/scheduler/schedulerService.ts` — scheduler service جديد يستخدم `CronExpressionParser` من `cron-parser` مع `setTimeout` متكرر يحسب الـ next tick من الـ expression
  - [x] `bootstrapScheduler()` يُستدعى عند بدء السيرفر — يحمّل كل الـ active workflows بـ `schedule_trigger` nodes ويسجّلها
  - [x] `scheduleWorkflow()` / `unscheduleWorkflow()` تُستدعى من PUT handler (حفظ version جديد) وPATCH handler (تغيير isActive) وDELETE handler
  - [x] الاختبارات السابقة (87 + 50 + 7 = 144) كلها تنجح بعد الإضافات

---

## الأولوية 2 — البنية التحتية للـ Production

### 2.1 Redis + BullMQ — Execution Queue
- **الحالة:** `[~]` — البنية التحتية جاهزة، بانتظار REDIS_URL secret
- **ما تم:**
  - [x] `artifacts/api-server/src/queue/index.ts` — BullMQ queue + in-process worker مع graceful fallback لـ in-process عند غياب REDIS_URL
  - [x] Execute handler في `workflows.ts` → يستخدم queue عندما متوفر، وإلا in-process
  - [x] Webhook receiver → نفس المنطق (immediate mode فقط؛ wait_for_completion يبقى in-process)
  - [x] `/api/ready` يستخدم `pingRedis()` الحقيقي بدل الـ hardcoded `"not_configured"`
  - [x] `initQueue()` يُستدعى عند بدء السيرفر بجانب `bootstrapScheduler()`
  - [~] توفير REDIS_URL — يحتاج Replit Redis integration أو secret من المستخدم
- **الملفات ذات الصلة:**
  - `artifacts/api-server/src/queue/index.ts` (الجديد)
  - `artifacts/api-server/src/index.ts`
  - `artifacts/api-server/src/routes/health.ts`

---

### 2.2 Telegram Secrets + Webhook Registration
- **الحالة:** `[~]` — بانتظار إدخال الـ secret من المستخدم
- **ما المشكلة:** نودات `telegram_trigger` و `telegram_action` موجودة بالـ registry لكن ما في secrets مضبوطة.
- **المطلوب:**
  - [~] إضافة `TELEGRAM_BOT_TOKEN` عبر Replit Secrets — بانتظار الإدخال
  - [ ] تسجيل Telegram webhook:
    ```
    POST https://api.telegram.org/bot{TOKEN}/setWebhook
    {"url": "https://{REPLIT_DEV_DOMAIN}/api/webhooks/{webhook_token}"}
    ```
  - [ ] اختبار workflow كامل: Telegram message → workflow يشتغل
- **الملفات ذات الصلة:**
  - `lib/node-registry/src/nodes/telegram-trigger.ts`
  - `lib/node-registry/src/nodes/telegram-action.ts`
  - `MEMORY.md` (فيه الـ webhook token المحفوظ)

---

### 2.3 OpenAI Image Secret
- **الحالة:** `[~]` — بانتظار إدخال الـ secret من المستخدم
- **ما المشكلة:** نود `openai_image` موجود لكن بحاج لـ `OPENAI_API_KEY` بصلاحية `gpt-image-1`.
- **المطلوب:**
  - [~] إضافة `OPENAI_API_KEY` عبر Replit Secrets — بانتظار الإدخال
  - [ ] اختبار generate و edit operations
- **الملفات ذات الصلة:**
  - `lib/node-registry/src/nodes/openai-image.ts`

---

## الأولوية 3 — ميزات جديدة

### 3.1 User Authentication & Multi-Tenancy (Milestone 4)
- **الحالة:** `[ ]`
- **ما المشكلة:** الـ app مفتوح بدون login، كل شيء مشترك. Auth middleware موجود (`optionalAuth` / `requireAuth`) لكن بدون نظام مستخدمين.
- **المطلوب:**
  - [ ] اختيار auth provider: Replit Auth أو Clerk
  - [ ] إضافة `users` table بالـ DB
  - [ ] إضافة `owner_id` لجداول `workflows`, `credentials`, `executions`
  - [ ] تطبيق `requireAuth` middleware على كل الـ v1 routes
  - [ ] صفحة login/logout بالـ frontend
  - [ ] حماية الـ routes في الـ frontend
- **الملفات ذات الصلة:**
  - `artifacts/api-server/src/middlewares/auth.ts`
  - `artifacts/api-server/src/lib/jwt.ts`
  - `lib/db/src/schema/`
  - `artifacts/api-server/src/routes/v1/`
  - `artifacts/web/src/App.tsx`

---

### 3.2 Canvas Polish (Phase 1.2 المتبقي)
- **الحالة:** `[x]` — مكتمل فعلاً (PROJECT_STATUS.md كان متأخراً)
- **ما تبيّن:**
  - [x] Undo/Redo stack — `historyRef` في `useWorkflowEditor.ts` (50 snapshot)، Ctrl+Z / Ctrl+Y في keyboard handler
  - [x] Auto-layout (Dagre) — `applyLayout()` في `useWorkflowEditor.ts`، زر بـ `data-testid="button-auto-layout"`
  - [x] Node palette search — `<Input>` مع filter في `NodePalette.tsx`، `data-testid="input-node-search"`
  - [x] Keyboard shortcuts — Ctrl+Z undo، Ctrl+Y/Shift+Z redo، Ctrl+S save، Delete/Backspace حذف node محدد، Escape deselect

---

## سجل التقدم

| التاريخ | الـ Agent | ما تم |
|---|---|---|
| 2026-07-30 | Agent 1 | إعداد المشروع، install dependencies، push DB schema، رفع الـ workflows، كتابة هذا الملف |
| 2026-07-30 | Agent 2 | Task 1.2 مكتملة (webhook auto-create + inbound receiver موجود)، Task 1.3 مكتملة (loop node كان شغّال فعلاً)، Task 1.4 مكتملة (schedulerService.ts + bootstrap + route hooks)، إصلاح اختبارات node-registry، Tasks 1.1 و 2.2 و 2.3 بانتظار secrets من المستخدم |

---

> **ملاحظة للـ agent القادم:** ابدأ من **1.1** (ENCRYPTION_KEY) لأنه أسهل وأسرع مهمة تعطي نتيجة واضحة، ثم **1.2** (Webhook Trigger) لأنه يفتح automations حقيقية. راجع `replit.md` و`PROJECT_STATUS.md` للسياق الكامل.
