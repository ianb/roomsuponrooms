-- Server-side LLM call log. Captures the exact prompt and response for
-- single-shot creation calls (room materialization, entity/exit/scenery
-- creation, verb fallback) so that when AI-generated content looks wrong
-- after the fact, you can retrieve what the model actually said. Linked
-- from AI-authored entities via ai_entities.ai_call_id -> ai_calls.id.
--
-- Pruned on a 14-day rolling window (longer than error_log's 2 days because
-- the entities these calls describe live much longer). Pruning runs
-- probabilistically on write — ~5% of inserts — matching the error_log
-- pattern, so there's no cron needed.

CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  context TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT,
  duration_ms INTEGER NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT
);

CREATE INDEX idx_ai_calls_timestamp ON ai_calls(timestamp);
CREATE INDEX idx_ai_calls_game_id ON ai_calls(game_id, timestamp);
