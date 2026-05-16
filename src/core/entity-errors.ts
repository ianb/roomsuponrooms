export class EntityNotFoundError extends Error {
  constructor(public readonly entityId: string) {
    super(`Entity not found: ${entityId}`);
    this.name = "EntityNotFoundError";
  }
}

export class DuplicateEntityError extends Error {
  constructor(public readonly entityId: string) {
    super(`Entity already exists: ${entityId}`);
    this.name = "DuplicateEntityError";
  }
}

export class UndefinedPropertyError extends Error {
  constructor(public readonly propertyName: string) {
    super(`Property "${propertyName}" is not defined in the registry`);
    this.name = "UndefinedPropertyError";
  }
}

export class DanglingReferenceError extends Error {
  constructor(
    public readonly propertyName: string,
    public readonly referencedId: string,
  ) {
    super(`Property "${propertyName}" references non-existent entity "${referencedId}"`);
    this.name = "DanglingReferenceError";
  }
}

export class InvalidEntityIdError extends Error {
  constructor(public readonly entityId: string) {
    super(`Entity ID "${entityId}" must contain a colon (e.g. "type:name")`);
    this.name = "InvalidEntityIdError";
  }
}

export class PropertyValueError extends Error {
  constructor(
    public readonly propertyName: string,
    public readonly errors: string[],
  ) {
    super(`Invalid value for property "${propertyName}"`);
    this.name = "PropertyValueError";
  }
}

/**
 * Thrown when a room entity is created without a name or description. Rooms
 * are the primary unit the player interacts with, so a nameless or blank room
 * is always a bug — usually upstream in AI generation or a caller dropping
 * typed fields. Fail fast here so the broken room never makes it to storage.
 */
export class RoomMissingRequiredFieldError extends Error {
  constructor(
    public readonly entityId: string,
    public readonly field: "name" | "description",
  ) {
    super(`Room "${entityId}" was created without a ${field}`);
    this.name = "RoomMissingRequiredFieldError";
  }
}
