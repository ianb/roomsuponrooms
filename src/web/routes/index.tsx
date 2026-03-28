import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext, devLogin } from "../auth.js";

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
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="mb-4 text-center text-3xl font-bold tracking-tight text-content">
          Rooms Upon Rooms Upon Rooms
        </h1>
        <p className="text-content/50">
          Text adventure worlds with rooms to explore, objects to interact with, and characters to
          talk to. But the map doesn&rsquo;t end. Walk through an exit and new rooms appear. Say
          something unexpected to an NPC and they&rsquo;ll find a way to respond. Everything that
          gets created sticks around. The world grows permanently.
        </p>
      </div>

      {/* Sign in prompt (only when not logged in) */}
      {!auth.loading && !auth.user ? <LoginSection devMode={auth.devMode} /> : null}

      {/* Game list */}
      <div className="mb-4">
        <h2 className="mb-4 text-lg font-bold text-content/70">Adventures</h2>
        <div className="space-y-3">
          {games.map((game) => (
            <Link
              key={game.slug}
              to="/game/$gameId"
              params={{ gameId: game.slug }}
              className="block rounded-lg border border-content/15 bg-surface p-4 hover:border-accent hover:bg-input"
            >
              <h3 className="font-bold text-accent">{game.title}</h3>
              <p className="mt-1 text-sm text-content/50">{game.description}</p>
            </Link>
          ))}
        </div>
      </div>
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
      <div className="mb-8 rounded-lg border border-content/15 bg-surface p-6">
        <p className="mb-4 text-content/50">Sign in to play:</p>
        <form onSubmit={handleDevLogin} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="flex-1 rounded border border-content/15 bg-input px-3 py-2 text-content placeholder-content/40 focus:border-accent focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="rounded bg-accent-bold px-4 py-2 font-medium text-content hover:bg-accent-bold/80"
          >
            Sign in
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border border-content/15 bg-surface p-6 text-center">
      <p className="mb-4 text-content/50">Sign in to start exploring</p>
      <a
        href="/auth/google"
        className="inline-block rounded bg-accent-bold px-6 py-2 font-medium text-content hover:bg-accent-bold/80"
      >
        Sign in with Google
      </a>
    </div>
  );
}
