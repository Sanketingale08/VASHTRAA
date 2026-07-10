---
name: drizzle-kit migrate silently failing after push-based schema changes
description: why `drizzle-kit migrate` exits 1 with no error, and how to fix a DB whose schema was evolved via `drizzle-kit push`
---

If `drizzle-kit migrate` exits with code 1 and no error message, suspect the
database schema was previously changed via `drizzle-kit push` (or manual SQL)
rather than through migration files. `push` applies schema changes directly
and never writes to the `drizzle.__drizzle_migrations` tracking table, so
`migrate` tries to replay migration files from scratch and fails on
`relation already exists` — but drizzle-kit swallows that error instead of
printing it.

**Why:** confirmed by manually re-running the first migration's SQL directly
against the DB, which surfaced the real Postgres error even though
`drizzle-kit migrate` itself printed nothing.

**How to apply:** compare `information_schema` (or the real DB) against each
migration file to confirm the schema already matches. If so, baseline
`drizzle.__drizzle_migrations` by inserting one row per entry in
`meta/_journal.json`, using `sha256(fileContents)` as `hash` and the entry's
`when` as `created_at` — this is the exact hash drizzle-orm's migrator
computes internally, so future `migrate` runs will treat those migrations as
already applied and only run new ones. Prefer this over dropping/recreating
tables. Also check `lib/db/drizzle/meta/` for missing snapshot json files
(needed by `drizzle-kit generate`, not `migrate`) as a related but separate
issue.
