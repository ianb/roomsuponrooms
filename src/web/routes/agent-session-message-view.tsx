export function MessageEntry({ index, message }: { index: number; message: unknown }) {
  if (typeof message !== "object" || message === null) {
    return (
      <div className="rounded border border-content/10 bg-surface px-3 py-2 text-xs">
        <div className="text-content/40">[{index}] (unparseable)</div>
        <pre className="overflow-x-auto text-content/60">{String(message)}</pre>
      </div>
    );
  }
  const msg = message as { role: string; content: unknown };
  return (
    <div className="rounded border border-content/10 bg-surface text-sm">
      <div className="border-b border-content/10 px-3 py-1 text-xs text-content/40">
        [{index}] {msg.role}
      </div>
      <div className="px-3 py-2">
        <MessageContent content={msg.content} />
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: unknown }) {
  if (typeof content === "string") {
    return <div className="whitespace-pre-wrap text-content/80">{content}</div>;
  }
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {(content as Array<Record<string, unknown>>).map((part, i) => (
          <ContentPart key={i} part={part} />
        ))}
      </div>
    );
  }
  return (
    <pre className="overflow-x-auto text-xs text-content/60">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function ContentPart({ part }: { part: Record<string, unknown> }) {
  const type = part["type"] as string;
  if (type === "text") {
    return <div className="whitespace-pre-wrap text-content/80">{String(part["text"] || "")}</div>;
  }
  if (type === "tool-call") {
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-blue-300">
          tool-call: {String(part["toolName"])}
        </div>
        <pre className="overflow-x-auto rounded bg-page p-2 text-xs text-content/70">
          {JSON.stringify(part["input"], null, 2)}
        </pre>
      </div>
    );
  }
  if (type === "tool-result") {
    const out = part["output"] as { value?: unknown } | undefined;
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-green-300">
          tool-result: {String(part["toolName"])}
        </div>
        <pre className="overflow-x-auto rounded bg-page p-2 text-xs text-content/70">
          {JSON.stringify(out && out.value, null, 2)}
        </pre>
      </div>
    );
  }
  if (type === "reasoning") {
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-content/40">reasoning</div>
        <div className="whitespace-pre-wrap text-xs italic text-content/50">
          {String(part["text"] || "")}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-content/40">{type}</div>
      <pre className="overflow-x-auto text-xs text-content/60">{JSON.stringify(part, null, 2)}</pre>
    </div>
  );
}
