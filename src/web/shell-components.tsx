import type { DebugData } from "./DebugView.js";
import type { BugPreviewData } from "./BugReportView.js";
import { HighlightedText } from "./HighlightedText.js";
import { DebugView } from "./DebugView.js";
import { BugPreviewEntry } from "./BugReportView.js";

export interface LogEntry {
  type: "input" | "output" | "debug" | "system" | "event" | "bug-preview";
  text: string;
  debugData?: DebugData;
  bugPreview?: BugPreviewData;
}

export function resultToLogEntries(result: {
  output: string;
  debug?: unknown;
  aiOutput?: string;
  eventDescriptions?: string[];
  bugPreview?: BugPreviewData;
}): LogEntry[] {
  if (result.bugPreview) {
    return [{ type: "bug-preview", text: "", bugPreview: result.bugPreview }];
  }
  const entries: LogEntry[] = [];
  const aiOutput = "aiOutput" in result ? (result.aiOutput as string) : null;
  if (aiOutput) {
    entries.push({ type: "system", text: aiOutput });
  }
  entries.push({ type: "output", text: result.output as string });
  if (result.eventDescriptions && result.eventDescriptions.length > 0) {
    for (const desc of result.eventDescriptions) {
      entries.push({ type: "event", text: desc });
    }
  }
  if ("debug" in result && result.debug) {
    entries.push({ type: "debug", text: "", debugData: result.debug as DebugData });
  }
  return entries;
}

export function LogEntryView({
  entry,
  gameId,
  isAdmin,
  imageStatus,
  imageVersions,
  imagePrompts,
  generatingImages,
  onEntityClick,
  onGenerateImage,
  onFillInput,
  onLogAppend,
}: {
  entry: LogEntry;
  gameId: string;
  isAdmin: boolean;
  imageStatus: Record<string, boolean>;
  imageVersions: Record<string, number>;
  imagePrompts: Record<string, string>;
  generatingImages: Record<string, boolean>;
  onEntityClick?: (id: string) => void;
  onGenerateImage: (entityId: string) => void;
  onFillInput: (text: string) => void;
  onLogAppend: (entries: LogEntry[]) => void;
}) {
  if (entry.type === "bug-preview" && entry.bugPreview) {
    return (
      <BugPreviewEntry
        preview={entry.bugPreview}
        onResolved={(msg, isError) => {
          const type = isError ? "output" : "system";
          onLogAppend([{ type, text: msg }]);
        }}
      />
    );
  }
  return (
    <div
      className={
        entry.type === "input"
          ? "text-accent"
          : entry.type === "debug"
            ? "mt-1 border-l-2 border-caution/50 pl-2 text-xs text-caution/70"
            : entry.type === "system"
              ? "text-ai/70"
              : entry.type === "event"
                ? "text-xs text-highlight-direction/80"
                : "overflow-hidden text-content/70"
      }
    >
      {entry.type === "output" ? (
        <HighlightedText
          text={entry.text}
          gameId={gameId}
          isAdmin={isAdmin}
          imageStatus={imageStatus}
          imageVersions={imageVersions}
          imagePrompts={imagePrompts}
          generatingImages={generatingImages}
          onEntityClick={onEntityClick}
          onTopicClick={(word) => onFillInput(word)}
          onCommandClick={(cmd) => onFillInput(cmd)}
          onGenerateImage={onGenerateImage}
        />
      ) : entry.type === "debug" && entry.debugData ? (
        <DebugView debug={entry.debugData} />
      ) : entry.type === "event" ? (
        <span>
          <span className="mr-1">&#x25C6;</span>
          <HighlightedText text={entry.text} gameId={gameId} onEntityClick={onEntityClick} />
        </span>
      ) : (
        entry.text
      )}
    </div>
  );
}

export function ShellToolbar({
  canDebug,
  debugMode,
  setDebugMode,
  mapButton,
}: {
  canDebug: boolean;
  debugMode: boolean;
  setDebugMode: (v: boolean) => void;
  mapButton?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-2 py-1">
      {mapButton}
      {canDebug ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-content/40">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
            className="accent-accent"
          />
          Debug
        </label>
      ) : null}
    </div>
  );
}

export function ConversationHeader({ npcName }: { npcName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-t-lg border-x border-t border-convo/50 bg-convo-bg px-3 py-2 text-sm text-convo/80">
      <span className="font-bold">{npcName}</span>
      <span className="ml-auto text-xs text-convo/50">
        Type a topic word, or &quot;bye&quot; to leave
      </span>
    </div>
  );
}

export function ShellInput({
  input,
  setInput,
  loading,
  conversationMode,
  inputRef,
  onSubmit,
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  conversationMode: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
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
  );
}
