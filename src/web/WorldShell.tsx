import { useState, useRef, useEffect, useContext } from "react";
import { trpc } from "./trpc.js";
import { HighlightedText } from "./HighlightedText.js";
import { useStickyState } from "./use-sticky-state.js";
import { DebugView } from "./DebugView.js";
import type { DebugData } from "./DebugView.js";
import { streamCommand } from "./stream-command.js";
import { AuthContext } from "./auth.js";

interface LogEntry {
  type: "input" | "output" | "debug" | "system";
  text: string;
  debugData?: DebugData;
}

function resultToLogEntries(result: {
  output: string;
  debug?: unknown;
  aiOutput?: string;
}): LogEntry[] {
  const entries: LogEntry[] = [];
  const aiOutput = "aiOutput" in result ? (result.aiOutput as string) : null;
  if (aiOutput) {
    entries.push({ type: "system", text: aiOutput });
  }
  entries.push({ type: "output", text: result.output as string });
  if ("debug" in result && result.debug) {
    entries.push({ type: "debug", text: "", debugData: result.debug as DebugData });
  }
  return entries;
}

export function WorldShell({
  gameId,
  onEntityClick,
  onCommandComplete,
}: {
  gameId: string;
  onEntityClick?: (id: string) => void;
  onCommandComplete?: () => void;
}) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"thinking" | "ai" | null>(null);
  const auth = useContext(AuthContext);
  const canDebug = auth.user && auth.user.roles ? auth.user.roles.includes("debug") : false;
  const [debugMode, setDebugMode] = useStickyState("extenso:debugMode", false);
  const [conversationMode, setConversationMode] = useState<{
    npcName: string;
    knownWords: string[];
  } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trpc.look.query({ gameId }).then((result) => {
      setLog([{ type: "output", text: result.output }]);
    });
  }, [gameId]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [log]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const command = input;
    setInput("");
    setLoading(true);
    setLoadingPhase("thinking");

    setLog((prev) => [...prev, { type: "input", text: `> ${command}` }]);

    let result;
    try {
      result = await streamCommand({
        gameId,
        text: command,
        debug: debugMode,
        onPhase(phase) {
          if (phase === "ai") setLoadingPhase("ai");
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLog((prev) => [...prev, { type: "output", text: `{!Error: ${message}!}` }]);
      setLoading(false);
      setLoadingPhase(null);
      return;
    }
    const entries = resultToLogEntries(result);
    if ("conversationMode" in result) {
      const mode = result.conversationMode as { npcName: string; knownWords: string[] } | null;
      setConversationMode(mode || null);
    }
    setLog((prev) => [...prev, ...entries]);
    setLoading(false);
    setLoadingPhase(null);
    if (onCommandComplete) onCommandComplete();
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div className="flex h-full flex-col">
      {canDebug ? (
        <div className="flex items-center justify-end py-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-content/40">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="accent-accent"
            />
            Debug
          </label>
        </div>
      ) : null}
      {conversationMode ? (
        <div className="flex items-center gap-2 rounded-t-lg border-x border-t border-convo/50 bg-convo-bg px-3 py-2 text-sm text-convo/80">
          <span className="font-bold">{conversationMode.npcName}</span>
          <span className="ml-auto text-xs text-convo/50">
            Type a topic word, or &quot;bye&quot; to leave
          </span>
        </div>
      ) : null}
      <div
        className={`flex-1 overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap ${
          conversationMode ? "border-x border-convo/50 bg-page" : "rounded-t-lg bg-surface"
        }`}
      >
        {log.map((entry, i) => (
          <LogEntryView
            key={i}
            entry={entry}
            onEntityClick={onEntityClick}
            onFillInput={(text) => {
              setInput(text);
              requestAnimationFrame(() => {
                if (inputRef.current) inputRef.current.focus();
              });
            }}
          />
        ))}
        {loading ? <ThinkingIndicator phase={loadingPhase} /> : null}
        <div ref={logEndRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className={`flex gap-2 rounded-b-lg p-2 ${conversationMode ? "border-x border-b border-convo/50 bg-page" : "bg-surface"}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={conversationMode ? "Say a topic word..." : "Enter command..."}
          className={`flex-1 rounded border px-3 py-2 font-mono text-sm text-content focus:outline-none ${
            conversationMode
              ? "border-convo/50 bg-page placeholder-convo/40 focus:border-convo"
              : "border-content/15 bg-surface placeholder-content/40 focus:border-accent"
          }`}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-accent-bold px-4 py-2 font-mono text-sm text-content hover:bg-accent-bold/80 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function LogEntryView({
  entry,
  onEntityClick,
  onFillInput,
}: {
  entry: LogEntry;
  onEntityClick?: (id: string) => void;
  onFillInput: (text: string) => void;
}) {
  return (
    <div
      className={
        entry.type === "input"
          ? "text-accent"
          : entry.type === "debug"
            ? "mt-1 border-l-2 border-caution/50 pl-2 text-xs text-caution/70"
            : entry.type === "system"
              ? "text-ai/70"
              : "text-content/70"
      }
    >
      {entry.type === "output" ? (
        <HighlightedText
          text={entry.text}
          onEntityClick={onEntityClick}
          onTopicClick={(word) => onFillInput(word)}
          onCommandClick={(cmd) => onFillInput(cmd)}
        />
      ) : entry.type === "debug" && entry.debugData ? (
        <DebugView debug={entry.debugData} />
      ) : (
        entry.text
      )}
    </div>
  );
}

function ThinkingIndicator({ phase }: { phase: "thinking" | "ai" | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!visible && phase !== "ai") return null;

  const text = phase === "ai" ? "Asking the AI..." : "Thinking...";
  const color = phase === "ai" ? "text-ai" : "text-content/50";

  return <div className={`${color} animate-pulse`}>{text}</div>;
}
