import { useState, useEffect, useContext } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";

export const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

interface UserRecord {
  id: string;
  displayName: string;
  email: string | null;
  roles: string[];
  createdAt: string;
  lastLoginAt: string;
}

interface SessionSummary {
  userId: string;
  gameId: string;
  eventCount: number;
  lastActivity: string;
}

interface AiUsageSummary {
  userId: string;
  total: number;
}

interface UserRow {
  user: UserRecord;
  sessions: SessionSummary[];
  aiCalls: number;
  lastActivity: string | null;
}

function assembleRows(
  users: UserRecord[],
  { sessions, aiUsage }: { sessions: SessionSummary[]; aiUsage: AiUsageSummary[] },
): UserRow[] {
  const sessionsByUser = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const list = sessionsByUser.get(s.userId) || [];
    list.push(s);
    sessionsByUser.set(s.userId, list);
  }
  const aiByUser = new Map<string, number>();
  for (const a of aiUsage) {
    aiByUser.set(a.userId, a.total);
  }
  return users.map((user) => {
    const userSessions = sessionsByUser.get(user.id) || [];
    const lastActivity = userSessions.reduce<string | null>((latest, s) => {
      if (!latest || s.lastActivity > latest) return s.lastActivity;
      return latest;
    }, null);
    return {
      user,
      sessions: userSessions,
      aiCalls: aiByUser.get(user.id) || 0,
      lastActivity,
    };
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function AdminPage() {
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    trpc.adminDashboard
      .query()
      .then((data) => {
        const assembled = assembleRows(data.users as UserRecord[], {
          sessions: data.sessions as SessionSummary[],
          aiUsage: data.aiUsage as AiUsageSummary[],
        });
        setRows(assembled);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      });
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="p-8 text-content/50">Admin access required.</div>;
  }
  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Admin Dashboard</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-content/20 text-left text-content/50">
            <th className="py-2 pr-4">User</th>
            <th className="py-2 pr-4">Roles</th>
            <th className="py-2 pr-4">Sessions</th>
            <th className="py-2 pr-4">AI Calls</th>
            <th className="py-2 pr-4">Last Activity</th>
            <th className="py-2">Last Login</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <UserRowView key={row.user.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRowView({ row }: { row: UserRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-content/10 hover:bg-surface"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 pr-4">
          <div className="font-bold text-content/80">{row.user.displayName}</div>
          {row.user.email ? <div className="text-xs text-content/40">{row.user.email}</div> : null}
        </td>
        <td className="py-2 pr-4 text-content/50">{row.user.roles.join(", ")}</td>
        <td className="py-2 pr-4 text-content/50">
          {row.sessions.length > 0
            ? row.sessions.map((s) => `${s.gameId} (${s.eventCount})`).join(", ")
            : "-"}
        </td>
        <td className="py-2 pr-4 text-content/50">{row.aiCalls || "-"}</td>
        <td className="py-2 pr-4 text-content/50">{formatDate(row.lastActivity)}</td>
        <td className="py-2 text-content/50">{formatDate(row.user.lastLoginAt)}</td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="bg-surface/50 px-4 py-2">
            <div className="text-xs text-content/50">
              <div>User ID: {row.user.id}</div>
              <div>Created: {formatDate(row.user.createdAt)}</div>
              {row.sessions.length > 0 ? (
                <div className="mt-2">
                  <div className="font-bold">Sessions:</div>
                  {row.sessions.map((s) => (
                    <div key={`${s.userId}-${s.gameId}`} className="ml-2">
                      {s.gameId}: {s.eventCount} events, last active {formatDate(s.lastActivity)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
