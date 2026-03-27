import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext, devLogin, logout } from "../auth.js";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

interface GameInfo {
  slug: string;
  title: string;
  description: string;
}

function HomePage() {
  const auth = useContext(AuthContext);
  const [games, setGames] = useState<GameInfo[]>([]);

  useEffect(() => {
    trpc.games.query().then(setGames);
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rooms Upon Rooms</h1>
        {auth.loading ? null : auth.user ? <UserBadge name={auth.user.displayName} /> : null}
      </div>

      {auth.loading ? null : !auth.user ? (
        <LoginSection devMode={auth.devMode} />
      ) : (
        <>
          <p className="mb-6 text-gray-400">Choose an adventure:</p>
          <div className="space-y-4">
            {games.map((game) => (
              <Link
                key={game.slug}
                to="/game/$gameId"
                params={{ gameId: game.slug }}
                className="block rounded-lg border border-gray-700 bg-gray-900 p-4 hover:border-sky-500 hover:bg-gray-800"
              >
                <h2 className="text-lg font-bold text-sky-400">{game.title}</h2>
                <p className="mt-1 text-sm text-gray-400">{game.description}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LoginSection({ devMode }: { devMode: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleDevLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await devLogin(name.trim());
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }

  if (devMode) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-6">
        <p className="mb-4 text-gray-400">Enter a name to start playing:</p>
        <form onSubmit={handleDevLogin} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-sky-500 focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="rounded bg-sky-700 px-4 py-2 font-medium text-gray-100 hover:bg-sky-600"
          >
            Start Playing
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-6">
      <p className="mb-4 text-gray-400">Sign in to start playing:</p>
      <a
        href="/auth/google"
        className="inline-block rounded bg-sky-700 px-4 py-2 font-medium text-gray-100 hover:bg-sky-600"
      >
        Sign in with Google
      </a>
    </div>
  );
}

function UserBadge({ name }: { name: string }) {
  async function handleLogout(): Promise<void> {
    await logout();
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-3 text-sm text-gray-400">
      <span>{name}</span>
      <button onClick={handleLogout} className="text-gray-500 hover:text-gray-300">
        Sign out
      </button>
    </div>
  );
}
