CREATE TABLE bug_reports (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  description TEXT NOT NULL,
  room_id TEXT,
  room_name TEXT,
  recent_commands TEXT NOT NULL,
  entity_changes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  fix_commit TEXT,
  duplicate_of TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_game ON bug_reports(game_id);
