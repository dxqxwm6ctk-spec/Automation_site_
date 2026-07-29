---
name: Artifact registration gap after GitHub import
description: Imported repo has valid artifact.toml + matching .replit workflows on disk, but Replit's artifact registry doesn't know about them — breaks Screenshot/listArtifacts, not the app itself.
---

## Symptom
`listArtifacts()` returns `[]` and `Screenshot` fails with "Artifact not found: <slug>" for artifacts (`web`, `api-server`, `mockup-sandbox`) that are otherwise fully scaffolded: valid `.replit-artifact/artifact.toml` on disk, matching `workflows.workflow` entries in `.replit`, and dev servers that run and serve traffic fine.

**Why:** This project was originally built on Replit, exported to GitHub, then re-imported into a fresh Replit environment. The re-import restored the git-tracked repo files (`artifact.toml`, `.replit` workflow definitions) but not whatever separate platform-side registration ties a slug to Replit's artifact system — that state lives outside the repo and isn't part of a GitHub export.

**How to apply:** Don't assume `Screenshot`/`listArtifacts` failing means the app is broken — check workflow logs and curl the dev server directly first; the app is very likely fine. `createArtifact()` will not fix this: it requires a fresh/empty slug and errors on an existing directory like `web` or `api-server`. Until this is properly re-registered, substitute curl/HTTP-level verification (status codes, HTML shell content, API round-trips) for visual screenshot verification, and flag the gap to the user rather than silently working around it — they may want it fixed for preview-pane visibility.
