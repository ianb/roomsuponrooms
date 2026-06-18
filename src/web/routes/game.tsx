import { useState, useEffect, useContext } from "react";
import { createRoute, Navigate } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { WorldShell } from "../WorldShell.js";
import { EntityViewer } from "../EntityViewer.js";
import { PromptViewer } from "../PromptViewer.js";
import { MapPanel } from "../MapPanel.js";
import { StandingPanel } from "../StandingPanel.js";
import { useStickyState } from "../use-sticky-state.js";
import { AuthContext } from "../auth.js";
import { trpc } from "../trpc.js";
import type { TrackStatus } from "../../core/progression.js";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameId",
  component: GamePage,
});

type SidebarTab = "map" | "standing" | "entities" | "prompts";

function GamePage() {
  const auth = useContext(AuthContext);
  const canDebug = auth.user && auth.user.roles ? auth.user.roles.includes("debug") : false;
  const { gameId } = gameRoute.useParams();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [sidebarTab, setSidebarTab] = useStickyState<SidebarTab>("extenso:sidebarTab", "map");
  const [sidebarExpanded, setSidebarExpanded] = useStickyState("extenso:sidebarExpanded", false);
  const [showMobileMap, setShowMobileMap] = useState(false);
  const [aiThinkingMessages, setAiThinkingMessages] = useState<string[] | null>(null);
  const [statusTracks, setStatusTracks] = useState<TrackStatus[]>([]);

  useEffect(() => {
    trpc.playerStanding.query({ gameId }).then((data) => setStatusTracks(data.tracks));
  }, [gameId, revision]);

  useEffect(() => {
    trpc.games.query().then((games) => {
      const match = games.find((g) => g.slug === gameId);
      if (match && match.theme) {
        document.documentElement.setAttribute("data-theme", match.theme);
      }
      if (match && match.aiThinkingMessages) {
        setAiThinkingMessages(match.aiThinkingMessages);
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
            aiThinkingMessages={aiThinkingMessages}
            mapButton={
              <button
                onClick={() => setShowMobileMap(true)}
                className="rounded px-2 py-1 text-xs text-content/40 hover:text-content/60 lg:hidden"
                title="Show map"
              >
                Map
              </button>
            }
          />
        </div>
      </div>
      {/* Sidebar: always visible on lg screens */}
      <div
        className={`hidden lg:flex ${sidebarExpanded ? "w-2/3" : "w-80"} flex-col border-l border-content/15 bg-surface`}
      >
        <SidebarTabs
          canDebug={canDebug}
          hasStanding={statusTracks.length > 0}
          sidebarTab={sidebarTab}
          onTabChange={setSidebarTab}
          sidebarExpanded={sidebarExpanded}
          onToggleExpand={() => setSidebarExpanded(!sidebarExpanded)}
        />
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "map" && <MapPanel gameId={gameId} revision={revision} />}
          {sidebarTab === "standing" && <StandingPanel tracks={statusTracks} />}
          {sidebarTab === "entities" && canDebug ? (
            <EntityViewer
              gameId={gameId}
              selectedId={selectedEntityId}
              onSelect={setSelectedEntityId}
              revision={revision}
            />
          ) : null}
          {sidebarTab === "prompts" && canDebug ? (
            <PromptViewer gameId={gameId} revision={revision} />
          ) : null}
        </div>
      </div>
      {/* Mobile map modal */}
      {showMobileMap ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-page/95 lg:hidden">
          <div className="flex items-center justify-between border-b border-content/15 px-4 py-2">
            <span className="text-sm text-content/70">Map</span>
            <button
              onClick={() => setShowMobileMap(false)}
              className="text-sm text-content/50 hover:text-content/80"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <MapPanel gameId={gameId} revision={revision} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarTabs({
  canDebug,
  hasStanding,
  sidebarTab,
  onTabChange,
  sidebarExpanded,
  onToggleExpand,
}: {
  canDebug: boolean;
  hasStanding: boolean;
  sidebarTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  sidebarExpanded: boolean;
  onToggleExpand: () => void;
}) {
  function tabClass(tab: SidebarTab): string {
    return `flex-1 px-2 py-1.5 text-xs ${
      sidebarTab === tab
        ? "border-b-2 border-accent text-accent"
        : "text-content/50 hover:text-content/70"
    }`;
  }

  return (
    <div className="flex border-b border-content/15">
      <button onClick={() => onTabChange("map")} className={tabClass("map")}>
        Map
      </button>
      {hasStanding ? (
        <button onClick={() => onTabChange("standing")} className={tabClass("standing")}>
          Standing
        </button>
      ) : null}
      {canDebug ? (
        <>
          <button onClick={() => onTabChange("entities")} className={tabClass("entities")}>
            Entities
          </button>
          <button onClick={() => onTabChange("prompts")} className={tabClass("prompts")}>
            AI Prompts
          </button>
        </>
      ) : null}
      <button
        onClick={onToggleExpand}
        className="px-2 py-1.5 text-xs text-content/40 hover:text-content/70"
        title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarExpanded ? "\u25B7" : "\u25C1"}
      </button>
    </div>
  );
}
