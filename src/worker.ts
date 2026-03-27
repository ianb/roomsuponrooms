/**
 * Cloudflare Worker entry point.
 *
 * Uses bundled game data (no fs access) and D1 for runtime storage.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// Register games from bundled data (no fs)
import "./games/register-bundled.js";

import { appRouter } from "./server/router.js";
import { setStorage } from "./server/storage-instance.js";
import { D1Storage } from "./server/storage-d1.js";
import type { D1Database } from "./server/storage-d1.js";

interface Env {
  DB: D1Database;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set D1 storage for this request
    setStorage(new D1Storage(env.DB));

    const url = new URL(request.url);

    // Handle tRPC requests
    if (url.pathname.startsWith("/trpc")) {
      return fetchRequestHandler({
        endpoint: "/trpc",
        req: request,
        router: appRouter,
      });
    }

    // Everything else: static assets (SPA fallback configured in wrangler.toml)
    return env.ASSETS.fetch(request);
  },
};
