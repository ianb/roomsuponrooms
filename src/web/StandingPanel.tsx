import type { TrackStatus } from "../core/progression.js";

interface StandingPanelProps {
  tracks: TrackStatus[];
}

/**
 * Player-facing progression panel: one row per track showing the current
 * tier (or raw value for a tierless meter like Coin) and, for signposted
 * tracks, the next tier and a progress bar toward it.
 */
export function StandingPanel({ tracks }: StandingPanelProps) {
  if (tracks.length === 0) {
    return (
      <div className="p-4 text-sm text-content/50">This world has no standing to track yet.</div>
    );
  }
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {tracks.map((track) => (
        <TrackRow key={track.name} track={track} />
      ))}
    </div>
  );
}

function TrackRow({ track }: { track: TrackStatus }) {
  const headline = track.hasTiers ? track.tier || "unranked" : String(track.value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-content/50">{track.label}</span>
        <span className="text-sm font-semibold text-content/90">{headline}</span>
      </div>
      {track.nextTier ? <NextTier track={track} next={track.nextTier} /> : null}
    </div>
  );
}

function NextTier({ track, next }: { track: TrackStatus; next: { name: string; at: number } }) {
  // Progress toward the next tier, measured from the current tier's threshold
  // isn't available here, so show absolute progress toward the next "at".
  const pct = next.at > 0 ? Math.min(100, Math.round((track.value / next.at) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1 overflow-hidden rounded bg-content/10">
        <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-content/40">
        {next.name} at {next.at} — you have {track.value}
      </span>
    </div>
  );
}
