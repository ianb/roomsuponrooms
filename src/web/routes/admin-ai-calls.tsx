import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";

export const adminAiCallsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/ai-calls",
  component: AdminAiCallsPage,
});

interface AiCallSummary {
  id: string;
  timestamp: string;
  gameId: string;
  userId: string;
  kind: string;
  context: string;
  model: string;
  durationMs: number;
  error?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function AdminAiCallsPage() {
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");
  const [calls, setCalls] = useState<AiCallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    trpc.adminAiCalls
      .query({ limit: 200 })
      .then((result) => {
        if (cancelled) return;
        setCalls(result.calls as AiCallSummary[]);
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
  }, [isAdmin]);

  if (!isAdmin) return <div className="p-8 text-content/50">Admin access required.</div>;
  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link to="/admin" className="mb-4 inline-block text-sm text-accent hover:text-accent-hover">
        &larr; Admin
      </Link>
      <h1 className="mb-4 text-2xl font-bold">AI Calls</h1>
      <p className="mb-4 text-sm text-content/60">
        Captured prompt/response for server-side LLM calls. Entries expire after 14 days.
      </p>
      {calls.length === 0 ? (
        <div className="text-sm text-content/50">No AI calls logged.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-content/20 text-left text-content/50">
              <th className="py-2 pr-4">Id</th>
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">Game</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Context</th>
              <th className="py-2 pr-4">Dur</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id} className="border-b border-content/10 hover:bg-surface">
                <td className="py-2 pr-4 font-mono text-xs">
                  <Link
                    to="/admin/ai-calls/$callId"
                    params={{ callId: c.id }}
                    className="text-accent hover:text-accent-hover"
                  >
                    {c.id}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-content/60">{formatDate(c.timestamp)}</td>
                <td className="py-2 pr-4 text-content/60">{c.gameId}</td>
                <td className="py-2 pr-4 text-content/60">{c.kind}</td>
                <td className="max-w-xs truncate py-2 pr-4 text-content/60" title={c.context}>
                  {c.context}
                </td>
                <td className="py-2 pr-4 text-content/60">{c.durationMs}ms</td>
                <td className="py-2">
                  {c.error ? (
                    <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs text-red-300">
                      error
                    </span>
                  ) : (
                    <span className="text-xs text-content/40">ok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
