import { useState, useRef, useEffect } from "react";
import { trpc } from "./trpc.js";
import { HighlightedText } from "./HighlightedText.js";
import { useStickyState } from "./use-sticky-state.js";

interface LogEntry {
  type: "input" | "output" | "debug" | "system";
  text: string;
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

    setLog((prev) => [...prev, { type: "input", text: `> ${command}` }]);

    const result = await trpc.command.mutate({ gameId, text: command, debug: debugMode });
    const entries: LogEntry[] = [];
    const aiOutput = "aiOutput" in result ? (result.aiOutput as string) : null;
    if (aiOutput) {
      entries.push({ type: "system", text: aiOutput });
    }
    entries.push({ type: "output", text: result.output });

    // Update conversation mode state
    if ("conversationMode" in result) {
      const mode = result.conversationMode as {
        npcName: string;
        knownWords: string[];
      } | null;
      setConversationMode(mode || null);
    }

    if ("debug" in result && result.debug) {
      entries.push({ type: "debug", text: formatDebug(result.debug as DebugData) });
    }

    setLog((prev) => [...prev, ...entries]);
    setLoading(false);
    if (onCommandComplete) {
      onCommandComplete();
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end">
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
      {conversationMode ? (
        <div className="flex items-center gap-2 rounded-t-lg border-x border-t border-cyan-700 bg-cyan-950 px-3 py-2 text-sm text-cyan-200">
          <span className="font-bold">{conversationMode.npcName}</span>
          <span className="ml-auto text-xs text-cyan-400/70">
            Type a topic word, or &quot;bye&quot; to leave
          </span>
        </div>
      ) : null}
      <div
        className={`min-h-[300px] max-h-[500px] overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap ${
          conversationMode
            ? "rounded-b-lg border-x border-b border-cyan-700 bg-gray-950"
            : "rounded-lg bg-gray-900"
        }`}
      >
        {log.map((entry, i) => (
          <div
            key={i}
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
                onTopicClick={(word) => {
                  setInput(word);
                  if (inputRef.current) inputRef.current.focus();
                }}
              />
            ) : (
              entry.text
            )}
          </div>
        ))}
        {loading ? <AiThinkingIndicator /> : null}
        <div ref={logEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
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
    </>
  );
}

function AiThinkingIndicator() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return <div className="text-purple-400 animate-pulse">AI is thinking...</div>;
}

interface DebugEvent {
  description: string;
  entityId: string;
  property?: string;
  value?: unknown;
}

interface AiFallbackDebug {
  systemPrompt: string;
  prompt: string;
  response?: unknown;
  durationMs: number;
}

interface DebugData {
  parse?: string;
  outcome?: string;
  handler?: string;
  source?: string;
  events?: DebugEvent[];
  vetoedBy?: string;
  aiFallback?: AiFallbackDebug;
}

function formatDebug(debug: DebugData): string {
  const lines: string[] = [];

  if (debug.parse) {
    lines.push(`parse: ${debug.parse}`);
  }

  if (debug.handler) {
    const src = debug.source ? ` (${debug.source})` : "";
    lines.push(`handler: ${debug.handler}${src}`);
  }

  if (debug.outcome === "vetoed" && debug.vetoedBy) {
    lines.push(`vetoed by: ${debug.vetoedBy}`);
  }

  if (debug.outcome === "unhandled") {
    lines.push("no handler matched");
  }

  if (debug.events && debug.events.length > 0) {
    for (const event of debug.events) {
      const prop = event.property ? `.${event.property}` : "";
      const val = event.value !== undefined ? ` = ${JSON.stringify(event.value)}` : "";
      lines.push(`  ${event.description}  [${event.entityId}${prop}${val}]`);
    }
  }

  if (debug.aiFallback) {
    const ai = debug.aiFallback;
    lines.push(`\n--- AI (${ai.durationMs}ms) ---`);
    if (ai.systemPrompt) {
      lines.push(`system:\n${ai.systemPrompt}`);
    }
    lines.push(`prompt:\n${ai.prompt}`);
    lines.push(`response: ${JSON.stringify(ai.response, null, 2)}`);
  }

  return lines.join("\n");
}
