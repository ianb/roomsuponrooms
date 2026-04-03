import { useState } from "react";
import { trpc } from "./trpc.js";

export interface BugPreviewData {
  description: string;
  gameId: string;
  userId: string;
  userName: string | null;
  roomId: string | null;
  roomName: string | null;
  recentCommands: Array<{ command: string; timestamp: string }>;
  entityChanges: Array<{
    id: string;
    name: string;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
  }>;
}

export function BugReportPreview({
  preview,
  onSubmit,
  onCancel,
  submitting,
}: {
  preview: BugPreviewData;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="my-2 rounded border border-caution/50 bg-surface p-3 text-sm">
      <div className="mb-2 font-bold text-caution">Bug Report Preview</div>
      <div className="mb-2 text-content/80">
        <span className="font-bold">Description:</span> {preview.description}
      </div>
      {preview.roomName ? (
        <div className="mb-2 text-content/60">
          <span className="font-bold">Room:</span> {preview.roomName}
        </div>
      ) : null}
      {preview.recentCommands.length > 0 ? (
        <div className="mb-2">
          <div className="font-bold text-content/60">Recent commands:</div>
          <div className="ml-2 font-mono text-xs text-content/50">
            {preview.recentCommands.map((cmd, i) => (
              <div key={i}>&gt; {cmd.command}</div>
            ))}
          </div>
        </div>
      ) : null}
      {preview.entityChanges.length > 0 ? (
        <div className="mb-2">
          <div className="font-bold text-content/60">State changes:</div>
          <div className="ml-2 text-xs text-content/50">
            {preview.entityChanges.map((ec) => (
              <div key={ec.id}>
                <span className="font-bold">{ec.name}</span>:{" "}
                {ec.changes.map((c) => c.field).join(", ")}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="rounded bg-accent-bold px-3 py-1 text-sm text-content hover:bg-accent-bold/80 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Bug Report"}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="rounded border border-content/20 px-3 py-1 text-sm text-content/70 hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface BugReportDetailData {
  id: string;
  description: string;
  gameId: string;
  userName: string | null;
  roomName: string | null;
  status: string;
  createdAt: string;
  recentCommands: Array<{ command: string; timestamp: string }>;
  entityChanges: Array<{
    id: string;
    name: string;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
  }>;
}

export function BugReportDetail({ report }: { report: BugReportDetailData }) {
  return (
    <div className="rounded border border-content/20 bg-surface p-4 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-content/50">{report.id}</span>
        <StatusBadge status={report.status} />
      </div>
      <div className="mb-2 text-lg font-bold text-content">{report.description}</div>
      <div className="mb-3 flex gap-4 text-xs text-content/50">
        <span>Game: {report.gameId}</span>
        {report.userName ? <span>By: {report.userName}</span> : null}
        {report.roomName ? <span>Room: {report.roomName}</span> : null}
        <span>{new Date(report.createdAt).toLocaleString()}</span>
      </div>
      {report.recentCommands.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 font-bold text-content/60">Recent commands:</div>
          <div className="rounded bg-page p-2 font-mono text-xs">
            {report.recentCommands.map((cmd, i) => (
              <div key={i} className="text-accent">
                &gt; {cmd.command}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {report.entityChanges.length > 0 ? (
        <div>
          <div className="mb-1 font-bold text-content/60">State changes:</div>
          <div className="rounded bg-page p-2 text-xs">
            {report.entityChanges.map((ec) => (
              <div key={ec.id} className="mb-1">
                <span className="font-bold text-content/80">{ec.name}</span>
                <span className="text-content/50"> ({ec.id})</span>
                {ec.changes.map((c, j) => (
                  <div key={j} className="ml-2 text-content/60">
                    {c.field}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Stateful wrapper used as a log entry in WorldShell */
export function BugPreviewEntry({
  preview,
  onResolved,
}: {
  preview: BugPreviewData;
  onResolved: (message: string, isError?: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);

  if (resolved) return null;

  return (
    <BugReportPreview
      preview={preview}
      submitting={submitting}
      onSubmit={async () => {
        setSubmitting(true);
        try {
          const result = await trpc.submitBug.mutate({
            gameId: preview.gameId,
            description: preview.description,
            roomId: preview.roomId,
            roomName: preview.roomName,
            recentCommands: JSON.stringify(preview.recentCommands),
            entityChanges: JSON.stringify(preview.entityChanges),
          });
          setResolved(true);
          onResolved(`Bug reported: ${result.url}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          onResolved(`{!Error submitting bug: ${msg}!}`, true);
        } finally {
          setSubmitting(false);
        }
      }}
      onCancel={() => {
        setResolved(true);
        onResolved("Bug report cancelled.");
      }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-caution/20 text-caution",
    seen: "bg-accent/20 text-accent",
    fixed: "bg-green-500/20 text-green-400",
    invalid: "bg-content/20 text-content/50",
    duplicate: "bg-content/20 text-content/50",
  };
  const cls = colors[status] || "bg-content/20 text-content/50";
  return <span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{status}</span>;
}
