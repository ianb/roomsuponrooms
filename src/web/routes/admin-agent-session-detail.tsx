import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";
import { MessageEntry } from "./agent-session-message-view.js";

export const adminAgentSessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/agent-sessions/$sessionId",
  component: AdminAgentSessionDetailPage,
});

interface AgentSessionRecord {
  id: string;
  gameId: string;
  userId: string;
  request: string;
  status: "running" | "finished" | "bailed" | "failed";
  messages: unknown[];
  savedVars: Record<string, unknown>;
  turnCount: number;
  turnLimit: number;
  summary: string | null;
  revertOf: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

interface WorldEditRecord {
  seq: number;
  gameId: string;
  sessionId: string;
  targetKind: "entity" | "handler";
  targetId: string;
  op: "create" | "update" | "delete";
  payload: unknown;
  priorState: unknown;
  applied: boolean;
  createdAt: string;
}

interface SessionDetailData {
  session: AgentSessionRecord;
  edits: WorldEditRecord[];
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "finished":
      return "bg-green-900/40 text-green-300";
    case "running":
      return "bg-blue-900/40 text-blue-300";
    case "bailed":
      return "bg-yellow-900/40 text-yellow-300";
    case "failed":
      return "bg-red-900/40 text-red-300";
    default:
      return "bg-surface text-content/60";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function AdminAgentSessionDetailPage() {
  const { sessionId } = adminAgentSessionDetailRoute.useParams();
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");
  const [data, setData] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    trpc.adminAgentSession
      .query({ id: sessionId })
      .then((result) => {
        if (cancelled) return;
        setData(result as SessionDetailData | null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, sessionId]);

  if (!isAdmin) {
    return <div className="p-8 text-content/50">Admin access required.</div>;
  }
  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-8 text-content/50">Session not found.</div>;

  const { session, edits } = data;
  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to="/admin/agent-sessions"
        className="mb-4 inline-block text-sm text-accent hover:text-accent-hover"
      >
        &larr; All sessions
      </Link>
      <SessionMetadata session={session} editCount={edits.length} />
      <SessionEdits edits={edits} />
      <SessionMessages messages={session.messages} />
      <SessionSavedVars savedVars={session.savedVars} />
    </div>
  );
}

function SessionMetadata({
  session,
  editCount,
}: {
  session: AgentSessionRecord;
  editCount: number;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="font-mono text-xl">{session.id}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(session.status)}`}>
          {session.status}
        </span>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-content/60">
        <dt>Game</dt>
        <dd className="text-content/80">{session.gameId}</dd>
        <dt>User</dt>
        <dd className="font-mono text-xs text-content/80">{session.userId}</dd>
        <dt>Turns</dt>
        <dd className="text-content/80">
          {session.turnCount}/{session.turnLimit}
        </dd>
        <dt>Edits</dt>
        <dd className="text-content/80">{editCount}</dd>
        <dt>Created</dt>
        <dd className="text-content/80">{formatDate(session.createdAt)}</dd>
        <dt>Updated</dt>
        <dd className="text-content/80">{formatDate(session.updatedAt)}</dd>
        {session.finishedAt ? (
          <>
            <dt>Finished</dt>
            <dd className="text-content/80">{formatDate(session.finishedAt)}</dd>
          </>
        ) : null}
      </dl>
      <div className="mt-4 rounded border border-content/10 bg-surface p-3 text-sm">
        <div className="mb-1 text-xs font-bold text-content/40">REQUEST</div>
        <div className="whitespace-pre-wrap text-content/90">{session.request}</div>
      </div>
      {session.summary ? (
        <div className="mt-2 rounded border border-content/10 bg-surface p-3 text-sm">
          <div className="mb-1 text-xs font-bold text-content/40">SUMMARY</div>
          <div className="whitespace-pre-wrap text-content/90">{session.summary}</div>
        </div>
      ) : null}
    </div>
  );
}

function SessionEdits({ edits }: { edits: WorldEditRecord[] }) {
  if (edits.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Edits</h2>
        <div className="text-sm text-content/50">No edits.</div>
      </div>
    );
  }
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-bold">
        Edits <span className="text-sm font-normal text-content/50">({edits.length})</span>
      </h2>
      <div className="space-y-2">
        {edits.map((edit) => (
          <EditEntry key={edit.seq} edit={edit} />
        ))}
      </div>
    </div>
  );
}

function EditEntry({ edit }: { edit: WorldEditRecord }) {
  const [expanded, setExpanded] = useState(false);
  const opColor =
    edit.op === "create"
      ? "text-green-300"
      : edit.op === "delete"
        ? "text-red-300"
        : "text-blue-300";
  return (
    <div className="rounded border border-content/10 bg-surface text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-content/5"
      >
        <span className="font-mono text-xs text-content/40">seq {edit.seq}</span>
        <span className={`font-mono text-xs ${opColor}`}>{edit.op}</span>
        <span className="text-content/50">{edit.targetKind}</span>
        <span className="font-mono text-xs text-content/80">{edit.targetId}</span>
        {edit.applied ? (
          <span className="ml-auto text-xs text-green-400">applied</span>
        ) : (
          <span className="ml-auto text-xs text-content/40">pending</span>
        )}
      </button>
      {expanded ? (
        <div className="border-t border-content/10 px-3 py-2">
          {edit.payload !== null ? (
            <div className="mb-2">
              <div className="mb-1 text-xs font-bold text-content/40">PAYLOAD</div>
              <pre className="overflow-x-auto rounded bg-page p-2 text-xs text-content/80">
                {JSON.stringify(edit.payload, null, 2)}
              </pre>
            </div>
          ) : null}
          {edit.priorState !== null ? (
            <div>
              <div className="mb-1 text-xs font-bold text-content/40">PRIOR STATE</div>
              <pre className="overflow-x-auto rounded bg-page p-2 text-xs text-content/80">
                {JSON.stringify(edit.priorState, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SessionMessages({ messages }: { messages: unknown[] }) {
  if (messages.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Conversation</h2>
        <div className="text-sm text-content/50">No messages.</div>
      </div>
    );
  }
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-bold">
        Conversation{" "}
        <span className="text-sm font-normal text-content/50">({messages.length})</span>
      </h2>
      <div className="space-y-2">
        {messages.map((msg, i) => (
          <MessageEntry key={i} index={i} message={msg} />
        ))}
      </div>
    </div>
  );
}

function SessionSavedVars({ savedVars }: { savedVars: Record<string, unknown> }) {
  const keys = Object.keys(savedVars);
  if (keys.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-bold">
        Saved Variables <span className="text-sm font-normal text-content/50">({keys.length})</span>
      </h2>
      <div className="space-y-2">
        {keys.map((k) => (
          <div key={k} className="rounded border border-content/10 bg-surface px-3 py-2 text-sm">
            <div className="mb-1 font-mono text-xs text-content/40">{k}</div>
            <pre className="overflow-x-auto text-xs text-content/70">
              {JSON.stringify(savedVars[k], null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
