import { useState } from "react";

export function SessionSystemPrompt({ prompt }: { prompt: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!prompt) return null;
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mb-2 text-lg font-bold hover:text-content/80"
      >
        System Prompt{" "}
        <span className="text-sm font-normal text-content/50">
          ({prompt.length.toLocaleString()} chars · click to {expanded ? "collapse" : "expand"})
        </span>
      </button>
      {expanded ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-content/10 bg-surface p-3 text-xs text-content/80">
          {prompt}
        </pre>
      ) : null}
    </div>
  );
}

export interface AgentTokenUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  totalUsd: number;
  breakdown: { input: number; cacheRead: number; cacheWrite: number; output: number };
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

function formatCostUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `${(usd * 100).toFixed(3)}¢`;
  if (usd < 1) return `${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(4)}`;
}

export function SessionTokenUsage({
  model,
  usage,
  cost,
}: {
  model: string | null;
  usage: AgentTokenUsage;
  cost: CostBreakdown | null;
}) {
  if (usage.totalTokens === 0 && !model) return null;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens);
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-bold">
        Token Usage{" "}
        {model ? <span className="text-sm font-normal text-content/50">({model})</span> : null}
      </h2>
      <div className="rounded border border-content/10 bg-surface p-4 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          <UsageRow
            label="Input (uncached)"
            tokens={uncachedInput}
            usd={cost ? cost.breakdown.input : null}
          />
          <UsageRow
            label="Input (cache read)"
            tokens={usage.cacheReadTokens}
            usd={cost ? cost.breakdown.cacheRead : null}
            highlight={usage.cacheReadTokens > 0}
          />
          {usage.cacheWriteTokens > 0 ? (
            <UsageRow
              label="Input (cache write)"
              tokens={usage.cacheWriteTokens}
              usd={cost ? cost.breakdown.cacheWrite : null}
            />
          ) : null}
          <UsageRow
            label="Output"
            tokens={usage.outputTokens}
            usd={cost ? cost.breakdown.output : null}
          />
          {usage.reasoningTokens > 0 ? (
            <UsageRow
              label="Output (reasoning)"
              tokens={usage.reasoningTokens}
              usd={null}
              note="included in output above"
            />
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-content/10 pt-3">
          <div className="text-content/60">
            Total tokens: <span className="text-content/90">{formatTokens(usage.totalTokens)}</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-content/40">Total cost</div>
            <div className="text-lg font-bold text-content/90">
              {cost ? formatCostUsd(cost.totalUsd) : "—"}
            </div>
          </div>
        </div>
        {!cost && model ? (
          <div className="mt-2 text-xs text-content/40">
            No pricing configured for model {model}.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UsageRow({
  label,
  tokens,
  usd,
  highlight,
  note,
}: {
  label: string;
  tokens: number;
  usd: number | null;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div>
      <div className="text-xs text-content/40">{label}</div>
      <div className={highlight ? "text-green-300" : "text-content/80"}>
        {formatTokens(tokens)}
        {usd !== null ? (
          <span className="ml-2 text-xs text-content/40">{formatCostUsd(usd)}</span>
        ) : null}
      </div>
      {note ? <div className="text-xs text-content/30">{note}</div> : null}
    </div>
  );
}
