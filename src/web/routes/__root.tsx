import { useState, useEffect } from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { AuthContext, fetchAuthStatus } from "../auth.js";
import type { AuthUser } from "../auth.js";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuthStatus().then((status) => {
      setUser(status.user);
      setDevMode(status.devMode);
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext value={{ user, devMode, loading }}>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Outlet />
      </div>
    </AuthContext>
  );
}
