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

export class PropertyValueError extends Error {
  constructor(
    public readonly propertyName: string,
    public readonly errors: string[],
  ) {
    super(`Invalid value for property "${propertyName}"`);
    this.name = "PropertyValueError";
  }
}
