/**
 * Minimal JWT (HS256) implementation using Web Crypto API.
 * Works in both Cloudflare Workers and Node.js 20+.
 */

export interface JwtPayload {
  sub: string;
  name: string;
  iat: number;
  exp: number;
}

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.codePointAt(i)!;
  }
  return bytes;
}

const encoder = new TextEncoder();

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const HEADER_B64 = base64urlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export async function signJwt(
  payload: { sub: string; name: string },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + THIRTY_DAYS,
  };
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  const key = await getSigningKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const sigB64 = base64urlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const sigB64 = parts[2]!;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getSigningKey(secret);
  const sigBytes = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes.buffer as ArrayBuffer,
    encoder.encode(signingInput),
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  return payload;
}

/** Parse a Cookie header string and return the value of a named cookie */
export function parseCookie(header: string, name: string): string | null {
  const pairs = header.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (key === name) {
      return pair.slice(eqIdx + 1).trim();
    }
  }
  return null;
}

/** Build a Set-Cookie header value for the session JWT */
export function sessionCookie(token: string, { secure }: { secure: boolean }): string {
  const parts = [
    `session=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${THIRTY_DAYS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build a Set-Cookie header that clears the session */
export function clearSessionCookie({ secure }: { secure: boolean }): string {
  const parts = ["session=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
