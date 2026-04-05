import { useState, useRef, useEffect, useContext, useCallback } from "react";
import { trpc } from "./trpc.js";
import { useStickyState } from "./use-sticky-state.js";
import { streamCommand } from "./stream-command.js";
import { AuthContext } from "./auth.js";
import { ThinkingIndicator } from "./ThinkingIndicator.js";
import {
  LogEntryView,
  ShellToolbar,
  ConversationHeader,
  ShellInput,
  resultToLogEntries,
} from "./shell-components.js";
import type { LogEntry } from "./shell-components.js";

interface ImageCallbacks {
  setGenerating: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setStatus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setVersions: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

function triggerImageGeneration(
  params: { gameId: string; entityId: string },
  cb: ImageCallbacks,
): void {
  const { gameId, entityId } = params;
  cb.setGenerating((prev) => ({ ...prev, [entityId]: true }));
  trpc.generateEntityImage
    .mutate({
      gameId,
      entityId,
      entityType: entityId.startsWith("room:") ? "room" : "npc",
      imagePrompt: "",
    })
    .then((result) => {
      cb.setGenerating((prev) => ({ ...prev, [entityId]: false }));
      if ("imageUrl" in result) {
        cb.setStatus((prev) => ({ ...prev, [entityId]: true }));
        cb.setVersions((prev) => ({ ...prev, [entityId]: Date.now() }));
      } else if ("error" in result) {
        console.error(`Image generation failed: ${result.error}`);
        alert(`Image generation failed: ${result.error}`);
      }
    })
    .catch((err: unknown) => {
      cb.setGenerating((prev) => ({ ...prev, [entityId]: false }));
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Image generation error: ${msg}`);
    });
}

/** Extract {img:entityId|name} markers from output text */
function extractImageIds(text: string): string[] {
  const pattern = /{img:([^|}]+)/g;
  const ids: string[] = [];
  let m = pattern.exec(text);
  while (m !== null) {
    ids.push(m[1]!);
    m = pattern.exec(text);
  }
  return ids;
}

interface ImageStatusCallbacks {
  setStatus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

function fetchImageStatus(
  params: { gameId: string; text: string },
  cb: ImageStatusCallbacks,
): void {
  const ids = extractImageIds(params.text);
  if (ids.length === 0) return;
  trpc.entityImageStatus.query({ gameId: params.gameId, entityIds: ids }).then((status) => {
    const s = status as Record<string, { exists: boolean; prompt: string | null }>;
    const statusMap: Record<string, boolean> = {};
    const promptMap: Record<string, string> = {};
    for (const [id, info] of Object.entries(s)) {
      statusMap[id] = info.exists;
      if (info.prompt) promptMap[id] = info.prompt;
    }
    cb.setStatus((prev) => ({ ...prev, ...statusMap }));
    cb.setPrompts((prev) => ({ ...prev, ...promptMap }));
  });
}

export function WorldShell({
  gameId,
  onEntityClick,
  onCommandComplete,
  mapButton,
  aiThinkingMessages,
}: {
  gameId: string;
  onEntityClick?: (id: string) => void;
  onCommandComplete?: () => void;
  mapButton?: React.ReactNode;
  aiThinkingMessages?: string[] | null;
}) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"thinking" | "ai" | null>(null);
  const auth = useContext(AuthContext);
  const roles = auth.user && auth.user.roles ? auth.user.roles : [];
  const canDebug = roles.includes("debug");
  const isAdmin = roles.includes("admin");
  const [debugMode, setDebugMode] = useStickyState("extenso:debugMode", false);
  const [conversationMode, setConversationMode] = useState<{
    npcName: string;
    knownWords: string[];
  } | null>(null);
  const [imageStatus, setImageStatus] = useState<Record<string, boolean>>({});
  const [imagePrompts, setImagePrompts] = useState<Record<string, string>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
  const [imageVersions, setImageVersions] = useState<Record<string, number>>({});
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshImageStatus = useCallback(
    (text: string) =>
      fetchImageStatus(
        { gameId, text },
        { setStatus: setImageStatus, setPrompts: setImagePrompts },
      ),
    [gameId],
  );

  useEffect(() => {
    trpc.look.query({ gameId }).then((result) => {
      setLog([{ type: "output", text: result.output }]);
      refreshImageStatus(result.output);
    });
  }, [gameId, refreshImageStatus]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;
      const command = input;
      setInput("");
      setLoading(true);
      setLoadingPhase("thinking");
      setLog((prev) => [...prev, { type: "input", text: `> ${command}` }]);
      try {
        const result = await streamCommand({
          gameId,
          text: command,
          debug: debugMode,
          onPhase(phase) {
            if (phase === "ai") setLoadingPhase("ai");
          },
        });
        setLog((prev) => [...prev, ...resultToLogEntries(result)]);
        if ("conversationMode" in result) {
          setConversationMode(
            (result.conversationMode as { npcName: string; knownWords: string[] } | null) || null,
          );
        }
        refreshImageStatus(result.output);
        if (onCommandComplete) onCommandComplete();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setLog((prev) => [...prev, { type: "output", text: `{!Error: ${message}!}` }]);
      }
      setLoading(false);
      setLoadingPhase(null);
      if (inputRef.current) inputRef.current.focus();
    },
    [input, loading, gameId, debugMode, refreshImageStatus, onCommandComplete],
  );

  const handleGenerateImage = useCallback(
    (entityId: string) =>
      triggerImageGeneration(
        { gameId, entityId },
        {
          setGenerating: setGeneratingImages,
          setStatus: setImageStatus,
          setVersions: setImageVersions,
        },
      ),
    [gameId],
  );

  return (
    <div className="flex h-full flex-col">
      <ShellToolbar
        canDebug={canDebug}
        debugMode={debugMode}
        setDebugMode={setDebugMode}
        mapButton={mapButton}
      />
      {conversationMode ? <ConversationHeader npcName={conversationMode.npcName} /> : null}
      <div
        data-scroll-container
        className={`flex-1 overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap ${
          conversationMode ? "border-x border-convo/50 bg-page" : "rounded-t-lg bg-surface"
        }`}
      >
        {log.map((entry, i) => (
          <LogEntryView
            key={i}
            entry={entry}
            gameId={gameId}
            isAdmin={isAdmin}
            imageStatus={imageStatus}
            imageVersions={imageVersions}
            imagePrompts={imagePrompts}
            generatingImages={generatingImages}
            onEntityClick={onEntityClick}
            onGenerateImage={handleGenerateImage}
            onFillInput={(text) => {
              setInput(text);
              requestAnimationFrame(() => {
                if (inputRef.current) inputRef.current.focus();
              });
            }}
            onLogAppend={(entries) => setLog((prev) => [...prev, ...entries])}
          />
        ))}
        {loading ? (
          <ThinkingIndicator phase={loadingPhase} customMessages={aiThinkingMessages} />
        ) : null}
        <div ref={logEndRef} />
      </div>
      <ShellInput
        input={input}
        setInput={setInput}
        loading={loading}
        conversationMode={!!conversationMode}
        inputRef={inputRef}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
