#!/usr/bin/env node
// Orval's zod client always emits `import * as zod from "zod";`, but this
// workspace standardizes on the v4 API surface (see replit.md). zod v3.25+
// ships that API at the `zod/v4` subpath, so every regeneration needs this
// import rewritten. Wired up as an orval `afterAllFilesWrite` hook (see
// orval.config.ts) so `pnpm --filter @workspace/api-spec run codegen` always
// produces a working import without manual patching.
//
// Orval invokes this as: `node ./scripts/fix-generated-zod-imports.mjs <generatedFilePath> ...`
import { readFile, writeFile } from "node:fs/promises";

const IMPORT_PATTERN = /^(import \* as zod from ["'])zod(["'];)$/m;

const filePaths = process.argv.slice(2);

if (filePaths.length === 0) {
  console.warn("[fix-generated-zod-imports] No file paths received from orval hook; nothing to do.");
}

for (const filePath of filePaths) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    // Not every path orval reports is a file we care about (or exists as text).
    continue;
  }

  if (!IMPORT_PATTERN.test(contents)) {
    continue;
  }

  const patched = contents.replace(IMPORT_PATTERN, "$1zod/v4$2");
  await writeFile(filePath, patched, "utf8");
  console.log(`[fix-generated-zod-imports] Patched zod import to zod/v4 in ${filePath}`);
}
