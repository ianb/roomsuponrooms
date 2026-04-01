CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context TEXT,
  user_id TEXT,
  game_id TEXT
);

CREATE INDEX idx_error_log_timestamp ON error_log(timestamp);
