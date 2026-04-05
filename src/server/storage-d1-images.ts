import type { D1Database } from "./d1-types.js";
import type { ImageSettings, ImageSettingsInput, WorldImageRecord } from "./storage.js";

export type { ImageSettings, ImageSettingsInput, WorldImageRecord };

interface ImageSettingsRow {
  game_id: string;
  images_enabled: number;
  image_style_room: string | null;
  image_style_npc: string | null;
  updated_at: string;
}

interface WorldImageRow {
  game_id: string;
  image_type: string;
  r2_key: string;
  prompt_used: string;
  style_prompt: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

function rowToSettings(row: ImageSettingsRow): ImageSettings {
  return {
    gameId: row.game_id,
    imagesEnabled: row.images_enabled === 1,
    imageStyleRoom: row.image_style_room,
    imageStyleNpc: row.image_style_npc,
    updatedAt: row.updated_at,
  };
}

function rowToImage(row: WorldImageRow): WorldImageRecord {
  return {
    gameId: row.game_id,
    imageType: row.image_type,
    r2Key: row.r2_key,
    promptUsed: row.prompt_used,
    stylePrompt: row.style_prompt,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export async function getImageSettings(
  db: D1Database,
  gameId: string,
): Promise<ImageSettings | null> {
  const row = await db
    .prepare("SELECT * FROM world_image_settings WHERE game_id = ?")
    .bind(gameId)
    .first<ImageSettingsRow>();
  if (!row) return null;
  return rowToSettings(row);
}

export async function saveImageSettings(
  db: D1Database,
  settings: ImageSettingsInput,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO world_image_settings (game_id, images_enabled, image_style_room, image_style_npc, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (game_id) DO UPDATE SET
         images_enabled = excluded.images_enabled,
         image_style_room = excluded.image_style_room,
         image_style_npc = excluded.image_style_npc,
         updated_at = excluded.updated_at`,
    )
    .bind(
      settings.gameId,
      settings.imagesEnabled ? 1 : 0,
      settings.imageStyleRoom,
      settings.imageStyleNpc,
      now,
    )
    .run();
}

export async function getWorldImage(
  db: D1Database,
  query: { gameId: string; imageType: string },
): Promise<WorldImageRecord | null> {
  const row = await db
    .prepare("SELECT * FROM world_images WHERE game_id = ? AND image_type = ?")
    .bind(query.gameId, query.imageType)
    .first<WorldImageRow>();
  if (!row) return null;
  return rowToImage(row);
}

export async function saveWorldImage(db: D1Database, record: WorldImageRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO world_images (game_id, image_type, r2_key, prompt_used, style_prompt, mime_type, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, image_type) DO UPDATE SET
         r2_key = excluded.r2_key,
         prompt_used = excluded.prompt_used,
         style_prompt = excluded.style_prompt,
         mime_type = excluded.mime_type,
         width = excluded.width,
         height = excluded.height,
         created_at = excluded.created_at`,
    )
    .bind(
      record.gameId,
      record.imageType,
      record.r2Key,
      record.promptUsed,
      record.stylePrompt,
      record.mimeType,
      record.width,
      record.height,
      record.createdAt,
    )
    .run();
}

export async function deleteWorldImage(
  db: D1Database,
  query: { gameId: string; imageType: string },
): Promise<void> {
  await db
    .prepare("DELETE FROM world_images WHERE game_id = ? AND image_type = ?")
    .bind(query.gameId, query.imageType)
    .run();
}

export async function listWorldImages(db: D1Database, gameId: string): Promise<WorldImageRecord[]> {
  const result = await db
    .prepare("SELECT * FROM world_images WHERE game_id = ? ORDER BY image_type")
    .bind(gameId)
    .all<WorldImageRow>();
  return result.results.map((row) => rowToImage(row));
}
