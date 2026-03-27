/**
 * Auth route handler. Works with both Cloudflare Workers and Fastify
 * (via Request/Response web standard API).
 */
import { getStorage } from "../storage-instance.js";
import type { UserRecord, UserRole } from "../storage.js";
import { signJwt, verifyJwt, parseCookie, sessionCookie, clearSessionCookie } from "./jwt.js";

const ALL_ROLES: UserRole[] = ["admin", "ai", "debug", "player"];
const DEFAULT_ROLES: UserRole[] = ["player"];

export interface AuthEnv {
  jwtSecret: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  publicOrigin: string;
  secure: boolean;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function rolesForNewUser(): Promise<UserRole[]> {
  const storage = getStorage();
  const hasUsers = await storage.hasAnyUsers();
  return hasUsers ? DEFAULT_ROLES : ALL_ROLES;
}

/** Ensure roles are present on a user record (handles pre-migration records) */
function ensureRoles(user: UserRecord): UserRecord {
  if (user.roles && user.roles.length > 0) return user;
  return { ...user, roles: DEFAULT_ROLES };
}

async function findOrCreateGoogleUser(info: GoogleUserInfo): Promise<UserRecord> {
  const storage = getStorage();
  const existing = await storage.findUserByGoogleId(info.id);
  if (existing) {
    await storage.updateLastLogin(existing.id);
    return ensureRoles(existing);
  }
  const roles = await rolesForNewUser();
  const now = new Date().toISOString();
  const record: UserRecord = {
    id: generateId(),
    displayName: info.name,
    email: info.email,
    googleId: info.id,
    roles,
    createdAt: now,
    lastLoginAt: now,
  };
  await storage.createUser(record);
  return record;
}

async function findOrCreateDevUser(name: string): Promise<UserRecord> {
  const storage = getStorage();
  const existing = await storage.findUserByName(name);
  if (existing) {
    await storage.updateLastLogin(existing.id);
    return { ...existing, roles: ALL_ROLES };
  }
  const now = new Date().toISOString();
  const record: UserRecord = {
    id: generateId(),
    displayName: name,
    email: null,
    googleId: null,
    roles: ALL_ROLES,
    createdAt: now,
    lastLoginAt: now,
  };
  await storage.createUser(record);
  return record;
}

function redirectResponse(url: string, headers: Record<string, string>): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...headers },
  });
}

function jsonResponse(
  data: unknown,
  { status, headers }: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Handle all /auth/* routes. Returns null if the path doesn't match. */
export async function handleAuthRoute(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/auth/me") {
    return handleMe(request, env);
  }

  if (path === "/auth/google" && request.method === "GET") {
    return handleGoogleRedirect(env);
  }

  if (path === "/auth/google/callback" && request.method === "GET") {
    return handleGoogleCallback(url, env);
  }

  if (path === "/auth/dev-login" && request.method === "POST") {
    return handleDevLogin(request, env);
  }

  if (path === "/auth/logout" && request.method === "POST") {
    return handleLogout(env);
  }

  return null;
}

async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const cookie = request.headers.get("Cookie");
  const devMode = !env.googleClientId;
  if (!cookie) {
    return jsonResponse({ user: null, devMode }, {});
  }
  const token = parseCookie(cookie, "session");
  if (!token) {
    return jsonResponse({ user: null, devMode }, {});
  }
  const payload = await verifyJwt(token, env.jwtSecret);
  if (!payload) {
    return jsonResponse({ user: null, devMode }, {});
  }
  return jsonResponse(
    {
      user: { userId: payload.sub, displayName: payload.name, roles: payload.roles },
      devMode,
    },
    {},
  );
}

function handleGoogleRedirect(env: AuthEnv): Response {
  if (!env.googleClientId) {
    return jsonResponse({ error: "Google OAuth not configured" }, { status: 404 });
  }
  const redirectUri = `${env.publicOrigin}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });
  return redirectResponse(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, {});
}

async function handleGoogleCallback(url: URL, env: AuthEnv): Promise<Response> {
  if (!env.googleClientId || !env.googleClientSecret) {
    return jsonResponse({ error: "Google OAuth not configured" }, { status: 500 });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return jsonResponse({ error: "Missing code parameter" }, { status: 400 });
  }

  const redirectUri = `${env.publicOrigin}/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[auth] Google token exchange failed:", text);
    return jsonResponse({ error: "Token exchange failed" }, { status: 500 });
  }
  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    return jsonResponse({ error: "Failed to fetch user info" }, { status: 500 });
  }
  const userInfo = (await userRes.json()) as GoogleUserInfo;

  const user = await findOrCreateGoogleUser(userInfo);
  const jwt = await signJwt(
    { sub: user.id, name: user.displayName, roles: user.roles },
    env.jwtSecret,
  );
  return redirectResponse("/", {
    "Set-Cookie": sessionCookie(jwt, { secure: env.secure }),
  });
}

async function handleDevLogin(request: Request, env: AuthEnv): Promise<Response> {
  const body = (await request.json()) as { name?: string };
  const name = body.name ? body.name.trim() : "";
  if (!name) {
    return jsonResponse({ error: "Name is required" }, { status: 400 });
  }
  const user = await findOrCreateDevUser(name);
  const jwt = await signJwt(
    { sub: user.id, name: user.displayName, roles: user.roles },
    env.jwtSecret,
  );
  return jsonResponse(
    { user: { userId: user.id, displayName: user.displayName } },
    {
      headers: { "Set-Cookie": sessionCookie(jwt, { secure: env.secure }) },
    },
  );
}

function handleLogout(env: AuthEnv): Response {
  return redirectResponse("/", {
    "Set-Cookie": clearSessionCookie({ secure: env.secure }),
  });
}
