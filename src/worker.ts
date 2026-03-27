/**
 * Cloudflare Worker entry point.
 *
 * Uses bundled game data (no fs access) and D1 for runtime storage.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// Register games from bundled data (no fs)
import "./games/register-bundled.js";

import { appRouter } from "./server/router.js";
import { handleCommandStream } from "./server/command-stream.js";
import { setStorage } from "./server/storage-instance.js";
import { D1Storage } from "./server/storage-d1.js";
import type { D1Database } from "./server/storage-d1.js";
import { handleAuthRoute } from "./server/auth/routes.js";
import type { AuthEnv } from "./server/auth/routes.js";
import { verifyJwt, parseCookie } from "./server/auth/jwt.js";

interface Env {
  DB: D1Database;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

function getAuthEnv(env: Env, request: Request): AuthEnv {
  const url = new URL(request.url);
  return {
    jwtSecret: env.JWT_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || null,
    publicOrigin: url.origin,
    secure: true,
  };
}

async function extractUser(
  request: Request,
  jwtSecret: string,
): Promise<{ userId: string; userName: string } | null> {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const token = parseCookie(cookie, "session");
  if (!token) return null;
  const payload = await verifyJwt(token, jwtSecret);
  if (!payload) return null;
  return { userId: payload.sub, userName: payload.name };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set D1 storage for this request
    setStorage(new D1Storage(env.DB));

    const url = new URL(request.url);

    // Auth routes (public)
    if (url.pathname.startsWith("/auth/")) {
      const authResponse = await handleAuthRoute(request, getAuthEnv(env, request));
      if (authResponse) return authResponse;
    }

    // Extract user for API routes
    const user = await extractUser(request, env.JWT_SECRET);

    // Streaming command endpoint (authed)
    if (url.pathname === "/api/command" && request.method === "POST") {
      if (!user) return new Response("Unauthorized", { status: 401 });
      return handleCommandStream(request, user);
    }

    // Handle tRPC requests (auth checked per-procedure)
    if (url.pathname.startsWith("/trpc")) {
      return fetchRequestHandler({
        endpoint: "/trpc",
        req: request,
        router: appRouter,
        createContext: () => ({
          userId: user ? user.userId : null,
          userName: user ? user.userName : null,
        }),
      });
    }

    // Everything else: static assets (SPA fallback configured in wrangler.toml)
    return env.ASSETS.fetch(request);
  },
};
