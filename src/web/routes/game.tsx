import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { WorldShell } from "../WorldShell.js";
import { EntityViewer } from "../EntityViewer.js";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameId",
  component: GamePage,
});

function GamePage() {
  const { gameId } = gameRoute.useParams();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  function handleCommandComplete(): void {
    setRevision((r) => r + 1);
  }

  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl">
          <WorldShell
            gameId={gameId}
            onEntityClick={setSelectedEntityId}
            onCommandComplete={handleCommandComplete}
          />
        </div>
      </div>
      <div className="w-72 border-l border-gray-700 bg-gray-900">
        <EntityViewer
          gameId={gameId}
          selectedId={selectedEntityId}
          onSelect={setSelectedEntityId}
          revision={revision}
        />
      </div>
    </div>
  );
}
