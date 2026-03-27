import { resolve } from "node:path";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { setStorage } from "./storage-instance.js";
import { FileStorage } from "./storage-file.js";
import { appRouter } from "./router.js";
import { handleCommandStream } from "./command-stream.js";
import { handleAuthRoute } from "./auth/routes.js";
import type { AuthEnv } from "./auth/routes.js";
import { verifyJwt, parseCookie } from "./auth/jwt.js";

// Register games from disk (fs-based)
import "../games/test-world.js";
import "../games/colossal-cave/index.js";
import "../games/the-aaru/index.js";

// Configure file-based storage
setStorage(new FileStorage(resolve(process.cwd(), "data")));

const DEV_JWT_SECRET = "dev-secret-not-for-production";

function getAuthEnv(): AuthEnv {
  return {
    jwtSecret: process.env["JWT_SECRET"] || DEV_JWT_SECRET,
    googleClientId: process.env["GOOGLE_CLIENT_ID"] || null,
    googleClientSecret: process.env["GOOGLE_CLIENT_SECRET"] || null,
    publicOrigin: `http://localhost:${process.env["PORT"] || "3000"}`,
    secure: false,
  };
}

async function extractUser(
  cookieHeader: string | undefined,
): Promise<{ userId: string; userName: string } | null> {
  if (!cookieHeader) return null;
  const token = parseCookie(cookieHeader, "session");
  if (!token) return null;
  const secret = process.env["JWT_SECRET"] || DEV_JWT_SECRET;
  const payload = await verifyJwt(token, secret);
  if (!payload) return null;
  return { userId: payload.sub, userName: payload.name };
}

const server = Fastify();

// Auth routes
server.all("/auth/*", async (req, reply) => {
  const webRequest = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(
        (pair): pair is [string, string] => typeof pair[1] === "string",
      ),
    ),
    body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
  });
  const response = await handleAuthRoute(webRequest, getAuthEnv());
  if (!response) {
    reply.status(404).send({ error: "Not found" });
    return;
  }
  reply.status(response.status);
  for (const [key, value] of response.headers.entries()) {
    reply.header(key, value);
  }
  const body = await response.text();
  reply.send(body);
});

// Streaming command endpoint
server.post("/api/command", async (req, reply) => {
  const user = await extractUser(req.headers.cookie);
  if (!user) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const webRequest = new Request("http://localhost/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body),
  });
  const response = await handleCommandStream(webRequest, user);
  reply.header("content-type", "application/x-ndjson");
  reply.header("transfer-encoding", "chunked");
  reply.header("cache-control", "no-cache");
  reply.send(response.body);
});

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext: async ({ req }: { req: { headers: { cookie?: string } } }) => {
      const user = await extractUser(req.headers.cookie);
      return {
        userId: user ? user.userId : null,
        userName: user ? user.userName : null,
      };
    },
  },
});

const port = Number(process.env["PORT"]) || 3001;

server.listen({ port, host: "0.0.0.0" }).then((address) => {
  console.log(`Server listening at ${address}`);
});
