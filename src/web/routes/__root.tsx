import { useState, useEffect, useContext } from "react";
import { Outlet, Link, createRootRoute, useMatchRoute } from "@tanstack/react-router";
import { AuthContext, fetchAuthStatus, logout } from "../auth.js";
import type { AuthUser } from "../auth.js";
import { trpc } from "../trpc.js";
import { BUILD_COMMIT } from "../../../generated/build-version.js";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const matchRoute = useMatchRoute();
  const isGamePage = matchRoute({ to: "/game/$gameId", fuzzy: true });

  useEffect(() => {
    fetchAuthStatus().then((status) => {
      setUser(status.user);
      setDevMode(status.devMode);
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext value={{ user, devMode, loading }}>
      <div
        className={`flex flex-col bg-page text-content ${isGamePage ? "h-screen" : "min-h-screen"}`}
      >
        <NavBar />
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
        {isGamePage ? null : <Footer />}
      </div>
    </AuthContext>
  );
}

function NavBar() {
  const auth = useContext(AuthContext);
  const matchRoute = useMatchRoute();
  const isGamePage = matchRoute({ to: "/game/$gameId", fuzzy: true });
  const isHomePage = matchRoute({ to: "/" });

  return (
    <nav className="border-b border-content/10 px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {isHomePage ? (
            <span className="font-bold text-content">Rooms Upon Rooms</span>
          ) : (
            <Link to="/" className="font-bold text-content/50 hover:text-content/70">
              Rooms Upon Rooms
            </Link>
          )}
          {isGamePage ? (
            <GameBreadcrumb gameId={(isGamePage as { gameId: string }).gameId} />
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {auth.loading ? null : auth.user ? (
            <UserIndicator
              name={auth.user.displayName}
              isAdmin={auth.user.roles.includes("admin")}
            />
          ) : (
            <Link to="/" className="text-content/40 hover:text-content/70">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function GameBreadcrumb({ gameId }: { gameId: string }) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    trpc.games.query().then((games) => {
      const match = games.find((g: { slug: string }) => g.slug === gameId);
      if (match) setTitle(match.title);
    });
  }, [gameId]);

  return (
    <>
      <span className="text-content/25">/</span>
      <span className="text-content/70">{title || gameId}</span>
    </>
  );
}

function UserIndicator({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  async function handleLogout(): Promise<void> {
    await logout();
    window.location.reload();
  }

  return (
    <>
      <span className="text-content/50">{name}</span>
      {isAdmin ? (
        <Link to="/admin" className="font-mono text-xs text-content/20 hover:text-content/40">
          {BUILD_COMMIT}
        </Link>
      ) : null}
      <button onClick={handleLogout} className="text-content/25 hover:text-content/70">
        Sign out
      </button>
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-content/10 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center justify-between text-xs text-content/40">
        <div className="flex gap-4">
          <Link to="/about" className="hover:text-content/70">
            About
          </Link>
          <Link to="/privacy" className="hover:text-content/70">
            Privacy
          </Link>
          <Link to="/tos" className="hover:text-content/70">
            Terms
          </Link>
        </div>
        <a
          href="https://github.com/ianb/roomsuponrooms"
          className="hover:text-content/70"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
