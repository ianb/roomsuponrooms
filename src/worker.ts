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
import { setImageStorage } from "./server/image-storage-instance.js";
import { R2ImageStorage } from "./server/image-storage.js";
import { handleImageRequest } from "./server/image-routes.js";
import type { R2Bucket } from "./server/r2-types.js";
import { handleAuthRoute } from "./server/auth/routes.js";
import type { AuthEnv } from "./server/auth/routes.js";
import { verifyJwt, parseCookie, bearerApiKeyMatches } from "./server/auth/jwt.js";
import { logErrorObj } from "./server/error-log.js";
import { setSandbox } from "./core/sandbox-host.js";
import { WorkerLoaderSandbox } from "./server/sandbox-worker-loader.js";
import type { WorkerLoaderBinding, LoaderCtx } from "./server/sandbox-worker-loader.js";

// Re-exported so `ctx.exports.LibEntry` resolves: the dynamic isolate calls
// back into this parent entrypoint for store reads.
export { LibEntry } from "./server/sandbox-worker-loader.js";

interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  LLM_PROVIDER: string;
  LLM_MODEL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  API_KEY?: string;
  LOADER: WorkerLoaderBinding;
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
  { jwtSecret, apiKey }: { jwtSecret: string; apiKey?: string },
): Promise<{ userId: string; userName: string; roles: string[] } | null> {
  // API key auth: treat as admin
  if (apiKey) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      if (await bearerApiKeyMatches(authHeader, apiKey)) {
        return { userId: "api", userName: "API", roles: ["admin", "ai", "debug"] };
      }
      console.error("[auth] Rejected Authorization header: API key mismatch");
    }
  }
  // JWT cookie auth
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const token = parseCookie(cookie, "session");
  if (!token) return null;
  const payload = await verifyJwt(token, jwtSecret);
  if (!payload) return null;
  return { userId: payload.sub, userName: payload.name, roles: payload.roles };
}

export default {
  // eslint-disable-next-line max-params -- Cloudflare fetch handler signature is fixed: (request, env, ctx)
  async fetch(request: Request, env: Env, ctx: LoaderCtx): Promise<Response> {
    // Set D1 storage for this request
    setStorage(new D1Storage(env.DB));
    setImageStorage(new R2ImageStorage(env.IMAGES));
    setSandbox(new WorkerLoaderSandbox(env.LOADER, ctx));

    // Expose secrets as process.env for modules that read from it (e.g. llm.ts)
    process.env["LLM_PROVIDER"] = env.LLM_PROVIDER;
    process.env["LLM_MODEL"] = env.LLM_MODEL;
    process.env["GOOGLE_GENERATIVE_AI_API_KEY"] = env.GOOGLE_GENERATIVE_AI_API_KEY;

    const url = new URL(request.url);

    // Auth routes (public)
    if (url.pathname.startsWith("/auth/")) {
      const authResponse = await handleAuthRoute(request, getAuthEnv(env, request));
      if (authResponse) return authResponse;
    }

    // Serve images (public, no auth needed)
    if (url.pathname.startsWith("/api/images/")) {
      return handleImageRequest(url);
    }

    // Extract user for API routes
    const user = await extractUser(request, { jwtSecret: env.JWT_SECRET, apiKey: env.API_KEY });

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
          roles: user ? user.roles : [],
        }),
        onError: ({ error, path }) => {
          logErrorObj("trpc", {
            error,
            userId: user ? user.userId : undefined,
            context: path,
          });
        },
      });
    }

    // Everything else: static assets (SPA fallback configured in wrangler.toml)
    return env.ASSETS.fetch(request);
  },
};
