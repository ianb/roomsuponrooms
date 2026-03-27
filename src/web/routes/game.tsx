import { useState, useContext } from "react";
import { createRoute, Navigate } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { WorldShell } from "../WorldShell.js";
import { EntityViewer } from "../EntityViewer.js";
import { PromptViewer } from "../PromptViewer.js";
import { useStickyState } from "../use-sticky-state.js";
import { AuthContext } from "../auth.js";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameId",
  component: GamePage,
});

type SidebarTab = "entities" | "prompts";

function GamePage() {
  const auth = useContext(AuthContext);
  const { gameId } = gameRoute.useParams();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [sidebarTab, setSidebarTab] = useStickyState<SidebarTab>("extenso:sidebarTab", "entities");
  const [sidebarExpanded, setSidebarExpanded] = useStickyState("extenso:sidebarExpanded", false);

  if (!auth.loading && !auth.user) {
    return <Navigate to="/" />;
  }

  function handleCommandComplete(): void {
    setRevision((r) => r + 1);
  }

  return (
    <div className="flex h-screen">
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-4 lg:pb-8">
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
          <WorldShell
            gameId={gameId}
            onEntityClick={setSelectedEntityId}
            onCommandComplete={handleCommandComplete}
          />
        </div>
      </div>
      <div
        className={`flex ${sidebarExpanded ? "w-2/3" : "w-72"} flex-col border-l border-gray-700 bg-gray-900`}
      >
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setSidebarTab("entities")}
            className={`flex-1 px-2 py-1.5 text-xs ${
              sidebarTab === "entities"
                ? "border-b-2 border-blue-400 text-blue-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Entities
          </button>
          <button
            onClick={() => setSidebarTab("prompts")}
            className={`flex-1 px-2 py-1.5 text-xs ${
              sidebarTab === "prompts"
                ? "border-b-2 border-blue-400 text-blue-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            AI Prompts
          </button>
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300"
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarExpanded ? "▷" : "◁"}
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "entities" && (
            <EntityViewer
              gameId={gameId}
              selectedId={selectedEntityId}
              onSelect={setSelectedEntityId}
              revision={revision}
            />
          )}
          {sidebarTab === "prompts" && <PromptViewer gameId={gameId} revision={revision} />}
        </div>
      </div>
    </div>
  );
}
