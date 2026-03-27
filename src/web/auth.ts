import { createContext } from "react";

export interface AuthUser {
  userId: string;
  displayName: string;
  roles: string[];
}

export interface AuthStatus {
  user: AuthUser | null;
  devMode: boolean;
  loading: boolean;
}

export const AuthContext = createContext<AuthStatus>({ user: null, devMode: false, loading: true });

export async function fetchAuthStatus(): Promise<{ user: AuthUser | null; devMode: boolean }> {
  const res = await fetch("/auth/me");
  return (await res.json()) as { user: AuthUser | null; devMode: boolean };
}

class DevLoginError extends Error {
  override name = "DevLoginError";
  constructor(message: string) {
    super(message);
  }
}

export async function devLogin(name: string): Promise<AuthUser> {
  const res = await fetch("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error: string };
    throw new DevLoginError(data.error);
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" });
}
