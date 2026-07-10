---
name: lib/db composite TS build must be rebuilt after schema changes
description: Dependent packages see stale types from lib/db unless its declaration build is force-rebuilt after editing schema files
---

`lib/db` is built with TS project references using composite + declarationMap + emitDeclarationOnly. Editing files under `lib/db/src/schema/*` does not automatically propagate new/changed exported types to consumers (e.g. `api-server`) — they keep resolving against stale `dist/*.d.ts`.

**Why:** the incremental build info (`tsconfig.tsbuildinfo`) can consider the package "up to date" even when schema types changed, so `pnpm --filter @workspace/db build` may no-op or downstream tsc errors look like the new fields don't exist.

**How to apply:** after any schema change in `lib/db`, run `rm lib/db/tsconfig.tsbuildinfo` then `pnpm --filter @workspace/db exec tsc -b --force` to regenerate declarations before type-checking or building dependent packages.
