export class AiGenerationIncompleteError extends Error {
  override name = "AiGenerationIncompleteError";
  constructor() {
    super("AI generation returned incomplete data (missing name or description)");
  }
}

/**
 * Thrown when a caller passes a typed-field key (name, description, location,
 * etc.) inside an entity's `properties` bag. Typed fields must be passed as
 * top-level options on createAndSave / AiEntityRecord. This is a programming
 * error, not an AI error — surface it loudly instead of silently dropping the
 * value, because dropping it produces entities with empty names and blank
 * descriptions that look like the LLM misbehaved.
 */
export class TypedFieldInPropertiesError extends Error {
  override name = "TypedFieldInPropertiesError";
  constructor(public readonly key: string) {
    super(
      `Typed-field key "${key}" was passed in an entity properties bag. ` +
        "Pass it as a top-level field (name/description/location/secret/aliases, " +
        "or on entity.exit / entity.room.grid) instead.",
    );
  }
}
