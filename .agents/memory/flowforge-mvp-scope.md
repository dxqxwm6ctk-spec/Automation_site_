---
name: FlowForge MVP scope & milestone order
description: Why the FlowForge MVP has no auth, and how the milestone numbering was resolved after a docs conflict.
---

The FlowForge MVP is intentionally single-tenant and unauthenticated: no `users`/`workspaces` tables, no login, every row globally scoped. This is a deliberate, documented architecture decision — not a gap. Don't add auth/ownership columns to MVP-era tables except through the additive migration path already designed for the later Authentication & Multi-Tenancy milestone.

**Why:** The roadmap docs originally described the MVP milestone as including full auth + workspaces, contradicting the architecture/schema/API docs (which were already unauth-only). Resolved by removing auth/workspaces from the MVP milestone and creating a dedicated "Authentication & Multi-Tenancy" milestone (auth + workspaces + teams/RBAC + API keys + audit logs + OIDC), placed after the Integration Nodes milestone — that ordering matches how the architecture/API/folder-structure docs already referenced Integration Nodes and Authentication & Multi-Tenancy by name.

**How to apply:** Roadmap milestone order is: Foundation → MVP (no auth) → Scheduling & Variables → Integration Nodes → Authentication & Multi-Tenancy → Enterprise & Scale. Treat `docs/05-development-roadmap.md` and `docs/06-implementation-phases.md` as authoritative for milestone/phase numbers going forward. Check `PROJECT_STATUS.md` for current build progress against this roadmap before assuming what phase is "next."
