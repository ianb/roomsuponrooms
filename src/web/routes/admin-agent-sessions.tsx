import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";

export const adminAgentSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/agent-sessions",
  component: AdminAgentSessionsPage,
});

interface SessionSummary {
  id: string;
  gameId: string;
  userId: string;
  request: string;
  status: "running" | "finished" | "bailed" | "failed";
  turnCount: number;
  turnLimit: number;
  summary: string | null;
  editCount: number;
  appliedEditCount: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

const STATUS_FILTERS: Array<"" | SessionSummary["status"]> = [
  "",
  "running",
  "finished",
  "bailed",
  "failed",
];

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function AdminAgentSessionsPage() {
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | SessionSummary["status"]>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const opts = statusFilter ? { status: statusFilter } : undefined;
    trpc.adminAgentSessions
      .query(opts)
      .then((result) => {
        if (cancelled) return;
        setSessions(result.sessions);
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
  }, [isAdmin, statusFilter, fetchKey]);

  function changeFilter(s: "" | SessionSummary["status"]): void {
    setStatusFilter(s);
    setLoading(true);
    setFetchKey((k) => k + 1);
  }

  if (!isAdmin) {
    return <div className="p-8 text-content/50">Admin access required.</div>;
  }
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link to="/admin" className="mb-4 inline-block text-sm text-accent hover:text-accent-hover">
        &larr; Admin
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Agent Sessions</h1>
      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || "all"}
            onClick={() => changeFilter(s)}
            className={`rounded px-3 py-1 text-sm ${
              statusFilter === s
                ? "bg-accent-bold text-content"
                : "bg-surface text-content/60 hover:text-content"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-content/50">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="text-content/50">No agent sessions found.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-content/20 text-left text-content/50">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Game</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Request</th>
              <th className="py-2 pr-4">Turns</th>
              <th className="py-2 pr-4">Edits</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-content/10 hover:bg-surface">
                <td className="py-2 pr-4">
                  <Link
                    to="/admin/agent-sessions/$sessionId"
                    params={{ sessionId: s.id }}
                    className="font-mono text-xs text-accent hover:text-accent-hover"
                  >
                    {s.id}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(s.status)}`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-content/60">{s.gameId}</td>
                <td className="py-2 pr-4 font-mono text-xs text-content/40">
                  {truncate(s.userId, 12)}
                </td>
                <td className="py-2 pr-4 text-content/80">{truncate(s.request, 60)}</td>
                <td className="py-2 pr-4 text-content/50">
                  {s.turnCount}/{s.turnLimit}
                </td>
                <td className="py-2 pr-4 text-content/50">
                  {s.appliedEditCount}/{s.editCount}
                </td>
                <td className="py-2 text-content/50">{formatDate(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
