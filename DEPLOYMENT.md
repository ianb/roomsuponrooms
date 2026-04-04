# Deployment

> **Keep this document up to date.** When deployment infrastructure, commands, or architecture changes, update this file to reflect the current state.

## Overview

Rooms Upon Rooms is deployed as a **Cloudflare Worker** with a **D1** (SQLite) database for runtime storage. Static assets (the Vite-built frontend) are served via Cloudflare's asset handling.

- **Production URL**: https://roomsuponrooms.com
- **Workers URL**: https://rooms-upon-rooms.ianbicking.workers.dev
- **Worker name**: `rooms-upon-rooms`
- **D1 database name**: `rooms-upon-rooms`
- **D1 database ID**: `b06e1aff-a6db-4e34-9391-ac4b129f7959`
- **Region**: ENAM (Eastern North America)

## Architecture

```
Browser  -->  Cloudflare Worker (src/worker.ts)
                |
                |--> /trpc/*  -->  tRPC router (appRouter)  -->  D1Storage
                |--> /*       -->  Static assets (dist/)
```

- **Local dev** (`npm run dev`): Fastify server + Vite dev server, FileStorage (JSONL files in `data/`)
- **Production** (`npm run deploy`): Cloudflare Worker, D1Storage
- **Local Worker dev** (`wrangler dev --local`): Worker + local D1 SQLite (in `.wrangler/`)

### Storage abstraction

`RuntimeStorage` interface (`src/server/storage.ts`) with two implementations:
- `FileStorage` (`src/server/storage-file.ts`) — JSONL files, used by Node server
- `D1Storage` (`src/server/storage-d1.ts`) — Cloudflare D1, used by Worker

Entry points call `setStorage()` to configure which backend:
- `src/server/index.ts` — sets FileStorage
- `src/worker.ts` — sets D1Storage from `env.DB`

### Game data bundling

Game definitions are loaded from disk (`src/games/read-game-dir.ts`) using `node:fs`. Workers can't access the filesystem, so a build step pre-bundles all game data:

- **Script**: `scripts/bundle-game-data.ts`
- **Output**: `generated/bundled-data.ts` (gitignored)
- **Worker imports**: `src/games/register-bundled.ts` (uses bundled data)
- **Node server imports**: individual game files directly (uses `readGameDir`)

The `generated/` directory is outside `src/` to avoid triggering wrangler's file watcher during `wrangler dev`.

## Commands

### Deploy to production

```bash
npm run deploy
```

This runs `bundle-games` (pre-bundles game data) then `wrangler deploy` (which also runs the build command in `wrangler.toml` to build the Vite frontend).

### Local development (Node server + Vite)

```bash
npm run dev
```

Starts Fastify on port 3001, Vite on port 3000. Uses FileStorage with JSONL files in `data/`.

### Local Worker development (wrangler)

```bash
wrangler dev --local
```

Runs the Worker locally on port 8787 with local D1 SQLite. Apply migrations first:

```bash
wrangler d1 migrations apply rooms-upon-rooms --local
```

### Database operations

```bash
# Apply migrations to remote D1
wrangler d1 migrations apply rooms-upon-rooms --remote

# Query remote D1
wrangler d1 execute rooms-upon-rooms --remote --command "SELECT * FROM events"

# Query local D1
wrangler d1 execute rooms-upon-rooms --local --command "SELECT * FROM events"
```

### Adding a new migration

Create a new SQL file in `migrations/` with the next sequence number (e.g., `0002_add_users.sql`). Then apply:

```bash
wrangler d1 migrations apply rooms-upon-rooms --local   # test locally first
wrangler d1 migrations apply rooms-upon-rooms --remote  # then apply to production
```

## Error Logging

Production errors (tRPC and command-stream) are logged to the `error_log` table in D1. Entries auto-prune after 2 days.

```bash
# Recent errors (summary)
npm run errors

# Recent errors (including stack traces)
npm run errors:full
```

Local dev errors log to the server console only (FileStorage doesn't implement `logError`).

The error log captures: timestamp, source (trpc/command-stream), message, stack trace, user ID, game ID, and context (tRPC path or command text).

## Bug Reports

Players report bugs in-game by typing `bug <description>`. Reports capture session context (recent commands, entity state changes, current room) and are stored in D1.

### CLI

```bash
npm run bugs                         # list all bugs
npm run bugs -- list new             # list bugs with status "new"
npm run bugs -- show b-xK9mQ3nP     # show full bug details
npm run bugs -- update b-xK9mQ3nP seen          # mark as seen
npm run bugs -- update b-xK9mQ3nP fixed abc123  # mark fixed with commit hash
```

Requires `API_KEY` in `.env`. Hits the production API by default; set `BUG_API_URL=http://localhost:3001` in `.env` for local dev.

### Web UI

- `/bugs` — list all bug reports with status filter
- `/bugs/:id` — individual bug report detail

### API

All bug endpoints use tRPC and require `Authorization: Bearer <API_KEY>`:

- `bugs` (query) — list reports, optional `{ status, gameId }` filter
- `bug` (query) — get single report by `{ id }`
- `submitBug` (mutation) — create a new report (used by the game client)
- `updateBug` (mutation) — update `{ id, status, fixCommit, duplicateOf }`

### Statuses

| Status | Meaning |
|--------|---------|
| `new` | Just reported, not yet reviewed |
| `seen` | Reviewed, acknowledged |
| `fixed` | Fix deployed (set `fixCommit` to the commit hash) |
| `invalid` | Not a real bug or not reproducible |
| `duplicate` | Duplicate of another report (set `duplicateOf` to the other bug ID) |

### Agent workflow for handling bugs

When working on bugs as an AI agent, follow this workflow:

1. **List open bugs**: `npm run bugs -- list new`
2. **Read a bug**: `npm run bugs -- show <id>` — review the description, recent commands, and entity changes
3. **Investigate**: read relevant code, reproduce the issue if possible, identify the root cause
4. **Present findings to the user**: explain what you found and propose a fix. **Do not make changes without user approval.**
5. **After user approves**: implement the fix, run tests, commit
6. **Update the bug**: `npm run bugs -- update <id> fixed <commit-hash>`

**Important**: The user MUST be consulted before taking any action on a bug (code changes, status updates, closing as invalid). Present your analysis and proposed action, then wait for approval.

## D1 Schema

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `ai_entities` | `(game_id, id)` | AI-generated entities |
| `ai_handlers` | `(game_id, name)` | AI-generated verb handlers |
| `events` | `(game_id, seq)` | Event log (game session commands) |
| `conversation_entries` | `(game_id, npc_id, word)` | NPC conversation history |
| `bug_reports` | `id` | Player-submitted bug reports |
| `error_log` | `id` (autoincrement) | Server errors, pruned after 2 days |

## Configuration

- **wrangler.toml** — Worker config, D1 binding, asset serving, build command
- **Custom domain** — configured in Cloudflare dashboard: Workers & Pages > rooms-upon-rooms > Settings > Domains & Routes
- **Environment variables** — secrets (API keys) go via `wrangler secret put <NAME>`; local dev uses `.env`
- **API_KEY** — shared secret for CLI/agent API access. Set via `wrangler secret put API_KEY` (production) and in `.env` (local)

## Authentication

Wrangler requires Cloudflare authentication. Run `wrangler login` to authenticate via browser. The `domains` subcommand does not exist in current wrangler; custom domains must be configured in the Cloudflare dashboard.
