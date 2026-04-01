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

## D1 Schema

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `ai_entities` | `(game_id, id)` | AI-generated entities |
| `ai_handlers` | `(game_id, name)` | AI-generated verb handlers |
| `events` | `(game_id, seq)` | Event log (game session commands) |
| `conversation_entries` | `(game_id, npc_id, word)` | NPC conversation history |
| `error_log` | `id` (autoincrement) | Server errors, pruned after 2 days |

## Configuration

- **wrangler.toml** — Worker config, D1 binding, asset serving, build command
- **Custom domain** — configured in Cloudflare dashboard: Workers & Pages > rooms-upon-rooms > Settings > Domains & Routes
- **Environment variables** — secrets (API keys) go via `wrangler secret put <NAME>`; local dev uses `.env`

## Authentication

Wrangler requires Cloudflare authentication. Run `wrangler login` to authenticate via browser. The `domains` subcommand does not exist in current wrangler; custom domains must be configured in the Cloudflare dashboard.
