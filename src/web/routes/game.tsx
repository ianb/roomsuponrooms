import { useState, useEffect, useContext } from "react";
import { createRoute, Navigate } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { WorldShell } from "../WorldShell.js";
import { EntityViewer } from "../EntityViewer.js";
import { PromptViewer } from "../PromptViewer.js";
import { useStickyState } from "../use-sticky-state.js";
import { AuthContext } from "../auth.js";
import { trpc } from "../trpc.js";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameId",
  component: GamePage,
});

type SidebarTab = "entities" | "prompts";

function GamePage() {
  const auth = useContext(AuthContext);
  const canDebug = auth.user && auth.user.roles ? auth.user.roles.includes("debug") : false;
  const { gameId } = gameRoute.useParams();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [sidebarTab, setSidebarTab] = useStickyState<SidebarTab>("extenso:sidebarTab", "entities");
  const [sidebarExpanded, setSidebarExpanded] = useStickyState("extenso:sidebarExpanded", false);

  useEffect(() => {
    trpc.games.query().then((games) => {
      const match = games.find((g) => g.slug === gameId);
      if (match && match.theme) {
        document.documentElement.setAttribute("data-theme", match.theme);
      }
    });
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [gameId]);

  if (!auth.loading && !auth.user) {
    return <Navigate to="/" />;
  }

  function handleCommandComplete(): void {
    setRevision((r) => r + 1);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-4 lg:pb-8">
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
          <WorldShell
            gameId={gameId}
            onEntityClick={setSelectedEntityId}
            onCommandComplete={handleCommandComplete}
          />
        </div>
      </div>
      {canDebug ? (
        <div
          className={`flex ${sidebarExpanded ? "w-2/3" : "w-72"} flex-col border-l border-content/15 bg-surface`}
        >
          <div className="flex border-b border-content/15">
            <button
              onClick={() => setSidebarTab("entities")}
              className={`flex-1 px-2 py-1.5 text-xs ${
                sidebarTab === "entities"
                  ? "border-b-2 border-accent text-accent"
                  : "text-content/50 hover:text-content/70"
              }`}
            >
              Entities
            </button>
            <button
              onClick={() => setSidebarTab("prompts")}
              className={`flex-1 px-2 py-1.5 text-xs ${
                sidebarTab === "prompts"
                  ? "border-b-2 border-accent text-accent"
                  : "text-content/50 hover:text-content/70"
              }`}
            >
              AI Prompts
            </button>
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="px-2 py-1.5 text-xs text-content/40 hover:text-content/70"
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
      ) : null}
    </div>
  );
}
