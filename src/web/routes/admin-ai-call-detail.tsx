import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";

export const adminAiCallDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/ai-calls/$callId",
  component: AdminAiCallDetailPage,
});

interface AiCallRecord {
  id: string;
  timestamp: string;
  gameId: string;
  userId: string;
  kind: string;
  context: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  response: unknown;
  durationMs: number;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function AdminAiCallDetailPage() {
  const { callId } = adminAiCallDetailRoute.useParams();
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");
  const [record, setRecord] = useState<AiCallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    trpc.adminAiCall
      .query({ id: callId })
      .then((result) => {
        if (cancelled) return;
        setRecord(result as AiCallRecord | null);
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
  }, [isAdmin, callId]);

  if (!isAdmin) return <div className="p-8 text-content/50">Admin access required.</div>;
  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!record) {
    // A missing record is the expected response after the 14-day retention
    // window has passed, so make that explicit rather than showing "not found".
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Link
          to="/admin/ai-calls"
          className="mb-4 inline-block text-sm text-accent hover:text-accent-hover"
        >
          &larr; All AI calls
        </Link>
        <div className="text-sm text-content/60">
          No record for <code className="font-mono text-xs">{callId}</code>. Entries expire after 14
          days — this call may have been pruned.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to="/admin/ai-calls"
        className="mb-4 inline-block text-sm text-accent hover:text-accent-hover"
      >
        &larr; All AI calls
      </Link>
      <Metadata record={record} />
      <Section title="System prompt">
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-page p-3 text-xs text-content/80">
          {record.systemPrompt}
        </pre>
      </Section>
      <Section title="Prompt">
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-page p-3 text-xs text-content/80">
          {record.prompt}
        </pre>
      </Section>
      <Section title="Response">
        {record.response === undefined || record.response === null ? (
          <div className="text-sm text-content/50">No response (call failed).</div>
        ) : (
          <pre className="overflow-x-auto rounded bg-page p-3 text-xs text-content/80">
            {JSON.stringify(record.response, null, 2)}
          </pre>
        )}
      </Section>
      {record.error ? (
        <Section title="Error">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-red-900/20 p-3 text-xs text-red-300">
            {record.error}
          </pre>
        </Section>
      ) : null}
    </div>
  );
}

function Metadata({ record }: { record: AiCallRecord }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="font-mono text-xl">{record.id}</h1>
        {record.error ? (
          <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs text-red-300">error</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-content/60">
        <dt>When</dt>
        <dd className="text-content/80">{formatDate(record.timestamp)}</dd>
        <dt>Duration</dt>
        <dd className="text-content/80">{record.durationMs}ms</dd>
        {record.tokensIn || record.tokensOut ? (
          <>
            <dt>Tokens</dt>
            <dd className="text-content/80">
              {record.tokensIn || "?"} in / {record.tokensOut || "?"} out
            </dd>
          </>
        ) : null}
        <dt>Game</dt>
        <dd className="text-content/80">{record.gameId}</dd>
        <dt>User</dt>
        <dd className="font-mono text-xs text-content/80">{record.userId}</dd>
        <dt>Kind</dt>
        <dd className="text-content/80">{record.kind}</dd>
        <dt>Context</dt>
        <dd className="text-content/80">{record.context}</dd>
        <dt>Model</dt>
        <dd className="font-mono text-xs text-content/80">{record.model}</dd>
      </dl>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}
