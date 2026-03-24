import { useState, useEffect } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";

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
  const [games, setGames] = useState<GameInfo[]>([]);

  useEffect(() => {
    trpc.games.query().then(setGames);
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Extensoworld</h1>
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
    </div>
  );
}
