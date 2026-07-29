---
name: Ad hoc script module resolution in pnpm workspaces
description: Why a scratch .mjs/.js script importing a workspace dependency fails with ERR_MODULE_NOT_FOUND, and what to do instead.
---

Running a throwaway Node script (e.g. in `/tmp`) that does `import { x } from "some-dep"` fails with
`ERR_MODULE_NOT_FOUND` even though `some-dep` is installed somewhere in the workspace.

**Why:** pnpm workspaces use strict, per-package `node_modules` symlinking (no hoisting fallback the
way npm/yarn classic does), so resolution depends on which directory the script runs from, not just
whether the package exists anywhere in the repo. A scratch file only resolves a dependency if it's
placed inside (or below) a workspace package that actually declares that dependency.

**How to apply:** don't fight resolution for a quick one-off check — either (a) place the scratch
script inside a workspace package directory that already depends on the library and run it from
there, or (b) skip execution entirely and read the library's type declarations/source directly (e.g.
`ReadFile` on `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/**/*.d.ts` or the `.js` source)
to answer API-shape questions like "does this error class expose field X".
