-- Add player-visible output to the per-user event log so the agent's
-- recent-events context shows what actually happened in response to each
-- command, not just the command and the raw state changes.

ALTER TABLE events ADD COLUMN output TEXT NOT NULL DEFAULT '';
