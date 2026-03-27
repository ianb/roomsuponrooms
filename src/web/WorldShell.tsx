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
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="accent-sky-500"
            />
            Debug
          </label>
        </div>
      ) : null}
      {conversationMode ? (
        <div className="flex items-center gap-2 rounded-t-lg border-x border-t border-cyan-700 bg-cyan-950 px-3 py-2 text-sm text-cyan-200">
          <span className="font-bold">{conversationMode.npcName}</span>
          <span className="ml-auto text-xs text-cyan-400/70">
            Type a topic word, or &quot;bye&quot; to leave
          </span>
        </div>
      ) : null}
      <div
        className={`flex-1 overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap ${
          conversationMode ? "border-x border-cyan-700 bg-gray-950" : "rounded-t-lg bg-gray-900"
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
        className={`flex gap-2 rounded-b-lg p-2 ${conversationMode ? "border-x border-b border-cyan-700 bg-gray-950" : "bg-gray-900"}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={conversationMode ? "Say a topic word..." : "Enter command..."}
          className={`flex-1 rounded border px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none ${
            conversationMode
              ? "border-cyan-700 bg-gray-950 placeholder-cyan-600 focus:border-cyan-500"
              : "border-gray-700 bg-gray-900 placeholder-gray-500 focus:border-sky-500"
          }`}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-sky-700 px-4 py-2 font-mono text-sm text-gray-100 hover:bg-sky-600 disabled:opacity-50"
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
          ? "text-sky-400"
          : entry.type === "debug"
            ? "mt-1 border-l-2 border-yellow-700 pl-2 text-xs text-yellow-600"
            : entry.type === "system"
              ? "text-purple-300"
              : "text-gray-200"
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
  const color = phase === "ai" ? "text-purple-400" : "text-gray-400";

  return <div className={`${color} animate-pulse`}>{text}</div>;
}
