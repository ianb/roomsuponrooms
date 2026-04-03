import { useState, useEffect } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { BugReportDetail } from "../BugReportView.js";

export const bugsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bugs",
  component: BugsPage,
});

export const bugDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bugs/$bugId",
  component: BugDetailPage,
});

interface BugSummary {
  id: string;
  gameId: string;
  description: string;
  userName: string | null;
  status: string;
  createdAt: string;
}

function BugsPage() {
  const [bugs, setBugs] = useState<BugSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const opts = statusFilter ? { status: statusFilter } : undefined;
    trpc.bugs.query(opts).then((result) => {
      if (cancelled) return;
      setBugs(result as BugSummary[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, fetchKey]);

  function changeFilter(s: string) {
    setStatusFilter(s);
    setLoading(true);
    setFetchKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Bug Reports</h1>
      <div className="mb-4 flex gap-2">
        {["", "new", "seen", "fixed", "invalid", "duplicate"].map((s) => (
          <button
            key={s}
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
      ) : bugs.length === 0 ? (
        <div className="text-content/50">No bug reports found.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-content/20 text-left text-content/50">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Game</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {bugs.map((bug) => (
              <tr key={bug.id} className="border-b border-content/10 hover:bg-surface">
                <td className="py-2 pr-4">
                  <a
                    href={`/bugs/${bug.id}`}
                    className="font-mono text-accent hover:text-accent-hover"
                  >
                    {bug.id}
                  </a>
                </td>
                <td className="py-2 pr-4 text-content/80">
                  {bug.description.length > 80
                    ? bug.description.slice(0, 77) + "..."
                    : bug.description}
                </td>
                <td className="py-2 pr-4 text-content/50">{bug.gameId}</td>
                <td className="py-2 pr-4 text-content/50">{bug.status}</td>
                <td className="py-2 text-content/50">
                  {new Date(bug.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface BugDetailData {
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

function BugDetailPage() {
  const { bugId } = bugDetailRoute.useParams();
  const [bug, setBug] = useState<BugDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trpc.bug.query({ id: bugId }).then((result) => {
      setBug(result as BugDetailData | null);
      setLoading(false);
    });
  }, [bugId]);

  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (!bug) return <div className="p-8 text-content/50">Bug report not found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <a href="/bugs" className="mb-4 inline-block text-sm text-accent hover:text-accent-hover">
        &larr; All bugs
      </a>
      <BugReportDetail report={bug} />
    </div>
  );
}
