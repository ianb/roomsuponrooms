-- Token usage tracking on agent sessions.
--
-- model: which LLM the session used (e.g. "gemini-3-flash-preview"). Null
-- for sessions created before this migration.
--
-- The remaining columns mirror the Vercel AI SDK's LanguageModelUsage shape,
-- summed across every generateText call in the session. The split between
-- input_tokens and cache_read_tokens lets the admin UI surface how much
-- prompt caching is saving.

ALTER TABLE agent_sessions ADD COLUMN model TEXT;
ALTER TABLE agent_sessions ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
