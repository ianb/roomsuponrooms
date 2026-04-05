CREATE TABLE world_images (
  game_id TEXT NOT NULL,
  image_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  prompt_used TEXT NOT NULL,
  style_prompt TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, image_type)
);

CREATE TABLE world_image_settings (
  game_id TEXT NOT NULL PRIMARY KEY,
  images_enabled INTEGER NOT NULL DEFAULT 0,
  image_style_room TEXT,
  image_style_npc TEXT,
  updated_at TEXT NOT NULL
);
