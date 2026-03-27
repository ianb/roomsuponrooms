import { useState } from "react";

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
  schema?: unknown;
  durationMs: number;
}

export interface DebugData {
  parse?: string;
  outcome?: string;
  handler?: string;
  source?: string;
  events?: DebugEvent[];
  vetoedBy?: string;
  aiFallback?: AiFallbackDebug;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DebugView({ debug }: { debug: DebugData }) {
  const lines: string[] = [];
  if (debug.parse) lines.push(`parse: ${debug.parse}`);
  if (debug.handler) {
    const src = debug.source ? ` (${debug.source})` : "";
    lines.push(`handler: ${debug.handler}${src}`);
  }
  if (debug.outcome === "vetoed" && debug.vetoedBy) lines.push(`vetoed by: ${debug.vetoedBy}`);
  if (debug.outcome === "unhandled") lines.push("no handler matched");
  if (debug.events && debug.events.length > 0) {
    for (const event of debug.events) {
      const prop = event.property ? `.${event.property}` : "";
      const val = event.value !== undefined ? ` = ${JSON.stringify(event.value)}` : "";
      lines.push(`  ${event.description}  [${event.entityId}${prop}${val}]`);
    }
  }

  const ai = debug.aiFallback;

  return (
    <div>
      <div>{lines.join("\n")}</div>
      {ai ? <AiDebugView ai={ai} /> : null}
    </div>
  );
}

function AiDebugView({ ai }: { ai: AiFallbackDebug }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  function toggle(section: string): void {
    setExpandedSection(expandedSection === section ? null : section);
  }

  return (
    <div className="mt-1">
      <div className="text-yellow-500">AI ({formatDuration(ai.durationMs)})</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        <CollapseButton
          label="system"
          expanded={expandedSection === "system"}
          onClick={() => toggle("system")}
        />
        <CollapseButton
          label="prompt"
          expanded={expandedSection === "prompt"}
          onClick={() => toggle("prompt")}
        />
        <CollapseButton
          label="response"
          expanded={expandedSection === "response"}
          onClick={() => toggle("response")}
        />
        {ai.schema ? (
          <CollapseButton
            label="schema"
            expanded={expandedSection === "schema"}
            onClick={() => toggle("schema")}
          />
        ) : null}
      </div>
      {expandedSection === "schema" && ai.schema ? (
        <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-gray-800 p-2 text-xs text-yellow-600/80">
          {JSON.stringify(ai.schema, null, 2)}
        </pre>
      ) : null}
      {expandedSection === "system" && ai.systemPrompt ? (
        <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-gray-800 p-2 text-xs text-yellow-600/80">
          {ai.systemPrompt}
        </pre>
      ) : null}
      {expandedSection === "prompt" ? (
        <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-gray-800 p-2 text-xs text-yellow-600/80">
          {ai.prompt}
        </pre>
      ) : null}
      {expandedSection === "response" ? (
        <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-gray-800 p-2 text-xs text-yellow-600/80">
          {JSON.stringify(ai.response, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function CollapseButton({
  label,
  expanded,
  onClick,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded border px-1.5 py-0.5 text-xs ${
        expanded
          ? "border-yellow-600 bg-yellow-900/40 text-yellow-400"
          : "border-yellow-800 text-yellow-700 hover:text-yellow-500"
      }`}
      onClick={onClick}
    >
      {expanded ? "\u25BC" : "\u25B6"} {label}
    </button>
  );
}
