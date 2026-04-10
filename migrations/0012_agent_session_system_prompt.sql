-- Persist the system prompt that was used on the first tick of an agent
-- session, so the admin UI can show it without having to regenerate it
-- (which would yield a different prompt as the world evolved).

ALTER TABLE agent_sessions ADD COLUMN system_prompt TEXT;
