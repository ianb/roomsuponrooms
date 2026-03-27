-- Add users table and per-user keying for events and conversations

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  google_id TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Recreate events with user_id in the primary key
CREATE TABLE IF NOT EXISTS events_v2 (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  command TEXT NOT NULL,
  events TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id, seq)
);

INSERT INTO events_v2 (game_id, user_id, seq, command, events, timestamp)
  SELECT game_id, 'default', seq, command, events, timestamp FROM events;

DROP TABLE events;
ALTER TABLE events_v2 RENAME TO events;

-- Recreate conversation_entries with user_id in the primary key
CREATE TABLE IF NOT EXISTS conversation_entries_v2 (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  word TEXT NOT NULL,
  entry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id, npc_id, word)
);

INSERT INTO conversation_entries_v2 (game_id, user_id, npc_id, word, entry, created_at)
  SELECT game_id, 'default', npc_id, word, entry, created_at FROM conversation_entries;

DROP TABLE conversation_entries;
ALTER TABLE conversation_entries_v2 RENAME TO conversation_entries;
